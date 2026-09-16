"""
Jeu de démonstration « Africa Insurance Group » : un groupe d'assurance
panafricain organisé autour d'un CODIR présidé par le PDG, avec le Directeur
de Zone (DZ) et six directions fonctionnelles à son niveau hiérarchique.

Organigramme :
    CODIR (comité de direction, présidé par le PDG — Admin Entreprise / CEO applicatif)
    ├── Directeur de Zone (DZ)
    │   ├── Filiale Bénin           (service rattaché à la Direction de Zone)
    │   └── Filiale Sénégal         (service rattaché à la Direction de Zone)
    ├── Direction Technique
    ├── Direction Études et Projets
    ├── Direction Marketing et Expérience Client
    ├── Direction Financière
    ├── Direction des Ressources Humaines
    └── Direction Planning Budgétaire et Pilotage
    Le DZ et les six directions fonctionnelles sont tous au même niveau
    hiérarchique (rattachés directement au CODIR) ; seules les deux filiales
    sont un niveau sous le DZ.

Chacune des 9 directions actives (Zone, 2 filiales, 6 fonctionnelles) reçoit
un directeur + 5 collaborateurs (5 paliers de performance ID-3A distincts,
pour que la matrice ID-3A/9 Box montre un ensemble contrasté), avec avatar
généré et une date de naissance tirée pour une moyenne d'âge 40-50 ans.

Usage:
    python manage.py seed_africa_insurance_group
    python manage.py seed_africa_insurance_group --reset   # repart de zéro (PDG conservé)

Seul le PDG est upserté par login — les directeurs et collaborateurs sont
tirés au hasard (noms, postes) et créés une seule fois : relancer la commande
sans `--reset` échoue sur un doublon d'email plutôt que de dupliquer
silencieusement les comptes. Utiliser `--reset` pour repeupler à neuf.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.avatar_utils import make_avatar_file
from apps.core.models import Company, Department, User
from apps.core.text_utils import slugify_company, strip_accents
from apps.evaluations.models import Evaluation, EvaluationCampaign, EvaluationSkillScore
from apps.skills.models import SkillItem, SkillMatrix

COMPANY_NAME = "Africa Insurance Group"
PASSWORD = "123456"
CAMPAIGN_NAME = "Année 2026"
CAMPAIGN_START = date(2026, 1, 1)
CAMPAIGN_END = date(2026, 12, 31)

PDG_FIRST_NAME, PDG_LAST_NAME = "Amina", "Sylla"
PDG_LOGIN = "CODIR"
PDG_POSITION = "Président Directeur Général — Président du CODIR"

# Les 10 soft skills sont repris à l'identique du référentiel PMC-DEMO
# (seed_demo.py) — convention établie : les soft skills ne varient pas d'une
# démo à l'autre, seuls les hard skills sont sectorisés (ici, assurance).
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

# code, nom de département, nom du référentiel/poste du directeur, hard skills (10)
DIRECTIONS = [
    (
        "DZ", "Direction de Zone", None, "Directeur de Zone",
        [
            "Pilotage stratégique multi-pays", "Développement de la zone et croissance du portefeuille",
            "Consolidation des résultats de zone", "Supervision du réseau de filiales",
            "Gestion des risques régionaux", "Relations avec les régulateurs (CIMA)",
            "Négociation des traités de réassurance", "Gouvernance de groupe",
            "Management Stratégique", "Business English",
        ],
    ),
    (
        "FIL1", "Filiale Bénin", "DZ", "Directeur de Filiale — Bénin",
        [
            "Souscription IARD & Vie", "Gestion des sinistres", "Animation du réseau d'agents généraux",
            "Pilotage commercial de filiale", "Gestion technique locale", "Relation clientèle et distribution",
            "Conformité réglementaire locale (CIMA)", "Gestion de la rentabilité de filiale",
            "Management d'équipe terrain", "Connaissance du marché béninois",
        ],
    ),
    (
        "FIL2", "Filiale Sénégal", "DZ", "Directeur de Filiale — Sénégal",
        [
            "Souscription IARD & Vie", "Gestion des sinistres", "Animation du réseau d'agents généraux",
            "Pilotage commercial de filiale", "Gestion technique locale", "Relation clientèle et distribution",
            "Conformité réglementaire locale (CIMA)", "Gestion de la rentabilité de filiale",
            "Management d'équipe terrain", "Connaissance du marché sénégalais",
        ],
    ),
    (
        "DT", "Direction Technique", None, "Directeur Technique",
        [
            "Tarification actuarielle", "Souscription des grands risques", "Gestion des sinistres complexes",
            "Réassurance et traités", "Provisionnement technique", "Conformité prudentielle (CIMA/Solvabilité)",
            "Pilotage du ratio combiné", "Digitalisation des processus techniques",
            "Management Stratégique", "Business English",
        ],
    ),
    (
        "DEP", "Direction Études et Projets", None, "Directeur Études et Projets",
        [
            "Conduite de projets stratégiques", "Étude de faisabilité", "Gestion de portefeuille de projets",
            "Transformation digitale", "Cartographie et optimisation des processus", "Conduite du changement",
            "Pilotage PMO", "Méthodologies agiles",
            "Management Stratégique", "Business English",
        ],
    ),
    (
        "DMEC", "Direction Marketing et Expérience Client", None, "Directeur Marketing et Expérience Client",
        [
            "Stratégie de marque", "Développement de produits d'assurance", "Expérience client omnicanale",
            "Études de marché", "Pilotage de la relation client (NPS)", "Communication digitale",
            "Partenariats bancassurance", "Data marketing et fidélisation",
            "Management Stratégique", "Business English",
        ],
    ),
    (
        "DFI", "Direction Financière", None, "Directeur Financier",
        [
            "Pilotage financier et budgétaire", "Gestion de trésorerie de groupe", "Contrôle de gestion",
            "Consolidation comptable", "Gestion actif-passif (ALM)", "Fiscalité et conformité IFRS",
            "Reporting réglementaire (CIMA)", "Analyse de rentabilité",
            "Management Stratégique", "Business English",
        ],
    ),
    (
        "DRH", "Direction des Ressources Humaines", None, "Directeur des Ressources Humaines",
        [
            "Gestion des talents et des successions", "Développement des compétences", "Gestion de la paie multi-pays",
            "Relations sociales", "Politique de rémunération", "Recrutement et marque employeur",
            "Droit du travail comparé", "Digitalisation RH (SIRH)",
            "Management Stratégique", "Business English",
        ],
    ),
    (
        "DPBP", "Direction Planning Budgétaire et Pilotage", None, "Directeur Planning Budgétaire et Pilotage",
        [
            "Élaboration budgétaire", "Planification stratégique", "Pilotage des indicateurs de performance",
            "Prévisions financières", "Allocation des ressources multi-filiales", "Analyse des écarts budgétaires",
            "Business Intelligence", "Modélisation financière",
            "Management Stratégique", "Business English",
        ],
    ),
]

CODIR_CODE, CODIR_NAME = "CDIR", "Comité de Direction (CODIR)"

# (poste, hard, soft) par direction — postes des 5 collaborateurs (pas de
# doublon utile : la même liste est piochée sans remise par direction).
# Exactement 5 postes par direction (5 collaborateurs demandés).
JOB_TITLES = {
    "DZ": [
        "Chargée de Communication Groupe", "Coordinateur Audit Interne Zone", "Assistante de Direction",
        "Juriste Groupe", "Chargé de Mission Zone",
    ],
    "FIL1": [
        "Souscripteur IARD", "Gestionnaire Sinistres", "Chargé de Clientèle", "Inspecteur Commercial",
        "Comptable Filiale",
    ],
    "FIL2": [
        "Souscripteur IARD", "Gestionnaire Sinistres", "Chargé de Clientèle", "Inspecteur Commercial",
        "Comptable Filiale",
    ],
    "DT": [
        "Actuaire", "Souscripteur Grands Risques", "Gestionnaire de Réassurance", "Analyste Technique",
        "Responsable Provisionnement",
    ],
    "DEP": [
        "Chef de Projet", "Chargé d'Études", "Business Analyst", "Consultant Transformation Digitale",
        "Coordinateur PMO",
    ],
    "DMEC": [
        "Chargé de Marketing Produits", "Responsable Expérience Client", "Chargé d'Études de Marché",
        "Community Manager", "Chargé de Partenariats Bancassurance",
    ],
    "DFI": [
        "Contrôleur de Gestion", "Comptable Senior", "Trésorier Groupe", "Analyste Financier",
        "Responsable Consolidation",
    ],
    "DRH": [
        "Chargé de Recrutement", "Gestionnaire de Paie", "Responsable Formation", "Chargé des Relations Sociales",
        "Gestionnaire Administratif du Personnel",
    ],
    "DPBP": [
        "Contrôleur Budgétaire", "Analyste Business Intelligence", "Chargé de Planification",
        "Responsable Reporting de Gestion", "Analyste Prévisions Financières",
    ],
}

# Noms panafricains (Sénégal, Côte d'Ivoire, Cameroun, Togo, Ghana, Bénin) —
# un groupe d'assurance de zone brasse plusieurs nationalités, contrairement
# aux démos mono-pays (SUNU Bank Togo, SUNU Services).
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


def random_birth_date(rng: random.Random, low: int, high: int) -> date:
    age_years = rng.randint(low, high)
    today = date.today()
    return today.replace(year=today.year - age_years) - timedelta(days=rng.randint(0, 364))


def make_login(first_name: str, last_name: str, used: set) -> str:
    """Format `p.nom` (initiale du prénom, point, nom), suffixe numérique en
    cas d'homonymie — même convention que SUNU Bank Togo."""
    first = strip_accents(first_name).strip().lower()
    last = strip_accents(last_name).strip().lower().replace(" ", "").replace("-", "").replace("'", "")
    base = f"{first[:1]}.{last}"
    login = base
    suffix = 2
    while login in used:
        login = f"{base}{suffix}"
        suffix += 1
    used.add(login)
    return login


PERFORMANCE_BUCKETS = [
    ("Très faible", (30, 48), (1.0, 2.2)),
    ("Faible", (52, 72), (2.0, 3.0)),
    ("Moyenne", (76, 88), (3.0, 3.8)),
    ("Bonne", (91, 99), (3.8, 4.6)),
    ("Exceptionnelle", (102, 128), (4.4, 5.0)),
]


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration Africa Insurance Group (CODIR, DZ, 2 filiales, 6 directions fonctionnelles)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset", action="store_true",
            help="Supprime tous les comptes hors PDG et recrée l'entreprise à neuf.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        self.rng = random.Random(2026)
        self.used_logins: set[str] = set()
        self.used_names: set[str] = set()

        company = self._company()
        if options["reset"]:
            self._reset(company)

        self.used_logins.update(
            User.objects.exclude(company=company).values_list("generated_login", flat=True)
        )

        pdg = self._pdg(company)
        campaign, _ = EvaluationCampaign.objects.get_or_create(
            company=company,
            name=CAMPAIGN_NAME,
            defaults={"start_date": CAMPAIGN_START, "end_date": CAMPAIGN_END, "created_by": pdg},
        )

        departments = self._departments(company, pdg)
        self.stdout.write(self.style.SUCCESS(f"{len(departments)} départements prêts."))

        director_count = 0
        employee_count = 0
        for code, dept_name, parent_code, position, hard_skills in DIRECTIONS:
            department = departments[code]
            director_count += 1
            director = self._director(company, pdg, department, position, f"DIR{director_count}")

            hard_items, soft_items = self._matrices(company, department, position, hard_skills)
            label, biz_range, skill_range = self.rng.choice(PERFORMANCE_BUCKETS)
            self._evaluation(campaign, director, pdg, hard_items, soft_items, biz_range, skill_range, label)

            for title in JOB_TITLES[code]:
                self._employee(company, department, director, title, campaign, hard_items, soft_items)
                employee_count += 1

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {company.name} (slug {company.slug})\n"
            f"  PDG / CEO   : {PDG_LOGIN} / {PASSWORD}\n"
            f"  Directeurs  : {director_count} (dont le DZ, login DIR1…DIR{director_count} / {PASSWORD})\n"
            f"  Collaborateurs : {employee_count} (login p.nom / {PASSWORD})\n"
            f"  Campagne    : {campaign.name} ({campaign.start_date} → {campaign.end_date})"
        ))

    # ------------------------------------------------------------------

    def _company(self):
        company, created = Company.objects.get_or_create(
            name=COMPANY_NAME,
            defaults={
                "slug": slugify_company(COMPANY_NAME),
                "sector": "Assurance",
                "plan": "PREMIUM",
                "admin_first_name": PDG_FIRST_NAME,
                "admin_last_name": PDG_LAST_NAME,
            },
        )
        self.stdout.write(self.style.SUCCESS(f"Entreprise {'créée' if created else 'réutilisée'} : {company.name}"))
        return company

    def _reset(self, company):
        company.users.exclude(generated_login__iexact=PDG_LOGIN).delete()
        company.departments.all().delete()
        company.skill_matrices.all().delete()
        self.stdout.write(self.style.WARNING("Comptes, départements et référentiels existants supprimés (PDG conservé)."))

    def _pdg(self, company):
        pdg = User.objects.filter(generated_login__iexact=PDG_LOGIN).first()
        if pdg is not None and pdg.company_id not in (None, company.id):
            raise CommandError(f"Le login {PDG_LOGIN} est déjà pris par {pdg.email} ({pdg.company.name}).")
        if pdg is None:
            pdg = User(email=f"{PDG_LOGIN}@{company.slug}.pmc.local", generated_login=PDG_LOGIN)
            pdg.set_password(PASSWORD)
        pdg.first_name = PDG_FIRST_NAME
        pdg.last_name = PDG_LAST_NAME
        pdg.role = User.Role.COMPANY_ADMIN
        pdg.position = PDG_POSITION
        pdg.company = company
        pdg.birth_date = random_birth_date(self.rng, 48, 58)
        pdg.hire_date = date(2016, 1, 1)
        pdg.career_start_date = date(1994, 9, 1)
        pdg.must_change_password = False
        pdg.is_active = True
        if not pdg.avatar:
            pdg.avatar.save(f"{PDG_LOGIN}.png", make_avatar_file(PDG_LOGIN, "AS"), save=False)
        pdg.save()
        self.used_logins.add(PDG_LOGIN)
        self.used_names.add(f"{PDG_FIRST_NAME} {PDG_LAST_NAME}")
        if company.admin_user_id != pdg.id:
            company.admin_user = pdg
            company.save(update_fields=["admin_user"])
        self.stdout.write(self.style.SUCCESS(f"PDG / CEO : {pdg.get_full_name()} — login {PDG_LOGIN}"))
        return pdg

    def _departments(self, company, pdg):
        codir, _ = Department.objects.get_or_create(
            company=company, code=CODIR_CODE, defaults={"name": CODIR_NAME, "manager": pdg},
        )
        if codir.manager_id != pdg.id:
            codir.manager = pdg
            codir.save(update_fields=["manager"])
        if pdg.department_id != codir.id:
            pdg.department = codir
            pdg.save(update_fields=["department"])

        departments = {}
        # deux passes : les directions racines d'abord, pour que les filiales
        # puissent référencer le département "DZ" comme parent.
        for code, name, parent_code, _position, _hard in DIRECTIONS:
            if parent_code is not None:
                continue
            dept, _ = Department.objects.get_or_create(company=company, code=code, defaults={"name": name})
            departments[code] = dept
        for code, name, parent_code, _position, _hard in DIRECTIONS:
            if parent_code is None:
                continue
            dept, _ = Department.objects.get_or_create(
                company=company, code=code, defaults={"name": name, "parent": departments[parent_code]},
            )
            if dept.parent_id != departments[parent_code].id:
                dept.parent = departments[parent_code]
                dept.save(update_fields=["parent"])
            departments[code] = dept
        departments[CODIR_CODE] = codir
        return departments

    def _matrices(self, company, department, position, hard_skills):
        hard_matrix, _ = SkillMatrix.objects.get_or_create(
            company=company, name=position, type=SkillMatrix.SkillType.HARD, defaults={"department": department},
        )
        if not hard_matrix.items.exists():
            SkillItem.objects.bulk_create(
                [SkillItem(matrix=hard_matrix, name=name, order=i) for i, name in enumerate(hard_skills)]
            )
        soft_matrix, _ = SkillMatrix.objects.get_or_create(
            company=company, name=position, type=SkillMatrix.SkillType.SOFT, defaults={"department": department},
        )
        if not soft_matrix.items.exists():
            SkillItem.objects.bulk_create(
                [SkillItem(matrix=soft_matrix, name=name, order=i) for i, name in enumerate(SOFT_SKILLS)]
            )
        return list(hard_matrix.items.all()), list(soft_matrix.items.all())

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

    def _director(self, company, pdg, department, position, login):
        first, last = self._unique_name()
        existing = User.objects.filter(generated_login__iexact=login).first()
        if existing is not None and existing.company_id not in (None, company.id):
            raise CommandError(f"Le login {login} est déjà pris par {existing.email} ({existing.company.name}).")
        self.used_logins.add(login)
        user = User.objects.create(
            email=f"{login}@{company.slug}.pmc.local",
            first_name=first,
            last_name=last,
            role=User.Role.MANAGER,
            position=position,
            company=company,
            department=department,
            manager=pdg,
            generated_login=login,
            must_change_password=False,
            birth_date=random_birth_date(self.rng, 42, 55),
            hire_date=date(2019, 1, 1),
            career_start_date=date(2000, 1, 1),
        )
        user.set_password(PASSWORD)
        initials = f"{first[0]}{last[0]}".upper()
        user.avatar.save(f"{login}.png", make_avatar_file(login, initials), save=False)
        user.save()
        department.manager = user
        department.save(update_fields=["manager"])
        self.stdout.write(f"  → {department.name}: directeur {user.get_full_name()} ({login})")
        return user

    def _employee(self, company, department, manager, position, campaign, hard_items, soft_items):
        first, last = self._unique_name()
        login = make_login(first, last, self.used_logins)
        user = User.objects.create(
            email=f"{login}@{company.slug}.pmc.local",
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

        label, (biz_lo, biz_hi), (skill_lo, skill_hi) = self.rng.choice(PERFORMANCE_BUCKETS)
        self._evaluation(campaign, user, manager, hard_items, soft_items, (biz_lo, biz_hi), (skill_lo, skill_hi), label)

    def _evaluation(self, campaign, user, evaluator, hard_items, soft_items, biz_range, skill_range, label=""):
        biz_lo, biz_hi = biz_range
        skill_lo, skill_hi = skill_range
        biz_score = round(self.rng.uniform(biz_lo, biz_hi), 1)
        people_score = round(self.rng.uniform(biz_lo, biz_hi), 1)
        evaluation, _ = Evaluation.objects.update_or_create(
            user=user,
            campaign=campaign,
            defaults={
                "evaluator": evaluator if evaluator.id != user.id else None,
                "business_objectives_score": Decimal(str(biz_score)),
                "people_objectives_score": Decimal(str(people_score)),
                "notes": f"Palier de performance cible: {label}." if label else "",
            },
        )
        evaluation.skill_scores.all().delete()
        EvaluationSkillScore.objects.bulk_create(
            [
                EvaluationSkillScore(evaluation=evaluation, skill_item=item, score=Decimal(str(round(self.rng.uniform(skill_lo, skill_hi), 1))))
                for item in hard_items + soft_items
            ]
        )
