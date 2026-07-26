"""
Ajoute l'historique de performance 2022-2024 des directeurs d'Elias Energy
Group (en plus de leur évaluation 2025-S1 existante), en reprenant les
pourcentages de la fiche "Revue des performances individuelles des
Directeurs 2022-2025". Permet la comparaison de progression par année dans
la Matrice ID-3A (vue Admin Entreprise).

Usage: python manage.py seed_director_history
"""
import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Company, User
from apps.evaluations.models import Evaluation, EvaluationCampaign, EvaluationSkillScore


def campaign_name_for_year(year):
    return f"Année {year}"

# email -> {année: altitude % cible}, d'après la fiche PDF de revue de
# performance (2022-2025). 2025 correspond à l'évaluation "2025-S1" déjà en
# base et n'est donc pas recréé ici.
DIRECTOR_HISTORY = {
    "charles@elias-demo.pmc": {"2022": 82, "2023": 90, "2024": 95},
    "jessica@elias-demo.pmc": {"2022": 97, "2023": 89, "2024": 91},
    "nadine@elias-demo.pmc": {"2022": 75, "2023": 70, "2024": 75},
    "aicha@elias-demo.pmc": {"2022": 90, "2023": 97, "2024": 105},
    "monique@elias-demo.pmc": {"2022": 117, "2023": 109, "2024": 97},
    "gilbert@elias-demo.pmc": {"2022": 40, "2023": 60, "2024": 55},
    "jean.jacques@elias-demo.pmc": {"2022": 107, "2023": 103, "2024": 115},
}


class Command(BaseCommand):
    help = "Ajoute l'historique 2022-2024 des directeurs pour la comparaison de progression ID-3A."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=7)

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options["seed"])

        try:
            company = Company.objects.get(name__icontains="Elias")
        except Company.DoesNotExist:
            self.stderr.write("Entreprise Elias introuvable — lancez d'abord seed_demo.")
            return

        for email, yearly_targets in DIRECTOR_HISTORY.items():
            try:
                director = User.objects.get(email=email, company=company)
            except User.DoesNotExist:
                self.stdout.write(f"  → {email}: introuvable, ignoré.")
                continue

            target_campaign_names = {campaign_name_for_year(year) for year in yearly_targets}
            reference_eval = Evaluation.objects.filter(user=director).exclude(
                campaign__name__in=target_campaign_names
            ).first()
            if not reference_eval:
                self.stdout.write(f"  → {director.first_name}: pas d'évaluation de référence, ignoré.")
                continue

            reference_scores = list(reference_eval.skill_scores.select_related("skill_item"))
            reference_pct = float(reference_eval.altitude_percentage) or 100.0

            for period, target_pct in yearly_targets.items():
                year = int(period)
                campaign, _ = EvaluationCampaign.objects.get_or_create(
                    company=company,
                    name=campaign_name_for_year(year),
                    defaults={
                        "start_date": f"{year}-01-01",
                        "end_date": f"{year}-12-31",
                        "created_by": company.admin_user,
                    },
                )
                evaluation, created = Evaluation.objects.get_or_create(
                    user=director,
                    campaign=campaign,
                    defaults={
                        "evaluator": reference_eval.evaluator,
                        "business_objectives_score": Decimal(str(target_pct)),
                        "people_objectives_score": Decimal(str(target_pct)),
                        "notes": f"Historique de performance {period} (revue annuelle des directeurs).",
                    },
                )
                if not created:
                    self.stdout.write(f"  → {director.first_name} {period}: déjà présent, ignoré.")
                    continue

                ratio = target_pct / reference_pct
                score_entries = []
                for ref_score in reference_scores:
                    scaled = float(ref_score.score) * ratio * rng.uniform(0.92, 1.08)
                    scaled = max(1.0, min(5.0, scaled))
                    score_entries.append(
                        EvaluationSkillScore(
                            evaluation=evaluation,
                            skill_item=ref_score.skill_item,
                            score=Decimal(str(round(scaled, 1))),
                        )
                    )
                EvaluationSkillScore.objects.bulk_create(score_entries)

                self.stdout.write(
                    f"  → {director.first_name} {period}: {target_pct}% "
                    f"(HSI={evaluation.hsi}, SSI={evaluation.ssi})"
                )

        self.stdout.write(self.style.SUCCESS("Historique des directeurs 2022-2024 créé."))
