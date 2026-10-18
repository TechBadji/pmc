"""
Rapports PDF de la rubrique Cohésion d'équipe, pour l'encadrement :

  - « Cohésion d'équipe » : ce que les collaborateurs disent de leur direction
    (ou de l'organisation entière) sur une campagne — participation, indice,
    lecture critère par critère avec la part d'avis bas, évolution d'une
    campagne à l'autre, regard de l'encadrant, sécurité psychologique,
    recommandations ;
  - « Dynamique relationnelle » : la cartographie des relations d'une équipe
    (ou de toutes), les personnes pivots, les tensions, les relations
    asymétriques, les facteurs qui nourrissent ou abîment la relation, et les
    recommandations qui s'en déduisent.

Même mise en page que les rapports du 360° Feedforward (briques reprises de
`apps.evaluations.feedforward_report`). Le rapport de cohésion respecte le
seuil d'anonymat de l'entreprise : il n'est produit qu'une fois ce nombre
d'avis déposé, et ne cite jamais un avis individuel.
"""
import unicodedata
from decimal import ROUND_HALF_UP, Decimal
from collections import Counter
from dataclasses import dataclass

from django.db.models import Q
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import NextPageTemplate, Spacer

from apps.core.models import Department, User
from apps.evaluations.feedforward_report import (
    BLUE,
    CONTENT_W,
    GREY,
    NAVY,
    ORANGE,
    RED,
    TEAL,
    TINT_BLUE,
    TINT_ORANGE,
    TINT_TEAL,
    BarList,
    Builder,
    ReportError,
    StackedBar,
    escape,
    fmt_num,
    fmt_pct,
    fr_date,
    name_of,
    pct,
    slug,
)
from apps.evaluations.models import EvaluationCampaign

from .aggregation import LOW_SCORE, MIN_RESPONDENTS, aggregate_responses
from .models import CohesionResponse, PsychologicalSafetyResponse, TeamBoard, TeamCohesionAnalysis, TeamRelationship
from .serializers import PSI_DIMENSIONS

GREEN = colors.HexColor("#4A9A52")
PSI_LABELS = {"belonging": "Appartenance", "learning": "Apprentissage", "contributing": "Contribution", "challenging": "Remise en question"}


def _norm(text):
    text = unicodedata.normalize("NFD", text or "").encode("ascii", "ignore").decode().lower()
    return " ".join(text.replace("’", "'").split())


@dataclass(frozen=True)
class Criterion:
    key: str
    marker: str  # fragment du libellé (sans accents) qui identifie le critère
    short: str
    action: str
    owner: str
    horizon: str


# Les dix critères du questionnaire (`cohesion.criteria` du front), reconnus
# par un fragment de leur libellé : le nom de l'entité notée y est substitué.
CRITERIA = [
    Criterion("vision", "10 a 15 prochaines annees", "Vision à 10-15 ans clairement définie",
              "Formaliser la vision à 10-15 ans et la présenter à l'ensemble du personnel, avec ses étapes intermédiaires",
              "Direction Générale", "6 mois"),
    Criterion("understand", "peut l'expliquer", "Vision et valeurs comprises de tous",
              "Décliner la vision et les valeurs en messages simples, relayés par chaque manager en réunion d'équipe",
              "Direction Générale et RH", "3 mois"),
    Criterion("own", "appropries", "Vision et valeurs appropriées",
              "Faire vivre les valeurs au quotidien : rituels, reconnaissance des comportements attendus, exemplarité de l'encadrement",
              "Managers", "6 mois"),
    Criterion("objectives", "objectifs individuels", "Objectifs individuels reliés aux objectifs globaux",
              "Relier explicitement chaque objectif individuel aux objectifs de l'organisation lors des entretiens de la prochaine campagne",
              "Managers et RH", "Prochaine campagne"),
    Criterion("engaged", "tres engage", "Engagement envers les objectifs d'équipe",
              "Rendre les objectifs d'équipe visibles, suivre leur avancement ensemble et célébrer les réussites collectives",
              "Managers", "3 mois"),
    Criterion("collective", "au-dessus de leurs interets", "Intérêt collectif avant intérêt personnel",
              "Valoriser les arbitrages faits au service du collectif et traiter ouvertement les logiques de silo",
              "Direction Générale", "6 mois"),
    Criterion("vertical", "communication verticale", "Communication verticale",
              "Instaurer des temps d'échange réguliers et à double sens entre le Top Management et les équipes",
              "Direction Générale", "3 mois"),
    Criterion("horizontal", "communication horizontale", "Communication entre directions",
              "Créer des espaces de coopération entre directions : projets transverses, comités, partage d'information",
              "Comité de Direction", "6 mois"),
    Criterion("trust_top", "confiance entre le top management", "Confiance envers le Top Management",
              "Renforcer la confiance : transparence sur les décisions, cohérence entre discours et actes, suivi des engagements pris",
              "Direction Générale", "6 à 12 mois"),
    Criterion("trust_peers", "eux-memes", "Confiance entre collaborateurs",
              "Développer la confiance entre pairs : feedback régulier, entraide, traitement rapide des tensions",
              "Managers et RH", "6 mois"),
]


def criterion_of(label):
    text = _norm(label)
    return next((c for c in CRITERIA if c.marker in text), None)


def short_label(label):
    c = criterion_of(label)
    return c.short if c else label


# Grille de lecture de l'ICE (Indice de Cohésion d'Équipe), fixée par le cabinet :
# en dessous de 3, un groupe ; de 3 à 3,9, une équipe moyennement soudée ; à
# partir de 4, une vraie équipe, qui a de fortes chances de performer dans la durée.
ICE_TEAM, ICE_STRONG = 3.0, 4.0
ICE_READING = {
    "group": ("Un groupe", "C'est encore un groupe plutôt qu'une équipe : les personnes travaillent côte à côte sans former un collectif soudé."),
    "average": ("Cohésion moyenne", "C'est une équipe moyennement soudée : un collectif existe, mais ses liens restent à renforcer pour durer."),
    "strong": ("Forte cohésion", "C'est une vraie équipe, qui a de fortes chances de performer dans le long terme."),
}


def ice_band(score):
    """Niveau de l'ICE, lu sur sa valeur arrondie au dixième (arrondi commercial) :
    3,95 compte pour 4,0 — une vraie équipe — et 2,95 pour 3,0, comme l'a fixé le cabinet."""
    if score is None:
        return None
    rounded = float(Decimal(str(score)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    return "group" if rounded < ICE_TEAM else "average" if rounded < ICE_STRONG else "strong"


def level_of(score):
    """Niveau d'un indice ou d'un critère, sur la même grille que l'ICE."""
    band = ice_band(score)
    return {"group": "faible", "average": "moyen", "strong": "fort", None: "non mesuré"}[band]


def fmt_score(value):
    return "—" if value is None else fmt_num(value, 2)


def fmt_delta(value):
    if value is None:
        return "—"
    sign = "+" if value > 0.004 else ("−" if value < -0.004 else "±")
    return f"{sign}{fmt_num(abs(value), 2)}"


def _latest(responses):
    latest = {}
    for response in responses.order_by("date", "id"):
        latest[response.respondent_id] = response
    return list(latest.values())


def _window(qs, campaign, field="date"):
    return qs.filter(**{f"{field}__range": (campaign.start_date, campaign.effective_end_date)})


def _campaigns_until(company, campaign):
    return list(EvaluationCampaign.objects.filter(company=company, start_date__lte=campaign.start_date).order_by("start_date"))


class Perimeter:
    """Ce sur quoi porte le rapport : une direction, ou l'organisation entière."""

    def __init__(self, company, team=None):
        self.company, self.team = company, team

    @property
    def is_org(self):
        return self.team is None

    @property
    def name(self):
        return self.company.name if self.is_org else self.team.name

    @property
    def label(self):
        return f"l'organisation {self.company.name}" if self.is_org else f"la direction « {self.team.name} »"

    def responses(self, campaign):
        if self.is_org:
            qs = CohesionResponse.objects.filter(scope=CohesionResponse.Scope.ORGANISATION, company=self.company)
        else:
            qs = CohesionResponse.objects.filter(scope=CohesionResponse.Scope.TEAM, team=self.team)
        return _latest(_window(qs, campaign))

    def headcount(self):
        if self.is_org:
            return User.objects.filter(company=self.company, is_active=True).count()
        return self.team.members.count()


def _min_respondents(company):
    return getattr(company, "cohesion_min_respondents", None) or MIN_RESPONDENTS


def _psi(perimeter, campaign, threshold):
    if perimeter.is_org:
        rows = PsychologicalSafetyResponse.objects.filter(
            company=perimeter.company, campaign=campaign, scope=PsychologicalSafetyResponse.Scope.ORGANISATION)
    else:
        rows = PsychologicalSafetyResponse.objects.filter(
            team=perimeter.team, campaign=campaign, scope=PsychologicalSafetyResponse.Scope.TEAM)
    rows = [r for r in rows if len(r.scores or []) >= 12]
    if len(rows) < threshold:
        return None
    dims = [(key, sum(sum(r.scores[i * 3:i * 3 + 3]) / 3 for r in rows) / len(rows)) for i, key in enumerate(PSI_DIMENSIONS)]
    return {"respondents": len(rows), "dimensions": dims, "global": sum(v for _k, v in dims) / len(dims)}


# ---------------------------------------------------------------------------
# Rapport « Cohésion d'équipe »
# ---------------------------------------------------------------------------
def build_cohesion_report(company, campaign, team, prepared_for):
    perimeter = Perimeter(company, team)
    threshold = _min_respondents(company)
    headcount = perimeter.headcount()
    responses = perimeter.responses(campaign)
    if len(responses) < threshold:
        raise ReportError(
            f"Le rapport de cohésion de {perimeter.label} sera disponible dès que {threshold} collaborateurs auront déposé leur avis "
            f"sur la campagne « {campaign.name} » ({len(responses)} à ce jour) : en dessous, les résultats ne sont pas publiés, "
            "pour qu'aucun avis ne puisse être rattaché à une personne."
        )
    agg = aggregate_responses(responses, headcount=headcount, min_respondents=threshold)
    criteria = [c for c in agg["criteria"] if c["score"] is not None]
    ranked = sorted(criteria, key=lambda c: c["score"], reverse=True)
    strongest, weakest = ranked[:3], list(reversed(ranked[-3:]))
    divisive = sorted(criteria, key=lambda c: (c["low_share"] or 0), reverse=True)[0]
    score, low_share = agg["score"], agg["low_share"] or 0

    history = []
    for camp in _campaigns_until(company, campaign):
        rs = responses if camp.pk == campaign.pk else perimeter.responses(camp)
        a = aggregate_responses(rs, headcount=headcount, min_respondents=threshold)
        history.append((camp, a))
    previous = next((a for camp, a in reversed(history[:-1]) if a["published"]), None)
    prev_by_key = {}
    if previous:
        for c in previous["criteria"]:
            crit = criterion_of(c["criterion"])
            if crit and c["score"] is not None:
                prev_by_key[crit.key] = c["score"]
    delta = (score - previous["score"]) if previous and previous["score"] is not None else None

    sheet = None
    if not perimeter.is_org:
        sheet = _window(TeamCohesionAnalysis.objects.filter(team=team), campaign).order_by("-date").first()
    sheet_scores = {}
    if sheet:
        for row in sheet.criterion_scores.all():
            crit = criterion_of(row.criterion)
            if crit:
                sheet_scores[crit.key] = (row.score, row.objective_score)

    directions = []
    if perimeter.is_org:
        for dept in Department.objects.filter(company=company).order_by("name"):
            rs = _latest(_window(CohesionResponse.objects.filter(scope=CohesionResponse.Scope.TEAM, team=dept), campaign))
            a = aggregate_responses(rs, headcount=dept.members.count(), min_respondents=threshold)
            if a["respondents"]:
                directions.append((dept, a))
    psi = _psi(perimeter, campaign, threshold)

    today = timezone.localdate()
    source = f"ID-PMC, Cohésion d'équipe, {company.name}, {campaign.name} — {len(responses)} avis, édition du {fr_date(today)}"
    b = Builder(source)
    who = "collaborateurs"
    cover_info = dict(
        label="RAPPORT D'ANALYSE", kicker=f"COHÉSION D'ÉQUIPE · {campaign.name.upper()}",
        eyebrow="AVIS DES COLLABORATEURS SUR L'ORGANISATION" if perimeter.is_org else "AVIS DES COLLABORATEURS SUR LEUR DIRECTION",
        title="Cohésion d'équipe", subtitle=f"{perimeter.name} — {campaign.name}" if not perimeter.is_org else f"{company.name} — {campaign.name}",
        meta=[("Préparé pour", prepared_for), ("Périmètre", f"{perimeter.name} · {headcount} personnes"),
              ("Période couverte", f"Du {fr_date(campaign.start_date)} au {fr_date(campaign.end_date)}"), ("Date d'édition", fr_date(today))],
        classification="CONFIDENTIEL", screen="ICE",
    )
    b.add(Spacer(1, 1), NextPageTemplate("body"))

    b.h1_plain("À propos de ce rapport")
    b.p(f"Ce rapport présente la mesure de la cohésion de <b>{escape(perimeter.label)}</b> sur la campagne « {escape(campaign.name)} », "
        f"telle que les {who} l'ont exprimée sur la plateforme ID-PMC au {fr_date(today)}. Chacun a noté de 1 (très faible) à 5 "
        "(très élevé) les dix critères du questionnaire de cohésion ID-PMC : vision, valeurs, objectifs, engagement, sens du "
        "collectif, communication et confiance.")
    b.p("La cohésion ne se décrète pas : elle se mesure, se discute et se travaille. Les résultats qui suivent sont une base de "
        "dialogue avec les équipes, pas un classement. Ils prennent tout leur sens lorsqu'ils sont restitués aux collaborateurs et "
        "suivis d'actions visibles.")
    b.box("Confidentialité", [
        f"Les avis sont anonymes. Aucun résultat n'est publié en dessous de {threshold} répondants, seuil fixé par l'entreprise, "
        "et ce rapport ne cite aucun avis individuel : il ne présente que des moyennes et des répartitions.",
        "Ce document est destiné à la Direction Générale, à l'encadrement concerné et à la fonction RH.",
    ], tint=TINT_ORANGE, color=ORANGE)
    b.toc()

    # 1. Synthèse exécutive
    participation = agg["participation"]
    action = {
        "group": "Un groupe plutôt qu'une équipe : la cohésion est à construire",
        "average": "Une équipe moyennement soudée : des appuis réels, des liens à renforcer pour durer",
        "strong": "Une vraie équipe, soudée, qui a de fortes chances de performer dans le long terme",
    }[ice_band(score)]
    b.h1("Synthèse exécutive", action)
    tiles = [(f"{fmt_num(score, 2)} / 5", "ICE — indice de cohésion d'équipe (moyenne des dix critères)"),
             (fmt_pct(round(100 * participation)) if participation is not None else str(len(responses)),
              f"de participation ({len(responses)} avis sur {headcount} personnes)"),
             (fmt_pct(round(100 * low_share)), f"des notes sont basses (≤ {LOW_SCORE} sur 5)")]
    tiles.append((fmt_delta(delta) if delta is not None else "—", "évolution depuis la campagne précédente" if delta is not None else "pas de campagne précédente publiée"))
    b.kpis(tiles)
    band = ice_band(score)
    grid = [("group", "ICE inférieur à 3", "c'est un groupe"),
            ("average", "ICE de 3 à 3,9", "cohésion moyenne : équipe moyennement soudée"),
            ("strong", "ICE de 4 et plus", "forte cohésion : une vraie équipe, qui a de fortes chances de performer dans le long terme")]
    b.box("Lecture de l'ICE", [(f"<b>» {label} : {text}</b> — position de {escape(perimeter.name)}" if key == band else f"{label} : {text}")
                               for key, label, text in grid], tint=TINT_BLUE, color=BLUE)
    b.h2("Messages clés")
    title, reading = ICE_READING[ice_band(score)]
    msgs = [f"<b>Niveau d'ensemble.</b> Avec un ICE de {fmt_num(score, 2)} sur 5 — <b>{title.lower()}</b> — {reading[0].lower()}{reading[1:]} "
            f"{fmt_pct(round(100 * low_share))} des notes données sont basses, ce qui "
            + ("signale des situations difficiles à ne pas laisser s'installer." if low_share >= 0.2 else "reste contenu.")]
    if strongest:
        msgs.append("<b>Points d'appui.</b> Les critères les mieux notés sont " + ", ".join(
            f"« {escape(short_label(c['criterion']))} » ({fmt_num(c['score'], 2)})" for c in strongest) + ".")
    if weakest:
        msgs.append("<b>Fragilités.</b> Les critères les plus faibles sont " + ", ".join(
            f"« {escape(short_label(c['criterion']))} » ({fmt_num(c['score'], 2)})" for c in weakest) + " : c'est là que se jouent les progrès.")
    if divisive and (divisive["low_share"] or 0) >= 0.2:
        msgs.append(f"<b>Avis partagés.</b> Sur « {escape(short_label(divisive['criterion']))} », "
                    f"{fmt_pct(round(100 * divisive['low_share']))} des répondants donnent une note basse : un sujet de dialogue prioritaire.")
    if delta is not None:
        msgs.append(f"<b>Trajectoire.</b> L'indice {'progresse' if delta > 0.04 else 'recule' if delta < -0.04 else 'est stable'} "
                    f"({fmt_delta(delta)} point) par rapport à la campagne précédente.")
    if psi:
        msgs.append(f"<b>Sécurité psychologique.</b> L'indice PSI s'établit à {fmt_num(psi['global'], 2)} sur 5 "
                    f"({psi['respondents']} répondants).")
    b.bullets(msgs)
    recs = _cohesion_recommendations(criteria, strongest)
    b.box("Trois priorités pour la suite", [f"<b>{i}.</b> {escape(r[0])}" for i, r in enumerate(recs[:3], 1)], tint=TINT_TEAL, color=TEAL)

    # 2. Méthodologie
    b.h1("Méthodologie et périmètre", "Dix critères notés de 1 à 5 par chaque collaborateur, agrégés sous un seuil d'anonymat")
    b.bullets([
        f"<b>Périmètre.</b> {escape(perimeter.label[0].upper() + perimeter.label[1:])}, soit {headcount} personnes"
        + (" (comptes actifs de l'entreprise)." if perimeter.is_org else " rattachées à la direction."),
        f"<b>Période.</b> Avis déposés entre le {fr_date(campaign.start_date)} et le {fr_date(campaign.effective_end_date)} ; "
        "lorsqu'une personne a répondu plusieurs fois, seul son dernier avis est retenu.",
        "<b>Calcul.</b> Chaque critère est moyenné sur ceux qui y ont répondu, puis l'indice est la moyenne des dix critères. "
        f"La part d'avis bas compte les notes de 1 et 2 ; la note dominante est celle que le plus de répondants ont choisie.",
        f"<b>Seuil de publication.</b> {threshold} répondants au minimum, réglé par l'entreprise.",
        "<b>Lecture de l'ICE.</b> ICE inférieur à 3 : c'est un <b>groupe</b>. ICE de 3 à 3,9 : <b>cohésion moyenne</b>, équipe moyennement "
        "soudée. ICE de 4 et plus : <b>forte cohésion</b>, une vraie équipe qui a de fortes chances de performer dans le long terme. "
        "L'ICE est lu arrondi au dixième : 3,95 compte pour 4. La même grille qualifie chaque critère (faible, moyen, fort).",
    ])

    # 3. Résultats par critère
    b.h1("Résultats critère par critère", "Ce qui rassemble et ce qui fragilise, au-delà de la moyenne")
    b.figure_block("Note moyenne par critère (sur 5)",
                   BarList([(short_label(c["criterion"]), c["score"], fmt_num(c["score"], 2)) for c in ranked], color=BLUE, max_value=5, label_width=78 * mm))
    rows = []
    for c in criteria:
        dist = c["distribution"]
        n = c["answers"] or 1
        high = (dist.get(4, 0) + dist.get(5, 0)) / n
        rows.append([escape(c["criterion"]), fmt_num(c["score"], 2), f"{c['mode']} ({fmt_pct(round(100 * (c['mode_share'] or 0)))})",
                     fmt_pct(round(100 * (c["low_share"] or 0))), fmt_pct(round(100 * high)), level_of(c["score"])])
    b.table("Détail par critère", ["Critère", "Moyenne", "Note dominante", "Avis bas", "Avis ≥ 4", "Niveau"], rows,
            [74 * mm, 17 * mm, 24 * mm, 17 * mm, 17 * mm, 21 * mm], align=["left", "center", "center", "center", "center", "center"])

    # 4. Forces et points de vigilance
    b.h1("Points d'appui et points de vigilance", "Capitaliser sur ce qui fonctionne, traiter ce qui freine le collectif")
    b.h2("Points d'appui")
    b.bullets([f"<b>{escape(short_label(c['criterion']))}</b> — {fmt_num(c['score'], 2)} sur 5, "
               f"{fmt_pct(round(100 * (c['low_share'] or 0)))} d'avis bas." for c in strongest], color=GREEN)
    b.h2("Points de vigilance")
    b.bullets([f"<b>{escape(short_label(c['criterion']))}</b> — {fmt_num(c['score'], 2)} sur 5, "
               f"{fmt_pct(round(100 * (c['low_share'] or 0)))} d'avis bas." for c in weakest], color=RED)

    # 5. Évolution
    published = [(camp, a) for camp, a in history if a["published"]]
    if len(published) >= 2:
        b.h1("Évolution d'une campagne à l'autre", "La trajectoire compte autant que le niveau")
        b.figure_block("Indice de cohésion par campagne (sur 5)",
                       BarList([(camp.name, a["score"], fmt_num(a["score"], 2)) for camp, a in published], color=TEAL, max_value=5, label_width=50 * mm))
        b.table("Indice et participation par campagne", ["Campagne", "Répondants", "Participation", "Indice", "Avis bas"],
                [[escape(camp.name), str(a["respondents"]), fmt_pct(round(100 * a["participation"])) if a["participation"] is not None else "—",
                  fmt_score(a["score"]), fmt_pct(round(100 * (a["low_share"] or 0)))] for camp, a in published],
                [60 * mm, 27 * mm, 27 * mm, 28 * mm, 28 * mm], align=["left", "center", "center", "center", "center"])
        if prev_by_key:
            moves = []
            for c in criteria:
                crit = criterion_of(c["criterion"])
                if crit and crit.key in prev_by_key:
                    moves.append((short_label(c["criterion"]), prev_by_key[crit.key], c["score"]))
            moves.sort(key=lambda m: m[2] - m[1])
            b.table("Évolution par critère depuis la campagne précédente", ["Critère", "Précédente", "Actuelle", "Écart"],
                    [[escape(m[0]), fmt_score(m[1]), fmt_score(m[2]), fmt_delta(m[2] - m[1])] for m in moves],
                    [90 * mm, 26 * mm, 26 * mm, 28 * mm], align=["left", "center", "center", "center"])

    # 6. Regard de l'encadrant
    if sheet_scores:
        b.h1("Regard de l'encadrant et regard des équipes", "L'écart entre les deux lectures est le signal le plus riche de l'exercice")
        b.p(f"Sur sa fiche du {fr_date(sheet.date)}, l'encadrant a noté la cohésion de sa direction à {fmt_num(float(sheet.ice_score), 1)} "
            f"(ICE), avec un objectif de {fmt_num(float(sheet.oce_score), 1)} (OCE). Ses collaborateurs la notent à {fmt_num(score, 2)}.")
        gap_rows = []
        for c in criteria:
            crit = criterion_of(c["criterion"])
            if crit and crit.key in sheet_scores:
                own, target = sheet_scores[crit.key]
                gap_rows.append([escape(crit.short), str(own), fmt_score(c["score"]), fmt_delta(own - c["score"]),
                                 fmt_num(float(target), 1) if target is not None else "—"])
        b.table("Note de l'encadrant et avis des collaborateurs", ["Critère", "Encadrant", "Collaborateurs", "Écart", "Objectif"],
                gap_rows, [76 * mm, 22 * mm, 26 * mm, 22 * mm, 24 * mm], align=["left", "center", "center", "center", "center"],
                note="un écart positif signifie que l'encadrant voit la cohésion plus haute que ses équipes")

    # 7. Directions (organisation)
    if directions:
        b.h1("Lecture par direction", "La cohésion de l'organisation ne se confond pas avec celle de ses directions")
        b.table("Avis des collaborateurs sur leur direction", ["Direction", "Répondants", "Participation", "Indice", "Niveau"],
                [[escape(d.name), str(a["respondents"]), fmt_pct(round(100 * a["participation"])) if a["participation"] is not None else "—",
                  fmt_score(a["score"]) if a["published"] else "non publié", level_of(a["score"]) if a["published"] else "—"] for d, a in directions],
                [62 * mm, 24 * mm, 26 * mm, 30 * mm, 28 * mm], align=["left", "center", "center", "center", "center"],
                note=f"une direction n'est publiée qu'à partir de {threshold} répondants")

    # 8. Sécurité psychologique
    if psi:
        b.h1("Sécurité psychologique", "Le terrain sur lequel la cohésion peut se construire")
        b.figure_block("Indice PSI par dimension (sur 5)",
                       BarList([(PSI_LABELS[k], v, fmt_num(v, 2)) for k, v in psi["dimensions"]], color=TEAL, max_value=5, label_width=50 * mm),
                       note=f"{psi['respondents']} répondants ; indice global {fmt_num(psi['global'], 2)}")
        low = min(psi["dimensions"], key=lambda kv: kv[1])
        b.p(f"La dimension la plus faible est « {PSI_LABELS[low[0]]} » ({fmt_num(low[1], 2)}). C'est elle qui conditionne la capacité des "
            "équipes à exprimer un désaccord ou à signaler un problème, et donc à faire progresser les critères de cohésion ci-dessus.")

    # 9. Recommandations
    b.h1("Plan de recommandations", "Des actions ciblées sur les critères les plus faibles, portées et datées")
    b.table("Recommandations", ["#", "Action", "Porteur", "Horizon", "Priorité"],
            [[str(i), escape(r[0]), escape(r[1]), escape(r[2]), r[3]] for i, r in enumerate(recs, 1)],
            [8 * mm, 92 * mm, 30 * mm, 22 * mm, 18 * mm], align=["center", "left", "left", "center", "center"])
    b.box("Prochaines étapes", [
        "Restituer ces résultats aux collaborateurs dans le mois qui suit, en présentant les priorités retenues.",
        "Inscrire les actions dans les plans d'action de la rubrique Cohésion d'équipe, avec un porteur et une échéance.",
        "Mesurer à nouveau à la prochaine campagne pour suivre la trajectoire de chaque critère.",
    ])

    # Annexe
    b.h1_plain("Annexe — Répartition des notes par critère")
    b.table("Nombre de répondants par note", ["Critère", "1", "2", "3", "4", "5", "Total"],
            [[escape(short_label(c["criterion"]))] + [str(c["distribution"].get(n, 0)) for n in range(1, 6)] + [str(c["answers"])] for c in criteria],
            [80 * mm] + [15 * mm] * 5 + [15 * mm], align=["left"] + ["center"] * 6)

    title = f"Cohésion d'équipe — {perimeter.name} — {campaign.name}"
    return b.render(title, "Rapport de cohésion d'équipe", f"Cohésion d'équipe · {perimeter.name}", campaign.name, "CONFIDENTIEL", cover_info)


def _cohesion_recommendations(criteria, strongest):
    recs = []
    for c in sorted(criteria, key=lambda c: c["score"]):
        crit = criterion_of(c["criterion"])
        if not crit:
            continue
        low = c["low_share"] or 0
        if c["score"] < ICE_TEAM or low >= 0.35:
            priority = "Haute"
        elif c["score"] < ICE_STRONG or low >= 0.2:
            priority = "Moyenne"
        else:
            continue
        recs.append((crit.action, crit.owner, crit.horizon, priority))
        if len(recs) == 4:
            break
    if len(recs) < 3:
        for c in sorted(criteria, key=lambda c: c["score"])[: 3 - len(recs)]:
            crit = criterion_of(c["criterion"])
            if crit and all(crit.action != r[0] for r in recs):
                recs.append((crit.action, crit.owner, crit.horizon, "Basse"))
    if strongest:
        best = short_label(strongest[0]["criterion"])
        recs.append((f"Capitaliser sur le point d'appui « {best} » : en faire un exemple partagé et un levier pour les critères plus faibles",
                     "Direction Générale et managers", "En continu", "Basse"))
    return recs


# ---------------------------------------------------------------------------
# Rapport « Dynamique relationnelle »
# ---------------------------------------------------------------------------
QUALITY = [("EXCELLENT", "Excellente", GREEN), ("CORRECT", "Correcte", BLUE), ("DIFFICULT", "Difficile", ORANGE), ("TOXIC", "Toxique", RED)]
QUALITY_LABEL = {k: label for k, label, _c in QUALITY}
POSITIVE, TENSION = {"EXCELLENT", "CORRECT"}, {"DIFFICULT", "TOXIC"}


def _boards(company, team, campaign):
    teams = [team] if team else list(Department.objects.filter(company=company))
    boards = []
    for t in teams:
        board = (_window(TeamBoard.objects.filter(team=t), campaign).order_by("-date").first()
                 or TeamBoard.objects.filter(team=t, date__lte=campaign.effective_end_date).order_by("-date").first())
        if board:
            boards.append(board)
    return boards


def build_relational_report(company, campaign, team, prepared_for):
    perimeter = Perimeter(company, team)
    if team:
        teams = [team]
        members = list(User.objects.filter(Q(department=team) | Q(pk=team.manager_id)).distinct())
    else:
        teams = list(Department.objects.filter(company=company).order_by("name"))
        members = list(User.objects.filter(company=company, department__isnull=False).distinct())
    links = list(TeamRelationship.objects.filter(team__in=teams).select_related("from_user", "to_user", "team"))
    boards = _boards(company, team, campaign)
    if not links and not boards:
        raise ReportError(
            f"Aucune relation n'a encore été qualifiée et aucune planche « Dynamique relationnelle » n'a été remplie pour {perimeter.label} : "
            "le rapport n'aurait rien à présenter. Qualifiez les relations dans la fiche de cohésion ou complétez la planche, puis réessayez."
        )
    today = timezone.localdate()
    counts = Counter(link.quality for link in links)
    total = len(links)
    positive = sum(counts[q] for q in POSITIVE)
    tension = sum(counts[q] for q in TENSION)
    member_ids = {m.id for m in members}
    for link in links:
        for u in (link.from_user, link.to_user):
            if u.id not in member_ids:
                members.append(u)
                member_ids.add(u.id)
    received = {m.id: Counter() for m in members}
    emitted = Counter()
    involved = set()
    for link in links:
        received.setdefault(link.to_user_id, Counter())[link.quality] += 1
        emitted[link.from_user_id] += 1
        involved.update({link.from_user_id, link.to_user_id})
    by_pair = {(l.team_id, l.from_user_id, l.to_user_id): l for l in links}
    asymmetric, seen = [], set()
    reciprocal = 0
    for (tid, a, c), link in by_pair.items():
        back = by_pair.get((tid, c, a))
        if not back or (tid, c, a) in seen:
            continue
        seen.add((tid, a, c))
        reciprocal += 1
        if (link.quality in POSITIVE) != (back.quality in POSITIVE):
            asymmetric.append((link, back))
    pivots = sorted([m for m in members if received[m.id]["EXCELLENT"] >= 2], key=lambda m: -received[m.id]["EXCELLENT"])[:6]
    tensions = sorted([m for m in members if received[m.id]["TOXIC"] or received[m.id]["DIFFICULT"] >= 2],
                      key=lambda m: -(2 * received[m.id]["TOXIC"] + received[m.id]["DIFFICULT"]))[:6]
    isolated = [m for m in members if m.id not in involved]
    possible = sum(max(0, len([m for m in members if m.department_id == t.id or m.id == t.manager_id]) - 1)
                   * len([m for m in members if m.department_id == t.id or m.id == t.manager_id]) for t in teams)
    coverage = total / possible if possible else None

    source = f"ID-PMC, Dynamique relationnelle, {company.name}, {campaign.name} — {total} relations qualifiées, édition du {fr_date(today)}"
    b = Builder(source)
    cover_info = dict(
        label="RAPPORT D'ANALYSE", kicker=f"DYNAMIQUE RELATIONNELLE · {campaign.name.upper()}",
        eyebrow="CARTOGRAPHIE DES RELATIONS DE L'ORGANISATION" if perimeter.is_org else "CARTOGRAPHIE DES RELATIONS DE L'ÉQUIPE",
        title="Dynamique relationnelle", subtitle=f"{perimeter.name} — {campaign.name}",
        meta=[("Préparé pour", prepared_for), ("Périmètre", f"{perimeter.name} · {len(members)} personnes" + (f" · {len(teams)} équipes" if perimeter.is_org else "")),
              ("Période couverte", f"Du {fr_date(campaign.start_date)} au {fr_date(campaign.end_date)}"), ("Date d'édition", fr_date(today))],
        classification="STRICTEMENT CONFIDENTIEL", screen="ID",
    )
    b.add(Spacer(1, 1), NextPageTemplate("body"))

    b.h1_plain("À propos de ce rapport")
    b.p(f"Ce rapport analyse la dynamique relationnelle de <b>{escape(perimeter.label)}</b> : la qualité des relations de travail "
        "entre ses membres, telle qu'elle est cartographiée dans la fiche de cohésion (excellente, correcte, difficile, toxique), et "
        "les comportements qui nourrissent ou abîment ces relations — catalyseurs, nourrisseurs, inhibiteurs et toxines — relevés "
        f"sur la planche « Dynamique relationnelle » de la campagne « {escape(campaign.name)} ».")
    b.p("La cohésion d'une équipe se joue dans ces relations : elles expliquent souvent ce que la mesure de cohésion constate. "
        "L'objectif n'est pas de désigner des responsables, mais de repérer les appuis et les tensions pour agir tôt.")
    b.box("Confidentialité", [
        "Ce rapport est nominatif : il nomme les personnes pivots, les relations en tension et les relations asymétriques.",
        "Il est destiné à la Direction Générale, à l'encadrant de l'équipe et à la fonction RH, et ne doit pas être diffusé au-delà.",
    ], tint=TINT_ORANGE, color=ORANGE)
    b.toc()

    # 1. Synthèse
    if total:
        action = ("Un tissu relationnel sain, sur lequel l'équipe peut s'appuyer" if pct(tension, total) < 15 else
                  "Des relations majoritairement constructives, mais des tensions à traiter avant qu'elles ne s'étendent" if pct(tension, total) < 30 else
                  "Un climat relationnel tendu, qui appelle une intervention rapide")
    else:
        action = "Une cartographie des relations encore à établir ; les facteurs relationnels sont décrits"
    b.h1("Synthèse exécutive", action)
    b.kpis([
        (str(len(members)), "personnes dans le périmètre"),
        (str(total), "relations qualifiées" + (f" ({fmt_pct(round(100 * coverage))} des relations possibles)" if coverage else "")),
        (fmt_pct(pct(positive, total)) if total else "—", "de relations excellentes ou correctes"),
        (fmt_pct(pct(tension, total)) if total else "—", "de relations difficiles ou toxiques"),
    ])
    msgs = []
    if total:
        msgs.append(f"<b>Climat relationnel.</b> Sur {total} relations qualifiées, {counts['EXCELLENT']} sont excellentes, {counts['CORRECT']} correctes, "
                    f"{counts['DIFFICULT']} difficiles et {counts['TOXIC']} toxiques.")
        if pivots:
            msgs.append("<b>Personnes pivots.</b> " + ", ".join(escape(name_of(m)) for m in pivots[:3])
                        + " entretiennent le plus de relations excellentes : des relais naturels pour les projets collectifs.")
        if tensions:
            msgs.append(f"<b>Tensions.</b> {len(tensions)} personne(s) concentrent des relations difficiles ou toxiques ; elles appellent un échange individuel.")
        if asymmetric:
            msgs.append(f"<b>Asymétries.</b> {len(asymmetric)} relation(s) sont vécues de façon opposée par les deux personnes concernées.")
        if isolated:
            msgs.append(f"<b>Isolement.</b> {len(isolated)} personne(s) n'apparaissent dans aucune relation qualifiée.")
    else:
        msgs.append("<b>Cartographie.</b> Aucune relation n'est encore qualifiée : le rapport s'appuie sur la planche des facteurs relationnels.")
    factors = _factor_counts(boards)
    if factors["toxins"]:
        msgs.append("<b>Toxines relevées.</b> " + ", ".join(f"« {escape(t)} »" for t, _n in factors["toxins"].most_common(3)) + ".")
    b.bullets(msgs)
    recs = _relational_recommendations(total, tension, asymmetric, isolated, pivots, factors, coverage)
    b.box("Trois priorités pour la suite", [f"<b>{i}.</b> {escape(r[0])}" for i, r in enumerate(recs[:3], 1)], tint=TINT_TEAL, color=TEAL)

    # 2. Méthodologie
    b.h1("Méthodologie", "Une cartographie qualifiée par l'encadrement, complétée par les facteurs observés")
    b.bullets([
        "<b>Relations.</b> Chaque relation de travail entre deux membres d'une équipe est qualifiée dans un sens donné "
        "(de A vers B) : excellente, correcte, difficile ou toxique. Une relation peut être vécue différemment dans l'autre sens.",
        "<b>Facteurs.</b> La planche « Dynamique relationnelle » recense les catalyseurs et nourrisseurs (ce qui fait grandir la "
        "relation) et les inhibiteurs et toxines (ce qui l'abîme).",
        f"<b>Date.</b> La cartographie présente l'état des relations au {fr_date(today)} ; les facteurs sont ceux de la planche "
        f"la plus récente de la campagne « {escape(campaign.name)} ».",
        "<b>Lecture.</b> Une personne pivot reçoit au moins deux relations excellentes ; une tension est signalée dès une relation "
        "toxique ou deux relations difficiles reçues ; une relation est asymétrique quand l'un la juge positive et l'autre tendue.",
    ])

    if total:
        # 3. Cartographie
        b.h1("Cartographie des relations", "Comment se répartit la qualité des relations de travail")
        b.figure_block("Répartition des relations qualifiées", StackedBar([(label, counts[k], color) for k, label, color in QUALITY]))
        if perimeter.is_org and len(teams) > 1:
            team_rows = []
            for t in teams:
                tl = [l for l in links if l.team_id == t.id]
                if not tl:
                    continue
                tc = Counter(l.quality for l in tl)
                team_rows.append([escape(t.name), str(len(tl)), fmt_pct(pct(sum(tc[q] for q in POSITIVE), len(tl))),
                                  fmt_pct(pct(sum(tc[q] for q in TENSION), len(tl))), str(tc["TOXIC"])])
            if team_rows:
                b.table("Relations par équipe", ["Équipe", "Relations", "Positives", "En tension", "Toxiques"], team_rows,
                        [70 * mm, 24 * mm, 26 * mm, 26 * mm, 24 * mm], align=["left", "center", "center", "center", "center"])
        person_rows = []
        for m in sorted(members, key=lambda m: name_of(m)):
            r = received.get(m.id, Counter())
            if not (r or emitted[m.id]):
                continue
            balance = r["EXCELLENT"] + r["CORRECT"] - r["DIFFICULT"] - 2 * r["TOXIC"]
            person_rows.append([escape(name_of(m)), str(emitted[m.id]), str(r["EXCELLENT"]), str(r["CORRECT"]), str(r["DIFFICULT"]),
                                str(r["TOXIC"]), f"{'+' if balance > 0 else ''}{balance}"])
        b.table("Relations par personne (qualités reçues)", ["Personne", "Émises", "Excellentes", "Correctes", "Difficiles", "Toxiques", "Solde"],
                person_rows, [52 * mm, 18 * mm, 21 * mm, 20 * mm, 20 * mm, 19 * mm, 20 * mm], align=["left"] + ["center"] * 6,
                note="solde = relations positives reçues − difficiles − 2 × toxiques")

        # 4. Pivots, tensions, asymétries
        b.h1("Appuis, tensions et asymétries", "Les relations à consolider et celles à désamorcer")
        b.h2("Personnes pivots")
        b.bullets([f"<b>{escape(name_of(m))}</b>{', ' + escape(m.position) if m.position else ''} — {received[m.id]['EXCELLENT']} relations excellentes reçues."
                   for m in pivots] or ["Aucune personne ne reçoit encore au moins deux relations excellentes."], color=GREEN)
        b.h2("Relations en tension")
        b.bullets([f"<b>{escape(name_of(m))}</b> — {received[m.id]['DIFFICULT']} relation(s) difficile(s), {received[m.id]['TOXIC']} toxique(s) reçue(s)."
                   for m in tensions] or ["Aucune concentration de relations difficiles ou toxiques."], color=RED)
        if asymmetric:
            b.table("Relations asymétriques", ["Personne A", "A juge B", "Personne B", "B juge A"],
                    [[escape(name_of(l.from_user)), QUALITY_LABEL[l.quality], escape(name_of(l.to_user)), QUALITY_LABEL[back.quality]]
                     for l, back in asymmetric[:25]], [52 * mm, 33 * mm, 52 * mm, 33 * mm], align=["left", "center", "left", "center"])
        if isolated:
            b.h2("Personnes sans relation qualifiée")
            b.p(", ".join(escape(name_of(m)) for m in sorted(isolated, key=name_of)[:40]) + (" …" if len(isolated) > 40 else "") + ".")

    # 5. Facteurs
    if boards:
        b.h1("Facteurs de la dynamique relationnelle", "Ce qui nourrit la relation et ce qui l'abîme")
        for key, title, color in (("catalysts", "Catalyseurs", GREEN), ("nourishers", "Nourrisseurs", TEAL),
                                  ("inhibitors", "Inhibiteurs", ORANGE), ("toxins", "Toxines", RED)):
            items = factors[key].most_common(8)
            if items:
                b.h2(title)
                b.bullets([escape(t) + (f" <font color='#6B7280'>({n} équipes)</font>" if perimeter.is_org and n > 1 else "") for t, n in items], color=color)
        people = factors["people_strengths"].most_common(5), factors["people_weaknesses"].most_common(5)
        if people[0] or people[1]:
            b.h2("Forces et faiblesses People relevées")
            b.table("Forces et faiblesses de l'équipe", ["Forces", "Faiblesses"],
                    [[escape(people[0][i][0]) if i < len(people[0]) else "", escape(people[1][i][0]) if i < len(people[1]) else ""]
                     for i in range(max(len(people[0]), len(people[1])))], [CONTENT_W / 2, CONTENT_W / 2], head_color=TEAL)

    # 6. Recommandations
    b.h1("Plan de recommandations", "Agir sur les tensions tôt, s'appuyer sur les relais naturels")
    b.table("Recommandations", ["#", "Action", "Porteur", "Horizon", "Priorité"],
            [[str(i), escape(r[0]), escape(r[1]), escape(r[2]), r[3]] for i, r in enumerate(recs, 1)],
            [8 * mm, 92 * mm, 30 * mm, 22 * mm, 18 * mm], align=["center", "left", "left", "center", "center"])

    if links and not perimeter.is_org:
        b.h1_plain("Annexe — Relations qualifiées")
        b.table("Liste des relations", ["De", "Vers", "Qualité"],
                [[escape(name_of(l.from_user)), escape(name_of(l.to_user)), QUALITY_LABEL[l.quality]]
                 for l in sorted(links, key=lambda l: (name_of(l.from_user), name_of(l.to_user)))],
                [70 * mm, 70 * mm, 30 * mm], align=["left", "left", "center"])

    title = f"Dynamique relationnelle — {perimeter.name} — {campaign.name}"
    return b.render(title, "Rapport de dynamique relationnelle", f"Dynamique relationnelle · {perimeter.name}", campaign.name,
                    "STRICTEMENT CONFIDENTIEL", cover_info)


def _factor_counts(boards):
    keys = ("catalysts", "nourishers", "inhibitors", "toxins", "people_strengths", "people_weaknesses")
    out = {k: Counter() for k in keys}
    for board in boards:
        for k in keys:
            for item in {str(v).strip() for v in (getattr(board, k) or []) if str(v).strip()}:
                out[k][item] += 1
    return out


def _relational_recommendations(total, tension, asymmetric, isolated, pivots, factors, coverage):
    recs = []
    if total and pct(tension, total) >= 15:
        recs.append(("Conduire un entretien individuel avec chaque personne concernée par une relation difficile ou toxique, puis une médiation si besoin",
                     "Encadrant et RH", "1 mois", "Haute" if pct(tension, total) >= 30 else "Moyenne"))
    if factors["toxins"]:
        top = factors["toxins"].most_common(1)[0][0]
        recs.append((f"Nommer et traiter explicitement les comportements toxiques relevés, à commencer par « {top} » : règles de fonctionnement partagées",
                     "Encadrant", "3 mois", "Haute"))
    if asymmetric:
        recs.append(("Ouvrir un dialogue sur les relations vécues de façon opposée, pour rapprocher les deux lectures", "Encadrant", "3 mois", "Moyenne"))
    if isolated:
        recs.append(("Intégrer les personnes sans relation qualifiée : binômes, projets communs, et compléter leur cartographie",
                     "Encadrant", "3 mois", "Moyenne"))
    if factors["inhibitors"]:
        top = factors["inhibitors"].most_common(1)[0][0]
        recs.append((f"Réduire les inhibiteurs, en priorité « {top} », par des rituels d'équipe et un suivi des engagements", "Encadrant", "6 mois", "Moyenne"))
    if pivots:
        recs.append(("S'appuyer sur les personnes pivots comme relais : animation de rituels, accueil des nouveaux, projets transverses",
                     "Direction et encadrant", "En continu", "Basse"))
    if not total or (coverage is not None and coverage < 0.5):
        recs.append(("Compléter la cartographie des relations dans la fiche de cohésion pour fiabiliser la lecture", "Encadrant", "1 mois", "Moyenne"))
    if factors["catalysts"]:
        top = factors["catalysts"].most_common(1)[0][0]
        recs.append((f"Valoriser les catalyseurs observés, comme « {top} », en les reconnaissant publiquement", "Encadrant", "En continu", "Basse"))
    return recs or [("Entretenir la qualité des relations par des points d'équipe réguliers et un feedback mutuel", "Encadrant", "En continu", "Basse")]


def report_filename(company, campaign, kind, team=None):
    parts = [slug(company.name), "Cohesion-equipe" if kind == "cohesion" else "Dynamique-relationnelle",
             slug(team.name) if team else "Organisation", slug(campaign.name)]
    return "_".join(parts) + ".pdf"
