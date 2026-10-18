"""
Rédaction stratégique par règles, au standard d'un senior de cabinet.

Second moteur de la synthèse exécutive : il prend le relais quand Claude
n'est pas disponible (pas de clé, pas de crédit, panne, refus). Il lit les
mêmes faits que ceux envoyés à Claude et produit la même structure — un
titre-constat, des thématiques rédigées en paragraphes d'analyse, des
recommandations stratégiques assorties d'un porteur, d'un horizon, d'une
priorité et d'un indicateur de suivi.

Principe d'écriture : chaque paragraphe pose un constat chiffré, l'interprète
(ce que cela signifie pour la performance, le risque ou le levier) et le
relie aux autres constats. Les formulations varient selon les situations
(niveau, écart, tendance, dispersion) pour ne pas produire un texte à trous.
"""
import re

from .report_ai import Recommendation, Strategic

NBSP = " "


# ---------------------------------------------------------------------------
# Outils d'écriture
# ---------------------------------------------------------------------------
def n(value, decimals=2):
    if value is None:
        return "—"
    return f"{value:.{decimals}f}".replace(".", ",")


def signed(value, decimals=1):
    if value is None:
        return "—"
    return ("+" if value > 0 else "−" if value < 0 else "") + n(abs(value), decimals)


def p(value):
    return "—" if value is None else f"{round(value)}{NBSP}%"


def plural(count, singular, plural_form=None):
    return f"{count} {singular if count in (0, 1) else (plural_form or singular + 's')}"


def enum(items, last="et"):
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" {last} " + items[-1]


def quoted(items):
    return enum([f"« {i} »" for i in items])


def trend_word(delta, unit_small=0.05):
    if delta is None:
        return None
    if delta > unit_small:
        return "progresse"
    if delta < -unit_small:
        return "recule"
    return "se stabilise"


def scale_fragility(share_low):
    if share_low >= 30:
        return "une fracture nette : près d'un répondant sur trois exprime un désaccord"
    if share_low >= 20:
        return "une minorité significative en difficulté, qu'une moyenne correcte ne doit pas masquer"
    if share_low >= 10:
        return "des poches de réserve localisées"
    return "un consensus large, sans foyer de contestation notable"


def small_sample_caveat(count, threshold=8):
    if count is not None and count < threshold:
        return (f" Avec {plural(count, 'répondant')}, ces constats doivent être lus comme des signaux à confirmer plutôt "
                "que comme des mesures stabilisées.")
    return ""


# ---------------------------------------------------------------------------
# Cohésion d'équipe
# ---------------------------------------------------------------------------
COHESION_ACTIONS = {
    "Vision à 10-15 ans clairement définie": ("Formaliser et incarner la vision à long terme", "Direction Générale",
                                               "Note du critère « vision » ≥ 3,5 et part d'avis bas < 15 %"),
    "Vision et valeurs comprises de tous": ("Faire de chaque manager le relais de la vision et des valeurs", "Direction Générale et RH",
                                            "Critère « vision et valeurs comprises » ≥ 3,5"),
    "Vision et valeurs appropriées": ("Traduire les valeurs en comportements attendus, reconnus et évalués", "Managers et RH",
                                      "Critère « valeurs appropriées » ≥ 3,5"),
    "Objectifs individuels reliés aux objectifs globaux": ("Aligner explicitement objectifs individuels et objectifs de l'organisation", "Managers et RH",
                                                           "100 % des objectifs individuels rattachés à un objectif collectif"),
    "Engagement envers les objectifs d'équipe": ("Rendre les objectifs d'équipe visibles et pilotés collectivement", "Managers",
                                                 "Critère « engagement » ≥ 4,0"),
    "Intérêt collectif avant intérêt personnel": ("Récompenser les arbitrages faits au service du collectif", "Direction Générale",
                                                  "Critère « intérêt collectif » ≥ 3,5"),
    "Communication verticale": ("Instaurer un dialogue régulier et à double sens entre la Direction et les équipes", "Direction Générale",
                                "Critère « communication verticale » ≥ 3,5"),
    "Communication entre directions": ("Installer une gouvernance de la coopération entre directions", "Comité de Direction",
                                       "Critère « communication entre directions » ≥ 3,2 et avis bas < 20 %"),
    "Confiance envers le Top Management": ("Reconstruire la confiance par la transparence et la tenue des engagements", "Direction Générale",
                                           "Critère « confiance envers le Top Management » ≥ 3,5"),
    "Confiance entre collaborateurs": ("Développer la confiance entre pairs par le feedback et l'entraide", "Managers et RH",
                                       "Critère « confiance entre collaborateurs » ≥ 3,8"),
}
COHESION_WHY = {
    "Vision à 10-15 ans clairement définie": "sans cap partagé, les arbitrages quotidiens se font en ordre dispersé",
    "Vision et valeurs comprises de tous": "une vision qui n'est pas comprise ne peut pas orienter les comportements",
    "Vision et valeurs appropriées": "l'écart entre valeurs affichées et valeurs vécues érode la crédibilité du management",
    "Objectifs individuels reliés aux objectifs globaux": "chacun optimise son périmètre sans voir sa contribution à l'ensemble",
    "Engagement envers les objectifs d'équipe": "l'engagement collectif est le moteur direct de la performance",
    "Intérêt collectif avant intérêt personnel": "les logiques individuelles l'emportent sur la réussite commune",
    "Communication verticale": "l'information circule mal entre la Direction et le terrain, ce qui ralentit l'exécution",
    "Communication entre directions": "le cloisonnement entre directions renchérit chaque processus transverse et ralentit le service au client",
    "Confiance envers le Top Management": "la confiance envers la Direction conditionne l'adhésion à toute transformation",
    "Confiance entre collaborateurs": "la confiance entre pairs conditionne l'entraide et la circulation de l'information",
}


def _cohesion(scope, campaign, f):
    ice, reading = f["ICE"], f["lecture_ICE"]
    crit = sorted(f["criteres"], key=lambda c: -c["moyenne"])
    top, bottom = crit[:3], list(reversed(crit[-3:]))
    divisive = max(crit, key=lambda c: c["avis_bas_pct"])
    part = f["participation"]
    low = f["part_avis_bas_pct"]
    hist = [(k, v) for k, v in (f.get("historique_ICE") or {}).items() if v is not None]
    delta = f.get("evolution_depuis_campagne_precedente")
    psi = f.get("securite_psychologique_PSI")
    manager = f.get("regard_de_l_encadrant")
    spread = top[0]["moyenne"] - bottom[0]["moyenne"]

    if ice >= 3.95:
        headline = "Une vraie équipe, soudée, dont le défi est désormais de durer"
        verdict = "une vraie équipe, à forte cohésion, qui a de fortes chances de performer dans la durée"
    elif ice >= 2.95:
        headline = (f"Un collectif réel mais inachevé, freiné par un point faible : « {bottom[0]['critere'].lower()} »") if spread >= 1 else \
            "Une équipe moyennement soudée, à consolider sur l'ensemble des leviers"
        verdict = "une équipe moyennement soudée : le collectif existe, mais ses liens ne sont pas encore assez solides pour résister aux tensions"
    else:
        headline = "Un groupe plutôt qu'une équipe : la cohésion est à construire"
        verdict = "encore un groupe plutôt qu'une équipe : les personnes travaillent côte à côte sans former un collectif"

    sections = []
    s1 = (f"Avec un Indice de Cohésion d'Équipe de {n(ice)} sur 5, {scope} se situe dans la zone « {reading} » de la grille du cabinet : "
          f"c'est {verdict}. Ce niveau s'appuie sur une participation de {p(part['taux_pct'])} ({part['repondants']} avis sur {part['effectif']}), "
          + ("suffisamment large pour que la mesure soit représentative." if (part["taux_pct"] or 0) >= 70 else
             "en deçà du seuil de représentativité souhaitable : les absents sont souvent les plus réservés, et le résultat pourrait être optimiste.")
          + small_sample_caveat(part["repondants"]))
    s1b = (f"La moyenne ne dit pas tout : {p(low)} des notes données sont basses, ce qui traduit {scale_fragility(low)}. "
           + (f"L'écart de {n(spread, 1)} point entre le critère le mieux noté et le plus faible montre que la cohésion repose sur des fondations inégales."
              if spread >= 1 else "Les critères sont relativement homogènes : les progrès passeront par un effort d'ensemble plutôt que par un levier unique."))
    sections.append(("Une cohésion " + ("forte" if ice >= 3.95 else "moyenne" if ice >= 2.95 else "à construire") + " au regard de la grille du cabinet", [s1, s1b]))

    s2 = (f"Le socle de la cohésion est {quoted([c['critere'].lower() for c in top])}, notés respectivement "
          f"{enum([n(c['moyenne']) for c in top])}. "
          + (f"Le premier recueille {p(top[0]['avis_4_ou_5_pct'])} d'avis favorables (4 ou 5) : c'est un actif à valoriser explicitement, "
             "car il constitue le point d'appui le plus crédible pour engager les transformations. ")
          + "Ces points forts sont aussi ceux qu'une organisation perd le plus vite lorsqu'elle cesse de les entretenir.")
    sections.append(("Des points d'appui sur lesquels capitaliser", [s2]))

    weak = bottom[0]
    s3 = (f"À l'inverse, {quoted([c['critere'].lower() for c in bottom])} concentrent les fragilités ({enum([n(c['moyenne']) for c in bottom])}). "
          f"Le critère le plus faible, « {weak['critere'].lower()} », pèse directement sur la performance : {COHESION_WHY.get(weak['critere'], 'il freine le fonctionnement collectif')}. ")
    if divisive["avis_bas_pct"] >= 20:
        s3 += (f"Le sujet le plus clivant est « {divisive['critere'].lower()} », sur lequel {p(divisive['avis_bas_pct'])} des répondants donnent une note basse : "
               "au-delà d'un niveau insuffisant, c'est un désaccord de fond qui doit être ouvert en dialogue avec les équipes, faute de quoi il se transformera en désengagement.")
    sections.append(("Des fragilités qui conditionnent la performance", [s3]))

    if len(hist) >= 2 or delta is not None or psi or manager:
        parts = []
        if len(hist) >= 2:
            first, last = hist[0], hist[-1]
            total = last[1] - first[1]
            parts.append(f"Sur la durée, l'ICE est passé de {n(first[1])} ({first[0]}) à {n(last[1])} ({last[0]}), soit "
                         f"{'+' if total >= 0 else '−'}{n(abs(total))} point : la trajectoire est "
                         + ("nettement positive" if total > 0.3 else "positive mais lente" if total > 0.05 else "plate" if total > -0.05 else "orientée à la baisse") + ".")
        if delta is not None:
            parts.append(f"Sur la dernière campagne, l'indice {trend_word(delta)} ({'+' if delta >= 0 else '−'}{n(abs(delta))})"
                         + (", ce qui suggère que les actions engagées n'ont pas encore produit d'effet visible." if abs(delta) <= 0.05 else "."))
        if manager:
            gap = manager["ICE_fiche"] - ice
            parts.append(f"L'encadrant évalue la cohésion à {n(manager['ICE_fiche'], 1)} sur sa fiche, contre {n(ice)} pour ses équipes : "
                         + ("un écart significatif qui révèle un angle mort managérial à traiter en priorité." if gap >= 0.5 else
                            "une lecture plus sévère que celle des équipes, signe d'exigence." if gap <= -0.5 else "les deux lectures convergent, ce qui facilite l'action."))
        if psi:
            weakest = min(psi["dimensions"].items(), key=lambda kv: kv[1])
            parts.append(f"La sécurité psychologique (PSI {n(psi['global'])}) éclaire ces résultats : sa dimension la plus faible, « {weakest[0].lower()} » ({n(weakest[1])}), "
                         "limite la capacité des équipes à exprimer un désaccord ou à signaler un problème — précisément ce qu'exige le traitement des fragilités identifiées.")
        sections.append(("Trajectoire et signaux complémentaires", [" ".join(parts)]))

    dirs = {k: v for k, v in (f.get("par_direction") or {}).items() if isinstance(v, (int, float))}
    if len(dirs) >= 2:
        best, worst = max(dirs.items(), key=lambda kv: kv[1]), min(dirs.items(), key=lambda kv: kv[1])
        sections.append(("Des situations contrastées selon les directions", [
            f"La cohésion n'est pas uniforme : elle va de {n(worst[1])} pour « {worst[0]} » à {n(best[1])} pour « {best[0]} ». "
            "Un plan unique pour toute l'organisation serait inefficace ; il faut combiner un socle commun, porté par la Direction Générale, "
            "et des plans ciblés pour les directions les plus en retrait, portés par leurs responsables."]))

    sections.append(("Enjeux pour la Direction", [
        ("L'enjeu n'est pas de défendre un niveau mais de franchir un palier : passer d'une équipe moyennement soudée à une vraie équipe suppose de traiter "
         if 2.95 <= ice < 3.95 else "L'enjeu est de préserver un acquis précieux, qui se dégrade vite lorsque la vigilance baisse, en continuant à traiter "
         if ice >= 3.95 else "L'enjeu est de poser les fondations d'un collectif, en commençant par traiter ")
        + f"en priorité {quoted([c['critere'].lower() for c in bottom[:2]])}. Ces sujets relèvent de la Direction Générale autant que des managers : "
        "ils touchent à la gouvernance, à la circulation de l'information et à la crédibilité des engagements pris. Une restitution rapide des résultats, "
        "suivie de deux ou trois décisions visibles, est le moyen le plus sûr de transformer cette mesure en levier de performance."]))
    recs = []
    for c in bottom:
        action, owner, kpi = COHESION_ACTIONS.get(c["critere"], (f"Traiter le critère « {c['critere']} »", "Direction Générale", f"Critère ≥ {n(min(5, c['moyenne'] + 0.5), 1)}"))
        priority = "Haute" if c["moyenne"] < 3 or c["avis_bas_pct"] >= 30 else "Moyenne"
        recs.append(Recommendation(action, f"Critère noté {n(c['moyenne'])} avec {p(c['avis_bas_pct'])} d'avis bas : {COHESION_WHY.get(c['critere'], 'il freine le collectif')}.",
                                   owner, "6 mois" if priority == "Haute" else "6 à 12 mois", priority, kpi))
    recs.append(Recommendation("Restituer les résultats aux équipes et co-construire un plan de cohésion",
                               "La crédibilité de la démarche dépend de la restitution : une mesure sans suite détériore la confiance qu'elle cherchait à mesurer.",
                               "Direction Générale et managers", "1 mois", "Haute", "Restitution réalisée dans 100 % des équipes sous 30 jours"))
    target = 4.0 if ice < 3.95 else round(ice + 0.2, 1)
    recs.append(Recommendation(f"Fixer un objectif d'ICE de {n(target, 1)} et le suivre à chaque campagne",
                               "Inscrire la cohésion parmi les indicateurs de pilotage de la Direction en fait un objectif managérial à part entière.",
                               "Comité de Direction", "Prochaine campagne", "Moyenne", f"ICE ≥ {n(target, 1)} et participation ≥ 80 %"))
    return Strategic(headline, sections, recs[:6])


# ---------------------------------------------------------------------------
# Psychological Safety
# ---------------------------------------------------------------------------
PSI_STAKE = {
    "Belonging Safety": "le sentiment d'appartenance conditionne la rétention et l'engagement discrétionnaire",
    "Learning Safety": "une équipe qui n'ose pas reconnaître ses erreurs ne peut pas apprendre ni s'améliorer",
    "Contributing Safety": "l'autonomie et l'initiative sont les conditions d'une organisation agile",
    "Challenging Safety": "sans droit au désaccord, les risques et les mauvaises décisions remontent trop tard",
}
PSI_ACTION = {
    "Belonging Safety": ("Renforcer l'inclusion et le respect au quotidien", "Managers et RH"),
    "Learning Safety": ("Faire de l'erreur une source d'apprentissage collectif", "Direction Générale et managers"),
    "Contributing Safety": ("Élargir l'autonomie et la délégation", "Managers"),
    "Challenging Safety": ("Protéger et solliciter explicitement le désaccord", "Direction Générale"),
}


def _psi(scope, campaign, f):
    g = f["indice_global"]
    dims = sorted(f["dimensions"].items(), key=lambda kv: kv[1])
    weak, strong = dims[0], dims[-1]
    items = sorted(f["affirmations"], key=lambda a: a["moyenne"])
    level = "fragile" if g < 2.5 else "à consolider" if g < 3.25 else "solide" if g < 4 else "forte"
    hist = list((f.get("historique") or {}).items())
    headline = (f"Une sécurité psychologique {level}, freinée par la dimension « {weak[0]} »" if strong[1] - weak[1] >= 0.5
                else f"Une sécurité psychologique {level} et homogène sur les quatre dimensions")
    sections = [
        ("Un climat de sécurité psychologique " + level, [
            f"L'indice global de sécurité psychologique de {scope} s'établit à {n(g)} sur 5, sur la base de {plural(f['repondants'], 'répondant')} "
            f"pour un effectif de {f['effectif']}. Ce niveau, qualifié de {level}, signifie que les collaborateurs "
            + ("se sentent largement libres de prendre des risques interpersonnels : poser une question, signaler une erreur, contredire." if g >= 4 else
               "prennent ces risques de façon sélective, selon les sujets et les interlocuteurs." if g >= 3.25 else
               "hésitent encore à exposer leurs doutes, leurs erreurs ou leurs désaccords.")
            + small_sample_caveat(f["repondants"])]),
        ("Un écart entre dimensions qui oriente l'action", [
            f"La dimension la plus solide est « {strong[0]} » ({n(strong[1])}), la plus fragile « {weak[0]} » ({n(weak[1])}). "
            f"Cet écart de {n(strong[1] - weak[1])} point est décisif : {PSI_STAKE.get(weak[0], 'cette dimension limite la parole')}. "
            "Les dimensions se renforcent mutuellement ; agir sur la plus faible produit en général un effet d'entraînement sur les autres."]),
        ("Les comportements les moins partagés", [
            "Les affirmations les moins validées sont : " + " ; ".join(f"« {a['texte'][:110]}{'…' if len(a['texte']) > 110 else ''} » ({n(a['moyenne'])}, {p(a['avis_bas_pct'])} d'avis bas)" for a in items[:2])
            + ". Ce sont des comportements concrets, observables, sur lesquels le management peut agir directement et dont l'évolution se mesurera dès la prochaine campagne."]),
    ]
    if len(hist) >= 2:
        first, last = hist[0], hist[-1]
        d = last[1]["global"] - first[1]["global"]
        sections.append(("Une trajectoire à piloter", [
            f"L'indice est passé de {n(first[1]['global'])} ({first[0]}) à {n(last[1]['global'])} ({last[0]}) : "
            + ("une amélioration qui témoigne de l'effet des pratiques managériales engagées." if d > 0.1 else
               "une stabilité qui appelle une impulsion nouvelle." if d > -0.1 else "une dégradation qui doit être traitée comme un signal d'alerte.")]))
    sections.append(("Enjeux pour la Direction", [
        "La sécurité psychologique se construit d'abord par l'exemple du management : la façon dont les dirigeants accueillent une mauvaise nouvelle, "
        "une erreur ou une contradiction fixe la norme pour toute l'organisation. "
        f"Agir sur « {weak[0]} » est la priorité ; c'est aussi la condition pour que les autres démarches — cohésion, feedforward, plans de progrès — produisent leur plein effet."]))
    recs = []
    for name, value in dims[:2]:
        action, owner = PSI_ACTION.get(name, (f"Renforcer la dimension « {name} »", "Managers"))
        recs.append(Recommendation(action, f"Dimension « {name} » à {n(value)} : {PSI_STAKE.get(name, '')}.", owner, "3 à 6 mois",
                                   "Haute" if value < 3 else "Moyenne", f"Dimension « {name} » ≥ {n(min(5, value + 0.4), 1)}"))
    recs.append(Recommendation("Former les managers aux pratiques de sécurité psychologique",
                               "Le comportement du manager est le premier déterminant de la sécurité psychologique d'une équipe.",
                               "RH", "6 mois", "Moyenne", "100 % des managers formés ; indice global en progression"))
    recs.append(Recommendation("Restituer les résultats et engager chaque équipe sur deux comportements",
                               "Rendre visibles les engagements pris transforme une mesure en démarche.", "Managers", "1 mois", "Moyenne",
                               "Deux engagements formalisés par équipe"))
    return Strategic(headline, sections, recs)


# ---------------------------------------------------------------------------
# Dynamique relationnelle
# ---------------------------------------------------------------------------
def _relational(scope, campaign, f):
    total = f["relations_qualifiees"]
    rep = f["repartition"]
    tension = rep.get("Difficile", 0) + rep.get("Toxique", 0)
    tension_pct = 100 * tension / total if total else 0
    fac = f["facteurs"]
    sections = []
    if total:
        headline = ("Un tissu relationnel sain, à protéger" if tension_pct < 15 else
                    "Des relations majoritairement constructives, mais des foyers de tension à traiter" if tension_pct < 30 else
                    "Un climat relationnel tendu qui menace la performance collective")
        sections.append(("Un climat relationnel " + ("sain" if tension_pct < 15 else "contrasté" if tension_pct < 30 else "tendu"), [
            f"Sur {plural(total, 'relation qualifiée', 'relations qualifiées')} au sein de {scope}, on compte {plural(rep.get('Excellente', 0), 'relation excellente', 'relations excellentes')}, "
            f"{plural(rep.get('Correcte', 0), 'correcte')}, {plural(rep.get('Difficile', 0), 'difficile')} et {plural(rep.get('Toxique', 0), 'toxique')}, soit {p(tension_pct)} de relations en tension. "
            + ("Ce niveau reste compatible avec un fonctionnement efficace, à condition de ne pas laisser les tensions s'installer." if tension_pct < 15 else
               "À ce niveau, les tensions commencent à coûter : elles ralentissent les décisions et pèsent sur l'engagement des personnes concernées.")
            + (f" La cartographie couvre {p(f['couverture_pct'])} des relations possibles : " + ("une base solide." if (f["couverture_pct"] or 0) >= 60 else "elle doit être complétée pour fiabiliser la lecture.")
               if f.get("couverture_pct") is not None else "")]))
        if f["pivots"]:
            sections.append(("Des personnes pivots sur lesquelles s'appuyer", [
                f"{enum(f['pivots'][:4])} entretiennent le plus de relations excellentes. Ces personnes pivots sont des relais naturels : "
                "les associer aux projets transverses, à l'accueil des nouveaux et à l'animation des rituels démultiplie l'effet des actions de cohésion, "
                "à condition de ne pas les surcharger."]))
        risks = []
        if f["en_tension"]:
            risks.append(f"{plural(len(f['en_tension']), 'personne concentre', 'personnes concentrent')} des relations difficiles ou toxiques ({enum(f['en_tension'][:4])})")
        if f["asymetries"]:
            risks.append(f"{plural(len(f['asymetries']), 'relation est vécue', 'relations sont vécues')} de façon opposée par les deux personnes")
        if f["sans_relation_qualifiee"]:
            risks.append(f"{plural(f['sans_relation_qualifiee'], 'personne n’apparaît', 'personnes n’apparaissent')} dans aucune relation qualifiée")
        if risks:
            sections.append(("Des zones de risque à traiter tôt", [
                ("La lecture fine fait apparaître plusieurs zones de risque : " if len(risks) > 1 else "La lecture fine fait apparaître une zone de risque : ")
                + " ; ".join(risks) + ". "
                "Les relations asymétriques sont les plus insidieuses : l'un des deux ne perçoit pas la difficulté, qui s'aggrave donc sans être traitée."]))
    else:
        headline = "Une cartographie relationnelle à établir pour piloter la cohésion"
        sections.append(("Une cartographie encore à construire", [
            f"Aucune relation n'est encore qualifiée pour {scope}. La lecture repose donc sur les facteurs relationnels relevés par l'équipe ; "
            "compléter la cartographie est la première étape pour objectiver les appuis et les tensions."]))
    if any(fac.get(k) for k in ("catalysts", "nourishers", "inhibitors", "toxins")):
        sections.append(("Ce qui nourrit et ce qui abîme la relation", [
            (f"Les comportements qui font grandir la relation sont identifiés ({quoted((fac.get('catalysts') or [])[:2] + (fac.get('nourishers') or [])[:1])}), "
             if fac.get("catalysts") or fac.get("nourishers") else "")
            + (f"de même que ceux qui l'abîment ({quoted((fac.get('inhibitors') or [])[:1] + (fac.get('toxins') or [])[:2])}). " if fac.get("toxins") or fac.get("inhibitors") else "")
            + "Nommer ces comportements est un levier puissant : ils deviennent des règles du jeu explicites, que chacun peut invoquer."]))
    recs = []
    if tension:
        recs.append(Recommendation("Traiter individuellement chaque relation difficile ou toxique", f"{p(tension_pct)} des relations sont en tension.",
                                   "Encadrant et RH", "1 mois", "Haute" if tension_pct >= 20 else "Moyenne", "Part de relations en tension < 10 %"))
    if fac.get("toxins"):
        recs.append(Recommendation("Établir une charte des comportements attendus et proscrits", f"Toxines relevées : {quoted(fac['toxins'][:3])}.",
                                   "Encadrant", "3 mois", "Haute", "Charte adoptée et revue à chaque campagne"))
    if f.get("pivots"):
        recs.append(Recommendation("Confier aux personnes pivots un rôle de relais", "Elles concentrent les relations excellentes.",
                                   "Direction et encadrant", "3 mois", "Moyenne", "Un relais identifié par équipe"))
    recs.append(Recommendation("Compléter et actualiser la cartographie à chaque campagne", "La dynamique relationnelle évolue vite ; sa lecture doit être tenue à jour.",
                               "Encadrant", "Prochaine campagne", "Moyenne", "Couverture de la cartographie ≥ 70 %"))
    return Strategic(headline, sections, recs)


# ---------------------------------------------------------------------------
# Forces & faiblesses
# ---------------------------------------------------------------------------
def _strengths(scope, campaign, f):
    cc, ind = f["carte_collective"], f["individuel"]

    def top(key, k=3):
        return [x["element"] for x in (ind.get(key) or [])[:k]]
    hs, ss, hw, sw = top("forces_savoir_faire"), top("forces_savoir_etre"), top("axes_de_progres_savoir_faire"), top("axes_de_progres_savoir_etre")
    headline = ("Un capital de compétences réel, à mobiliser sur des axes de progrès partagés" if (hs or ss) and (hw or sw)
                else "Des forces et des faiblesses identifiées, à transformer en plan d'action")
    sections = []
    if cc.get("people_strengths") or cc.get("business_strengths"):
        sections.append(("Ce que le collectif reconnaît comme ses atouts", [
            f"La carte collective de {scope} met en avant, côté People, {quoted(cc.get('people_strengths', [])[:3]) or 'peu d’éléments'}, "
            f"et côté Business, {quoted(cc.get('business_strengths', [])[:3]) or 'peu d’éléments'}. "
            "Ces atouts déclarés constituent le socle sur lequel bâtir : ils doivent être explicitement mobilisés dans les projets prioritaires."]))
    if cc.get("people_weaknesses") or cc.get("business_weaknesses"):
        sections.append(("Les faiblesses que l'équipe identifie elle-même", [
            f"L'équipe reconnaît comme faiblesses {quoted(cc.get('people_weaknesses', [])[:2] + cc.get('business_weaknesses', [])[:2])}. "
            "Le fait qu'elles soient nommées par l'équipe elle-même est un atout : l'adhésion aux actions correctrices en sera facilitée."]))
    if hs or ss:
        sections.append(("Des forces individuelles convergentes", [
            f"Les évaluations de {plural(f['personnes_evaluees'], 'personne')} font ressortir des forces récurrentes : "
            + (f"en savoir-faire, {quoted(hs)}" if hs else "") + ("; " if hs and ss else "") + (f"en savoir-être, {quoted(ss)}" if ss else "")
            + ". Leur récurrence en fait des compétences collectives, transmissibles par le mentorat et le partage de pratiques."]))
    if hw or sw:
        sections.append(("Des axes de progrès qui appellent une réponse collective", [
            "Les axes de progrès les plus souvent cités sont " + (f"{quoted(hw)} en savoir-faire" if hw else "") + (" et " if hw and sw else "")
            + (f"{quoted(sw)} en savoir-être" if sw else "")
            + ". Lorsqu'un même manque revient chez plusieurs personnes, il relève moins du plan individuel que d'une politique de développement des compétences."]))
    recs = []
    if hw:
        recs.append(Recommendation(f"Bâtir un parcours de formation collectif sur « {hw[0]} »", "Axe de progrès le plus partagé en savoir-faire.",
                                   "RH", "6 mois", "Haute", "Note moyenne de la compétence +0,5 à la prochaine campagne"))
    if sw:
        recs.append(Recommendation(f"Développer le savoir-être « {sw[0]} » par le coaching et le feedback", "Axe de progrès comportemental le plus cité.",
                                   "Managers et RH", "6 mois", "Moyenne", "Compétence sortie du top 3 des axes de progrès"))
    if hs or ss:
        recs.append(Recommendation("Organiser le partage des forces par le mentorat interne", "Les forces récurrentes sont transmissibles.",
                                   "RH", "3 mois", "Moyenne", "Un binôme de mentorat par équipe"))
    recs.append(Recommendation("Intégrer forces et faiblesses au plan d'action de l'équipe", "Une carte qui n'alimente pas de décisions perd son utilité.",
                               "Encadrant", "1 mois", "Moyenne", "Plan d'action mis à jour à chaque campagne"))
    if not sections:
        sections.append(("Une base d'analyse encore limitée", [f"Les éléments disponibles pour {scope} sont encore peu nombreux ; compléter la carte collective et les évaluations permettra une lecture plus fine."]))
    return Strategic(headline, sections, recs)


# ---------------------------------------------------------------------------
# Matrice ID-3A
# ---------------------------------------------------------------------------
def _id3a(scope, campaign, f):
    m, q, n_ = f["moyennes"], f["quadrants"], f["effectif_evalue"]
    talents, experts, relational, watch = (q.get(k, {"effectif": 0, "part_pct": 0}) for k in ("Talents clés", "Experts techniques", "Potentiel relationnel", "Zone de vigilance"))
    gap = m["ecart_HSI_moins_SSI"]
    paliers = f["paliers_de_performance"]
    high_perf = paliers.get("Bon", 0) + paliers.get("Exceptionnel", 0)
    low_perf = paliers.get("Très faible", 0) + paliers.get("Faible", 0)
    headline = ("Un vivier de talents clés solide, à fidéliser et à responsabiliser" if talents["part_pct"] >= 50 else
                "Un potentiel réel mais déséquilibré entre aptitudes et attitudes" if abs(gap) >= 0.3 else
                "Une part importante des équipes à accompagner pour atteindre le niveau attendu")
    sections = [
        ("Un capital humain " + ("solide" if talents["part_pct"] >= 50 else "à consolider"), [
            f"Sur {plural(n_, 'personne évaluée', 'personnes évaluées')} au sein de {scope}, {talents['effectif']} ({p(talents['part_pct'])}) se situent dans le quadrant "
            f"des talents clés, c'est-à-dire au-dessus du niveau moyen de 3 sur 5 à la fois en aptitudes et en attitudes. "
            f"{experts['effectif']} sont des experts techniques, {relational['effectif']} relèvent du potentiel relationnel et {watch['effectif']} sont en zone de vigilance. "
            + ("Cette répartition offre une base solide pour porter la stratégie." if talents["part_pct"] >= 50 else
               "Moins de la moitié des effectifs réunit les deux dimensions : la capacité d'exécution de la stratégie repose sur un noyau restreint.")]),
        ("Un équilibre entre savoir-faire et savoir-être", [
            f"L'indice moyen des aptitudes (HSI) s'établit à {n(m['HSI'])} et celui des attitudes (SSI) à {n(m['SSI'])}. "
            + (f"L'avance des aptitudes ({n(gap)} point) signale une organisation techniquement compétente dont les comportements — coopération, communication, "
               "leadership — constituent le principal levier de progrès." if gap >= 0.3 else
               f"L'avance des attitudes ({n(-gap)} point) révèle des équipes engagées et collaboratives, dont l'expertise métier doit être renforcée." if gap <= -0.3 else
               "Les deux dimensions sont équilibrées : le développement peut porter sur l'ensemble des compétences.")]),
        ("Compétences et résultats : une relation à piloter", [
            f"L'Altitude moyenne, qui mesure l'atteinte des objectifs, est de {p(m['altitude_pct'])} : {high_perf} personnes atteignent ou dépassent leurs objectifs, "
            f"{low_perf} restent sous 75 %. "
            + (f"Les talents clés affichent une Altitude moyenne de {p(talents.get('altitude_moyenne_pct'))}, "
               + ("ce qui confirme que la compétence se traduit en résultats." if (talents.get("altitude_moyenne_pct") or 0) >= m["altitude_pct"] else
                  "inférieure à la moyenne : des compétences élevées ne se traduisent pas encore en résultats, ce qui interroge les objectifs fixés ou les moyens alloués.")
               if talents["effectif"] else "")]),
    ]
    moves = f.get("changements_de_quadrant_depuis_la_campagne_precedente") or {}
    changed = {k: v for k, v in moves.items() if k.split(" -> ")[0] != k.split(" -> ")[1]}
    if changed:
        ups = sum(v for k, v in changed.items() if k.endswith("Talents clés"))
        downs = sum(v for k, v in changed.items() if k.endswith("Zone de vigilance"))
        sections.append(("Une dynamique de progression", [
            f"Depuis « {f['campagne_precedente']} », {plural(sum(changed.values()), 'personne a changé', 'personnes ont changé')} de quadrant, dont {ups} vers les talents clés "
            f"et {downs} vers la zone de vigilance. " + ("Le solde est positif : les actions de développement produisent leurs effets." if ups > downs else
                                                        "Le solde est défavorable : certaines trajectoires se dégradent et doivent être analysées individuellement.")]))
    dirs = f.get("par_direction") or {}
    if len(dirs) >= 2:
        best = max(dirs.items(), key=lambda kv: kv[1]["talents_cles_pct"])
        worst = min(dirs.items(), key=lambda kv: kv[1]["talents_cles_pct"])
        low_alt = min(dirs.items(), key=lambda kv: kv[1]["altitude_pct"])
        sections.append(("Des profils de compétences très différents selon les directions", [
            f"La part de talents clés varie fortement : de {p(worst[1]['talents_cles_pct'])} pour « {worst[0]} » à {p(best[1]['talents_cles_pct'])} pour « {best[0]} ». "
            f"L'atteinte des objectifs est la plus faible pour « {low_alt[0]} » ({p(low_alt[1]['altitude_pct'])}). "
            "Ces contrastes appellent une allocation différenciée des moyens de développement : un plan uniforme diluerait l'effort là où il est le moins nécessaire."]))
    people = f.get("personnes") or []
    vigilance = [x["nom"] for x in people if x.get("quadrant") == "Zone de vigilance"]
    sections.append(("Enjeux pour la Direction", [
        ("Le premier enjeu est de sécuriser le noyau de talents clés, qui porte l'exécution de la stratégie, " if talents["part_pct"] < 50 else
         "Le premier enjeu est de fidéliser un vivier de talents clés majoritaire et de lui confier davantage de responsabilités, ")
        + f"tout en faisant évoluer les {experts['effectif'] + relational['effectif']} profils intermédiaires vers ce quadrant : c'est là que se trouve le gisement de progrès le plus rapide. "
        + (f"La zone de vigilance ({enum(vigilance[:5])}{' et d’autres' if len(vigilance) > 5 else ''}) appelle des décisions individuelles, assumées et suivies, "
           "car son maintien durable pèse sur les équipes qui l'entourent." if vigilance else "")]))
    recs = []
    if watch["effectif"]:
        recs.append(Recommendation("Mettre en place des plans de développement rapprochés pour la zone de vigilance",
                                   f"{plural(watch['effectif'], 'personne est', 'personnes sont')} sous le niveau moyen sur les deux dimensions.",
                                   "Managers et RH", "3 mois", "Haute", "Moitié de la zone de vigilance sortie du quadrant à la prochaine campagne"))
    if experts["effectif"] >= relational["effectif"] and experts["effectif"]:
        recs.append(Recommendation("Investir dans le développement des savoir-être des experts techniques", f"{experts['effectif']} experts techniques à faire évoluer vers les talents clés.",
                                   "RH", "6 mois", "Moyenne", "SSI moyen des experts ≥ 3,0"))
    if relational["effectif"]:
        recs.append(Recommendation("Renforcer l'expertise métier du potentiel relationnel", f"{relational['effectif']} personnes engagées dont les savoir-faire sont à consolider.",
                                   "RH et managers", "6 mois", "Moyenne", "HSI moyen du potentiel relationnel ≥ 3,0"))
    recs.append(Recommendation("Sécuriser les talents clés par un plan de rétention et de succession",
                               "Le noyau de talents clés porte l'exécution de la stratégie ; sa perte serait le principal risque.",
                               "Direction Générale et RH", "6 mois", "Haute" if talents["part_pct"] < 50 else "Moyenne", "Taux de rétention des talents clés ≥ 95 %"))
    if low_perf:
        recs.append(Recommendation("Revoir la fixation des objectifs et les moyens associés", f"{low_perf} personnes sous 75 % d'Altitude.",
                                   "Managers", "Prochaine campagne", "Moyenne", "Part sous 75 % divisée par deux"))
    return Strategic(headline, sections, recs[:6])


# ---------------------------------------------------------------------------
# 9 Box et ID-TPD
# ---------------------------------------------------------------------------
def _ninebox(scope, campaign, f):
    n_ = f["talents_positionnes"]
    cases = f["repartition_par_case"]
    lead, risk, prog = f["leaders_moteurs"], f["a_risque"], f["en_progression"]
    crit = cases.get("Situation critique", 0) + cases.get("Manager à risque", 0)
    decel = cases.get("Haut performeur en décélération", 0)
    top_case = max(cases.items(), key=lambda kv: kv[1])
    headline = ("Un vivier en dynamique positive, porté par ses leaders moteurs" if 100 * prog / n_ >= 60 else
                "Une trajectoire collective qui s'infléchit et appelle des décisions ciblées")
    sections = [
        ("Une performance " + ("en dynamique" if 100 * prog / n_ >= 60 else "sous tension"), [
            f"Sur {plural(n_, 'talent positionné', 'talents positionnés')}, {prog} ({p(100 * prog / n_)}) progressent par rapport à leur évaluation précédente, "
            f"pour une Altitude moyenne de {p(f['altitude_moyenne_pct'])} et une progression moyenne de {n(f['progression_moyenne_pct'], 1)} %. "
            f"La case la plus peuplée est « {top_case[0]} » ({top_case[1]} personnes), ce qui donne la tonalité d'ensemble du vivier."]),
        ("Des leaders moteurs à reconnaître", [
            f"{plural(lead, 'personne cumule', 'personnes cumulent')} haute performance (≥ 90 %) et forte progression (≥ 6 %). "
            "Ces leaders moteurs sont les premiers candidats aux responsabilités élargies et aux plans de succession ; "
            "faute de perspectives, ce sont aussi les profils les plus exposés aux sollicitations externes."]),
        ("Des signaux de risque à traiter sans attendre", [
            f"{plural(risk, 'personne est', 'personnes sont')} sous 90 % sans progresser : "
            f"{cases.get('Situation critique', 0)} en situation critique (sous 75 %, en recul) et {cases.get('Manager à risque', 0)} à risque (75 à 89 %, en recul)"
            + (f", et {plural(decel, 'haut performeur ralentit', 'hauts performeurs ralentissent')}" if decel else "")
            + ". Les hauts performeurs en décélération méritent une attention particulière : leur recul est souvent le premier signe d'un désengagement ou d'une surcharge."]),
    ]
    dirs = f.get("par_direction") or {}
    if len(dirs) >= 2:
        best = max(dirs.items(), key=lambda kv: kv[1]["progression_pct"])
        worst = min(dirs.items(), key=lambda kv: kv[1]["progression_pct"])
        sections.append(("Des dynamiques différenciées selon les directions", [
            f"La progression moyenne va de {signed(worst[1]['progression_pct'])} % pour « {worst[0]} » à {signed(best[1]['progression_pct'])} % pour « {best[0]} ». "
            "Ces écarts orientent l'allocation des efforts d'accompagnement."]))
    sections.append(("Enjeux pour la Direction", [
        "Le 9 Box éclaire trois décisions : qui retenir et faire grandir (les leaders moteurs et les talents en accélération), "
        "qui relancer (les performeurs qui stagnent ou ralentissent) et sur qui statuer (les situations critiques qui perdurent). "
        f"Avec {lead} leaders moteurs pour {risk} talents à risque, " + ("le rapport de force est favorable : la priorité est de capitaliser." if lead >= risk else
                                                                          "le rapport de force est défavorable : la priorité est d'enrayer les trajectoires négatives avant qu'elles ne s'installent.")]))
    recs = [Recommendation("Inscrire les leaders moteurs dans un plan de succession et de rétention", f"{lead} leaders moteurs identifiés.",
                           "Direction Générale et RH", "6 mois", "Haute", "100 % des leaders moteurs avec un plan de carrière formalisé")]
    if crit or risk:
        recs.append(Recommendation("Engager des plans de redressement formalisés pour les talents à risque", f"{risk} talents sous 90 % sans progression.",
                                   "Managers et RH", "1 à 3 mois", "Haute", "Moitié des talents à risque en progression à la prochaine campagne"))
    if decel:
        recs.append(Recommendation("Prévenir l'essoufflement des hauts performeurs", f"{decel} hauts performeurs en décélération.",
                                   "Managers", "1 mois", "Haute", "Entretien de motivation réalisé pour chacun"))
    recs.append(Recommendation("Conduire une revue des talents annuelle en Comité de Direction", "Le 9 Box ne produit de valeur que s'il nourrit des décisions collectives.",
                               "Comité de Direction", "Annuel", "Moyenne", "Revue réalisée et décisions suivies"))
    return Strategic(headline, sections, recs)


def _tpd(scope, campaign, f):
    n_ = f["talents_evalues"]
    avg, prog = f["altitude_moyenne_pct"], f.get("progression_moyenne_pct")
    paliers = f["paliers"]
    camp_hist = [(k, v) for k, v in (f.get("altitude_moyenne_par_campagne_pct") or {}).items() if v is not None]
    headline = (f"Une Altitude moyenne de {n(avg, 1)} %" + (f" en {'hausse' if prog > 0 else 'baisse'} de {n(abs(prog), 1)} %" if prog is not None else "")
                + (" : une dynamique à amplifier" if (prog or 0) > 0 else " : une dynamique à relancer"))
    high = paliers.get("Bon", 0) + paliers.get("Exceptionnel", 0)
    low = paliers.get("Très faible", 0) + paliers.get("Faible", 0)
    sections = [
        ("Un niveau de performance " + ("élevé" if avg >= 90 else "intermédiaire" if avg >= 75 else "insuffisant"), [
            f"Les {plural(n_, 'talent évalué', 'talents évalués')} de {scope} atteignent en moyenne {p(avg)} de leurs objectifs. "
            f"{high} se situent au palier bon ou exceptionnel, {low} sous 75 %. "
            + ("La performance est portée par une majorité de l'effectif." if high >= n_ / 2 else "La performance repose sur une minorité, ce qui fragilise l'atteinte des objectifs collectifs.")]),
    ]
    if prog is not None:
        sections.append(("Une dynamique de progression", [
            f"La progression moyenne est de {n(prog, 1)} % par rapport à l'évaluation précédente ; {f['en_progression']} talents sur {f['avec_progression_calculable']} progressent. "
            f"{plural(f['leaders_moteurs'], 'leader moteur')} et {plural(f['a_risque'], 'talent à risque', 'talents à risque')} encadrent cette dynamique."]))
    if len(camp_hist) >= 2:
        sections.append(("Une trajectoire sur plusieurs campagnes", [
            "L'Altitude moyenne a évolué ainsi : " + ", ".join(f"{k} {p(v)}" for k, v in camp_hist) + ". "
            + ("La tendance de fond est favorable." if camp_hist[-1][1] > camp_hist[0][1] else "La tendance de fond doit être redressée.")]))
    dirs = f.get("par_direction") or {}
    if len(dirs) >= 2:
        best, worst = max(dirs.items(), key=lambda kv: kv[1]["altitude_pct"]), min(dirs.items(), key=lambda kv: kv[1]["altitude_pct"])
        sections.append(("Des écarts de performance entre directions", [
            f"L'Altitude moyenne va de {p(worst[1]['altitude_pct'])} pour « {worst[0]} » à {p(best[1]['altitude_pct'])} pour « {best[0]} ». "
            "Une partie de cet écart peut tenir à l'ambition inégale des objectifs ; l'autre à des différences réelles d'exécution, qu'il faut distinguer avant d'agir."]))
    sections.append(("Enjeux pour la Direction", [
        "Le tableau de bord invite à piloter la performance des talents comme un portefeuille : protéger les contributeurs les plus performants, "
        "accélérer ceux qui progressent et traiter sans délai les situations durablement en deçà des attentes. "
        "La fixation d'objectifs de trajectoire individuels, revus à chaque campagne, est le levier le plus direct pour faire progresser l'Altitude moyenne."]))
    recs = [Recommendation("Fixer à chaque talent un objectif de trajectoire chiffré", "Piloter la progression autant que le niveau.",
                           "Managers", "Prochaine campagne", "Moyenne", "Progression moyenne ≥ +5 %")]
    if low:
        recs.insert(0, Recommendation("Traiter en priorité les talents sous 75 % d'Altitude", f"{low} talents concernés.",
                                      "Managers et RH", "1 à 3 mois", "Haute", "Part sous 75 % divisée par deux"))
    recs.append(Recommendation("Reconnaître et fidéliser les talents au palier exceptionnel", f"{paliers.get('Exceptionnel', 0)} talents dépassent leurs objectifs.",
                               "Direction Générale et RH", "3 mois", "Moyenne", "Rétention ≥ 95 % des talents exceptionnels"))
    recs.append(Recommendation("Vérifier l'ambition et la cohérence des objectifs entre directions", "Des objectifs hétérogènes faussent la comparaison des performances.",
                               "Comité de Direction", "Prochaine campagne", "Basse", "Grille d'objectifs harmonisée"))
    return Strategic(headline, sections, recs)


# ---------------------------------------------------------------------------
# Team Performance ID et Performance ID individuelle
# ---------------------------------------------------------------------------
def _team_id(scope, campaign, f):
    card, coh = f.get("carte_d_identite") or {}, f.get("cohesion")
    sections = []
    if card.get("vision_missions"):
        sections.append(("Une identité d'équipe formalisée", [
            f"{scope[0].upper() + scope[1:]} dispose d'une vision formalisée et de valeurs explicites ({quoted((card.get('values') or [])[:3])}). "
            "Cette identité est un actif de management : elle fournit un cadre de décision commun et un langage partagé."]))
    if f.get("membres_evalues"):
        sections.append(("Des compétences au service des objectifs", [
            f"Les {f['membres_evalues']} membres évalués affichent une Altitude moyenne de {p(f['altitude_moyenne_pct'])}, pour des aptitudes moyennes de {n(f['HSI_moyen'])} "
            f"et des attitudes de {n(f['SSI_moyen'])}. La répartition dans la matrice ID-3A ({', '.join(f'{v} {k.lower()}' for k, v in (f.get('quadrants') or {}).items())}) "
            "indique où porter l'effort de développement."]))
    if coh:
        sections.append(("Une cohésion qui conditionne la performance durable", [
            f"Les membres évaluent la cohésion de leur équipe à {n(coh['ICE'])} ({coh['lecture'].lower()}). "
            + ("C'est un socle favorable pour tenir les objectifs dans la durée." if coh["ICE"] >= 3.95 else
               "Renforcer cette cohésion est la condition pour transformer les compétences individuelles en performance collective.")]))
    series = [r for r in (card.get("targets_vs_actuals") or []) if r.get("target") and r.get("actual")]
    if series:
        last = series[-1]
        rate = 100 * float(last["actual"]) / float(last["target"])
        sections.append(("Des résultats à mettre en regard des ambitions", [
            f"Sur {last.get('year')}, l'équipe a réalisé {p(rate)} de son objectif. "
            + ("L'ambition est tenue." if rate >= 95 else "L'écart à l'objectif doit être analysé : ambition, moyens ou exécution.")]))
    headline = "Une équipe dont l'identité, les compétences et la cohésion doivent converger vers ses objectifs"
    recs = [Recommendation("Décliner la vision de l'équipe en objectifs individuels", "Aligner contributions individuelles et ambition collective.",
                           "Encadrant", "Prochaine campagne", "Moyenne", "100 % des objectifs individuels rattachés")]
    if coh and coh["ICE"] < 3.95:
        recs.insert(0, Recommendation("Faire de la cohésion une priorité du plan d'équipe", f"ICE de {n(coh['ICE'])}.", "Encadrant", "6 mois", "Haute", "ICE ≥ 4,0"))
    recs.append(Recommendation("Actualiser la carte d'identité de l'équipe à chaque campagne", "Une identité figée perd sa force mobilisatrice.",
                               "Encadrant", "Chaque campagne", "Basse", "Carte mise à jour"))
    if not sections:
        sections.append(("Une carte d'identité à compléter", [f"Les éléments disponibles pour {scope} sont encore limités."]))
    return Strategic(headline, sections, recs)


def _person(scope, campaign, f):
    who = f["personne"]
    evals = f["evaluations"]
    last = evals[-1] if evals else None
    name = who.get("nom")
    sections = []
    if last:
        trend = ""
        if len(evals) >= 2:
            d = last["altitude_pct"] - evals[-2]["altitude_pct"]
            trend = f", {'en hausse' if d > 0 else 'en baisse'} de {n(abs(d), 0)} points par rapport à la campagne précédente"
        sections.append(("Un niveau de performance et une trajectoire", [
            f"{name} atteint {p(last['altitude_pct'])} de ses objectifs sur {last['campagne']} (palier {str(last['palier']).lower()}){trend}. "
            f"Ses aptitudes (HSI {n(last['HSI'])}) et ses attitudes (SSI {n(last['SSI'])}) le ou la placent dans le quadrant « {f.get('quadrant_ID3A_actuel')} »"
            + (f" et dans la case « {f['case_9_box']} » du 9 Box." if f.get("case_9_box") else ".")]))
    forces = f.get("forces_et_axes_de_progres") or {}
    def fr(text):
        return re.sub(r"(\d)\.(\d)", r"\1,\2", text)
    strengths = [fr(x) for k, v in forces.items() if "Force" in k for x in v][:4]
    weaknesses = [fr(x) for k, v in forces.items() if "Faiblesse" in k for x in v][:4]
    if strengths or weaknesses:
        sections.append(("Des forces à mobiliser, des axes de progrès à travailler", [
            (f"Ses forces les plus marquées sont {quoted(strengths)}. " if strengths else "")
            + (f"Ses axes de progrès portent sur {quoted(weaknesses)}. " if weaknesses else "")
            + "Le plan de développement gagne à s'appuyer sur les premières pour travailler les seconds."]))
    card = f.get("fiche_performance_id") or {}
    motiv = card.get("Ce qui le/la motive")
    aspir = card.get("Vision / Aspirations")
    if motiv or aspir:
        sections.append(("Des leviers d'engagement identifiés", [
            (f"Ce qui le ou la motive : {quoted(motiv[:3])}. " if motiv else "") + (f"Ses aspirations : {aspir} " if aspir else "")
            + "Ces leviers orientent les décisions de rétention et d'évolution."]))
    headline = f"{name} : un profil " + ("performant à fidéliser" if last and last["altitude_pct"] >= 90 else "à accompagner vers son plein potentiel")
    recs = [Recommendation("Formaliser deux ou trois priorités de développement lors du prochain entretien", "Concentrer l'effort sur ce qui fera la différence.",
                           "Manager", "Prochain entretien", "Haute", "Priorités formalisées et suivies")]
    if weaknesses:
        recs.append(Recommendation(f"Accompagner le développement sur « {weaknesses[0]} »", "Axe de progrès principal.", "Manager et RH", "6 mois", "Moyenne", "Note de la compétence +0,5"))
    if last and last["altitude_pct"] >= 90:
        recs.append(Recommendation("Proposer une perspective d'évolution", "Un haut niveau de performance appelle une perspective.", "Direction et RH", "6 mois", "Moyenne", "Plan de carrière formalisé"))
    return Strategic(headline, sections or [("Un profil à documenter", [f"Les données disponibles sur {name} sont encore limitées."])], recs)


WRITERS = {
    "Cohésion d'équipe (avis des collaborateurs)": _cohesion,
    "Psychological Safety Index (PSI)": _psi,
    "Dynamique relationnelle": _relational,
    "Forces & faiblesses": _strengths,
    "Matrice ID-3A (Aptitudes × Attitudes = Altitude)": _id3a,
    "9 Box Performance Trajectory": _ninebox,
    "ID-TPD — Talents Performance Dashboard": _tpd,
    "Team Performance ID (carte d'identité de la performance de l'équipe)": _team_id,
    "Performance ID individuelle (carte d'identité de la performance)": _person,
}


def write(report_title, scope_label, campaign_name, facts):
    writer = WRITERS.get(report_title)
    if writer is None:
        return None
    return writer(scope_label, campaign_name, facts)
