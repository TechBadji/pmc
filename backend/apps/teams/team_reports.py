"""
Rapports PDF des rubriques d'équipe :

  - Psychological Safety (PSI) : indice global, quatre dimensions, douze
    affirmations, évolution, lecture par direction — sous le seuil d'anonymat ;
  - Forces & faiblesses : la carte de l'équipe (People / Business) et la
    consolidation des forces et axes de progrès relevés dans les évaluations ;
  - Team Performance ID : la carte d'identité de la performance de l'équipe.

Même mise en page que les autres rapports (briques de `feedforward_report`).
"""
from collections import Counter, defaultdict

from django.utils import timezone
from reportlab.lib.units import mm

from apps.core.models import Department
from apps.evaluations.feedforward_report import (
    BLUE,
    CONTENT_W,
    ORANGE,
    RED,
    TEAL,
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
)
from apps.evaluations.models import EvaluationCampaign, SkillNote
from apps.evaluations.talent_reports import GREEN, QUADRANT, People, _cover, _intro, _recommendations, quadrant_of

from .aggregation import MIN_RESPONDENTS, aggregate_responses
from .models import CohesionResponse, PsychologicalSafetyResponse, TeamBoard
from .psi_texts import DIMENSION_NAME, DIMENSION_QUESTION, DIMENSION_TITLE, STATEMENTS, STATEMENTS_ORG
from .serializers import PSI_DIMENSIONS

PSI_ADVICE = {
    "belonging": ("Renforcer l'inclusion : rituels d'accueil, règles de respect partagées, attention aux personnes en marge des échanges", "Managers"),
    "learning": ("Banaliser l'erreur et la question : retours d'expérience sans recherche de coupable, managers qui reconnaissent leurs propres limites", "Managers et Direction"),
    "contributing": ("Élargir l'autonomie et la prise d'initiative : délégation explicite, sollicitation de chacun en réunion", "Managers"),
    "challenging": ("Protéger le désaccord : solliciter explicitement les avis contraires, remercier ceux qui signalent un risque, ne jamais sanctionner la contradiction", "Direction Générale et managers"),
}


def _threshold(company):
    return getattr(company, "cohesion_min_respondents", None) or MIN_RESPONDENTS


def _psi_rows(company, team, campaign):
    if team is None:
        qs = PsychologicalSafetyResponse.objects.filter(company=company, campaign=campaign, scope=PsychologicalSafetyResponse.Scope.ORGANISATION)
    else:
        qs = PsychologicalSafetyResponse.objects.filter(team=team, campaign=campaign, scope=PsychologicalSafetyResponse.Scope.TEAM)
    return [r for r in qs if len(r.scores or []) >= 12]


def _psi_summary(rows):
    n = len(rows)
    items = [sum(r.scores[i] for r in rows) / n for i in range(12)]
    low = [sum(1 for r in rows if r.scores[i] <= 2) / n for i in range(12)]
    dims = {key: sum(items[d * 3:d * 3 + 3]) / 3 for d, key in enumerate(PSI_DIMENSIONS)}
    return {"n": n, "items": items, "low": low, "dims": dims, "global": sum(dims.values()) / 4}


def psi_level(score):
    return "fragile" if score < 2.5 else "à consolider" if score < 3.25 else "solide" if score < 4 else "forte"


def build_psi_report(company, campaign, team, prepared_for):
    scope = People(company, team)
    threshold = _threshold(company)
    rows = _psi_rows(company, team, campaign)
    if len(rows) < threshold:
        raise ReportError(
            f"Le rapport Psychological Safety de {scope.label} sera disponible dès que {threshold} collaborateurs auront répondu au questionnaire "
            f"sur la campagne « {campaign.name} » ({len(rows)} à ce jour) : en dessous, les résultats ne sont pas publiés, pour préserver l'anonymat."
        )
    s = _psi_summary(rows)
    headcount = scope.users().filter(is_active=True).count() or scope.users().count()
    statements = STATEMENTS_ORG if team is None else STATEMENTS
    ranked_dims = sorted(s["dims"].items(), key=lambda kv: kv[1])
    weakest_dim, strongest_dim = ranked_dims[0], ranked_dims[-1]
    history = []
    for camp in EvaluationCampaign.objects.filter(company=company, start_date__lte=campaign.start_date).order_by("start_date"):
        rs = rows if camp.pk == campaign.pk else _psi_rows(company, team, camp)
        if len(rs) >= threshold:
            history.append((camp, _psi_summary(rs)))
    prev = history[-2][1] if len(history) >= 2 else None
    today = timezone.localdate()
    b = Builder(f"ID-PMC, Psychological Safety Index, {company.name}, {campaign.name} — {s['n']} répondants, édition du {fr_date(today)}")
    cover = _cover(f"PSYCHOLOGICAL SAFETY · {campaign.name.upper()}", "SÉCURITÉ PSYCHOLOGIQUE DE L'ORGANISATION" if team is None else "SÉCURITÉ PSYCHOLOGIQUE DE L'ÉQUIPE",
                   "Psychological Safety", f"{scope.name} — {campaign.name}", prepared_for, f"{scope.name} · {headcount} personnes", campaign, "PSI")
    _intro(b, [
        f"Ce rapport présente l'indice de sécurité psychologique ID-PMC (PSI) de <b>{escape(scope.label)}</b> sur la campagne "
        f"« {escape(campaign.name)} ». Chaque répondant a noté de 1 à 5 douze affirmations réparties en quatre dimensions : "
        "appartenance, apprentissage, contribution et remise en question.",
        "La sécurité psychologique est la conviction partagée qu'on peut prendre un risque interpersonnel — poser une question, "
        "reconnaître une erreur, contredire — sans être puni ni humilié. C'est le socle de la cohésion et de la performance collective.",
    ], [f"Les réponses sont anonymes ; aucun résultat n'est publié en dessous de {threshold} répondants et ce rapport ne présente que des moyennes.",
        "Il est destiné à la Direction Générale, à l'encadrement concerné et à la fonction RH."])

    b.h1("Synthèse exécutive", f"Une sécurité psychologique {psi_level(s['global'])}, portée par « {DIMENSION_TITLE[strongest_dim[0]]} »")
    delta = s["global"] - prev["global"] if prev else None
    b.kpis([(f"{fmt_num(s['global'], 2)} / 5", "indice PSI global"), (fmt_pct(pct(s["n"], headcount)) if headcount else str(s["n"]), f"de participation ({s['n']} répondants)"),
            (fmt_num(strongest_dim[1], 2), f"dimension la plus forte : {DIMENSION_NAME[strongest_dim[0]]}"),
            (fmt_num(weakest_dim[1], 2), f"dimension la plus faible : {DIMENSION_NAME[weakest_dim[0]]}"),
            ((f"{'+' if delta > 0 else '−' if delta < 0 else '±'}{fmt_num(abs(delta), 2)}") if delta is not None else "—", "évolution depuis la campagne précédente")])
    worst_items = sorted(range(12), key=lambda i: s["items"][i])[:3]
    b.bullets([
        f"<b>Niveau d'ensemble.</b> Indice de {fmt_num(s['global'], 2)} sur 5 : sécurité psychologique <b>{psi_level(s['global'])}</b>.",
        f"<b>Point d'appui.</b> « {DIMENSION_TITLE[strongest_dim[0]]} » ({fmt_num(strongest_dim[1], 2)}).",
        f"<b>Fragilité.</b> « {DIMENSION_TITLE[weakest_dim[0]]} » ({fmt_num(weakest_dim[1], 2)}) — {escape(DIMENSION_QUESTION[weakest_dim[0]])}",
        "<b>Affirmations les moins partagées.</b> " + " ; ".join(f"« {escape(statements[i][:90])}{'…' if len(statements[i]) > 90 else ''} » ({fmt_num(s['items'][i], 2)})" for i in worst_items) + ".",
    ])

    b.h1("Méthodologie", "Douze affirmations, quatre dimensions, un seuil d'anonymat")
    b.bullets([f"<b>{DIMENSION_NAME[k]} — {DIMENSION_TITLE[k]}.</b> {escape(DIMENSION_QUESTION[k])}" for k in PSI_DIMENSIONS] + [
        "<b>Calcul.</b> Chaque dimension est la moyenne de ses trois affirmations ; l'indice global est la moyenne des quatre dimensions.",
        "<b>Lecture.</b> Moins de 2,5 : fragile · 2,5 à 3,25 : à consolider · 3,25 à 4 : solide · 4 et plus : forte.",
    ])

    b.h1("Les quatre dimensions", "Ce qui sécurise et ce qui retient la parole")
    b.figure_block("Indice par dimension (sur 5)", BarList([(f"{DIMENSION_NAME[k]} — {DIMENSION_TITLE[k][:40]}", v, fmt_num(v, 2)) for k, v in s["dims"].items()],
                                                       color=TEAL, max_value=5, label_width=85 * mm))
    for d, key in enumerate(PSI_DIMENSIONS):
        b.h2(f"{DIMENSION_NAME[key]} — {fmt_num(s['dims'][key], 2)} ({psi_level(s['dims'][key])})")
        b.table(f"{DIMENSION_TITLE[key]}", ["Affirmation", "Moyenne", "Avis bas"],
                [[escape(statements[i]), fmt_num(s["items"][i], 2), fmt_pct(round(100 * s["low"][i]))] for i in range(d * 3, d * 3 + 3)],
                [130 * mm, 20 * mm, 20 * mm], align=["left", "center", "center"], note="avis bas = notes de 1 ou 2")

    if len(history) >= 2:
        b.h1("Évolution", "La trajectoire de la sécurité psychologique")
        b.table("Indice par campagne", ["Campagne", "Répondants", "Global"] + [DIMENSION_NAME[k].split()[0] for k in PSI_DIMENSIONS],
                [[escape(c.name), str(h["n"]), fmt_num(h["global"], 2)] + [fmt_num(h["dims"][k], 2) for k in PSI_DIMENSIONS] for c, h in history],
                [40 * mm, 22 * mm, 20 * mm] + [22 * mm] * 4, align=["left"] + ["center"] * 6)

    if team is None:
        teams = []
        for dept in Department.objects.filter(company=company).order_by("name"):
            rs = _psi_rows(company, dept, campaign)
            teams.append((dept, len(rs), _psi_summary(rs) if len(rs) >= threshold else None))
        teams = [t for t in teams if t[1]]
        if teams:
            b.h1("Lecture par direction", "Les avis des collaborateurs sur leur propre équipe")
            b.table("Indice PSI par direction (portée équipe)", ["Direction", "Répondants", "Global"] + [DIMENSION_NAME[k].split()[0] for k in PSI_DIMENSIONS],
                    [[escape(d.name), str(n)] + ([fmt_num(h["global"], 2)] + [fmt_num(h["dims"][k], 2) for k in PSI_DIMENSIONS] if h else ["non publié"] + [""] * 4)
                     for d, n, h in teams], [42 * mm, 22 * mm, 22 * mm] + [21 * mm] * 4, align=["left"] + ["center"] * 6,
                    note=f"une direction n'est publiée qu'à partir de {threshold} répondants")

    recs = []
    for key, value in ranked_dims[:2]:
        action, owner = PSI_ADVICE[key]
        recs.append((action, owner, "3 à 6 mois", "Haute" if value < 3 else "Moyenne"))
    recs.append(("Restituer les résultats aux équipes et co-construire avec elles deux engagements concrets", "Managers", "1 mois", "Moyenne"))
    _recommendations(b, recs)
    return b.render(f"Psychological Safety — {scope.name} — {campaign.name}", "Rapport Psychological Safety", f"Psychological Safety · {scope.name}",
                    campaign.name, "CONFIDENTIEL", cover)


# ---------------------------------------------------------------------------
# Forces & faiblesses
# ---------------------------------------------------------------------------
def _boards(company, team, campaign):
    teams = [team] if team else list(Department.objects.filter(company=company))
    out = []
    for t in teams:
        qs = TeamBoard.objects.filter(team=t)
        board = (qs.filter(date__range=(campaign.start_date, campaign.effective_end_date)).order_by("-date").first()
                 or qs.filter(date__lte=campaign.effective_end_date).order_by("-date").first())
        if board:
            out.append(board)
    return out


def build_strengths_report(company, campaign, team, prepared_for):
    scope = People.of(company, team)
    if scope.team is not None or scope.is_org:
        boards = _boards(company, scope.team, campaign)
    elif scope.group in ("leadership", "directors"):
        # La carte de l'équipe dirigeante est celle de l'équipe que dirige le CEO (« Comité de Direction »).
        own = Department.objects.filter(company=company, manager__role="COMPANY_ADMIN").first()
        boards = _boards(company, own, campaign) if own else []
    else:
        boards = []
    team = scope.team
    notes = list(SkillNote.objects.filter(evaluation__campaign=campaign, evaluation__user__in=scope.users()).exclude(text="")
                 .select_related("evaluation__user"))
    if not boards and not notes:
        raise ReportError(f"Aucune carte « Forces & faiblesses » ni aucune évaluation renseignée pour {scope.label} sur « {campaign.name} » : le rapport n'aurait rien à présenter.")
    collected = {k: Counter() for k in ("people_strengths", "people_weaknesses", "business_strengths", "business_weaknesses")}
    for board in boards:
        for k in collected:
            for item in {str(v).strip() for v in (getattr(board, k) or []) if str(v).strip()}:
                collected[k][item] += 1
    by_cat = defaultdict(lambda: defaultdict(list))
    for n in notes:
        by_cat[n.category][n.text.strip()].append(float(n.score) if n.score is not None else None)
    people_evaluated = len({n.evaluation.user_id for n in notes})
    today = timezone.localdate()
    b = Builder(f"ID-PMC, Forces & faiblesses, {company.name}, {campaign.name} — édition du {fr_date(today)}")
    cover = _cover(f"FORCES & FAIBLESSES · {campaign.name.upper()}", "CE SUR QUOI S'APPUYER, CE QU'IL FAUT RENFORCER", "Forces & faiblesses",
                   f"{scope.name} — {campaign.name}", prepared_for, f"{scope.name}" + (f" · {len(boards)} équipes" if scope.is_org else ""), campaign, "F/F")
    _intro(b, [
        f"Ce rapport consolide les forces et les faiblesses de <b>{escape(scope.label)}</b> sur la campagne « {escape(campaign.name)} », "
        "à deux niveaux : la carte collective « Forces & faiblesses » de l'équipe (People et Business), et les forces et axes de progrès "
        "individuels relevés lors des évaluations, regroupés pour faire apparaître ce qui est commun.",
        "Capitaliser sur les forces est souvent plus rentable que corriger les faiblesses : les deux lectures se complètent.",
    ], ["Les forces et faiblesses individuelles sont présentées de façon agrégée, sans nom.",
        "Ce document est destiné à la Direction Générale, à l'encadrement concerné et à la fonction RH."])

    b.h1("Synthèse exécutive", "Des forces collectives identifiées, des fragilités à traiter en priorité")
    top_soft_s = sorted(by_cat["SOFT_STRENGTH"].items(), key=lambda kv: -len(kv[1]))[:3]
    top_hard_w = sorted(by_cat["HARD_WEAKNESS"].items(), key=lambda kv: -len(kv[1]))[:3]
    b.kpis([(str(len(boards)), "carte(s) d'équipe exploitée(s)"), (str(people_evaluated), "personnes évaluées"),
            (str(sum(len(v) for v in by_cat["SOFT_STRENGTH"].values()) + sum(len(v) for v in by_cat["HARD_STRENGTH"].values())), "forces individuelles relevées"),
            (str(sum(len(v) for v in by_cat["SOFT_WEAKNESS"].values()) + sum(len(v) for v in by_cat["HARD_WEAKNESS"].values())), "axes de progrès relevés")])
    msgs = []
    if collected["people_strengths"]:
        msgs.append("<b>Forces People de l'équipe.</b> " + ", ".join(f"« {escape(t)} »" for t, _ in collected["people_strengths"].most_common(3)) + ".")
    if collected["business_weaknesses"]:
        msgs.append("<b>Faiblesses Business.</b> " + ", ".join(f"« {escape(t)} »" for t, _ in collected["business_weaknesses"].most_common(3)) + ".")
    if top_soft_s:
        msgs.append("<b>Savoir-être les plus souvent cités comme forces.</b> " + ", ".join(f"« {escape(t)} » ({len(v)})" for t, v in top_soft_s) + ".")
    if top_hard_w:
        msgs.append("<b>Savoir-faire les plus souvent à renforcer.</b> " + ", ".join(f"« {escape(t)} » ({len(v)})" for t, v in top_hard_w) + ".")
    b.bullets(msgs or ["Les éléments disponibles sont présentés ci-après."])

    if boards:
        b.h1("La carte collective", "Ce que l'équipe dit d'elle-même")
        for title, ks, kw in (("People", "people_strengths", "people_weaknesses"), ("Business", "business_strengths", "business_weaknesses")):
            s_items, w_items = collected[ks].most_common(10), collected[kw].most_common(10)
            if s_items or w_items:
                rows = [[escape(s_items[i][0]) if i < len(s_items) else "", escape(w_items[i][0]) if i < len(w_items) else ""]
                        for i in range(max(len(s_items), len(w_items)))]
                b.table(f"Forces et faiblesses — {title}", ["Forces", "Faiblesses"], rows, [CONTENT_W / 2, CONTENT_W / 2], head_color=TEAL,
                        note="éléments les plus cités en tête" if scope.is_org and len(boards) > 1 else None)

    if notes:
        b.h1("Forces et axes de progrès individuels", "Ce qui revient le plus souvent dans les évaluations")
        labels = [("HARD_STRENGTH", "Forces — savoir-faire", GREEN), ("SOFT_STRENGTH", "Forces — savoir-être", TEAL),
                  ("HARD_WEAKNESS", "Axes de progrès — savoir-faire", ORANGE), ("SOFT_WEAKNESS", "Axes de progrès — savoir-être", RED)]
        for cat, label, color in labels:
            items = sorted(by_cat[cat].items(), key=lambda kv: (-len(kv[1]), kv[0]))[:10]
            if items:
                b.figure_block(f"{label} — fréquence de citation",
                               BarList([(t, len(v), f"{len(v)} pers." + (f" · {fmt_num(sum(x for x in v if x is not None) / max(1, len([x for x in v if x is not None])), 1)}" if any(x is not None for x in v) else ""))
                                        for t, v in items], color=color, label_width=88 * mm),
                               note="nombre de personnes et note moyenne sur 5")

    recs = []
    if by_cat["HARD_WEAKNESS"]:
        top = max(by_cat["HARD_WEAKNESS"].items(), key=lambda kv: len(kv[1]))[0]
        recs.append((f"Construire une action de formation collective sur « {top} », axe de progrès le plus partagé", "RH", "6 mois", "Haute"))
    if by_cat["SOFT_WEAKNESS"]:
        top = max(by_cat["SOFT_WEAKNESS"].items(), key=lambda kv: len(kv[1]))[0]
        recs.append((f"Travailler en équipe le savoir-être « {top} » : ateliers, feedback croisé, exemplarité des managers", "Managers", "6 mois", "Moyenne"))
    if collected["business_weaknesses"]:
        top = collected["business_weaknesses"].most_common(1)[0][0]
        recs.append((f"Traiter la faiblesse Business « {top} » dans le plan d'action de l'équipe", "Encadrant", "3 mois", "Moyenne"))
    if by_cat["SOFT_STRENGTH"] or collected["people_strengths"]:
        recs.append(("Capitaliser sur les forces reconnues : confier des rôles de référent, partager les bonnes pratiques", "Managers", "En continu", "Basse"))
    _recommendations(b, recs or [("Compléter la carte Forces & faiblesses de l'équipe", "Encadrant", "1 mois", "Moyenne")])
    return b.render(f"Forces & faiblesses — {scope.name} — {campaign.name}", "Rapport Forces & faiblesses", f"Forces & faiblesses · {scope.name}",
                    campaign.name, "CONFIDENTIEL", cover)


# ---------------------------------------------------------------------------
# Team Performance ID
# ---------------------------------------------------------------------------
def build_team_id_report(company, campaign, team, prepared_for):
    if team is None:
        raise ReportError("Le rapport Team Performance ID porte sur une équipe : choisissez une direction.")
    scope = People(company, team)
    boards = _boards(company, team, campaign)
    board = boards[0] if boards else None
    evals = scope.evaluations(campaign)
    if board is None and not evals:
        raise ReportError(f"La carte d'identité de « {team.name} » n'est pas renseignée et aucune évaluation n'existe sur « {campaign.name} » : le rapport n'aurait rien à présenter.")
    threshold = _threshold(company)
    responses = list(CohesionResponse.objects.filter(scope=CohesionResponse.Scope.TEAM, team=team,
                                                     date__range=(campaign.start_date, campaign.effective_end_date)))
    latest = {r.respondent_id: r for r in sorted(responses, key=lambda r: r.date)}
    cohesion = aggregate_responses(list(latest.values()), min_respondents=threshold)
    today = timezone.localdate()
    b = Builder(f"ID-PMC, Team Performance ID, {company.name}, {campaign.name} — {team.name}, édition du {fr_date(today)}")
    cover = _cover(f"TEAM PERFORMANCE ID · {campaign.name.upper()}", "CARTE D'IDENTITÉ DE LA PERFORMANCE DE L'ÉQUIPE", "Team Performance ID",
                   f"{team.name} — {campaign.name}", prepared_for, f"{team.name} · {scope.users().count()} personnes", campaign, "TID")
    _intro(b, [
        f"Ce rapport présente la carte d'identité de la performance de <b>{escape(team.name)}</b> sur la campagne « {escape(campaign.name)} » : "
        "sa vision et ses valeurs, ses réalisations et ses échecs, ses objectifs et priorités, ses résultats face à ses cibles, "
        "ainsi que la cohésion et les compétences de ses membres.",
    ], ["Ce document est destiné à la Direction Générale, à l'encadrant de l'équipe et à la fonction RH."])

    alt = [float(e.altitude_percentage) for e in evals]
    b.h1("Synthèse exécutive", "L'équipe en un coup d'œil")
    b.kpis([(str(len(evals)), "membres évalués"), (fmt_pct(round(sum(alt) / len(alt))) if alt else "—", "Altitude moyenne"),
            (fmt_num(cohesion["score"], 2) if cohesion["published"] else "—", "indice de cohésion (avis des membres)"),
            (fmt_num(sum(float(e.hsi) for e in evals) / len(evals), 2) if evals else "—", "Aptitudes moyennes (HSI)"),
            (fmt_num(sum(float(e.ssi) for e in evals) / len(evals), 2) if evals else "—", "Attitudes moyennes (SSI)")])
    if board and board.vision_missions:
        b.box("Vision / missions", escape(board.vision_missions), tint=TINT_TEAL, color=TEAL)

    if board:
        b.h1("Identité de l'équipe", "Ce qui la fonde et ce qu'elle a accompli")
        pairs = [("Valeurs", board.values), ("Contre-valeurs", board.counter_values), ("Grandes réalisations", board.achievements),
                 ("Échecs / leçons", board.failures_lessons), ("Objectifs", board.objectives),
                 ("Priorités — cohésion", board.priorities_cohesion), ("Priorités — business", board.priorities_business)]
        rows = [[k, "<br/>".join(escape(str(v)) for v in items if str(v).strip())] for k, items in pairs if any(str(v).strip() for v in (items or []))]
        if rows:
            b.table(f"Carte d'identité du {fr_date(board.date)}", ["Rubrique", "Éléments"], rows, [48 * mm, CONTENT_W - 48 * mm], align=["left", "left"])
        series = [r for r in (board.targets_vs_actuals or []) if r.get("target") not in (None, "")]
        if series:
            b.h2("Réalisations face aux objectifs")
            b.table("Objectifs et réalisé par année", ["Année", "Objectif", "Réalisé", "Taux d'atteinte"],
                    [[str(r.get("year", "")), fmt_num(float(r["target"]), 1), fmt_num(float(r["actual"]), 1) if r.get("actual") not in (None, "") else "—",
                      fmt_pct(round(100 * float(r["actual"]) / float(r["target"]))) if r.get("actual") not in (None, "") and float(r["target"]) else "—"]
                     for r in series], [40 * mm, 40 * mm, 40 * mm, 50 * mm], align=["center"] * 4)
        plan = [r for r in (board.objectives_plan or []) if r.get("target") not in (None, "")]
        if plan:
            b.p("<b>Objectifs des prochaines années :</b> " + ", ".join(f"{r.get('year')} : {fmt_num(float(r['target']), 1)}" for r in plan) + ".")

    if evals:
        b.h1("Les membres", "Compétences et performance de chacun")
        b.table("Membres évalués", ["Personne", "Poste", "HSI", "SSI", "Altitude", "Quadrant ID-3A"],
                [[escape(name_of(e.user)), escape(e.user.position or ""), fmt_num(float(e.hsi), 2), fmt_num(float(e.ssi), 2),
                  fmt_pct(round(float(e.altitude_percentage))), QUADRANT[quadrant_of(float(e.hsi), float(e.ssi))][0]]
                 for e in sorted(evals, key=lambda e: name_of(e.user))],
                [38 * mm, 42 * mm, 16 * mm, 16 * mm, 20 * mm, 38 * mm], align=["left", "left", "center", "center", "center", "left"])

    if cohesion["published"]:
        b.h1("Cohésion de l'équipe", "Ce que les membres disent de leur direction")
        b.figure_block("Avis des membres par critère (sur 5)", BarList([(c["criterion"][:70], c["score"], fmt_num(c["score"], 2)) for c in cohesion["criteria"] if c["score"] is not None],
                                                                     color=BLUE, max_value=5, label_width=95 * mm), note=f"{cohesion['respondents']} répondants")
    recs = [("Restituer cette carte d'identité à l'équipe et la mettre à jour à chaque campagne", "Encadrant", "1 mois", "Moyenne")]
    if board and board.priorities_business:
        recs.append((f"Décliner la priorité business « {board.priorities_business[0]} » en objectifs individuels", "Encadrant", "Prochaine campagne", "Moyenne"))
    if board and board.priorities_cohesion:
        recs.append((f"Engager la priorité de cohésion « {board.priorities_cohesion[0]} » dans le plan d'action de l'équipe", "Encadrant", "3 mois", "Moyenne"))
    _recommendations(b, recs)
    return b.render(f"Team Performance ID — {team.name} — {campaign.name}", "Rapport Team Performance ID", f"Team Performance ID · {team.name}",
                    campaign.name, "CONFIDENTIEL", cover)
