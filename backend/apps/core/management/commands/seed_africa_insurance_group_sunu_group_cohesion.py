"""
Peuple la Cohésion d'équipe de la direction SUNU Group (Africa Insurance Group)
pour toutes les campagnes de l'entreprise : un avis « sur sa direction »
(portée TEAM) par collaborateur participant, déposé dans la fenêtre de chaque
campagne.

Le libellé d'un critère EST la clé de rapprochement avec la ligne affichée :
pour la portée TEAM, le front y substitue le nom de la direction visée
(« SUNU Group »), pas celui de l'entreprise — c'est ce que reproduit ici.

Les notes sont contrastées à dessein (niveau cible par critère, humeur propre
à chaque répondant, bruit) et la cohésion progresse d'une campagne à l'autre ;
la participation progresse aussi, pour que les écrans montrent une histoire.

Ajoute aussi la fiche de cohésion de la direction (ICE, OCE, Réalisé) pour
chaque campagne : SUNU Group n'a pas de directeur pour la saisir, et sans elle
l'écran n'affiche ni ICE ni écart avec l'avis des collaborateurs.

Idempotente : relancée, elle met à jour les avis existants sans doublon.

Usage:
    python manage.py seed_africa_insurance_group_sunu_group_cohesion
"""
import random
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import CohesionCriterionScore, CohesionResponse, TeamCohesionAnalysis

COMPANY_NAME = "Africa Insurance Group"
DEPT_CODE = "SUNU"

CRITERIA = [
    "La vision de {name} sur les 10 à 15 prochaines années est clairement définie",
    "Tout le personnel comprend la vision et les valeurs de {name} et peut l'expliquer clairement",
    "Tous les employés se sont appropriés la vision et les valeurs de {name}",
    "Chaque employé connaît ses objectifs individuels et comment ils sont liés aux objectifs globaux",
    "Chaque membre est très engagé pour atteindre les objectifs fixés à l'équipe",
    "Tous les employés de {name} mettent les intérêts de l'organisation au-dessus de leurs intérêts personnels",
    "Il y a une bonne communication verticale entre le Top Management et le reste de {name}",
    "Il y a une bonne communication horizontale entre les différents départements/directions",
    "Il y a un niveau élevé de confiance entre le Top Management et le reste de {name}",
    "Il y a un niveau élevé de confiance entre les employés de {name} eux-mêmes",
]

TARGET_LEVELS = [4.1, 3.4, 3.0, 3.6, 3.8, 2.8, 2.9, 2.4, 2.7, 3.5]

# Décalage de niveau et part des collaborateurs qui répondent, du plus ancien
# au plus récent exercice.
SHIFTS = [-0.6, -0.2, 0.1, 0.35]
PARTICIPATION = [0.62, 0.75, 0.87, 0.95]

# Fiche de la direction : ICE plus indulgent que l'avis des collaborateurs
# (l'écart est le signal), objectif OCE haut, Réalisé entre les deux.
SHEET_ICE = [4.3, 3.8, 3.5, 3.9, 4.1, 3.3, 3.4, 3.0, 3.2, 3.9]
SHEET_SHIFTS = [-0.5, -0.2, 0.1, 0.3]
OBJECTIVES = [4.5, 4.5, 4.0, 4.5, 4.5, 4.0, 4.0, 4.0, 4.0, 4.5]


def shift_sheet(index):
    return SHEET_SHIFTS[min(index, len(SHEET_SHIFTS) - 1)]


class Command(BaseCommand):
    help = "Peuple la cohésion de SUNU Group (portée TEAM) pour toutes les campagnes d'Africa Insurance Group."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
            department = Department.objects.get(company=company, code=DEPT_CODE)
        except (Company.DoesNotExist, Department.DoesNotExist):
            raise CommandError("Entreprise ou direction SUNU Group introuvable — lancez d'abord seed_africa_insurance_group_sunu_group.")

        members = list(User.objects.filter(company=company, department=department).order_by("generated_login"))
        if not members:
            raise CommandError("SUNU Group n'a aucun collaborateur.")

        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if not campaigns:
            raise CommandError("Aucune campagne pour cette entreprise.")

        labels = [c.format(name=department.name) for c in CRITERIA]
        total = 0
        for index, campaign in enumerate(campaigns):
            shift = SHIFTS[min(index, len(SHIFTS) - 1)]
            share = PARTICIPATION[min(index, len(PARTICIPATION) - 1)]
            deposit = min(date.today(), campaign.end_date)
            if deposit < campaign.start_date:
                deposit = campaign.start_date

            rng = random.Random(f"sunu-cohesion-{campaign.pk}")
            respondents = sorted(members, key=lambda u: rng.random())[: round(len(members) * share)]

            for respondent in respondents:
                humeur = rng.gauss(0, 0.75)
                scores = []
                for label, target in zip(labels, TARGET_LEVELS):
                    note = round(target + shift + humeur + rng.gauss(0, 0.5))
                    scores.append({"criterion": label, "score": max(1, min(5, note))})
                CohesionResponse.objects.update_or_create(
                    scope=CohesionResponse.Scope.TEAM,
                    team=department,
                    respondent=respondent,
                    date=deposit,
                    defaults={"scores": scores, "company": company},
                )
                total += 1

            sheet, _ = TeamCohesionAnalysis.objects.get_or_create(team=department, date=deposit)
            sheet.criterion_scores.all().delete()
            rows = []
            for i, label in enumerate(labels):
                ice = max(1, min(5, round(SHEET_ICE[i] + shift_sheet(index))))
                rows.append(CohesionCriterionScore(
                    analysis=sheet, criterion=label, score=ice, objective_score=OBJECTIVES[i],
                    achieved_score=round(min(5, max(1, (ice + OBJECTIVES[i]) / 2 - 0.3 + rng.gauss(0, 0.2))), 1),
                ))
            CohesionCriterionScore.objects.bulk_create(rows)
            sheet.ice_score = round(sum(r.score for r in rows) / len(rows), 1)
            sheet.oce_score = round(sum(float(r.objective_score) for r in rows) / len(rows), 1)
            sheet.save(update_fields=["ice_score", "oce_score"])

            self.stdout.write(f"{campaign.name} : {len(respondents)}/{len(members)} avis ({deposit}), ICE {sheet.ice_score} / OCE {sheet.oce_score}")

        self.stdout.write(self.style.SUCCESS(f"\nTerminé — {total} avis de cohésion déposés pour {department.name}."))
