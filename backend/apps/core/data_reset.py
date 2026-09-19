"""Remise à zéro ciblée des données d'une entreprise, pour reprendre une démo.

Le CEO choisit des rubriques, une ou plusieurs campagnes (ou toutes) et,
facultativement, une direction. L'aperçu compte ce qui serait supprimé ;
l'exécution supprime exactement cela, dans une transaction, après une
confirmation explicite. Les comptes, directions, campagnes et référentiels de
compétences ne sont jamais touchés.
"""
import unicodedata
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers

CONFIRMATION_PHRASE = "REMISE A ZERO"


@dataclass(frozen=True)
class Rubrique:
    key: str
    campaign_scoped: bool
    group: str


# L'ordre est celui de l'exécution : les lignes rattachées passent avant ce
# qui les porte, de sorte que les comptes de l'aperçu restent exacts.
RUBRIQUES = [
    Rubrique("objectives", True, "evaluations"),
    Rubrique("skill_notes", True, "evaluations"),
    Rubrique("evaluations", True, "evaluations"),
    Rubrique("managerial", True, "evaluations"),
    Rubrique("monkey", True, "evaluations"),
    Rubrique("cohesion_sheets", True, "cohesion"),
    Rubrique("cohesion_answers", True, "cohesion"),
    Rubrique("team_boards", True, "teams"),
    Rubrique("action_plans", False, "teams"),
    Rubrique("relationships", False, "teams"),
    Rubrique("profiles", False, "people"),
]
BY_KEY = {r.key: r for r in RUBRIQUES}


def normalize_phrase(text):
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    return " ".join(text.upper().split())


def _windows(field, campaigns):
    """Les avis, fiches et cartes de cohésion se rattachent à une campagne par
    leur date, dans la fenêtre de saisie de cette campagne."""
    query = Q()
    for campaign in campaigns:
        query |= Q(**{f"{field}__range": (campaign.start_date, campaign.effective_end_date)})
    return query


def querysets(company, key, campaigns, department):
    """Les ensembles de lignes qui composent une rubrique, dans le périmètre choisi.
    `campaigns` vaut None pour « toutes les campagnes »."""
    from apps.actionplans.models import ActionPlan
    from apps.core.models import PerformanceProfile
    from apps.evaluations.models import (
        Evaluation,
        ManagerialSelfAssessment,
        ManagerialSynthesis,
        MonkeyManagementAssessment,
        PerformanceObjective,
        SkillNote,
    )
    from apps.teams.models import CohesionResponse, TeamBoard, TeamCohesionAnalysis, TeamRelationship

    def evaluations():
        qs = Evaluation.objects.filter(user__company=company)
        if campaigns is not None:
            qs = qs.filter(campaign__in=campaigns)
        if department is not None:
            qs = qs.filter(user__department=department)
        return qs

    def by_user_campaign(model):
        qs = model.objects.filter(user__company=company)
        if campaigns is not None:
            qs = qs.filter(campaign__in=campaigns)
        if department is not None:
            qs = qs.filter(user__department=department)
        return qs

    def dated(model, team_field):
        qs = model.objects.filter(**{f"{team_field}__company": company})
        if campaigns is not None:
            qs = qs.filter(_windows("date", campaigns))
        if department is not None:
            qs = qs.filter(**{team_field: department})
        return qs

    if key == "evaluations":
        return [evaluations()]
    if key == "skill_notes":
        return [SkillNote.objects.filter(evaluation__in=evaluations())]
    if key == "objectives":
        team_lines = PerformanceObjective.objects.filter(evaluation__isnull=True, team__company=company)
        if campaigns is not None:
            team_lines = team_lines.filter(campaign__in=campaigns)
        if department is not None:
            team_lines = team_lines.filter(team=department)
        return [PerformanceObjective.objects.filter(evaluation__in=evaluations()), team_lines]
    if key == "managerial":
        return [by_user_campaign(ManagerialSelfAssessment), by_user_campaign(ManagerialSynthesis)]
    if key == "monkey":
        return [by_user_campaign(MonkeyManagementAssessment)]
    if key == "cohesion_sheets":
        return [dated(TeamCohesionAnalysis, "team")]
    if key == "cohesion_answers":
        qs = CohesionResponse.objects.filter(
            Q(company=company) | Q(team__company=company) | Q(respondent__company=company)
        )
        if campaigns is not None:
            qs = qs.filter(_windows("date", campaigns))
        if department is not None:
            qs = qs.filter(
                Q(team=department) | Q(scope=CohesionResponse.Scope.ORGANISATION, respondent__department=department)
            )
        return [qs.distinct()]
    if key == "team_boards":
        return [dated(TeamBoard, "team")]
    if key == "action_plans":
        qs = ActionPlan.objects.filter(team__company=company)
        return [qs.filter(team=department) if department is not None else qs]
    if key == "relationships":
        qs = TeamRelationship.objects.filter(team__company=company)
        return [qs.filter(team=department) if department is not None else qs]
    if key == "profiles":
        qs = PerformanceProfile.objects.filter(user__company=company)
        return [qs.filter(user__department=department) if department is not None else qs]
    raise KeyError(key)


def parse_scope(company, data):
    """Lit et vérifie la demande ; chaque refus dit ce qu'il faut corriger."""
    from apps.core.models import Department
    from apps.evaluations.models import EvaluationCampaign

    keys = data.get("rubriques")
    if not isinstance(keys, list) or not keys:
        raise serializers.ValidationError({"rubriques": "Cochez au moins une rubrique à remettre à zéro."})
    unknown = [k for k in keys if k not in BY_KEY]
    if unknown:
        raise serializers.ValidationError({"rubriques": f"Rubrique inconnue : {', '.join(map(str, unknown))}."})
    keys = [r.key for r in RUBRIQUES if r.key in keys]

    raw = data.get("campaigns")
    campaigns = None
    if raw != "all":
        if not isinstance(raw, list) or not raw:
            raise serializers.ValidationError(
                {"campaigns": "Choisissez une ou plusieurs campagnes, ou « Toutes les campagnes »."}
            )
        campaigns = list(EvaluationCampaign.objects.filter(company=company, pk__in=raw))
        if len(campaigns) != len(set(raw)):
            raise serializers.ValidationError(
                {"campaigns": "Une des campagnes choisies n'existe pas ou n'appartient pas à votre entreprise."}
            )
        general = [k for k in keys if not BY_KEY[k].campaign_scoped]
        if general:
            raise serializers.ValidationError({
                "rubriques": "Ces rubriques ne sont pas rattachées à une campagne : choisissez « Toutes les campagnes » pour les vider ("
                + ", ".join(general) + ")."
            })

    department = None
    if data.get("department") not in (None, "", 0):
        department = Department.objects.filter(company=company, pk=data.get("department")).first()
        if department is None:
            raise serializers.ValidationError({"department": "Cette direction n'existe pas dans votre entreprise."})
    return keys, campaigns, department


def preview(company, keys, campaigns, department):
    result = []
    for key in keys:
        sets = querysets(company, key, campaigns, department)
        item = {"key": key, "count": sum(qs.count() for qs in sets)}
        if key == "evaluations":
            from apps.evaluations.models import EvaluationSkillScore, PerformanceObjective, SkillNote

            evals = sets[0]
            item["includes"] = {
                "skill_scores": EvaluationSkillScore.objects.filter(evaluation__in=evals).count(),
                "skill_notes": SkillNote.objects.filter(evaluation__in=evals).count(),
                "objectives": PerformanceObjective.objects.filter(evaluation__in=evals).count(),
            }
        result.append(item)
    return result


@transaction.atomic
def execute(company, keys, campaigns, department):
    """Supprime dans l'ordre des rubriques ; renvoie ce qui a été effacé."""
    done = []
    for key in keys:
        sets = querysets(company, key, campaigns, department)
        count = sum(qs.count() for qs in sets)
        for qs in sets:
            qs.delete()
        done.append({"key": key, "count": count})
    return done
