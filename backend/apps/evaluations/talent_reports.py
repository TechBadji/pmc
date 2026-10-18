"""
Rapports PDF des rubriques fondées sur les évaluations :

  - Matrice ID-3A : Aptitudes (HSI) × Attitudes (SSI) = Altitude ;
  - 9 Box : performance (Altitude) × progression depuis la campagne précédente ;
  - ID-TPD (Talents Performance Dashboard) : classement, paliers, trajectoires ;
  - Performance ID d'une personne : sa fiche, son historique, ses forces.

Les règles de classement reprennent exactement celles des écrans
(`ID3AMatrixPage.tsx`, `TalentsDashboardPage.tsx`) : un même collaborateur
doit tomber dans la même case à l'écran et dans le rapport. Même mise en page
que les autres rapports (briques de `feedforward_report`).
"""
import re
from collections import Counter, defaultdict
from dataclasses import dataclass

from django.db.models import Q
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, NextPageTemplate, Spacer

from apps.core.models import Department, PerformanceProfile, User

from .feedforward_report import (
    BLUE,
    CONTENT_W,
    F_BOLD,
    F_REG,
    F_SEMI,
    GREY,
    LIGHT,
    NAVY,
    ORANGE,
    RED,
    RULE,
    TEAL,
    TEXT,
    TINT_ORANGE,
    TINT_TEAL,
    BarList,
    Builder,
    ReportError,
    escape,
    fmt_num,
    fmt_pct,
    fr_date,
    name_of,
    pct,
    slug,
)
from .models import Evaluation, EvaluationCampaign, SkillNote

GREEN = colors.HexColor("#4A9A52")
RATINGS = [("VERY_LOW", "Très faible", "< 50 %", RED), ("LOW", "Faible", "50-74 %", ORANGE), ("AVERAGE", "Moyen", "75-89 %", colors.HexColor("#D9B42C")),
           ("GOOD", "Bon", "90-100 %", TEAL), ("OUTSTANDING", "Exceptionnel", "> 100 %", GREEN)]
RATING_LABEL = {k: label for k, label, _r, _c in RATINGS}


# ---------------------------------------------------------------------------
# Périmètre commun : une direction (services compris) ou toute l'entreprise
# ---------------------------------------------------------------------------
GROUPS = {
    "leadership": "Équipe dirigeante",
    "directors": "Tous les directeurs",
    "service_heads": "Tous les responsables de services",
}


class People:
    """Ce sur quoi porte un rapport : l'organisation entière, un groupe
    (équipe dirigeante, directeurs, responsables de services — mêmes groupes
    qu'à l'écran), une direction avec ses services, ou une seule personne."""

    def __init__(self, company, team=None, group=None, person=None):
        self.company, self.team, self.group, self.person = company, team, group, person

    @classmethod
    def of(cls, company, target):
        return target if isinstance(target, cls) else cls(company, target)

    @property
    def is_org(self):
        return self.team is None and self.group is None and self.person is None

    @property
    def spans_departments(self):
        """Vrai quand le périmètre couvre plusieurs directions : la lecture par direction a alors un sens."""
        return self.is_org or self.group is not None

    @property
    def name(self):
        if self.person is not None:
            return name_of(self.person)
        if self.group:
            return GROUPS[self.group]
        return self.company.name if self.is_org else self.team.name

    @property
    def label(self):
        if self.person is not None:
            return name_of(self.person)
        if self.group:
            return f"le périmètre « {GROUPS[self.group]} » de {self.company.name}"
        return f"l'organisation {self.company.name}" if self.is_org else f"la direction « {self.team.name} »"

    def department_ids(self):
        if self.team is None:
            return None
        return [self.team.id] + list(Department.objects.filter(parent_id=self.team.id).values_list("id", flat=True))

    def users(self):
        qs = User.objects.filter(company=self.company).exclude(role=User.Role.SUPER_ADMIN)
        if self.person is not None:
            return qs.filter(pk=self.person.pk)
        if self.group == "leadership":
            return qs.filter(role__in=[User.Role.COMPANY_ADMIN, User.Role.MANAGER])
        if self.group in ("directors", "service_heads"):
            heads = Department.objects.filter(company=self.company, manager__isnull=False, manager__role=User.Role.MANAGER)
            heads = heads.filter(parent__isnull=self.group == "directors")
            return qs.filter(pk__in=heads.values("manager_id")).distinct()
        if self.team is not None:
            qs = qs.filter(Q(department_id__in=self.department_ids()) | Q(pk=self.team.manager_id))
        return qs.distinct()

    def evaluations(self, campaign):
        return list(Evaluation.objects.filter(campaign=campaign, user__in=self.users())
                    .select_related("user", "user__department", "campaign")
                    .prefetch_related("skill_scores__skill_item__matrix"))


def _cover(kicker, eyebrow, title, subtitle, prepared_for, scope, campaign, screen, classification="CONFIDENTIEL"):
    today = timezone.localdate()
    return dict(
        label="RAPPORT D'ANALYSE", kicker=kicker, eyebrow=eyebrow, title=title, subtitle=subtitle,
        meta=[("Préparé pour", prepared_for), ("Périmètre", scope),
              ("Période couverte", f"Du {fr_date(campaign.start_date)} au {fr_date(campaign.end_date)}"), ("Date d'édition", fr_date(today))],
        classification=classification, screen=screen,
    )


def _intro(b, text, confidentiality):
    b.add(Spacer(1, 1), NextPageTemplate("body"))
    b.h1_plain("À propos de ce rapport")
    for paragraph in text:
        b.p(paragraph)
    b.box("Confidentialité", confidentiality, tint=TINT_ORANGE, color=ORANGE)
    b.toc()


def _recommendations(b, recs, intro="Des actions ciblées, portées et datées"):
    b.h1("Plan de recommandations", intro)
    b.table("Recommandations", ["#", "Action", "Porteur", "Horizon", "Priorité"],
            [[str(i), escape(r[0]), escape(r[1]), escape(r[2]), r[3]] for i, r in enumerate(recs, 1)],
            [8 * mm, 92 * mm, 30 * mm, 22 * mm, 18 * mm], align=["center", "left", "left", "center", "center"])


def _f(value):
    return float(value) if value is not None else None


def previous_campaign(company, campaign):
    return EvaluationCampaign.objects.filter(company=company, start_date__lt=campaign.start_date).order_by("-start_date").first()


def _department_name(user):
    return user.department.name if user.department_id else "—"


# ---------------------------------------------------------------------------
# Matrice ID-3A
# ---------------------------------------------------------------------------
QUADRANTS = [
    ("talents", "Talents clés", "Aptitudes et attitudes au-dessus du seuil : à fidéliser et à responsabiliser.", GREEN),
    ("experts", "Experts techniques", "Aptitudes solides, attitudes à développer : coaching comportemental, travail en équipe.", BLUE),
    ("relational", "Potentiel relationnel", "Attitudes porteuses, aptitudes à renforcer : formation technique, mentorat métier.", TEAL),
    ("watch", "Zone de vigilance", "Aptitudes et attitudes sous le seuil : plan de développement rapproché et décision à terme.", RED),
]
QUADRANT = {k: (label, text, color) for k, label, text, color in QUADRANTS}
# Niveau moyen d'une compétence : 3 sur 5, pour les savoir-faire comme pour les savoir-être.
ID3A_MID = 3.0


def quadrant_of(hsi, ssi):
    if hsi >= ID3A_MID:
        return "talents" if ssi >= ID3A_MID else "experts"
    return "relational" if ssi >= ID3A_MID else "watch"


def initials(user):
    name = name_of(user)
    parts = [p for p in name.replace("-", " ").split() if p]
    if len(parts) == 1:
        # Comptes de démonstration nommés d'après leur login (EMP12, SBS3) : le numéro les distingue.
        digits = re.search(r"\d+$", parts[0])
        return digits.group(0) if digits else parts[0][:3]
    return (parts[0][0] + parts[-1][0]).upper()


class QuadrantChart(Flowable):
    """Matrice ID-3A : SSI en abscisse, HSI en ordonnée, quadrants au seuil 2,5."""

    def __init__(self, points, size=118 * mm, axis_max=5.0):
        super().__init__()
        self.points, self.size, self.axis_max = points, size, axis_max
        self.width, self.height = CONTENT_W, size + 14 * mm

    def wrap(self, *_args):
        return self.width, self.height

    def draw(self):
        c, s, m = self.canv, self.size, self.axis_max
        x0, y0 = (self.width - s) / 2 + 6 * mm, 10 * mm
        mid = s * ID3A_MID / m
        tints = {"watch": "#FBECEC", "relational": "#E7F6F4", "experts": "#EAF2FA", "talents": "#E9F4EA"}
        for key, (qx, qy, w, h) in {"watch": (0, 0, mid, mid), "relational": (mid, 0, s - mid, mid),
                                   "experts": (0, mid, mid, s - mid), "talents": (mid, mid, s - mid, s - mid)}.items():
            c.setFillColor(colors.HexColor(tints[key]))
            c.rect(x0 + qx, y0 + qy, w, h, stroke=0, fill=1)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        for i in range(int(m) + 1):
            p = s * i / m
            c.line(x0 + p, y0, x0 + p, y0 + s)
            c.line(x0, y0 + p, x0 + s, y0 + p)
            c.setFont(F_REG, 6.5)
            c.setFillColor(GREY)
            c.drawCentredString(x0 + p, y0 - 3.5 * mm, str(i))
            c.drawRightString(x0 - 1.5 * mm, y0 + p - 1, str(i))
        c.setStrokeColor(NAVY)
        c.setDash(3, 2)
        c.line(x0 + mid, y0, x0 + mid, y0 + s)
        c.line(x0, y0 + mid, x0 + s, y0 + mid)
        c.setDash()
        c.setFont(F_SEMI, 7)
        c.setFillColor(NAVY)
        for key, (lx, ly, align) in {"experts": (2 * mm, s - 4 * mm, "l"), "talents": (s - 2 * mm, s - 4 * mm, "r"),
                                     "watch": (2 * mm, 2 * mm, "l"), "relational": (s - 2 * mm, 2 * mm, "r")}.items():
            text = QUADRANT[key][0].upper()
            (c.drawString if align == "l" else c.drawRightString)(x0 + lx, y0 + ly, text)
        c.setFont(F_SEMI, 7.5)
        c.drawCentredString(x0 + s / 2, y0 - 8 * mm, "ATTITUDES — SSI (Soft Skills)")
        c.saveState()
        c.translate(x0 - 8 * mm, y0 + s / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, "APTITUDES — HSI (Hard Skills)")
        c.restoreState()
        for label, ssi, hsi, color in self.points:
            px, py = x0 + s * min(ssi, m) / m, y0 + s * min(hsi, m) / m
            c.setFillColor(color)
            c.setStrokeColor(colors.white)
            c.setLineWidth(0.8)
            c.circle(px, py, 2.9 * mm, stroke=1, fill=1)
            c.setFillColor(colors.white)
            c.setFont(F_BOLD, 5.6 if len(label) <= 2 else 4.6)
            c.drawCentredString(px, py - 2, label)


def build_id3a_report(company, campaign, team, prepared_for):
    scope = People.of(company, team)
    evals = scope.evaluations(campaign)
    if not evals:
        raise ReportError(f"Aucune évaluation n'a été enregistrée pour {scope.label} sur la campagne « {campaign.name} » : la matrice ID-3A n'a rien à présenter.")
    rows = []
    for e in evals:
        hsi, ssi, alt = float(e.hsi), float(e.ssi), float(e.altitude_percentage)
        rows.append(dict(user=e.user, hsi=hsi, ssi=ssi, alt=alt, rating=e.performance_rating, q=quadrant_of(hsi, ssi),
                         biz=_f(e.business_objectives_score), ppl=_f(e.people_objectives_score)))
    n = len(rows)
    by_q = Counter(r["q"] for r in rows)
    avg = lambda key: sum(r[key] for r in rows) / n
    prev_camp = previous_campaign(company, campaign)
    prev = {}
    if prev_camp:
        for e in scope.evaluations(prev_camp):
            prev[e.user_id] = (float(e.hsi), float(e.ssi), float(e.altitude_percentage))

    today = timezone.localdate()
    b = Builder(f"ID-PMC, Matrice ID-3A, {company.name}, {campaign.name} — {n} évaluations, édition du {fr_date(today)}")
    cover = _cover(f"MATRICE ID-3A · {campaign.name.upper()}", "APTITUDES × ATTITUDES = ALTITUDE", "Matrice ID-3A",
                   f"{scope.name} — {campaign.name}", prepared_for, f"{scope.name} · {n} personnes évaluées", campaign, "3A")
    _intro(b, [
        f"Ce rapport présente la matrice ID-3A de <b>{escape(scope.label)}</b> sur la campagne « {escape(campaign.name)} ». Chaque "
        "personne évaluée y est placée selon ses <b>Aptitudes</b> (indice des savoir-faire, HSI) et ses <b>Attitudes</b> (indice des "
        "savoir-être, SSI), notées de 1 à 5 lors de l'évaluation ; son <b>Altitude</b> est la moyenne de ses objectifs business et people.",
        "La matrice éclaire les décisions de développement : qui fidéliser, qui accompagner, sur quelles compétences investir. "
        "Elle ne se lit jamais seule, mais avec la personne et son manager.",
    ], ["Ce rapport est nominatif. Il est destiné à la Direction Générale, à l'encadrement concerné et à la fonction RH."])

    talents_share = pct(by_q["talents"], n)
    b.h1("Synthèse exécutive", "Un vivier de talents clés à fidéliser" if talents_share >= 50 else
         "Un potentiel réel, mais une part importante des équipes à accompagner")
    b.kpis([(str(n), "personnes évaluées"), (fmt_num(avg("hsi"), 2), "indice moyen des Aptitudes (HSI)"),
            (fmt_num(avg("ssi"), 2), "indice moyen des Attitudes (SSI)"), (fmt_pct(round(avg("alt"))), "Altitude moyenne (objectifs)"),
            (fmt_pct(talents_share), "en quadrant « Talents clés »")])
    msgs = [f"<b>Répartition.</b> " + ", ".join(f"{by_q[k]} {QUADRANT[k][0].lower()} ({fmt_pct(pct(by_q[k], n))})" for k, *_ in QUADRANTS) + "."]
    gap = avg("hsi") - avg("ssi")
    msgs.append(f"<b>Équilibre.</b> " + ("Les aptitudes devancent les attitudes" if gap > 0.15 else "Les attitudes devancent les aptitudes" if gap < -0.15
                                         else "Aptitudes et attitudes sont équilibrées") + f" (écart moyen {fmt_num(abs(gap), 2)}).")
    ratings = Counter(r["rating"] for r in rows)
    msgs.append(f"<b>Altitude.</b> {ratings['GOOD'] + ratings['OUTSTANDING']} personnes atteignent ou dépassent leurs objectifs (≥ 90 %), "
                f"{ratings['VERY_LOW'] + ratings['LOW']} restent sous 75 %.")
    if prev:
        moved = [r for r in rows if r["user"].id in prev and quadrant_of(prev[r["user"].id][0], prev[r["user"].id][1]) != r["q"]]
        msgs.append(f"<b>Mouvements.</b> {len(moved)} personne(s) ont changé de quadrant depuis « {escape(prev_camp.name)} ».")
    b.bullets(msgs)

    b.h1("Méthodologie", "Deux indices de compétences, un seuil, quatre quadrants")
    b.bullets([
        "<b>HSI — Aptitudes.</b> Moyenne pondérée des notes (1 à 5) des savoir-faire du référentiel métier de la personne.",
        "<b>SSI — Attitudes.</b> Moyenne pondérée des notes (1 à 5) des savoir-être du référentiel comportemental.",
        f"<b>Quadrants.</b> Une compétence est jugée de niveau moyen à {fmt_num(ID3A_MID, 0)} sur 5, en Hard Skills comme en Soft Skills : "
        "ce niveau sépare les quadrants, comme à l'écran — Talents clés (les deux indices à 3 ou plus), Experts techniques, Potentiel relationnel, Zone de vigilance.",
        "<b>Altitude.</b> Moyenne du taux d'atteinte des objectifs business et people ; paliers : très faible (< 50 %), faible (50-74 %), "
        "moyen (75-89 %), bon (90-100 %), exceptionnel (> 100 %).",
    ])

    b.h1("La matrice", "Où se situe chacun")
    points = [(initials(r["user"]), r["ssi"], r["hsi"], QUADRANT[r["q"]][2]) for r in rows]
    b.figure_block("Matrice ID-3A — Aptitudes × Attitudes", QuadrantChart(points), note="pastille = initiales, couleur = quadrant")
    for key, label, text, color in QUADRANTS:
        members = sorted([r for r in rows if r["q"] == key], key=lambda r: -(r["hsi"] + r["ssi"]))
        if members:
            b.h2(f"{label} — {len(members)} personne(s)")
            b.p(f"<i>{escape(text)}</i>", "small_grey")
            b.p(", ".join(f"{escape(name_of(r['user']))} ({fmt_num(r['hsi'], 1)} / {fmt_num(r['ssi'], 1)})" for r in members))

    b.h1("Altitude et paliers de performance", "L'atteinte des objectifs, en regard des compétences")
    b.figure_block("Répartition par palier de performance",
                   BarList([(f"{label} ({rng})", ratings[k], str(ratings[k])) for k, label, rng, _c in RATINGS], color=BLUE, label_width=60 * mm))
    b.table("Altitude moyenne par quadrant", ["Quadrant", "Effectif", "HSI", "SSI", "Altitude"],
            [[label, str(by_q[k]), fmt_num(sum(r["hsi"] for r in rows if r["q"] == k) / by_q[k], 2) if by_q[k] else "—",
              fmt_num(sum(r["ssi"] for r in rows if r["q"] == k) / by_q[k], 2) if by_q[k] else "—",
              fmt_pct(round(sum(r["alt"] for r in rows if r["q"] == k) / by_q[k])) if by_q[k] else "—"] for k, label, *_ in QUADRANTS],
            [60 * mm, 25 * mm, 28 * mm, 28 * mm, 29 * mm], align=["left", "center", "center", "center", "center"])

    if prev:
        b.h1("Évolution depuis la campagne précédente", f"Comparaison avec « {prev_camp.name} »")
        evo = []
        for r in rows:
            p = prev.get(r["user"].id)
            if not p:
                continue
            evo.append([escape(name_of(r["user"])), f"{fmt_num(p[0], 2)} » {fmt_num(r['hsi'], 2)}", f"{fmt_num(p[1], 2)} » {fmt_num(r['ssi'], 2)}",
                        f"{fmt_pct(round(p[2]))} » {fmt_pct(round(r['alt']))}", QUADRANT[quadrant_of(p[0], p[1])][0], QUADRANT[r["q"]][0]])
        evo.sort(key=lambda row: row[0])
        b.table("Indices et quadrant, campagne précédente » actuelle", ["Personne", "HSI", "SSI", "Altitude", "Avant", "Maintenant"], evo,
                [38 * mm, 25 * mm, 25 * mm, 28 * mm, 27 * mm, 27 * mm], align=["left", "center", "center", "center", "center", "center"])

    if scope.spans_departments:
        by_dept = defaultdict(list)
        for r in rows:
            by_dept[_department_name(r["user"])].append(r)
        b.h1("Lecture par direction", "Les équilibres diffèrent d'une direction à l'autre")
        b.table("Indices moyens par direction", ["Direction", "Évalués", "HSI", "SSI", "Altitude", "Talents clés"],
                [[escape(d), str(len(rs)), fmt_num(sum(r["hsi"] for r in rs) / len(rs), 2), fmt_num(sum(r["ssi"] for r in rs) / len(rs), 2),
                  fmt_pct(round(sum(r["alt"] for r in rs) / len(rs))), fmt_pct(pct(sum(1 for r in rs if r["q"] == "talents"), len(rs)))]
                 for d, rs in sorted(by_dept.items())],
                [56 * mm, 20 * mm, 22 * mm, 22 * mm, 24 * mm, 26 * mm], align=["left", "center", "center", "center", "center", "center"])

    recs = []
    if by_q["watch"]:
        recs.append((f"Établir un plan de développement rapproché pour les {by_q['watch']} personne(s) en zone de vigilance, avec un point à 3 mois", "Managers et RH", "3 mois", "Haute"))
    if by_q["experts"]:
        recs.append(("Accompagner les experts techniques sur les savoir-être : coaching, feedback, travail en binôme", "Managers", "6 mois", "Moyenne"))
    if by_q["relational"]:
        recs.append(("Renforcer les savoir-faire du potentiel relationnel : formation métier et mentorat par un expert", "RH et managers", "6 mois", "Moyenne"))
    if by_q["talents"]:
        recs.append(("Fidéliser les talents clés : missions élargies, visibilité, plan de carrière et préparation de la relève", "Direction Générale et RH", "En continu", "Moyenne"))
    if ratings["VERY_LOW"] + ratings["LOW"]:
        recs.append(("Revoir avec chaque personne sous 75 % d'Altitude la faisabilité de ses objectifs et les moyens alloués", "Managers", "1 mois", "Haute"))
    _recommendations(b, recs or [("Maintenir le dispositif et mesurer à nouveau à la prochaine campagne", "Managers", "Prochaine campagne", "Basse")])

    b.h1_plain("Annexe — Détail par personne")
    b.table("Indices et Altitude par personne", ["Personne", "Direction", "HSI", "SSI", "Altitude", "Palier", "Quadrant"],
            [[escape(name_of(r["user"])), escape(_department_name(r["user"])), fmt_num(r["hsi"], 2), fmt_num(r["ssi"], 2),
              fmt_pct(round(r["alt"])), RATING_LABEL.get(r["rating"], ""), QUADRANT[r["q"]][0]] for r in sorted(rows, key=lambda r: name_of(r["user"]))],
            [34 * mm, 36 * mm, 15 * mm, 15 * mm, 19 * mm, 22 * mm, 29 * mm], align=["left", "left", "center", "center", "center", "center", "center"])
    return b.render(f"Matrice ID-3A — {scope.name} — {campaign.name}", "Rapport Matrice ID-3A", f"Matrice ID-3A · {scope.name}",
                    campaign.name, "CONFIDENTIEL", cover)


# ---------------------------------------------------------------------------
# 9 Box et ID-TPD
# ---------------------------------------------------------------------------
BOXES = {
    "02": ("Redressement prometteur", "Soutenir et sécuriser la progression"),
    "12": ("Talent en accélération", "Développer et responsabiliser davantage"),
    "22": ("Leader moteur", "Reconnaître, fidéliser et élargir l'impact"),
    "01": ("Progrès à consolider", "Accompagnement rapproché"),
    "11": ("Contributeur en développement", "Plan ciblé de progression"),
    "21": ("Performeur solide", "Maintenir, challenger et préparer la relève"),
    "00": ("Situation critique", "Diagnostic profond et décision rapide"),
    "10": ("Manager à risque", "Plan de redressement et suivi rapproché"),
    "20": ("Haut performeur en décélération", "Prévenir l'essoufflement ou le déclin"),
}
BOX_COLOR = {"22": GREEN, "21": TEAL, "12": TEAL, "20": colors.HexColor("#D9B42C"), "11": BLUE, "02": BLUE,
             "10": ORANGE, "01": ORANGE, "00": RED}
PERF_BANDS = ["Faible (< 75 %)", "Moyen (75-89 %)", "Élevé (≥ 90 %)"]
PROG_BANDS = ["Régression ou nulle (≤ 0 %)", "Modérée (0-6 %)", "Forte (≥ 6 %)"]


def perf_band(perf):
    return 0 if perf < 75 else 1 if perf < 90 else 2


def prog_band(prog):
    return 0 if prog <= 0 else 1 if prog < 6 else 2


@dataclass
class Talent:
    user: object
    performance: float
    previous: float | None
    rating: str

    @property
    def progression(self):
        if self.previous in (None, 0):
            return None
        return round((self.performance - self.previous) / self.previous * 1000) / 10

    @property
    def box(self):
        return None if self.progression is None else f"{perf_band(self.performance)}{prog_band(self.progression)}"


def talents(scope, campaign):
    """Un point par personne évaluée : sa progression se mesure depuis sa
    propre évaluation précédente, comme à l'écran."""
    users = scope.users()
    evals = list(Evaluation.objects.filter(user__in=users, campaign__start_date__lte=campaign.start_date, campaign__company=scope.company)
                 .select_related("user", "user__department", "campaign").order_by("campaign__start_date"))
    by_user = defaultdict(list)
    for e in evals:
        by_user[e.user_id].append(e)
    out, history = [], {}
    for uid, lst in by_user.items():
        idx = next((i for i, e in enumerate(lst) if e.campaign_id == campaign.id), None)
        history[uid] = lst
        if idx is None:
            continue
        e = lst[idx]
        prev = float(lst[idx - 1].altitude_percentage) if idx > 0 else None
        out.append(Talent(e.user, float(e.altitude_percentage), prev, e.performance_rating))
    return sorted(out, key=lambda t: -t.performance), history


def _fit(text, font, size, width):
    from reportlab.pdfbase.pdfmetrics import stringWidth
    if stringWidth(text, font, size) <= width:
        return text
    while text and stringWidth(text + "…", font, size) > width:
        text = text[:-1]
    return text.rstrip() + "…"


class NineBoxGrid(Flowable):
    def __init__(self, counts, names):
        super().__init__()
        self.counts, self.names = counts, names
        self.width, self.height = CONTENT_W, 128 * mm

    def wrap(self, *_args):
        return self.width, self.height

    def draw(self):
        c = self.canv
        left, bottom = 24 * mm, 14 * mm
        cw, ch = (self.width - left) / 3, (self.height - bottom - 2 * mm) / 3
        for px in range(3):
            for py in range(3):
                key = f"{px}{py}"
                x, y = left + px * cw, bottom + py * ch
                color = BOX_COLOR[key]
                c.setFillColor(colors.Color(color.red, color.green, color.blue, alpha=0.13))
                c.setStrokeColor(colors.white)
                c.setLineWidth(2)
                c.rect(x, y, cw, ch, stroke=1, fill=1)
                c.setFillColor(color)
                c.rect(x + 1, y + ch - 1.6 * mm, cw - 2, 1.6 * mm, stroke=0, fill=1)
                c.setFillColor(NAVY)
                c.setFont(F_BOLD, 7.6)
                c.drawString(x + 3 * mm, y + ch - 6.5 * mm, _fit(BOXES[key][0], F_BOLD, 7.6, cw - 6 * mm))
                c.setFont(F_REG, 6.4)
                c.setFillColor(GREY)
                c.drawString(x + 3 * mm, y + ch - 10 * mm, _fit(BOXES[key][1], F_REG, 6.4, cw - 6 * mm))
                c.setFont(F_BOLD, 18)
                c.setFillColor(color)
                c.drawRightString(x + cw - 3 * mm, y + 3 * mm, str(self.counts.get(key, 0)))
                names = self.names.get(key, [])
                fit = max(0, int((ch - 18 * mm) / (3.3 * mm)))
                shown = names if len(names) <= fit else names[: max(0, fit - 1)]
                c.setFillColor(TEXT)
                c.setFont(F_REG, 6.4)
                for i, nm in enumerate(shown):
                    c.drawString(x + 3 * mm, y + ch - 15 * mm - i * 3.3 * mm, _fit(nm, F_REG, 6.4, cw - 16 * mm))
                if len(names) > len(shown):
                    c.setFillColor(GREY)
                    c.drawString(x + 3 * mm, y + ch - 15 * mm - len(shown) * 3.3 * mm, f"+ {len(names) - len(shown)} autre(s)")
        c.setFont(F_SEMI, 6.8)
        c.setFillColor(NAVY)
        for i, label in enumerate(PERF_BANDS):
            c.drawCentredString(left + (i + 0.5) * cw, bottom - 4.5 * mm, label)
        c.drawCentredString(left + 1.5 * cw, bottom - 10 * mm, "PERFORMANCE — Altitude (% des objectifs)")
        for i, label in enumerate(PROG_BANDS):
            c.saveState()
            c.translate(left - 4 * mm, bottom + (i + 0.5) * ch)
            c.rotate(90)
            c.drawCentredString(0, 0, label)
            c.restoreState()
        c.saveState()
        c.translate(left - 12 * mm, bottom + 1.5 * ch)
        c.rotate(90)
        c.drawCentredString(0, 0, "PROGRESSION vs campagne précédente")
        c.restoreState()


def _talent_kpis(placed):
    improving = sum(1 for t in placed if t.progression > 0)
    leaders = sum(1 for t in placed if t.performance >= 90 and t.progression >= 6)
    at_risk = sum(1 for t in placed if t.performance < 90 and t.progression <= 0)
    return improving, leaders, at_risk


def build_ninebox_report(company, campaign, team, prepared_for):
    scope = People.of(company, team)
    points, _history = talents(scope, campaign)
    if not points:
        raise ReportError(f"Aucune évaluation n'a été enregistrée pour {scope.label} sur la campagne « {campaign.name} » : le 9 Box n'a rien à présenter.")
    placed = [t for t in points if t.box]
    unrated = [t for t in points if not t.box]
    if not placed:
        raise ReportError(f"Les {len(points)} personnes évaluées sur « {campaign.name} » le sont pour la première fois : la progression, et donc le 9 Box, "
                          "ne sont calculables qu'à partir d'une deuxième campagne évaluée.")
    counts = Counter(t.box for t in placed)
    names = defaultdict(list)
    for t in placed:
        names[t.box].append(name_of(t.user))
    improving, leaders, at_risk = _talent_kpis(placed)
    n = len(placed)
    today = timezone.localdate()
    b = Builder(f"ID-PMC, 9 Box Performance Trajectory, {company.name}, {campaign.name} — {n} talents positionnés, édition du {fr_date(today)}")
    cover = _cover(f"9 BOX · {campaign.name.upper()}", "PERFORMANCE × TRAJECTOIRE", "9 Box Performance",
                   f"{scope.name} — {campaign.name}", prepared_for, f"{scope.name} · {n} talents positionnés", campaign, "9B")
    _intro(b, [
        f"Ce rapport positionne les talents de <b>{escape(scope.label)}</b> dans la matrice ID-PMC 9 Box Performance Trajectory, sur la "
        f"campagne « {escape(campaign.name)} ». Chaque personne y est placée selon sa <b>performance</b> (Altitude : taux d'atteinte de ses "
        "objectifs) et sa <b>progression</b> (écart relatif avec sa propre évaluation précédente).",
        "À chaque case correspond une conduite à tenir. Le 9 Box guide les revues de talents, les plans de succession et les "
        "priorités d'accompagnement ; il se discute avec chaque manager avant toute décision.",
    ], ["Ce rapport est nominatif. Il est destiné à la Direction Générale, à l'encadrement concerné et à la fonction RH."])

    b.h1("Synthèse exécutive", "Un vivier en dynamique positive" if pct(improving, n) >= 60 else
         "Des performances à relancer : la trajectoire d'une partie des talents s'infléchit")
    b.kpis([(str(n), "talents positionnés"), (fmt_pct(pct(improving, n)), "en progression"), (str(leaders), "leaders moteurs"),
            (str(at_risk), "à risque (< 90 % et sans progression)")])
    top_box = counts.most_common(1)[0]
    msgs = [f"<b>Case la plus peuplée.</b> « {BOXES[top_box[0]][0]} » ({top_box[1]} personnes, {fmt_pct(pct(top_box[1], n))}) : {BOXES[top_box[0]][1].lower()}."]
    if leaders:
        msgs.append(f"<b>Leaders moteurs.</b> {leaders} personne(s) cumulent haute performance et forte progression : à reconnaître et fidéliser.")
    if at_risk:
        msgs.append(f"<b>Vigilance.</b> {at_risk} personne(s) sont sous 90 % sans progresser : un plan de redressement s'impose.")
    if counts["20"]:
        msgs.append(f"<b>Décélération.</b> {counts['20']} haut(s) performeur(s) reculent : un signal d'essoufflement à traiter tôt.")
    if unrated:
        msgs.append(f"<b>Non positionnés.</b> {len(unrated)} personne(s) évaluée(s) pour la première fois : progression non calculable.")
    b.bullets(msgs)

    b.h1("Méthodologie", "Trois paliers de performance, trois paliers de progression")
    b.bullets([
        "<b>Performance.</b> Altitude de la campagne : moyenne des taux d'atteinte des objectifs business et people. "
        "Paliers : faible (< 75 %), moyen (75-89 %), élevé (≥ 90 %).",
        "<b>Progression.</b> (Altitude actuelle − Altitude précédente) / Altitude précédente, mesurée sur la propre évaluation précédente "
        "de la personne. Paliers : régression ou nulle (≤ 0 %), modérée (moins de 6 %), forte (6 % et plus).",
        "<b>Indicateurs.</b> Leader moteur : performance ≥ 90 % et progression ≥ 6 %. À risque : performance < 90 % et progression ≤ 0 %.",
    ])

    b.h1("La matrice 9 Box", "Où se situe chacun, et ce qu'il faut faire")
    b.figure_block("Matrice 9 Box Performance Trajectory", NineBoxGrid(counts, names))
    b.table("Effectif et conduite à tenir par case", ["Case", "Effectif", "Part", "Conduite à tenir"],
            [[BOXES[k][0], str(counts.get(k, 0)), fmt_pct(pct(counts.get(k, 0), n)), BOXES[k][1]]
             for k in ("22", "21", "12", "20", "11", "02", "10", "01", "00")],
            [55 * mm, 20 * mm, 18 * mm, 77 * mm], align=["left", "center", "center", "left"])

    b.h1("Détail par personne", "Performance, progression et case")
    b.table("Positionnement individuel", ["Personne", "Direction", "Précédente", "Actuelle", "Progression", "Case"],
            [[escape(name_of(t.user)), escape(_department_name(t.user)), fmt_pct(round(t.previous)), fmt_pct(round(t.performance)),
              f"{'+' if t.progression > 0 else ''}{fmt_num(t.progression, 1)} %", BOXES[t.box][0]] for t in placed],
            [36 * mm, 36 * mm, 20 * mm, 18 * mm, 22 * mm, 38 * mm], align=["left", "left", "center", "center", "center", "left"])
    if unrated:
        b.p("<b>Évalués pour la première fois</b> (non positionnés) : " + ", ".join(escape(name_of(t.user)) for t in unrated) + ".")

    recs = []
    if counts["00"] + counts["10"]:
        recs.append(("Engager un diagnostic et un plan de redressement formalisé pour les situations critiques et les profils à risque", "Managers et RH", "1 mois", "Haute"))
    if counts["20"]:
        recs.append(("Ouvrir un entretien de motivation avec les hauts performeurs en décélération : charge, perspectives, reconnaissance", "Managers", "1 mois", "Haute"))
    if counts["01"] + counts["11"] + counts["02"]:
        recs.append(("Bâtir des plans de progression ciblés pour les contributeurs en développement et sécuriser les redressements engagés", "Managers", "3 mois", "Moyenne"))
    if counts["22"] + counts["12"] + counts["21"]:
        recs.append(("Inscrire leaders moteurs, talents en accélération et performeurs solides dans les plans de succession", "Direction Générale et RH", "6 mois", "Moyenne"))
    _recommendations(b, recs)
    return b.render(f"9 Box — {scope.name} — {campaign.name}", "Rapport 9 Box", f"9 Box · {scope.name}", campaign.name, "CONFIDENTIEL", cover)


def build_tpd_report(company, campaign, team, prepared_for):
    scope = People.of(company, team)
    points, history = talents(scope, campaign)
    if not points:
        raise ReportError(f"Aucune évaluation n'a été enregistrée pour {scope.label} sur la campagne « {campaign.name} » : le tableau de bord n'a rien à présenter.")
    n = len(points)
    placed = [t for t in points if t.progression is not None]
    ratings = Counter(t.rating for t in points)
    avg_perf = sum(t.performance for t in points) / n
    avg_prog = sum(t.progression for t in placed) / len(placed) if placed else None
    improving, leaders, at_risk = _talent_kpis(placed) if placed else (0, 0, 0)
    campaigns = list(EvaluationCampaign.objects.filter(company=company, start_date__lte=campaign.start_date).order_by("start_date"))[-4:]
    today = timezone.localdate()
    b = Builder(f"ID-PMC, Talents Performance Dashboard, {company.name}, {campaign.name} — {n} talents, édition du {fr_date(today)}")
    cover = _cover(f"ID-TPD · {campaign.name.upper()}", "TALENTS PERFORMANCE DASHBOARD", "ID-TPD",
                   f"{scope.name} — {campaign.name}", prepared_for, f"{scope.name} · {n} talents évalués", campaign, "TPD")
    _intro(b, [
        f"Ce rapport présente le tableau de bord de la performance des talents de <b>{escape(scope.label)}</b> (ID-TPD) sur la campagne "
        f"« {escape(campaign.name)} » : niveau de performance de chacun, progression depuis sa précédente évaluation, et trajectoire "
        "sur les dernières campagnes.",
        "Là où le 9 Box classe, l'ID-TPD mesure : il permet de suivre dans la durée la dynamique de chaque talent et de l'équipe.",
    ], ["Ce rapport est nominatif. Il est destiné à la Direction Générale, à l'encadrement concerné et à la fonction RH."])

    b.h1("Synthèse exécutive", f"Une Altitude moyenne de {fmt_num(avg_perf, 1)} %" + (f", en {'hausse' if avg_prog > 0 else 'baisse'} de {fmt_num(abs(avg_prog), 1)} % en moyenne" if avg_prog is not None else ""))
    b.kpis([(str(n), "talents évalués"), (fmt_pct(round(avg_perf)), "Altitude moyenne"),
            ((f"{'+' if avg_prog > 0 else ''}{fmt_num(avg_prog, 1)} %") if avg_prog is not None else "—", "progression moyenne"),
            (str(leaders), "leaders moteurs"), (str(at_risk), "à risque")])
    msgs = [f"<b>Paliers.</b> " + ", ".join(f"{ratings[k]} {label.lower()}" for k, label, *_ in RATINGS) + "."]
    if placed:
        best = max(placed, key=lambda t: t.progression)
        worst = min(placed, key=lambda t: t.progression)
        msgs.append(f"<b>Plus forte progression.</b> {escape(name_of(best.user))} (+{fmt_num(best.progression, 1)} %).")
        if worst.progression < 0:
            msgs.append(f"<b>Plus fort recul.</b> {escape(name_of(worst.user))} ({fmt_num(worst.progression, 1)} %).")
        msgs.append(f"<b>Dynamique.</b> {improving} talents sur {len(placed)} progressent ({fmt_pct(pct(improving, len(placed)))}).")
    b.bullets(msgs)

    b.h1("Paliers de performance", "Comment se répartit l'atteinte des objectifs")
    b.figure_block("Talents par palier de performance",
                   BarList([(f"{label} ({rng})", ratings[k], str(ratings[k])) for k, label, rng, _c in RATINGS], color=BLUE, label_width=60 * mm))
    b.figure_block("Altitude par talent (%)",
                   BarList([(name_of(t.user), t.performance, fmt_pct(round(t.performance))) for t in points[:30]], color=TEAL,
                           max_value=max(125, max(t.performance for t in points)), label_width=55 * mm),
                   note="les 30 premiers talents" if n > 30 else None)

    if placed:
        b.h1("Progression", "Qui accélère, qui ralentit")
        ranked = sorted(placed, key=lambda t: -t.progression)
        b.table("Progression depuis la précédente évaluation", ["Personne", "Direction", "Précédente", "Actuelle", "Progression", "Lecture"],
                [[escape(name_of(t.user)), escape(_department_name(t.user)), fmt_pct(round(t.previous)), fmt_pct(round(t.performance)),
                  f"{'+' if t.progression > 0 else ''}{fmt_num(t.progression, 1)} %", BOXES[t.box][0]] for t in ranked],
                [36 * mm, 36 * mm, 20 * mm, 18 * mm, 22 * mm, 38 * mm], align=["left", "left", "center", "center", "center", "left"])

    if len(campaigns) >= 2:
        b.h1("Trajectoires", "L'Altitude de chacun sur les dernières campagnes")
        rows = []
        for t in points:
            lst = {e.campaign_id: float(e.altitude_percentage) for e in history.get(t.user.id, [])}
            rows.append([escape(name_of(t.user))] + [fmt_pct(round(lst[c.id])) if c.id in lst else "—" for c in campaigns])
        w = (CONTENT_W - 50 * mm) / len(campaigns)
        b.table("Altitude par campagne", ["Personne"] + [escape(c.name) for c in campaigns], rows,
                [50 * mm] + [w] * len(campaigns), align=["left"] + ["center"] * len(campaigns))

    if scope.spans_departments:
        by_dept = defaultdict(list)
        for t in points:
            by_dept[_department_name(t.user)].append(t)
        b.h1("Lecture par direction", "Performance et dynamique comparées")
        b.table("Indicateurs par direction", ["Direction", "Talents", "Altitude moyenne", "Progression moyenne", "≥ 90 %"],
                [[escape(d), str(len(ts)), fmt_pct(round(sum(t.performance for t in ts) / len(ts))),
                  (lambda ps: f"{fmt_num(sum(ps) / len(ps), 1)} %" if ps else "—")([t.progression for t in ts if t.progression is not None]),
                  fmt_pct(pct(sum(1 for t in ts if t.performance >= 90), len(ts)))] for d, ts in sorted(by_dept.items())],
                [62 * mm, 22 * mm, 30 * mm, 32 * mm, 24 * mm], align=["left", "center", "center", "center", "center"])

    recs = [("Partager le tableau de bord avec chaque manager et fixer, pour chaque talent, un objectif de trajectoire à la prochaine campagne",
             "Direction Générale", "1 mois", "Moyenne")]
    if at_risk:
        recs.insert(0, (f"Revoir sans attendre la situation des {at_risk} talent(s) à risque : objectifs, moyens, accompagnement", "Managers et RH", "1 mois", "Haute"))
    if ratings["OUTSTANDING"]:
        recs.append(("Vérifier que les objectifs dépassés (> 100 %) étaient suffisamment ambitieux, et reconnaître ces performances", "Managers", "Prochaine campagne", "Basse"))
    _recommendations(b, recs)
    return b.render(f"ID-TPD — {scope.name} — {campaign.name}", "Rapport ID-TPD", f"ID-TPD · {scope.name}", campaign.name, "CONFIDENTIEL", cover)


# ---------------------------------------------------------------------------
# Performance ID d'une personne
# ---------------------------------------------------------------------------
def _items(values):
    return [escape(str(v)) for v in (values or []) if str(v).strip()]


def build_person_id_report(company, campaign, subject, prepared_for):
    profile = PerformanceProfile.objects.filter(user=subject).first()
    evals = list(Evaluation.objects.filter(user=subject, campaign__start_date__lte=campaign.start_date)
                 .select_related("campaign").prefetch_related("skill_scores__skill_item__matrix").order_by("campaign__start_date"))
    current = next((e for e in evals if e.campaign_id == campaign.id), None)
    if profile is None and not evals:
        raise ReportError(f"La fiche Performance ID de {name_of(subject)} n'est pas renseignée et aucune évaluation n'existe : le rapport n'aurait rien à présenter.")
    today = timezone.localdate()
    b = Builder(f"ID-PMC, Performance ID, {company.name}, {campaign.name} — {name_of(subject)}, édition du {fr_date(today)}")
    cover = _cover(f"PERFORMANCE ID · {campaign.name.upper()}", "CARTE D'IDENTITÉ DE LA PERFORMANCE", "Performance ID",
                   name_of(subject) + (f" — {subject.position}" if subject.position else ""), prepared_for,
                   _department_name(subject) if subject.department_id else company.name, campaign, "ID", "STRICTEMENT CONFIDENTIEL")
    _intro(b, [
        f"Ce rapport présente la carte d'identité de la performance de <b>{escape(name_of(subject))}</b>"
        f"{', ' + escape(subject.position) if subject.position else ''} : son parcours, ses réalisations, ce qui le ou la motive, ses "
        f"évaluations successives jusqu'à la campagne « {escape(campaign.name)} », ses forces et ses axes de développement.",
        "C'est un support d'entretien : il se lit avec la personne, pour construire ensemble son plan de développement.",
    ], ["Ce rapport est personnel. Il est destiné à la personne concernée, à son manager, à la Direction Générale et à la fonction RH."])

    b.h1("Synthèse", "Le profil en un coup d'œil")
    tiles = []
    if current:
        tiles += [(fmt_pct(round(float(current.altitude_percentage))), f"Altitude {campaign.name}"), (fmt_num(float(current.hsi), 2), "Aptitudes (HSI)"),
                  (fmt_num(float(current.ssi), 2), "Attitudes (SSI)"), (RATING_LABEL.get(current.performance_rating, "—"), "palier de performance")]
    for value, label in ((subject.years_in_company, "ans dans l'entreprise"), (subject.total_experience_years, "ans d'expérience")):
        if value is not None and len(tiles) < 5:
            tiles.append((str(value), label))
    if tiles:
        b.kpis(tiles)
    facts = []
    if current:
        hsi, ssi = float(current.hsi), float(current.ssi)
        facts.append(f"<b>Matrice ID-3A.</b> Quadrant « {QUADRANT[quadrant_of(hsi, ssi)][0]} » : {QUADRANT[quadrant_of(hsi, ssi)][1][0].lower()}{QUADRANT[quadrant_of(hsi, ssi)][1][1:]}")
        prev = next((e for e in reversed(evals) if e.campaign.start_date < campaign.start_date), None)
        if prev:
            t = Talent(subject, float(current.altitude_percentage), float(prev.altitude_percentage), current.performance_rating)
            if t.box:
                facts.append(f"<b>9 Box.</b> « {BOXES[t.box][0]} » (progression {'+' if t.progression > 0 else ''}{fmt_num(t.progression, 1)} % depuis « {escape(prev.campaign.name)} ») : {BOXES[t.box][1].lower()}.")
    if profile and profile.bono_hat:
        facts.append(f"<b>Chapeau de Bono.</b> {escape(profile.bono_hat)}.")
    if profile and profile.vision_aspirations:
        facts.append(f"<b>Vision et aspirations.</b> {escape(profile.vision_aspirations)}")
    if facts:
        b.bullets(facts)

    if profile:
        b.h1("Parcours et réalisations", "D'où vient la performance")
        identity = [("Poste", subject.position), ("Direction", _department_name(subject)), ("Contrat", profile.contract_type),
                    ("Âge", f"{subject.age} ans" if subject.age is not None else ""), ("Ancienneté dans le poste", f"{subject.years_in_current_role} ans" if subject.years_in_current_role is not None else "")]
        b.table("Identité professionnelle", ["Élément", "Valeur"], [[k, escape(str(v))] for k, v in identity if v], [60 * mm, CONTENT_W - 60 * mm])
        for title, values in (("Qualifications", profile.qualifications), ("Postes précédents", [
                f"{p} ({d})" if i < len(profile.previous_position_dates or []) and (d := profile.previous_position_dates[i]) else p
                for i, p in enumerate(profile.previous_positions or [])]),
                ("Réalisations professionnelles", profile.professional_achievements), ("Réalisations personnelles", profile.personal_achievements)):
            if _items(values):
                b.h2(title)
                b.bullets(_items(values), color=TEAL)

        b.h1("Ce qui anime la personne", "Motivations, personnalité, relation à l'équipe")
        pairs = [("Ce qui le/la motive", profile.motivates), ("Traits de personnalité", profile.personality_traits),
                 ("Ce qu'il/elle n'aime pas", profile.dislikes), ("Loisirs", profile.hobbies),
                 ("Modèles professionnels", profile.professional_role_models), ("Modèles dans la vie", profile.role_models_in_life),
                 ("Apporte à l'équipe", profile.brings_to_team), ("Apporte au manager", profile.brings_to_manager),
                 ("Attend de l'équipe", profile.expects_from_team), ("Attend du manager", profile.expects_from_manager)]
        rows = [[k, "<br/>".join(_items(v))] for k, v in pairs if _items(v)]
        if rows:
            b.table("Profil personnel", ["Rubrique", "Éléments"], rows, [55 * mm, CONTENT_W - 55 * mm], align=["left", "left"])
        if profile.personal_projects:
            b.box("Projets personnels", escape(profile.personal_projects), tint=TINT_TEAL, color=TEAL)

    if evals:
        b.h1("Historique des évaluations", "La performance dans la durée")
        b.table("Évaluations successives", ["Campagne", "Business", "People", "Altitude", "Palier", "HSI", "SSI"],
                [[escape(e.campaign.name), fmt_pct(round(float(e.business_objectives_score))), fmt_pct(round(float(e.people_objectives_score))),
                  fmt_pct(round(float(e.altitude_percentage))), RATING_LABEL.get(e.performance_rating, ""), fmt_num(float(e.hsi), 2), fmt_num(float(e.ssi), 2)]
                 for e in evals], [38 * mm, 21 * mm, 21 * mm, 21 * mm, 27 * mm, 21 * mm, 21 * mm], align=["left"] + ["center"] * 6)
        if len(evals) >= 2:
            b.figure_block("Altitude par campagne (%)", BarList([(e.campaign.name, float(e.altitude_percentage), fmt_pct(round(float(e.altitude_percentage))))
                                                                 for e in evals], color=TEAL, max_value=125, label_width=50 * mm))

    if current:
        notes = list(SkillNote.objects.filter(evaluation=current).exclude(text="").order_by("category", "order"))
        if notes:
            b.h1("Forces et axes de développement", f"Relevés lors de l'évaluation « {campaign.name} »")
            labels = {"HARD_STRENGTH": "Forces — savoir-faire", "SOFT_STRENGTH": "Forces — savoir-être",
                      "HARD_WEAKNESS": "Axes de progrès — savoir-faire", "SOFT_WEAKNESS": "Axes de progrès — savoir-être"}
            for cat, label in labels.items():
                items = [n for n in notes if n.category == cat]
                if items:
                    b.h2(label)
                    b.bullets([f"{escape(n.text)}" + (f" <font color='#6B7280'>({fmt_num(float(n.score), 1)})</font>" if n.score is not None else "")
                               for n in items], color=GREEN if "STRENGTH" in cat else ORANGE)

    if profile and any(_items(v) for v in (profile.dev_priorities, profile.dev_professional_perspectives, profile.dev_actions_support, profile.dev_risks_obstacles)):
        b.h1("Plan de développement", "Les priorités convenues")
        rows = [[k, "<br/>".join(_items(v))] for k, v in (("Priorités de développement", profile.dev_priorities),
                ("Perspectives professionnelles", profile.dev_professional_perspectives), ("Actions de soutien", profile.dev_actions_support),
                ("Risques et obstacles", profile.dev_risks_obstacles)) if _items(v)]
        b.table("Plan de développement", ["Rubrique", "Éléments"], rows, [55 * mm, CONTENT_W - 55 * mm], align=["left", "left"])
    b.box("Prochaines étapes", ["Relire ce rapport avec la personne lors de son prochain entretien.",
                                "Convenir de deux ou trois priorités de développement et des moyens associés.",
                                "Mettre à jour la fiche Performance ID après l'entretien."])
    return b.render(f"Performance ID — {name_of(subject)} — {campaign.name}", "Rapport Performance ID", f"Performance ID · {name_of(subject)}",
                    campaign.name, "STRICTEMENT CONFIDENTIEL", cover)


def filename(company, campaign, label, target):
    return "_".join([slug(company.name), label, slug(target), slug(campaign.name)]) + ".pdf"
