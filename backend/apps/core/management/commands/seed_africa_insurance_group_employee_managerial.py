"""
Peuple l'auto-évaluation managériale (5 fiches par campagne) et sa synthèse
(compétences clés, axes d'amélioration) des collaborateurs EMP1…EMP55
d'Africa Insurance Group, sur les 4 campagnes — jusque-là réservée aux
directeurs et au PDG, ce qui laissait vide le radar de la Synthèse du CEO pour
un collaborateur.

Mêmes barèmes et même dérivation de la synthèse que pour les directeurs.
Idempotent (update_or_create) : relancé, il retrouve les mêmes valeurs.

Usage:
    python manage.py seed_africa_insurance_group_employee_managerial
"""
import random
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands import seed_africa_insurance_group_self_assessments as SELF
from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign, ManagerialSelfAssessment, ManagerialSynthesis

COMPANY_NAME = "Africa Insurance Group"


class Command(BaseCommand):
    help = "Auto-évaluation managériale et synthèse des collaborateurs EMP1…EMP55."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        staff = [
            u for u in User.objects.filter(company=company, role=User.Role.MEMBER)
            if re.fullmatch(r"EMP\d+", u.generated_login or "")
        ]
        staff.sort(key=lambda u: int(u.generated_login[3:]))
        if not campaigns or not staff:
            raise CommandError("Campagnes ou collaborateurs EMP introuvables : lancez d'abord les seeds Africa Insurance Group.")

        maker = SELF.Command()
        forms = syntheses = 0
        for user in staff:
            # Un tirage par collaborateur, indépendant de l'ordre d'exécution.
            maker.rng = random.Random(f"emp-managerial-{user.generated_login}")
            for campaign in campaigns:
                for category in SELF.CATEGORIES:
                    maker._managerial(user, campaign, category)
                    forms += 1
                rows = list(ManagerialSelfAssessment.objects.filter(user=user, campaign=campaign))
                ordered = sorted(rows, key=lambda r: (-(r.ic_score or 0), r.category))
                ManagerialSynthesis.objects.update_or_create(
                    user=user, campaign=campaign,
                    defaults={
                        "key_skills": [R.STRONG[r.category] for r in ordered[:3]],
                        "improvement_areas": [R.WEAK[r.category] for r in reversed(ordered[-3:])],
                    },
                )
                syntheses += 1
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {len(staff)} collaborateurs : {forms} fiches et {syntheses} synthèses sur {len(campaigns)} campagnes."
        ))
