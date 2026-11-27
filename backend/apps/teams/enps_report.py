"""Rapport PDF eNPS (employee Net Promoter Score) : organisation entière ou une
direction, sur une campagne. Mêmes règles que l'écran : rien n'est publié sous
le seuil de répondants de l'entreprise, les commentaires sont reproduits sans
nom, rangés par note."""
from django.utils import timezone
from reportlab.lib.units import mm

from apps.core.models import Department
from apps.evaluations.feedforward_report import (
    BarList,
    Builder,
    ReportError,
    TEAL,
    escape,
    fmt_num,
    fmt_pct,
    fr_date,
    para,
    pct,
)
from apps.evaluations.models import EvaluationCampaign
from apps.evaluations.report_ai import render_executive, strategic_summary
from apps.evaluations.talent_reports import People, _cover, _intro, _recommendations

from .models import EnpsResponse
from .team_reports import _threshold

QUESTION_1 = ("Sur une échelle de 0 à 10, quelle est la probabilité que vous recommandiez votre organisation "
              "comme un endroit où il fait bon travailler ?")
QUESTION_2 = ("Quelle est la principale raison de votre note et quelle amélioration vous inciterait à recommander "
              "davantage notre organisation ?")
CATEGORY_LABEL = {"promoter": "Promoteurs (9-10)", "passive": "Neutres (7-8)", "detractor": "Détracteurs (0-6)"}
MAX_VERBATIMS = 15


def _rows(company, team, campaign):
    qs = EnpsResponse.objects.filter(company=company, campaign=campaign)
    if team is not None:
        qs = qs.filter(team=team)
    return list(qs)


def _summary(rows):
    n = len(rows)
    counts = {"promoter": 0, "passive": 0, "detractor": 0}
    dist = [0] * 11
    for r in rows:
        counts[EnpsResponse.category(r.score)] += 1
        dist[r.score] += 1
    return {
        "n": n,
        "counts": counts,
        "pct": {k: v * 100 / n for k, v in counts.items()},
        "enps": round((counts["promoter"] - counts["detractor"]) * 100 / n),
        "average": sum(r.score for r in rows) / n,
        "dist": dist,
    }


def enps_level(value):
    return "excellent" if value >= 40 else "bon" if value >= 10 else "à améliorer" if value >= 0 else "critique"


def _signed(v):
    return f"{'+' if v > 0 else '−' if v < 0 else ''}{abs(v)}"


def build_enps_report(company, campaign, team, prepared_for):
    scope = People(company, team)
    threshold = _threshold(company)
    rows = _rows(company, team, campaign)
    if len(rows) < threshold:
        raise ReportError(
            f"Le rapport eNPS de {scope.label} sera disponible dès que {threshold} collaborateurs auront répondu "
            f"sur la campagne « {campaign.name} » ({len(rows)} à ce jour) : en dessous, les résultats ne sont pas publiés, pour préserver l'anonymat."
        )
    s = _summary(rows)
    headcount = scope.users().filter(is_active=True).count() or scope.users().count()
    history = []
    for camp in EvaluationCampaign.objects.filter(company=company, start_date__lte=campaign.start_date).order_by("start_date"):
        rs = rows if camp.pk == campaign.pk else _rows(company, team, camp)
        if len(rs) >= threshold:
            history.append((camp, _summary(rs)))
    prev = history[-2][1] if len(history) >= 2 else None
    delta = s["enps"] - prev["enps"] if prev else None
    by_category = {k: sorted((r for r in rows if EnpsResponse.category(r.score) == k), key=lambda r: (r.score, r.reason.lower()))
                   for k in ("promoter", "passive", "detractor")}

    today = timezone.localdate()
    b = Builder(f"ID-PMC, eNPS, {company.name}, {campaign.name} — {s['n']} répondants, édition du {fr_date(today)}")
    cover = _cover(f"eNPS · {campaign.name.upper()}", "RECOMMANDATION DE L'ORGANISATION COMME EMPLOYEUR",
                   "eNPS", f"{scope.name} — {campaign.name}", prepared_for, f"{scope.name} · {headcount} personnes", campaign, "eNPS")
    _intro(b, [
        f"Ce rapport présente l'eNPS (employee Net Promoter Score) de <b>{escape(scope.label)}</b> sur la campagne "
        f"« {escape(campaign.name)} ». Chaque répondant a donné une note de 0 à 10 et expliqué sa note.",
        "L'eNPS mesure l'adhésion des collaborateurs : seraient-ils prêts à recommander leur organisation comme un endroit "
        "où il fait bon travailler ? C'est un indicateur simple, comparable d'une campagne à l'autre, de l'engagement et du risque de départ.",
    ], [f"Les réponses sont anonymes ; aucun résultat n'est publié en dessous de {threshold} répondants et les commentaires sont reproduits sans nom.",
        "Il est destiné à la Direction Générale, à l'encadrement concerné et à la fonction RH."])

    ai = strategic_summary("eNPS (employee Net Promoter Score)", scope.label, campaign.name, {
        "questions": [QUESTION_1, QUESTION_2],
        "grille": "promoteurs 9-10, neutres 7-8, détracteurs 0-6 ; eNPS = % promoteurs − % détracteurs (de −100 à +100) ; "
                  "lecture : 40 et plus excellent, 10 à 39 bon, 0 à 9 à améliorer, négatif critique",
        "anonymat": f"réponses anonymes, publiées à partir de {threshold} répondants",
        "repondants": s["n"], "effectif": headcount, "enps": s["enps"], "note_moyenne": round(s["average"], 1),
        "repartition_pct": {CATEGORY_LABEL[k]: round(v, 1) for k, v in s["pct"].items()},
        "historique": {c.name: h["enps"] for c, h in history},
        "commentaires": {CATEGORY_LABEL[k]: [f"{r.score}/10 — {r.reason}" for r in v[:25]] for k, v in by_category.items()},
    })

    b.h1("Synthèse exécutive", ai.headline if ai else f"Un eNPS {enps_level(s['enps'])} de {_signed(s['enps'])}")
    b.kpis([
        (_signed(s["enps"]), "eNPS (de −100 à +100)"),
        (fmt_pct(pct(s["n"], headcount)) if headcount else str(s["n"]), f"de participation ({s['n']} répondants)"),
        (fmt_pct(round(s["pct"]["promoter"])), f"de promoteurs ({s['counts']['promoter']})"),
        (fmt_pct(round(s["pct"]["detractor"])), f"de détracteurs ({s['counts']['detractor']})"),
        (_signed(delta) if delta is not None else "—", "évolution depuis la campagne précédente"),
    ])
    if ai:
        render_executive(b, ai, para, escape)
    else:
        b.bullets([
            f"<b>Niveau d'ensemble.</b> eNPS de {_signed(s['enps'])} : niveau <b>{enps_level(s['enps'])}</b>, note moyenne de {fmt_num(s['average'], 1)} sur 10.",
            f"<b>Répartition.</b> {fmt_pct(round(s['pct']['promoter']))} de promoteurs, {fmt_pct(round(s['pct']['passive']))} de neutres, "
            f"{fmt_pct(round(s['pct']['detractor']))} de détracteurs.",
            "<b>Évolution.</b> " + (f"{_signed(delta)} point(s) depuis la campagne précédente." if delta is not None else "Première mesure publiée : pas encore de comparaison."),
        ])

    b.h1("Méthodologie", "Deux questions, trois catégories, un seuil d'anonymat")
    b.bullets([
        f"<b>Question 1.</b> {escape(QUESTION_1)}",
        f"<b>Question 2.</b> {escape(QUESTION_2)}",
        "<b>Catégories.</b> Détracteurs : notes de 0 à 6 · Neutres ou passifs : 7 et 8 · Promoteurs : 9 et 10.",
        "<b>Calcul.</b> eNPS = % de promoteurs − % de détracteurs. Le résultat va de −100 à +100 ; les neutres comptent dans le total sans ajouter ni retirer.",
        "<b>Lecture.</b> 40 et plus : excellent · 10 à 39 : bon · 0 à 9 : à améliorer · négatif : critique.",
    ])

    b.h1("Résultats", "Qui recommande, qui hésite, qui décroche")
    b.table("Répartition par catégorie", ["Catégorie", "Répondants", "Part"],
            [[CATEGORY_LABEL[k], str(s["counts"][k]), fmt_pct(round(s["pct"][k], 1))] for k in ("promoter", "passive", "detractor")],
            [80 * mm, 40 * mm, 40 * mm], align=["left", "center", "center"])
    b.figure_block("Répartition des notes (nombre de répondants)",
                   BarList([(f"Note {n}", c, str(c)) for n, c in enumerate(s["dist"])], color=TEAL, max_value=max(s["dist"]) or 1, label_width=25 * mm))

    if len(history) >= 2:
        b.h1("Évolution", "La trajectoire de l'eNPS")
        b.table("eNPS par campagne", ["Campagne", "Répondants", "Promoteurs", "Neutres", "Détracteurs", "eNPS"],
                [[escape(c.name), str(h["n"]), fmt_pct(round(h["pct"]["promoter"])), fmt_pct(round(h["pct"]["passive"])),
                  fmt_pct(round(h["pct"]["detractor"])), _signed(h["enps"])] for c, h in history],
                [46 * mm, 24 * mm, 26 * mm, 24 * mm, 26 * mm, 24 * mm], align=["left"] + ["center"] * 5)

    if team is None:
        teams = []
        for dept in Department.objects.filter(company=company).order_by("name"):
            rs = _rows(company, dept, campaign)
            if rs:
                teams.append((dept, len(rs), _summary(rs) if len(rs) >= threshold else None))
        if teams:
            b.h1("Lecture par direction", "Où l'adhésion est forte, où elle se fragilise")
            b.table("eNPS par direction", ["Direction", "Répondants", "Promoteurs", "Neutres", "Détracteurs", "eNPS"],
                    [[escape(d.name), str(n)] + ([fmt_pct(round(h["pct"]["promoter"])), fmt_pct(round(h["pct"]["passive"])),
                                                  fmt_pct(round(h["pct"]["detractor"])), _signed(h["enps"])] if h else ["non publié", "", "", ""])
                     for d, n, h in teams],
                    [52 * mm, 22 * mm, 24 * mm, 22 * mm, 24 * mm, 20 * mm], align=["left"] + ["center"] * 5,
                    note=f"une direction n'est publiée qu'à partir de {threshold} répondants")

    b.h1("Ce que disent les collaborateurs", "Raisons des notes et améliorations proposées")
    for key in ("detractor", "passive", "promoter"):
        items = by_category[key]
        b.h2(f"{CATEGORY_LABEL[key]} — {len(items)} réponse(s)")
        if not items:
            b.bullets(["Aucun commentaire dans cette catégorie."])
            continue
        shown = items[:MAX_VERBATIMS]
        b.bullets([f"<b>{r.score}/10</b> — « {escape(r.reason)} »" for r in shown]
                  + ([f"<i>… et {len(items) - len(shown)} autre(s) commentaire(s).</i>"] if len(items) > len(shown) else []))

    recs = []
    if s["pct"]["detractor"] >= 20:
        recs.append(("Rencontrer les équipes où les détracteurs sont nombreux et traiter en priorité les irritants qu'ils citent", "Direction Générale et RH", "1 à 3 mois", "Haute"))
    if s["pct"]["passive"] >= 30:
        recs.append(("Transformer les neutres en promoteurs : reconnaissance, perspectives d'évolution, écoute des propositions d'amélioration", "Managers", "3 à 6 mois", "Moyenne"))
    recs.append(("Restituer les résultats et les principales améliorations demandées, puis annoncer deux engagements concrets", "Direction Générale", "1 mois", "Moyenne"))
    recs.append(("Mesurer de nouveau l'eNPS à la prochaine campagne pour vérifier l'effet des actions engagées", "RH", "Prochaine campagne", "Moyenne"))
    _recommendations(b, recs, ai=ai)
    return b.render(f"eNPS — {scope.name} — {campaign.name}", "Rapport eNPS", f"eNPS · {scope.name}", campaign.name, "CONFIDENTIEL", cover)
