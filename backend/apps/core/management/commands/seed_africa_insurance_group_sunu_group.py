"""
Ajoute SUNU Group comme 10e direction d'Africa Insurance Group, au même
niveau hiérarchique que les autres (rattachée au CODIR, pas une filiale sous
le DZ) — pour l'expérience de cohésion demandée : le personnel dépose un
avis contrasté sur sa propre direction, et le CODIR peut lire l'agrégat
depuis la page Cohésion d'équipe (« Toute l'entreprise » ou la direction
« SUNU Group »).

Additive : n'implique pas `--reset` et ne retouche pas les 9 directions déjà
peuplées par `seed_africa_insurance_group` — les mêmes intitulés de poste et
de compétences ont été répliqués dans son `DIRECTIONS`/`JOB_TITLES` pour
qu'un futur `--reset` recrée aussi SUNU Group, mais cette commande reste le
chemin normal pour la peupler aujourd'hui sans perdre les données déjà en
place. Directeur : login DIR10. Collaborateurs : EMP46…EMP50 (suite directe
de la numérotation EMP1…EMP45 déjà utilisée).

Usage:
    python manage.py seed_africa_insurance_group_sunu_group
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.avatar_utils import make_avatar_file
from apps.core.models import Company, Department, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    EvaluationSkillScore,
    ManagerialSelfAssessment,
    MonkeyManagementAssessment,
)
from apps.skills.models import SkillItem, SkillMatrix
from apps.teams.models import CohesionResponse

COMPANY_NAME = "Africa Insurance Group"
PASSWORD = "123456"

DEPT_CODE, DEPT_NAME = "SUNU", "SUNU Group"
DIRECTOR_LOGIN = "DIR10"
DIRECTOR_POSITION = "Directeur Général — SUNU Group"
FIRST_EMP_NUMBER = 46

HARD_SKILLS = [
    "Pilotage stratégique de filiale", "Développement commercial multi-lignes",
    "Gestion des partenariats de distribution", "Supervision des opérations d'assurance",
    "Gestion des risques et conformité groupe", "Reporting consolidé au groupe",
    "Optimisation de la rentabilité de la filiale", "Digitalisation des parcours clients",
    "Management Stratégique", "Business English",
]
# Identiques au référentiel PMC-DEMO, convention établie sur cette entreprise.
SOFT_SKILLS = [
    "Leadership stratégique et inspiration",
    "Communication efficace et assertive",
    "Courage managérial et prise de décision",
    "Intelligence émotionnelle",
    "Collaboration transverse et esprit d'équipe",
    "Résolution de conflits et médiation",
    "Culture client et orientation résultats",
    "Délégation et responsabilisation",
    "Motivation et développement des équipes",
    "Adaptabilité et ouverture au changement",
]
JOB_TITLES = [
    "Souscripteur Senior", "Gestionnaire Sinistres", "Responsable Partenariats",
    "Contrôleur de Gestion Filiale", "Chargé de Conformité",
]

FIRST_NAMES_M = [
    "Mamadou", "Ousmane", "Ibrahima", "Kouassi", "Yao", "Kouadio", "Koffi",
    "Serge", "Franck", "Jean-Baptiste", "Emmanuel", "Kwesi", "Kwabena",
    "Komlan", "Ayité", "Adama", "Boubacar", "Cheikh", "Modeste", "Landry",
]
FIRST_NAMES_F = [
    "Awa", "Fatou", "Aminata", "Akissi", "Affoué", "Adjoua", "Ama",
    "Josiane", "Chantal", "Nadège", "Solange", "Abena", "Efua",
    "Akouvi", "Essi", "Aïda", "Rokhaya", "Mariam", "Clarisse", "Estelle",
]
LAST_NAMES = [
    "Diop", "Ndiaye", "Diallo", "Kouassi", "Kouame", "N'Guessan", "Yao",
    "Amon", "Traoré", "Konaté", "Mbeki", "Ekwalla", "Fotso", "Ngo",
    "Amégan", "Folly", "Agbodjan", "Mensah", "Owusu", "Asante", "Toure",
]

# Niveaux tirés indépendamment (hard/soft/performance) — même principe que
# seed_africa_insurance_group : profils contrastés d'une campagne à l'autre.
LEVEL_RANGES = [(1.0, 2.0), (2.0, 2.8), (2.8, 3.6), (3.6, 4.4), (4.4, 5.0)]
BIZ_RANGES = [(30, 48), (52, 72), (76, 88), (91, 99), (102, 128)]

MANAGERIAL_CATEGORIES = ["COMMUNICATION", "ECOUTE", "MOTIVATION", "DELEGATION", "TEMPS_PRIORITES"]
MONKEY_TOTAL_RANGES = [(10, 20), (21, 30), (31, 40), (41, 50)]
MONKEYS_POOL = [
    "Le dossier de renouvellement du contrat cadre", "Le reporting mensuel de l'équipe",
    "L'arbitrage sur le budget marketing", "La relance des impayés clients",
    "La préparation du comité de direction", "Le suivi du plan de formation",
]
WHY_ACCEPTED_POOL = [
    "Peur que le délai ne soit pas tenu si je ne m'en occupe pas moi-même.",
    "Le collaborateur n'avait pas encore démontré sa maîtrise du sujet.",
    "C'était plus rapide de le faire moi-même que d'expliquer comment faire.",
]
RETURN_TO_WHOM_POOL = [
    "Au responsable direct du dossier, avec un point de suivi hebdomadaire.",
    "À l'équipe, en clarifiant d'abord le niveau de décision qui lui revient.",
]
BEHAVIOR_POOL = [
    "Poser la question \"qu'as-tu déjà essayé ?\" avant de proposer une solution.",
    "Ne plus dire \"laisse-moi faire\", même sous pression de temps.",
]
NEXT_RESPONSIBILITY_POOL = [
    "La validation finale des devis de moins de 5 000 €.",
    "L'animation de la réunion hebdomadaire d'équipe.",
]

# Les dix critères de la fiche de cohésion, tels que le front les compose
# (frontend/src/utils/cohesionCriteria.ts) : le libellé — nom d'entreprise
# substitué — EST la clé de rapprochement entre un avis stocké et la ligne
# affichée, y compris pour un avis "sur sa direction" (le front substitue
# toujours le nom de l'entreprise, jamais celui de la direction notée).
CRITERIA = [
    "La vision de {company} sur les 10 à 15 prochaines années est clairement définie",
    "Tout le personnel comprend la vision et les valeurs de {company} et peut l'expliquer clairement",
    "Tous les employés se sont appropriés la vision et les valeurs de {company}",
    "Chaque employé connaît ses objectifs individuels et comment ils sont liés aux objectifs globaux",
    "Chaque membre est très engagé pour atteindre les objectifs fixés à l'équipe",
    "Tous les employés de {company} mettent les intérêts de l'organisation au-dessus de leurs intérêts personnels",
    "Il y a une bonne communication verticale entre le Top Management et le reste de {company}",
    "Il y a une bonne communication horizontale entre les différents départements/directions",
    "Il y a un niveau élevé de confiance entre le Top Management et le reste de {company}",
    "Il y a un niveau élevé de confiance entre les employés de {company} eux-mêmes",
]
# Niveau moyen visé par critère — contrastés à dessein, comme pour SUNU
# Services : une démo où les dix lignes tombent à la même note ne montre rien.
TARGET_LEVELS = [4.0, 3.3, 3.6, 4.2, 3.8, 2.6, 3.0, 2.3, 2.8, 3.4]


def random_birth_date(rng, low, high):
    age_years = rng.randint(low, high)
    today = date.today()
    return today.replace(year=today.year - age_years) - timedelta(days=rng.randint(0, 364))


class Command(BaseCommand):
    help = "Ajoute SUNU Group (10e direction, niveau CODIR) à Africa Insurance Group, avec avis de cohésion pré-remplis."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=2026)

    @transaction.atomic
    def handle(self, *args, **options):
        self.rng = random.Random(options["seed"])

        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable — lancez d'abord seed_africa_insurance_group.")

        if Department.objects.filter(company=company, code=DEPT_CODE).exists():
            raise CommandError("SUNU Group existe déjà pour cette entreprise — rien à faire.")

        pdg = company.admin_user
        if pdg is None:
            raise CommandError("Cette entreprise n'a pas de PDG (admin_user) — lancez seed_africa_insurance_group.")

        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if not campaigns:
            raise CommandError("Aucune campagne pour cette entreprise — lancez d'abord seed_africa_insurance_group.")

        self.used_logins = set(User.objects.exclude(company=company).values_list("generated_login", flat=True))
        self.used_logins.update(company.users.values_list("generated_login", flat=True))
        self.used_names = set(f"{u.first_name} {u.last_name}" for u in company.users.all())

        department = Department.objects.create(company=company, code=DEPT_CODE, name=DEPT_NAME)
        self.stdout.write(self.style.SUCCESS(f"Direction créée : {DEPT_NAME}"))

        director = self._director(company, pdg, department)
        hard_items, soft_items = self._matrices(company, department)
        for campaign in campaigns:
            self._evaluate_person(campaign, director, pdg, hard_items, soft_items)
            self._managerial(director, campaign)
            self._monkey(director, campaign)

        employees = []
        for title in JOB_TITLES:
            employee = self._employee(company, department, director, title)
            employees.append(employee)
            for campaign in campaigns:
                self._evaluate_person(campaign, employee, director, hard_items, soft_items)

        respondents = [director] + employees
        self._cohesion_responses(company, department, respondents)

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — SUNU Group : {director.get_full_name()} ({DIRECTOR_LOGIN}) "
            f"+ {len(employees)} collaborateurs (EMP{FIRST_EMP_NUMBER}…EMP{FIRST_EMP_NUMBER + len(employees) - 1}), "
            f"{len(campaigns)} campagnes, {len(respondents)} avis de cohésion déposés."
        ))

    # ------------------------------------------------------------------

    def _unique_name(self):
        for _ in range(200):
            female = self.rng.random() < 0.5
            first = self.rng.choice(FIRST_NAMES_F if female else FIRST_NAMES_M)
            last = self.rng.choice(LAST_NAMES)
            full = f"{first} {last}"
            if full not in self.used_names:
                self.used_names.add(full)
                return first, last
        raise CommandError("Pool de noms épuisé.")

    def _director(self, company, pdg, department):
        first, last = self._unique_name()
        existing = User.objects.filter(generated_login__iexact=DIRECTOR_LOGIN).first()
        if existing is not None and existing.company_id not in (None, company.id):
            raise CommandError(f"Le login {DIRECTOR_LOGIN} est déjà pris par {existing.email} ({existing.company.name}).")
        self.used_logins.add(DIRECTOR_LOGIN)
        user = User.objects.create(
            email=f"{DIRECTOR_LOGIN.lower()}@{company.slug}.pmc.local",
            first_name=first,
            last_name=last,
            role=User.Role.MANAGER,
            position=DIRECTOR_POSITION,
            company=company,
            department=department,
            manager=pdg,
            generated_login=DIRECTOR_LOGIN,
            must_change_password=False,
            birth_date=random_birth_date(self.rng, 42, 55),
            hire_date=date(2019, 1, 1),
            career_start_date=date(2000, 1, 1),
        )
        user.set_password(PASSWORD)
        initials = f"{first[0]}{last[0]}".upper()
        user.avatar.save(f"{DIRECTOR_LOGIN}.png", make_avatar_file(DIRECTOR_LOGIN, initials), save=False)
        user.save()
        department.manager = user
        department.save(update_fields=["manager"])
        self.stdout.write(f"  → Directeur : {user.get_full_name()} ({DIRECTOR_LOGIN})")
        return user

    def _employee(self, company, department, manager, position):
        first, last = self._unique_name()
        # Le prochain EMP libre, recalculé à chaque appel plutôt que
        # compté une fois : sûr même si des logins EMP existent déjà
        # au-delà de FIRST_EMP_NUMBER pour une autre raison.
        n = FIRST_EMP_NUMBER
        while f"EMP{n}" in self.used_logins:
            n += 1
        login = f"EMP{n}"
        self.used_logins.add(login)
        user = User.objects.create(
            email=f"{login.lower()}@{company.slug}.pmc.local",
            first_name=first,
            last_name=last,
            role=User.Role.MEMBER,
            position=position,
            company=company,
            department=department,
            manager=manager,
            generated_login=login,
            must_change_password=True,
            birth_date=random_birth_date(self.rng, 34, 52),
            hire_date=date(2021, 6, 1),
            career_start_date=date(2005, 1, 1),
        )
        user.set_password(PASSWORD)
        initials = f"{first[0]}{last[0]}".upper()
        user.avatar.save(f"{login}.png", make_avatar_file(login, initials), save=False)
        user.save()
        self.stdout.write(f"  → {position} : {user.get_full_name()} ({login})")
        return user

    def _matrices(self, company, department):
        hard_matrix, _ = SkillMatrix.objects.get_or_create(
            company=company, name=DIRECTOR_POSITION, type=SkillMatrix.SkillType.HARD, defaults={"department": department},
        )
        if not hard_matrix.items.exists():
            SkillItem.objects.bulk_create(
                [SkillItem(matrix=hard_matrix, name=name, order=i) for i, name in enumerate(HARD_SKILLS)]
            )
        soft_matrix, _ = SkillMatrix.objects.get_or_create(
            company=company, name=DIRECTOR_POSITION, type=SkillMatrix.SkillType.SOFT, defaults={"department": department},
        )
        if not soft_matrix.items.exists():
            SkillItem.objects.bulk_create(
                [SkillItem(matrix=soft_matrix, name=name, order=i) for i, name in enumerate(SOFT_SKILLS)]
            )
        return list(hard_matrix.items.all()), list(soft_matrix.items.all())

    def _evaluate_person(self, campaign, user, evaluator, hard_items, soft_items):
        hard_range = self.rng.choice(LEVEL_RANGES)
        soft_range = self.rng.choice(LEVEL_RANGES)
        biz_lo, biz_hi = self.rng.choice(BIZ_RANGES)
        biz_score = round(self.rng.uniform(biz_lo, biz_hi), 1)
        people_score = round(self.rng.uniform(biz_lo, biz_hi), 1)
        evaluation, _ = Evaluation.objects.update_or_create(
            user=user, campaign=campaign,
            defaults={
                "evaluator": evaluator if evaluator.id != user.id else None,
                "business_objectives_score": Decimal(str(biz_score)),
                "people_objectives_score": Decimal(str(people_score)),
            },
        )
        evaluation.skill_scores.all().delete()
        hard_lo, hard_hi = hard_range
        soft_lo, soft_hi = soft_range
        entries = [
            EvaluationSkillScore(evaluation=evaluation, skill_item=item, score=Decimal(str(round(self.rng.uniform(hard_lo, hard_hi), 1))))
            for item in hard_items
        ] + [
            EvaluationSkillScore(evaluation=evaluation, skill_item=item, score=Decimal(str(round(self.rng.uniform(soft_lo, soft_hi), 1))))
            for item in soft_items
        ]
        EvaluationSkillScore.objects.bulk_create(entries)

    def _managerial(self, director, campaign):
        for category in MANAGERIAL_CATEGORIES:
            lo, hi = self.rng.choice(LEVEL_RANGES)
            scores = []
            for order in range(1, 11):
                score = round(self.rng.uniform(lo, hi), 1)
                objective = round(self.rng.uniform(lo, hi), 1) if self.rng.random() > 0.3 else None
                scores.append({"order": order, "score": score, "objective_score": objective})
            assessment, _ = ManagerialSelfAssessment.objects.update_or_create(
                user=director, campaign=campaign, category=category, defaults={"scores": scores},
            )
            valid_scores = [e["score"] for e in assessment.scores if e.get("score") is not None]
            valid_obj = [e["objective_score"] for e in assessment.scores if e.get("objective_score") is not None]
            assessment.ic_score = round(sum(valid_scores) / len(valid_scores), 1) if valid_scores else 0
            assessment.oc_score = round(sum(valid_obj) / len(valid_obj), 1) if valid_obj else 0
            assessment.save(update_fields=["ic_score", "oc_score"])

    def _monkey(self, director, campaign):
        lo, hi = self.rng.choice(MONKEY_TOTAL_RANGES)
        target = self.rng.randint(lo, hi)
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

        assessment, _ = MonkeyManagementAssessment.objects.update_or_create(
            user=director, campaign=campaign,
            defaults={
                "scores": scores,
                "monkeys": self.rng.sample(MONKEYS_POOL, 3),
                "why_accepted": self.rng.choice(WHY_ACCEPTED_POOL),
                "return_to_whom": self.rng.choice(RETURN_TO_WHOM_POOL),
                "behavior_to_change": self.rng.choice(BEHAVIOR_POOL),
                "next_responsibility": self.rng.choice(NEXT_RESPONSIBILITY_POOL),
            },
        )
        total = sum(e["score"] for e in assessment.scores if e.get("score") is not None)
        assessment.total_score = total
        assessment.save(update_fields=["total_score"])

    def _cohesion_responses(self, company, department, respondents):
        """Avis contrastés par répondant, tirés autour du niveau visé par
        critère — même algorithme que seed_sunu_services (mood gaussien par
        répondant + bruit par critère), pour que le CODIR lise un agrégat
        dispersé plutôt qu'une note plate."""
        criteria = [c.format(company=company.name) for c in CRITERIA]
        today = date.today()
        count = 0
        for respondent in respondents:
            humeur = self.rng.gauss(0, 0.75)
            scores = []
            for label, cible in zip(criteria, TARGET_LEVELS):
                note = round(cible + humeur + self.rng.gauss(0, 0.5))
                scores.append({"criterion": label, "score": max(1, min(5, note))})
            CohesionResponse.objects.update_or_create(
                scope=CohesionResponse.Scope.TEAM,
                team=department,
                respondent=respondent,
                date=today,
                defaults={"scores": scores, "company": company},
            )
            count += 1
        self.stdout.write(self.style.SUCCESS(f"{count} avis de cohésion déposés sur « {department.name} »"))
