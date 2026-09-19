"""
Peuple, pour les 60 collaborateurs de SUNU Group d'Africa Insurance Group,
tout ce qu'affiche leur menu « Évaluations » (ID-3A, objectifs employé et
équipe, auto-évaluation managériale, Monkey Management) sur les 4 campagnes :
évaluations par Daniel Junior Nkola, forces & faiblesses, fiches d'objectifs,
et les deux fiches d'auto-évaluation que chaque collaborateur remplit pour lui-même.

Réutilise les générateurs des autres seeds Africa Insurance Group (mêmes
niveaux, mêmes objectifs) mais ne touche qu'à SUNU Group : aucune donnée des
autres directions n'est réécrite.

Idempotent : relançable, les fiches SUNU sont recalculées sans doublon.

Usage:
    python manage.py seed_africa_insurance_group_sunu_evaluations
"""
import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands import seed_africa_insurance_group as base_seed
from apps.core.management.commands.seed_africa_insurance_group_rubriques import Command as Rubriques
from apps.core.management.commands.seed_africa_insurance_group_self_assessments import (
    CATEGORIES,
    Command as SelfAssessments,
)
from apps.core.models import Company, Department, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)
from apps.skills.models import SkillItem, SkillMatrix

COMPANY_NAME = "Africa Insurance Group"
POSITION = "Collaborateur"
HARD_SKILLS = [
    "Souscription des contrats IARD et vie", "Connaissance des produits d'assurance", "Gestion et suivi des sinistres",
    "Techniques de vente et de conseil client", "Réglementation CIMA et conformité", "Tarification et calcul des primes",
    "Outils CRM et digitaux de souscription", "Lecture d'un contrat et des garanties", "Prospection et développement portefeuille",
    "Reporting commercial et tableaux de bord",
]


class Command(BaseCommand):
    help = "Évaluations, objectifs et auto-évaluations des 60 collaborateurs SUNU Group, sur les 4 campagnes."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        sunu = Department.objects.filter(company=company, code="SUNU").first()
        daniel = User.objects.filter(company=company, generated_login="DIR10").first()
        if not sunu or not daniel:
            raise CommandError("SUNU Group ou Daniel Nkola (DIR10) introuvable — lancez d'abord les seeds SUNU et portraits.")
        staff = list(User.objects.filter(company=company, department=sunu, role=User.Role.MEMBER).order_by("id"))
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if not staff or not campaigns:
            raise CommandError("Aucun collaborateur SUNU ou aucune campagne.")

        # Référentiel de compétences de la direction (hard sectorisé, soft commun).
        hard_matrix, _ = SkillMatrix.objects.get_or_create(
            company=company, name="Collaborateur SUNU Group", type=SkillMatrix.SkillType.HARD, defaults={"department": sunu})
        if not hard_matrix.items.exists():
            SkillItem.objects.bulk_create([SkillItem(matrix=hard_matrix, name=n, order=i) for i, n in enumerate(HARD_SKILLS)])
        soft_matrix, _ = SkillMatrix.objects.get_or_create(
            company=company, name="Collaborateur SUNU Group", type=SkillMatrix.SkillType.SOFT, defaults={"department": sunu})
        if not soft_matrix.items.exists():
            SkillItem.objects.bulk_create([SkillItem(matrix=soft_matrix, name=n, order=i) for i, n in enumerate(base_seed.SOFT_SKILLS)])
        hard_items, soft_items = list(hard_matrix.items.all()), list(soft_matrix.items.all())

        # 1. Évaluations ID-3A (Daniel Nkola évalue chaque collaborateur).
        gen = base_seed.Command()
        gen.rng = random.Random(4242)
        for campaign in campaigns:
            for user in staff:
                gen._evaluate_person(campaign, user, daniel, hard_items, soft_items)
        evaluations = list(Evaluation.objects.filter(user__in=staff).select_related("user", "campaign", "evaluator"))
        self.stdout.write(f"Évaluations : {len(evaluations)}")

        # 2. Forces & faiblesses (5 meilleures / 5 plus faibles notes, hard puis soft).
        notes = []
        for ev in evaluations:
            groups = {"HARD": [], "SOFT": []}
            for s in ev.skill_scores.select_related("skill_item__matrix"):
                if s.score is not None:
                    groups[s.skill_item.matrix.type].append((s.score, s.skill_item.name))
            for kind in ("HARD", "SOFT"):
                ordered = sorted(groups[kind], key=lambda t: (-t[0], t[1]))
                for cat, lst in ((f"{kind}_STRENGTH", ordered[:5]), (f"{kind}_WEAKNESS", list(reversed(ordered[-5:])))):
                    for order, (score, name) in enumerate(lst, start=1):
                        notes.append(SkillNote(evaluation=ev, category=cat, order=order, text=name[:255], score=score))
        SkillNote.objects.filter(evaluation__in=evaluations).delete()
        SkillNote.objects.bulk_create(notes)

        # 3. Fiches d'objectifs : employé (par évaluation) puis équipe (par campagne).
        rub = Rubriques()
        rub._spread = Rubriques._spread
        today = date.today()
        PerformanceObjective.objects.filter(evaluation__in=evaluations).delete()
        PerformanceObjective.objects.filter(team=sunu).delete()
        lines = []
        for ev in evaluations:
            rng = random.Random(f"obj-{ev.pk}")
            lines += rub._make_lines({"evaluation": ev}, "SUNU", ev.business_objectives_score, ev.people_objectives_score, False, rng)
            camp = ev.campaign
            evaluated = min(today, max(camp.start_date + timedelta(days=30), camp.end_date - timedelta(days=12)))
            ev.objectives_set_on = camp.start_date + timedelta(days=14 + rng.randint(0, 10))
            ev.evaluated_on = evaluated
            ev.next_evaluation_on = evaluated + timedelta(days=365 if camp.end_date - camp.start_date > timedelta(days=200) else 182)
            ev.manager_visa = f"{daniel.get_full_name()} — visé le {evaluated.strftime('%d/%m/%Y')}"
            ev.save(update_fields=["objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa"])
        PerformanceObjective.objects.bulk_create(lines)
        for ev in evaluations:
            recompute_evaluation_scores(ev)  # l'Altitude suit les objectifs saisis
        team_lines = []
        for campaign in campaigns:
            group = list(Evaluation.objects.filter(user__in=staff, campaign=campaign))
            business = sum(float(e.business_objectives_score) for e in group) / len(group)
            people = sum(float(e.people_objectives_score) for e in group) / len(group)
            rng = random.Random(f"tobj-SUNU-{campaign.pk}")
            team_lines += rub._make_lines({"team": sunu, "campaign_id": campaign.pk}, "SUNU", round(business, 1), round(people, 1), True, rng)
        PerformanceObjective.objects.bulk_create(team_lines)
        self.stdout.write(f"Objectifs : {len(lines)} lignes employés, {len(team_lines)} lignes équipe")

        # 4. Auto-évaluation managériale + Monkey Management, remplies par chacun pour lui-même.
        sa = SelfAssessments()
        sa.rng = random.Random(4243)
        for user in staff:
            for campaign in campaigns:
                for category in CATEGORIES:
                    sa._managerial(user, campaign, category)
                sa._monkey(user, campaign)
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {len(staff)} collaborateurs × {len(campaigns)} campagnes : évaluations, objectifs, auto-évaluations."
        ))
