"""Agrégation des avis de cohésion.

La règle, et ce qui la dicte : une direction compte une poignée de personnes.
À cette taille, la plupart des statistiques d'enquête — pensées pour des
centaines de répondants — se comportent mal. D'où trois partis pris.

1. La moyenne, pas la médiane. Sur une échelle de 1 à 5 avec six répondants, la
   médiane ne prend que neuf valeurs et ne bouge pas quand une personne change
   d'avis d'un point. La cohésion se suit d'un tour à l'autre : il faut une
   mesure qui se déplace continûment.

2. Toujours la dispersion à côté du niveau. Deux directions à 3,5 — l'une où
   tout le monde répond 3 ou 4, l'autre partagée entre 1 et 5 — sont des
   situations opposées, et c'est la seconde qui appelle une intervention. La
   moyenne seule efface précisément ce que l'exercice cherche. On retient la
   part d'avis bas plutôt que l'écart-type : instable à six répondants, et
   illisible pour qui n'en fait pas métier.

3. Agréger critère par critère d'abord, puis les critères entre eux. L'ordre
   n'a d'importance que si quelqu'un saute une question — mais c'est justement
   là qu'il compte : chaque critère est alors moyenné sur ceux qui y ont
   répondu, et un questionnaire incomplet ne déforme rien.
"""

MIN_RESPONDENTS = 4
"""En dessous, aucun résultat n'est publié pour la direction.

À six personnes, un résultat calculé sur deux réponses rend l'attribution
facile — et il suffit d'une fois pour que plus personne ne réponde
sincèrement. C'est ce seuil, et lui seul, qui décide si les données valent
quelque chose.
"""

LOW_SCORE = 2
"""Note à partir de laquelle un avis compte comme « en difficulté »."""


def _mean(values):
    return sum(values) / len(values) if values else None


def aggregate_responses(responses, criteria=None, headcount=None):
    """Résultat agrégé d'une direction pour un tour.

    `responses` est une suite de `CohesionResponse`. Renvoie le détail par
    critère, l'indice de la direction, la participation — et rien d'autre si le
    seuil de répondants n'est pas atteint, la structure étant alors vide de
    toute note.
    """
    responses = list(responses)
    respondents = len(responses)
    published = respondents >= MIN_RESPONDENTS

    result = {
        "respondents": respondents,
        "headcount": headcount,
        "participation": (respondents / headcount) if headcount else None,
        "min_respondents": MIN_RESPONDENTS,
        "published": published,
        "criteria": [],
        "score": None,
        "low_share": None,
    }
    if not published:
        return result

    # Notes rassemblées par critère. L'ordre de référence est celui du
    # questionnaire quand il est fourni : sans lui, deux directions
    # présenteraient leurs critères dans un ordre différent.
    by_criterion = {}
    for response in responses:
        for entry in response.scores or []:
            label = entry.get("criterion")
            score = entry.get("score")
            if not label or not isinstance(score, (int, float)):
                continue
            by_criterion.setdefault(label, []).append(float(score))

    # À défaut de liste de référence, l'ordre d'apparition fait foi : tous les
    # répondants parcourent le questionnaire dans le même ordre, si bien qu'un
    # tri alphabétique brouillerait la lecture pour rien.
    labels = list(criteria) if criteria else list(by_criterion)
    for label in criteria or []:
        by_criterion.setdefault(label, [])
    for label in by_criterion:
        if label not in labels:
            labels.append(label)

    for label in labels:
        scores = by_criterion.get(label, [])
        result["criteria"].append(
            {
                "criterion": label,
                "score": _mean(scores),
                "answers": len(scores),
                "low_share": (
                    sum(1 for s in scores if s <= LOW_SCORE) / len(scores) if scores else None
                ),
            }
        )

    # L'indice de la direction : la moyenne des moyennes par critère, et non la
    # moyenne des moyennes individuelles — voir l'en-tête du module.
    criterion_means = [c["score"] for c in result["criteria"] if c["score"] is not None]
    result["score"] = _mean(criterion_means)

    all_scores = [s for scores in by_criterion.values() for s in scores]
    result["low_share"] = (
        sum(1 for s in all_scores if s <= LOW_SCORE) / len(all_scores) if all_scores else None
    )
    return result


def company_score(directions):
    """Indice de l'entreprise : la moyenne des directions, pondérée par leur
    nombre de répondants.

    La pondération répond à « que ressent le collaborateur moyen ». Sans elle,
    une direction de trois personnes pèserait autant qu'une de trente.
    """
    weighted = [
        (d["score"], d["respondents"])
        for d in directions
        if d.get("published") and d.get("score") is not None
    ]
    total = sum(w for _, w in weighted)
    if not total:
        return None
    return sum(score * w for score, w in weighted) / total
