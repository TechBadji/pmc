"""
Peuple SOCIUM d'après son organigramme réel (appliqué par
`apply_socium_orgchart`), pour toutes les personnes et toutes les équipes, sur
les quatre campagnes — en ne créant QUE ce qui manque :

  - Évaluations : référentiels de compétences par équipe, évaluations ID-3A
    (chacun par le responsable de son équipe), forces & faiblesses, objectifs,
    auto-évaluation managériale et Monkey Management, 360° Feedback ;
  - 360° Feedforward (campagne en cours) : chaque personne reçoit le guide de
    son responsable et de plusieurs collègues ou collaborateurs, et remplit son
    Round 2 ;
  - Cohésion : fiche de cohésion de chaque équipe, avis de chacun sur son
    équipe et sur l'organisation (le dirigeant ne note pas l'organisation),
    Psychological Safety par équipe ;
  - dates de carrière et téléphone des comptes qui n'en ont pas.

Rien de ce qui existe n'est modifié ni supprimé : une évaluation, un avis ou
un guide déjà présent est laissé tel quel, relance comprise. Les notes sont
tirées dans les niveaux moyen à excellent : ces comptes portent le nom de
personnes réelles, aucune n'est présentée comme en difficulté par un tirage.

Aucun nom ne figure ici : les personnes et les équipes sont lues en base.

Usage:
    python manage.py seed_socium_org_data
"""
import random
from datetime import date, timedelta

from django.core.management.base import CommandError
from django.db import transaction

from apps.core.management.commands import seed_africa_insurance_group as MAIN
from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands import seed_psychological_safety as PSI
from apps.core.management.commands import seed_socium as SOCIUM
from apps.core.management.commands import seed_socium_feedforward as FF
from apps.core.management.commands import seed_socium_rubriques as RUB
from apps.core.management.commands import seed_sunu_bank_senegal_rubriques as SBS
from apps.core.management.commands.seed_africa_insurance_group_psi_360 import IMPROVE, STRENGTHS
from apps.core.models import Company, Department, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    Feedback360,
    ManagerialSelfAssessment,
    PerformanceObjective,
    recompute_evaluation_scores,
)
from apps.evaluations.serializers import FEEDFORWARD_ROUND1, FEEDFORWARD_ROUND2
from apps.teams.models import CohesionCriterionScore, CohesionResponse, TeamCohesionAnalysis

# Dix savoir-faire par famille de métier ; chaque équipe renvoie à sa famille.
FAMILIES = {
    "operations": [
        "Pilotage des opérations et des processus", "Suivi budgétaire", "Gestion des partenariats",
        "Coordination entre équipes", "Reporting à la direction", "Gestion administrative",
        "Amélioration continue", "Gestion des fournisseurs", "Conformité et procédures internes", "Gestion de projet",
    ],
    "hr": [
        "Recrutement et intégration", "Administration du personnel et paie", "Droit du travail",
        "Gestion des carrières", "Ingénierie de formation", "Marque employeur",
        "Dialogue social", "Outils et tableaux de bord RH", "Qualité de vie au travail", "Accompagnement des managers",
    ],
    "product": [
        "Cadrage et priorisation de la feuille de route produit", "Recueil et analyse des besoins utilisateurs",
        "Rédaction des spécifications", "Conception UX/UI", "Tests fonctionnels et recette",
        "Automatisation des tests", "Suivi de la qualité logicielle", "Analyse des usages et des données produit",
        "Collaboration avec les équipes techniques", "Connaissance des produits SOCIUM",
    ],
    "cx": [
        "Accompagnement et formation des clients", "Traitement des demandes et des incidents", "Paramétrage de la solution chez le client",
        "Expertise paie et réglementation sociale", "Suivi de la satisfaction client", "Gestion du portefeuille clients",
        "Détection des opportunités de vente additionnelle", "Rédaction de la base de connaissances",
        "Respect des délais de réponse", "Remontée de la voix du client",
    ],
    "marketing": [
        "Stratégie de marque", "Marketing digital et réseaux sociaux", "Création de contenus",
        "Génération de prospects", "Organisation d'événements", "Relations presse et partenaires",
        "Analyse des campagnes", "Identité visuelle", "Connaissance du marché", "Gestion du budget marketing",
    ],
    "sales": [
        "Prospection et qualification", "Conduite des rendez-vous et démonstrations", "Négociation et conclusion",
        "Gestion du portefeuille d'opportunités", "Connaissance des offres SOCIUM", "Connaissance du marché local",
        "Développement de partenariats", "Prévision des ventes", "Tenue du CRM", "Fidélisation des comptes clés",
    ],
    "tech": [
        "Conception et architecture logicielle", "Développement back-end", "Développement front-end et mobile",
        "Qualité du code et revues", "Tests et intégration continue", "Exploitation et supervision des plateformes",
        "Sécurité des systèmes d'information", "Bases de données et performance", "Documentation technique",
        "Estimation et tenue des délais",
    ],
}
FAMILY_BY_CODE = {"OPS": "operations", "HR": "hr", "PRD": "product", "CX": "cx", "MKT": "marketing", "SAL": "sales",
                  "SEN": "sales", "CIV": "sales", "GRW": "sales", "TECH": "tech", "SQ1": "tech", "SQ2": "tech"}
# Climat de cohésion ressenti par l'équipe (sur 5) et écart de la note que son responsable lui donne.
CLIMATE = {"OPS": 3.8, "HR": 4.0, "PRD": 3.6, "CX": 4.1, "MKT": 3.9, "SAL": 3.7, "SEN": 3.8, "CIV": 3.5, "GRW": 3.6,
           "TECH": 3.9, "SQ1": 4.0, "SQ2": 3.7}
SELF_GAP = {"OPS": 0.2, "HR": -0.1, "PRD": 0.3, "CX": 0.1, "MKT": 0.2, "SAL": 0.4, "SEN": 0.1, "CIV": 0.5, "GRW": 0.3,
            "TECH": 0.0, "SQ1": 0.2, "SQ2": 0.4}
# Niveaux tirés : moyen, bon, excellent (voir l'en-tête).
LEVELS = [r for _label, r in MAIN.LEVEL_RANGES[2:]]
PERFORMANCE = [r for _label, r in MAIN.BIZ_RANGES[2:]]


class Command(SBS.Command):
    help = "SOCIUM : peuple évaluations, 360° Feedforward et cohésion pour tout l'organigramme, sans rien écraser."

    def add_arguments(self, parser):
        pass

    @transaction.atomic
    def handle(self, *args, **options):
        company = Company.objects.filter(name=SOCIUM.COMPANY_NAME).first()
        if company is None:
            raise CommandError(f"Entreprise « {SOCIUM.COMPANY_NAME} » introuvable.")
        self.company = company
        self.ceo = company.admin_user
        self.campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        self.depts = list(Department.objects.filter(company=company).select_related("manager", "parent__manager"))
        unknown = [d.code for d in self.depts if d.code not in FAMILY_BY_CODE]
        if self.ceo is None or len(self.campaigns) != len(R.CAMPAIGN_SHIFTS) or unknown or not self.depts:
            raise CommandError(
                f"Organigramme attendu : un administrateur, {len(R.CAMPAIGN_SHIFTS)} campagnes, les équipes de "
                f"apply_socium_orgchart (équipes inconnues : {', '.join(unknown) or 'aucune'})."
            )
        self.people = sorted(
            company.users.filter(is_active=True, department__isnull=False).select_related("department__manager", "department__parent__manager"),
            key=lambda u: u.id,
        )
        self.today = date.today()
        self.deposit = {c.pk: max(min(self.today, c.end_date), c.start_date) for c in self.campaigns}

        self._profiles_basics()
        self._evaluations()
        self._self_assessments_missing()
        self._feedback(Feedback360.Kind.FEEDBACK, self.campaigns[-2:])
        self._feedback(Feedback360.Kind.FORWARD, self.campaigns[-1:])
        self._cohesion()
        PSI.Command(stdout=self.stdout, stderr=self.stderr).seed(company)
        self.stdout.write(self.style.SUCCESS(f"\nTerminé — {company.name} : {len(self.people)} personnes, {len(self.depts)} équipes."))

    # -- qui encadre qui -----------------------------------------------------
    def _boss(self, user):
        """Responsable d'une personne d'après son équipe : le chef de l'équipe ;
        pour le chef lui-même, celui de la direction de rattachement, sinon le
        dirigeant. Le dirigeant n'a pas de responsable."""
        if user.pk == self.ceo.pk:
            return None
        dept = user.department
        if dept.manager_id and dept.manager_id != user.pk:
            return dept.manager
        if dept.parent_id and dept.parent.manager_id and dept.parent.manager_id != user.pk:
            return dept.parent.manager
        return self.ceo

    def _circle(self, user, rng):
        """Ceux qui donnent leur avis sur `user` : son responsable, des pairs
        (même équipe, ou autres responsables de même niveau), des collaborateurs."""
        boss = self._boss(user)
        reports = [p for p in self.people if p.pk != user.pk and self._boss(p) and self._boss(p).pk == user.pk]
        peers = [p for p in self.people if p.pk != user.pk and boss is not None and self._boss(p) and self._boss(p).pk == boss.pk]
        circle = [(boss, "MANAGER")] if boss is not None else []
        circle += [(p, "PEER") for p in rng.sample(peers, min(3, len(peers)))]
        circle += [(p, "REPORT") for p in rng.sample(reports, min(3, len(reports)))]
        # Petite équipe (un responsable et une seule personne) : des collègues de
        # la même direction complètent, pour que chacun reçoive plusieurs avis.
        if len(circle) < 3:
            direction = user.department.parent_id or user.department_id
            taken = {p.pk for p, _ in circle} | {user.pk}
            wider = [p for p in self.people if p.pk not in taken and direction in (p.department_id, p.department.parent_id)]
            circle += [(p, "PEER") for p in rng.sample(wider, min(3 - len(circle), len(wider)))]
        return circle

    # -- comptes ---------------------------------------------------------------
    def _profiles_basics(self):
        filled = 0
        for user in self.people:
            changed = []
            if user.birth_date is None and user.career_start_date is None and user.hire_date is None and user.role_start_date is None:
                dates = SOCIUM.employee_dates(f"org-{user.generated_login}")
                for field, value in zip(("birth_date", "career_start_date", "hire_date", "role_start_date"), dates):
                    setattr(user, field, value)
                    changed.append(field)
            if not user.phone:
                rng = random.Random(f"socium-phone-{user.generated_login}")
                user.phone = f"+221 77 {rng.randint(100, 999)} {rng.randint(10, 99)} {rng.randint(10, 99)}"
                changed.append("phone")
            if changed:
                user.save(update_fields=changed)
                filled += 1
        self.stdout.write(f"Dates de carrière et téléphone : {filled} compte(s) complété(s)")

    # -- évaluations -----------------------------------------------------------
    def _evaluations(self):
        gen = MAIN.Command()
        rub = R.Command()
        items = {d.pk: gen._matrices(self.company, d, d.name, FAMILIES[FAMILY_BY_CODE[d.code]]) for d in self.depts}
        done = set(Evaluation.objects.filter(user__in=self.people).values_list("user_id", "campaign_id"))
        created = []
        for user in self.people:
            boss = self._boss(user)
            if boss is None:
                continue  # le dirigeant n'est évalué par personne
            gen.rng = random.Random(f"socium-org-eval-{user.generated_login}")
            hard_items, soft_items = items[user.department_id]
            for campaign in self.campaigns:
                if (user.pk, campaign.pk) in done:
                    continue
                gen._evaluation(campaign, user, boss, hard_items, soft_items, gen.rng.choice(PERFORMANCE),
                                gen.rng.choice(LEVELS), gen.rng.choice(LEVELS))
                created.append(Evaluation.objects.select_related("user", "campaign", "evaluator").get(user=user, campaign=campaign))
        self._skill_notes(created)
        lines = []
        for ev in created:
            rng = random.Random(f"socium-org-obj-{ev.user.generated_login}-{ev.campaign.name}")
            lines += rub._make_lines({"evaluation": ev}, RUB.SPEC_CODE, ev.business_objectives_score,
                                     ev.people_objectives_score, ev.user.role != User.Role.MEMBER, rng)
            camp = ev.campaign
            evaluated = min(self.today, max(camp.start_date + timedelta(days=30), camp.end_date - timedelta(days=12)))
            ev.objectives_set_on = camp.start_date + timedelta(days=14 + rng.randint(0, 10))
            ev.evaluated_on = evaluated
            ev.next_evaluation_on = evaluated + timedelta(days=365 if camp.end_date - camp.start_date > timedelta(days=200) else 182)
            ev.manager_visa = f"{ev.evaluator.get_full_name()} — visé le {evaluated.strftime('%d/%m/%Y')}"
            ev.save(update_fields=["objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa"])
        PerformanceObjective.objects.bulk_create(lines)
        for ev in created:
            recompute_evaluation_scores(ev)
        self.stdout.write(f"Évaluations ID-3A créées : {len(created)} ; objectifs : {len(lines)} lignes")

    def _self_assessments_missing(self):
        have = set(ManagerialSelfAssessment.objects.filter(user__in=self.people).values_list("user_id", flat=True))
        self.everyone = [u for u in self.people if u.pk not in have]
        self._self_assessments()

    def _feedback(self, kind, campaigns):
        forward = kind == Feedback360.Kind.FORWARD
        existing = set(Feedback360.objects.filter(company=self.company, kind=kind).values_list("author_id", "subject_id", "campaign_id"))
        answered = set(
            Feedback360.objects.filter(company=self.company, kind=kind).exclude(answers={}).values_list("author_id", "subject_id", "campaign_id")
        )
        rows, completed = [], 0

        def answers(keys, seed):
            rng = random.Random(seed)
            return {k: rng.choice(FF.STAFF_POOLS[k]).replace("le DGA", "la direction") for k in keys}

        for campaign in campaigns:
            for user in self.people:
                rng = random.Random(f"socium-org-{kind}-{campaign.name}-{user.generated_login}")
                for author, relation in [(user, "SELF")] + self._circle(user, rng):
                    key = (author.pk, user.pk, campaign.pk)
                    seed = f"socium-org-ff-{author.generated_login}-{user.generated_login}"
                    guide = answers(FEEDFORWARD_ROUND2 if relation == "SELF" else FEEDFORWARD_ROUND1, seed) if forward else {}
                    if key in existing:
                        # Un Feedforward d'avant le guide existe sans réponse : il est complété, jamais réécrit.
                        if forward and key not in answered:
                            Feedback360.objects.filter(author=author, subject=user, campaign=campaign, kind=kind).update(answers=guide)
                            completed += 1
                        continue
                    if forward:
                        rows.append(Feedback360(company=self.company, campaign=campaign, subject=user, author=author, kind=kind,
                                                relation=relation, answers=guide))
                    else:
                        rows.append(Feedback360(
                            company=self.company, campaign=campaign, subject=user, author=author, kind=kind, relation=relation,
                            scores=[max(2, min(5, round(rng.gauss(4.0 + (0.2 if relation == "SELF" else 0), 0.6)))) for _ in range(6)],
                            text_a=rng.choice(STRENGTHS), text_b=rng.choice(IMPROVE)))
        Feedback360.objects.bulk_create(rows)
        label = "360° Feedforward" if forward else "360° Feedback"
        self.stdout.write(f"{label} : {len(rows)} avis créés" + (f", {completed} complété(s)" if forward else ""))

    # -- cohésion ----------------------------------------------------------------
    def _cohesion(self):
        rub = R.Command()
        sheets = team_count = org_count = 0
        for dept in self.depts:
            labels = rub._labels(dept.name)
            members = [p for p in self.people if p.department_id == dept.pk]
            for i, camp in enumerate(self.campaigns):
                day = self.deposit[camp.pk]
                if dept.manager_id and not TeamCohesionAnalysis.objects.filter(team=dept, date=day).exists():
                    rng = random.Random(f"socium-org-sheet-{dept.code}-{camp.name}")
                    base = CLIMATE[dept.code] + R.CAMPAIGN_SHIFTS[i] + SELF_GAP[dept.code]
                    sheet = TeamCohesionAnalysis.objects.create(team=dept, date=day)
                    scores = []
                    for label, level in zip(labels, rub._levels(base)):
                        ice = R._clamp_score(level + rng.gauss(0, 0.35))
                        objective = round(min(5.0, max(ice + 0.5, 4.0 + rng.choice([0, 0.5]))), 1)
                        achieved = round(min(5.0, max(1.0, (ice + objective) / 2 - 0.2 + rng.gauss(0, 0.2))), 1)
                        scores.append(CohesionCriterionScore(analysis=sheet, criterion=label, score=ice,
                                                             objective_score=objective, achieved_score=achieved))
                    CohesionCriterionScore.objects.bulk_create(scores)
                    sheet.ice_score = round(sum(s.score for s in scores) / len(scores), 1)
                    sheet.oce_score = round(sum(float(s.objective_score) for s in scores) / len(scores), 1)
                    sheet.notes = f"Fiche de cohésion {camp.name} — {dept.name}."
                    sheet.save(update_fields=["ice_score", "oce_score", "notes"])
                    sheets += 1
                for respondent in members:
                    if CohesionResponse.objects.filter(scope=CohesionResponse.Scope.TEAM, team=dept, respondent=respondent, date=day).exists():
                        continue
                    rng = random.Random(f"socium-org-team-{dept.code}-{camp.name}-{respondent.generated_login}")
                    base = CLIMATE[dept.code] + R.CAMPAIGN_SHIFTS[i] + rng.gauss(0, 0.5)
                    CohesionResponse.objects.create(
                        scope=CohesionResponse.Scope.TEAM, team=dept, company=self.company, respondent=respondent, date=day,
                        scores=[{"criterion": label, "score": R._clamp_score(level + rng.gauss(0, 0.5))}
                                for label, level in zip(labels, rub._levels(base))],
                    )
                    team_count += 1
        labels = rub._labels(self.company.name)
        for i, camp in enumerate(self.campaigns):
            day = self.deposit[camp.pk]
            for respondent in self.people:
                if respondent.pk == self.ceo.pk:
                    continue  # le dirigeant lit le résultat, il ne note pas l'organisation
                if CohesionResponse.objects.filter(scope=CohesionResponse.Scope.ORGANISATION, company=self.company,
                                                   respondent=respondent, date__range=(camp.start_date, camp.end_date)).exists():
                    continue
                rng = random.Random(f"socium-org-orga-{camp.name}-{respondent.generated_login}")
                if rng.random() > R.ORG_PARTICIPATION[i]:
                    continue
                base = 3.5 + R.CAMPAIGN_SHIFTS[i] + rng.gauss(0, 0.5)
                CohesionResponse.objects.create(
                    scope=CohesionResponse.Scope.ORGANISATION, company=self.company, team=None, respondent=respondent, date=day,
                    scores=[{"criterion": label, "score": R._clamp_score(level + rng.gauss(0, 0.5))}
                            for label, level in zip(labels, rub._levels(base))],
                )
                org_count += 1
        self.stdout.write(f"Cohésion : {sheets} fiches d'équipe, {team_count} avis sur son équipe, {org_count} avis sur l'organisation")
