"""Rapport PDF eNPS (employee Net Promoter Score) : organisation entière ou une
direction, sur une campagne. Mêmes règles que l'écran : rien n'est publié sous
le seuil de répondants de l'entreprise, les commentaires sont reproduits sans
nom, rangés par note."""
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.platypus import Flowable

from apps.core.models import Department, User
from apps.evaluations.feedforward_report import (
    CONTENT_W,
    F_BOLD,
    F_REG,
    F_SEMI,
    GREY,
    NAVY,
    RULE,
    TEXT,
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
CAT_COLOR = {"detractor": colors.HexColor("#D7263D"), "passive": colors.HexColor("#E3A008"), "promoter": colors.HexColor("#2E9E44")}
ROWS_PER_CHART = 14


def _reading_color(v):
    return CAT_COLOR["promoter"] if v >= 40 else colors.HexColor("#17A89E") if v >= 10 else CAT_COLOR["passive"] if v >= 0 else CAT_COLOR["detractor"]


class EnpsDirectionsChart(Flowable):
    """Planche « eNPS par direction », identique à l'écran : rang et direction
    avec sa participation, barre 100 % détracteurs / neutres / promoteurs,
    échelle −100 → +100 avec le repère de l'entreprise, valeur et écart."""

    ROW = 11 * mm
    HEAD = 17 * mm

    def __init__(self, rows, benchmark, first_rank=1, width=CONTENT_W):
        super().__init__()
        self.rows, self.benchmark, self.first_rank, self.width = rows, benchmark, first_rank, width
        self.height = self.HEAD + len(rows) * self.ROW
        w = width
        self.x_name, self.w_name = 0, 0.29 * w
        self.x_bar, self.w_bar = 0.31 * w, 0.31 * w
        self.x_scale, self.w_scale = 0.65 * w, 0.21 * w
        self.x_val = w

    def wrap(self, *_args):
        return self.width, self.height

    def _sx(self, v):
        return self.x_scale + (v + 100) / 200 * self.w_scale

    def draw(self):
        c = self.canv
        top = self.height
        # Légende
        x = 0
        c.setFont(F_SEMI, 7)
        for key, label in (("detractor", "Détracteurs"), ("passive", "Neutres"), ("promoter", "Promoteurs")):
            c.setFillColor(CAT_COLOR[key])
            c.rect(x, top - 3.2 * mm, 2.6 * mm, 2.6 * mm, stroke=0, fill=1)
            c.setFillColor(TEXT)
            c.drawString(x + 3.6 * mm, top - 2.9 * mm, label)
            x += 3.6 * mm + c.stringWidth(label, F_SEMI, 7) + 5 * mm
        if self.benchmark is not None:
            c.setStrokeColor(NAVY)
            c.setDash(1.5, 1.2)
            c.setLineWidth(1)
            c.line(x + 1 * mm, top - 3.6 * mm, x + 1 * mm, top - 0.4 * mm)
            c.setDash()
            c.setFillColor(TEXT)
            c.drawString(x + 2.6 * mm, top - 2.9 * mm, f"eNPS de l'entreprise ({_signed(self.benchmark)})")
        # En-têtes de colonnes
        y_head = top - 9 * mm
        c.setFont(F_BOLD, 6.8)
        c.setFillColor(GREY)
        c.drawString(self.x_name, y_head, "Direction")
        c.drawString(self.x_bar, y_head, "Répartition des répondants")
        c.drawString(self.x_scale, y_head, "eNPS (−100 à +100)")
        c.drawRightString(self.x_val, y_head, "eNPS")
        c.setStrokeColor(NAVY)
        c.setLineWidth(1.2)
        c.line(0, y_head - 1.8 * mm, self.width, y_head - 1.8 * mm)
        # Graduations
        c.setFont(F_REG, 5.8)
        c.setFillColor(GREY)
        for v in (-100, -50, 0, 50, 100):
            c.drawCentredString(self._sx(v), top - self.HEAD + 1.2 * mm, _signed(v))

        for i, (rank_name, participation, summary) in enumerate(self.rows):
            y0 = top - self.HEAD - (i + 1) * self.ROW
            mid = y0 + self.ROW / 2
            c.setStrokeColor(RULE)
            c.setLineWidth(0.5)
            c.line(0, y0, self.width, y0)
            # Rang, direction, participation
            c.setFont(F_BOLD, 7)
            c.setFillColor(GREY)
            c.drawString(self.x_name, mid + 1.2 * mm, str(self.first_rank + i))
            lines = simpleSplit(rank_name, F_BOLD, 7.6, self.w_name - 5 * mm)[:2]
            c.setFillColor(NAVY)
            c.setFont(F_BOLD, 7.6)
            base = mid + (2.6 * mm if len(lines) == 2 else 1.2 * mm)
            for k, line in enumerate(lines):
                c.drawString(self.x_name + 4.5 * mm, base - k * 3.1 * mm, line)
            c.setFont(F_REG, 6.2)
            c.setFillColor(GREY)
            c.drawString(self.x_name + 4.5 * mm, base - len(lines) * 3.1 * mm, participation)
            # Barre 100 %
            bx, bh = self.x_bar, 4.6 * mm
            by = mid - bh / 2
            for key in ("detractor", "passive", "promoter"):
                p = summary["pct"][key]
                if not p:
                    continue
                w = self.w_bar * p / 100
                c.setFillColor(CAT_COLOR[key])
                c.rect(bx, by, w, bh, stroke=0, fill=1)
                if p >= 12:
                    c.setFillColor(colors.white)
                    c.setFont(F_BOLD, 6.2)
                    c.drawCentredString(bx + w / 2, by + 1.45 * mm, f"{int(p + 0.5)}%")
                bx += w
            # Échelle
            c.setStrokeColor(colors.HexColor("#E2E6EC"))
            c.setLineWidth(1.4)
            c.line(self.x_scale, mid, self.x_scale + self.w_scale, mid)
            c.setStrokeColor(colors.HexColor("#A0A8B4"))
            c.setLineWidth(0.6)
            c.line(self._sx(0), mid - 2.2 * mm, self._sx(0), mid + 2.2 * mm)
            if self.benchmark is not None:
                c.setStrokeColor(NAVY)
                c.setDash(1.5, 1.2)
                c.setLineWidth(0.9)
                c.line(self._sx(self.benchmark), mid - 3.2 * mm, self._sx(self.benchmark), mid + 3.2 * mm)
                c.setDash()
            color = _reading_color(summary["enps"])
            c.setStrokeColor(color)
            c.setStrokeAlpha(0.5)
            c.setLineWidth(2.2)
            c.line(self._sx(0), mid, self._sx(summary["enps"]), mid)
            c.setStrokeAlpha(1)
            c.setFillColor(colors.white)
            c.setStrokeColor(color)
            c.setLineWidth(1)
            c.circle(self._sx(summary["enps"]), mid, 1.9 * mm, stroke=1, fill=1)
            c.setFillColor(color)
            c.circle(self._sx(summary["enps"]), mid, 1.3 * mm, stroke=0, fill=1)
            # Valeur et écart
            c.setFont(F_BOLD, 11)
            c.drawRightString(self.x_val, mid + 0.6 * mm, _signed(summary["enps"]))
            if self.benchmark is not None:
                gap = summary["enps"] - self.benchmark
                c.setFont(F_SEMI, 6.2)
                c.setFillColor(CAT_COLOR["promoter"] if gap > 0 else CAT_COLOR["detractor"] if gap < 0 else GREY)
                c.drawRightString(self.x_val, mid - 3.2 * mm, "= entreprise" if gap == 0 else f"{_signed(gap)} vs entreprise")


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
            published = sorted([(d, n, h) for d, n, h in teams if h], key=lambda t: -t[2]["enps"])
            hidden = [(d, n) for d, n, h in teams if not h]
            b.h1("Lecture par direction", "Où l'adhésion est forte, où elle se fragilise")
            if published:
                rows = [(d.name, f"{n} / {User.objects.filter(department=d, is_active=True).count()} répondants", h)
                        for d, n, h in published]
                note = "directions classées de la plus forte à la plus faible adhésion ; repère en pointillés : eNPS de l'entreprise"
                for start in range(0, len(rows), ROWS_PER_CHART):
                    chunk = rows[start:start + ROWS_PER_CHART]
                    title = "eNPS par direction" + (" (suite)" if start else "")
                    b.figure_block(title, EnpsDirectionsChart(chunk, s["enps"], first_rank=start + 1), note=note)
            if hidden:
                b.bullets([f"<b>Non publiées</b> (moins de {threshold} répondants) : "
                           + " · ".join(f"{escape(d.name)} ({n} répondant{'s' if n > 1 else ''})" for d, n in hidden) + "."])

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
