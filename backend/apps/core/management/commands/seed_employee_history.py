"""
Ajoute un historique de performance 2022-2024 pour les collaborateurs
(rôle Membre) — même principe que seed_director_history, mais généralisé à
tous les membres d'équipe plutôt qu'à une liste de directeurs figée par
email. Part de leur évaluation "Semestre 1 2025" comme référence et génère
une progression plausible (marche aléatoire bornée) sur les 3 années
précédentes, pour permettre la comparaison de tendance dans la Matrice ID-3A.

Usage: python manage.py seed_employee_history [--company "PMC-DEMO"] [--seed 11]
"""
import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Company, User
from apps.evaluations.models import Evaluation, EvaluationCampaign, EvaluationSkillScore

YEARS = [2022, 2023, 2024]


def campaign_name_for_year(year):
    return f"Année {year}"


class Command(BaseCommand):
    help = "Ajoute un historique 2022-2024 pour les collaborateurs (rôle Membre) d'une entreprise."

    def add_arguments(self, parser):
        parser.add_argument("--company", type=str, default="PMC-DEMO")
        parser.add_argument("--seed", type=int, default=11)

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options["seed"])

        try:
            company = Company.objects.get(name=options["company"])
        except Company.DoesNotExist:
            self.stderr.write(f"Entreprise « {options['company']} » introuvable.")
            return

        members = User.objects.filter(company=company, role=User.Role.MEMBER)
        self.stdout.write(f"{members.count()} collaborateur(s) trouvé(s).")

        for member in members:
            reference_eval = (
                Evaluation.objects.filter(user=member)
                .exclude(campaign__name__in=[campaign_name_for_year(y) for y in YEARS])
                .select_related("campaign")
                .first()
            )
            if not reference_eval:
                self.stdout.write(f"  → {member.first_name} {member.last_name}: pas de référence, ignoré.")
                continue

            reference_scores = list(reference_eval.skill_scores.select_related("skill_item"))
            reference_pct = float(reference_eval.altitude_percentage) or 100.0

            # Marche aléatoire bornée qui converge vers la valeur 2025 : les
            # années les plus anciennes s'en écartent davantage, ce qui donne
            # une tendance de progression lisible sur la Matrice ID-3A.
            pct = reference_pct
            yearly_targets = {}
            for year in reversed(YEARS):  # 2024 -> 2023 -> 2022
                drift = rng.uniform(-14, 10)
                pct = max(25.0, min(135.0, pct + drift))
                yearly_targets[year] = round(pct, 1)

            for year in YEARS:
                target_pct = yearly_targets[year]
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
                    user=member,
                    campaign=campaign,
                    defaults={
                        "evaluator": reference_eval.evaluator,
                        "business_objectives_score": Decimal(str(target_pct)),
                        "people_objectives_score": Decimal(str(target_pct)),
                        "notes": f"Historique de performance {year} (généré).",
                    },
                )
                if not created:
                    self.stdout.write(f"  → {member.first_name} {year}: déjà présent, ignoré.")
                    continue

                ratio = target_pct / reference_pct
                score_entries = []
                for ref_score in reference_scores:
                    scaled = float(ref_score.score) * ratio * rng.uniform(0.9, 1.1)
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
                    f"  → {member.first_name} {member.last_name} {year}: {target_pct}% "
                    f"(HSI={evaluation.hsi}, SSI={evaluation.ssi})"
                )

        self.stdout.write(self.style.SUCCESS("Historique 2022-2024 des collaborateurs créé."))
