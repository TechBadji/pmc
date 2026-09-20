"""
Peuple, pour Africa Insurance Group, les deux fiches d'auto-évaluation
managériale (Auto-évaluation managériale à 5 catégories, Auto-diagnostic
Monkey Management) pour chaque directeur/PDG et sur les 4 campagnes déjà
créées par `seed_africa_insurance_group` (Année 2023/2024/2025, Semestre 1
2026) — jeu de démonstration dense, pour montrer les deux fiches remplies
sur tout l'historique plutôt que sur la seule campagne en cours.

Usage:
    python manage.py seed_africa_insurance_group_self_assessments

Idempotente (update_or_create par personne/campagne/catégorie) : relancer la
commande écrase les fiches déjà générées par elle, sans dupliquer.
"""
import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign, ManagerialSelfAssessment, MonkeyManagementAssessment

COMPANY_NAME = "Africa Insurance Group"

CATEGORIES = ["COMMUNICATION", "ECOUTE", "MOTIVATION", "DELEGATION", "TEMPS_PRIORITES"]

# Mêmes bornes que le peuplement des évaluations ID-3A de cette entreprise :
# cinq niveaux tirés indépendamment par catégorie et par campagne, pour des
# profils contrastés plutôt que des scores qui suivent tous la même courbe.
LEVEL_RANGES = [(1.0, 2.0), (2.0, 2.8), (2.8, 3.6), (3.6, 4.4), (4.4, 5.0)]

# Bandes cibles du score total Monkey Management (10-50) — un tirage par
# personne/campagne parmi les 4 paliers d'interprétation de la fiche, pour
# que la démo montre les quatre lectures possibles plutôt qu'un seul profil.
MONKEY_TOTAL_RANGES = [(10, 20), (21, 30), (31, 40), (41, 50)]

MONKEYS_POOL = [
    "Le dossier de renouvellement du contrat cadre", "Le reporting mensuel de l'équipe",
    "L'arbitrage sur le budget marketing", "La relance des impayés clients",
    "La préparation du comité de direction", "Le suivi du plan de formation",
    "La négociation avec le fournisseur principal", "Le contrôle qualité avant livraison",
    "La réponse aux réclamations sensibles", "Le pilotage du projet de migration système",
]
WHY_ACCEPTED_POOL = [
    "Peur que le délai ne soit pas tenu si je ne m'en occupe pas moi-même.",
    "Le collaborateur n'avait pas encore démontré sa maîtrise du sujet.",
    "C'était plus rapide de le faire moi-même que d'expliquer comment faire.",
    "Le sujet remontait directement d'un client important, j'ai voulu sécuriser.",
    "Habitude prise depuis longtemps, jamais remise en question depuis.",
]
RETURN_TO_WHOM_POOL = [
    "Au responsable direct du dossier, avec un point de suivi hebdomadaire.",
    "À l'équipe, en clarifiant d'abord le niveau de décision qui lui revient.",
    "Au collaborateur senior le plus proche du sujet.",
    "À mon adjoint, en le formant sur les deux premiers cas.",
]
BEHAVIOR_POOL = [
    "Poser la question \"qu'as-tu déjà essayé ?\" avant de proposer une solution.",
    "Ne plus dire \"laisse-moi faire\", même sous pression de temps.",
    "Attribuer clairement la prochaine action à la fin de chaque échange.",
    "Accepter un résultat imparfait plutôt que de reprendre la tâche.",
]
NEXT_RESPONSIBILITY_POOL = [
    "La validation finale des devis de moins de 5 000 €.",
    "L'animation de la réunion hebdomadaire d'équipe.",
    "Le premier niveau de réponse aux réclamations clients.",
    "Le suivi budgétaire mensuel de son périmètre.",
]


class Command(BaseCommand):
    help = "Peuple l'auto-évaluation managériale et le Monkey Management pour Africa Insurance Group, sur les 4 campagnes."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=2026)

    @transaction.atomic
    def handle(self, *args, **options):
        self.rng = random.Random(options["seed"])

        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable — lancez d'abord seed_africa_insurance_group.")

        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if not campaigns:
            raise CommandError("Aucune campagne pour cette entreprise — lancez d'abord seed_africa_insurance_group.")

        people = list(company.users.filter(role__in=[User.Role.MANAGER, User.Role.COMPANY_ADMIN]).order_by("id"))
        self.stdout.write(f"{len(people)} personnes (PDG + directeurs) × {len(campaigns)} campagnes")

        managerial_count = 0
        monkey_count = 0
        for person in people:
            for campaign in campaigns:
                for category in CATEGORIES:
                    self._managerial(person, campaign, category)
                    managerial_count += 1
                self._monkey(person, campaign)
                monkey_count += 1
            self.stdout.write(f"  → {person.get_full_name()} ({person.position}) : {len(campaigns)} campagnes traitées")

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {managerial_count} fiches Auto-évaluation managériale, "
            f"{monkey_count} fiches Monkey Management."
        ))

    def _managerial(self, person, campaign, category):
        lo, hi = self.rng.choice(LEVEL_RANGES)
        scores = []
        for order in range(1, 11):
            score = round(self.rng.uniform(lo, hi), 1)
            # Un objectif sur trois environ reste vide : une fiche où tout est
            # renseigné à 100% ne ressemble à aucun usage réel.
            objective = round(self.rng.uniform(lo, hi), 1) if self.rng.random() > 0.3 else None
            scores.append({"order": order, "score": score, "objective_score": objective})

        assessment, _ = ManagerialSelfAssessment.objects.update_or_create(
            user=person, campaign=campaign, category=category,
            defaults={"scores": scores},
        )
        self._recompute_managerial(assessment)

    @staticmethod
    def _recompute_managerial(instance):
        scores = [e["score"] for e in instance.scores if e.get("score") is not None]
        objectives = [e["objective_score"] for e in instance.scores if e.get("objective_score") is not None]
        instance.ic_score = round(sum(scores) / len(scores), 1) if scores else 0
        instance.oc_score = round(sum(objectives) / len(objectives), 1) if objectives else 0
        instance.save(update_fields=["ic_score", "oc_score"])

    def _monkey(self, person, campaign):
        lo, hi = self.rng.choice(MONKEY_TOTAL_RANGES)
        target = self.rng.randint(lo, hi)
        # Répartit `target` sur 10 notes de 1 à 5 : tirage successif borné
        # pour que la somme finale tombe exactement dans la bande visée,
        # plutôt que dix tirages indépendants qui la rateraient presque
        # toujours.
        scores = []
        remaining = target
        for order in range(1, 11):
            items_left = 10 - order + 1
            min_for_rest = (items_left - 1) * 1
            max_for_rest = (items_left - 1) * 5
            low = max(1, remaining - max_for_rest)
            high = min(5, remaining - min_for_rest)
            if low > high:
                low, high = 1, 5
            score = self.rng.randint(low, high)
            scores.append({"order": order, "score": score})
            remaining -= score

        monkeys = self.rng.sample(MONKEYS_POOL, 3)
        assessment, _ = MonkeyManagementAssessment.objects.update_or_create(
            user=person, campaign=campaign,
            defaults={
                "scores": scores,
                "monkeys": monkeys,
                "why_accepted": self.rng.choice(WHY_ACCEPTED_POOL),
                "return_to_whom": self.rng.choice(RETURN_TO_WHOM_POOL),
                "behavior_to_change": self.rng.choice(BEHAVIOR_POOL),
                "next_responsibility": self.rng.choice(NEXT_RESPONSIBILITY_POOL),
            },
        )
        total = sum(e["score"] for e in assessment.scores if e.get("score") is not None)
        assessment.total_score = total
        assessment.save(update_fields=["total_score"])
