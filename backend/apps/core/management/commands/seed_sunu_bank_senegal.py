"""
Jeu de démonstration « SUNU Bank Sénégal » : un CEO (login CEOSBS), cinq
directions conduites chacune par un directeur (DIR1…DIR5) et quarante
collaborateurs génériques EMP1…EMP40, répartis à parts égales.

Les comptes sont nommés d'après leur login et ne portent aucune donnée
pré-remplie par cette commande : les rubriques (évaluations, objectifs,
cohésion…) sont peuplées par `seed_sunu_bank_senegal_rubriques`, sur les
quatre campagnes créées ici (Année 2023, 2024, 2025 et Semestre 1 2026).
Les directeurs ont le CEO pour responsable, les collaborateurs le directeur
de leur direction.

Chaque compte reçoit ses dates de naissance, de début de carrière, d'entrée
dans l'entreprise et de prise de poste : ce sont elles qui alimentent l'âge
et les anciennetés des tableaux de bord (« Aperçu de l'Équipe Dirigeante »
du CEO, aperçu de l'équipe de chaque directeur). Une date déjà renseignée
n'est pas écrasée.

Les logins DIR1…DIR5 et EMP1…EMP40 doivent être libres : `generated_login`
est unique sur toute la plateforme. S'ils appartiennent encore à Africa
Insurance Group, lancer d'abord `rename_aig_emp_accounts` (voir ses options).

Idempotent : relancée, la commande crée les comptes manquants, remet le
rattachement hiérarchique en état et ne touche pas au reste des comptes
existants (mot de passe compris).

Usage:
    python manage.py seed_sunu_bank_senegal
"""
import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.avatar_utils import make_avatar_file
from apps.core.models import Company, Department, User
from apps.core.text_utils import slugify_company
from apps.evaluations.models import EvaluationCampaign

COMPANY_NAME = "SUNU Bank Sénégal"
CEO_LOGIN = "CEOSBS"
PASSWORD = "123456"
EMPLOYEE_COUNT = 40
# nom, début, fin, clôturée — mêmes exercices qu'Africa Insurance Group.
CAMPAIGNS = [
    ("Année 2023", date(2023, 1, 1), date(2023, 12, 31), True),
    ("Année 2024", date(2024, 1, 1), date(2024, 12, 31), True),
    ("Année 2025", date(2025, 1, 1), date(2025, 12, 31), True),
    ("Semestre 1 2026", date(2026, 1, 1), date(2026, 6, 30), False),
]
# Première version de la démo : une seule campagne, sur l'année entière. Elle
# devient « Semestre 1 2026 » plutôt que de rester en doublon du même exercice.
LEGACY_CAMPAIGN = "Année 2026"

# Les collaborateurs sont répartis dans l'ordre : EMP1…EMP8 dans la première
# direction, EMP9…EMP16 dans la deuxième, et ainsi de suite. Le directeur
# porte le rang de sa direction : DIR1 pour la première, DIR5 pour la dernière.
DEPARTMENTS = [
    ("DCO", "Direction Commerciale"),
    ("DRC", "Direction des Risques et de la Conformité"),
    ("DFC", "Direction Financière et Comptable"),
    ("DOP", "Direction des Opérations"),
    ("DSI", "Direction des Systèmes d'Information"),
]

# Par directeur : naissance, début de carrière, entrée dans l'entreprise, prise
# de poste. L'ordre chronologique est celui que contrôle la saisie du profil
# (`UserSerializer.validate`). Profils volontairement variés, de 43 à
# 54 ans, pour que le tableau comparatif ait quelque chose à montrer.
DIRECTOR_DATES = {
    "DIR1": (date(1974, 3, 12), date(1998, 9, 1), date(2010, 2, 1), date(2019, 1, 1)),
    "DIR2": (date(1979, 7, 25), date(2003, 10, 1), date(2015, 4, 1), date(2021, 9, 1)),
    "DIR3": (date(1971, 11, 5), date(1996, 1, 15), date(2006, 6, 1), date(2014, 3, 1)),
    "DIR4": (date(1983, 5, 18), date(2007, 9, 1), date(2018, 1, 8), date(2023, 2, 1)),
    "DIR5": (date(1981, 1, 30), date(2005, 3, 1), date(2012, 9, 3), date(2020, 6, 1)),
}
# Intitulé de poste du directeur : c'est lui que l'« Aperçu de l'Équipe
# Dirigeante » affiche sous chaque photo, dans une pastille étroite qui coupe
# les libellés longs. D'où la forme abrégée « Dir. … » (comme PMC-DEMO), qui
# place le nom de la direction en tête.
DIRECTOR_POSITIONS = {
    "DCO": "Dir. Commerciale",
    "DRC": "Dir. Risques & Conformité",
    "DFC": "Dir. Financière & Comptable",
    "DOP": "Dir. Opérations",
    "DSI": "Dir. Systèmes d'Information",
}
GENERIC_DIRECTOR_POSITION = "Directeur"
CEO_DATES = (date(1968, 9, 14), date(1992, 10, 1), date(2008, 3, 1), date(2017, 7, 1))
DATE_FIELDS = ("birth_date", "career_start_date", "hire_date", "role_start_date")
# Jour de référence des tirages des collaborateurs : figé, pour qu'une relance
# un autre jour redonne les mêmes dates.
REFERENCE_DAY = date(2026, 10, 1)


def employee_dates(number):
    """Dates d'un collaborateur, tirées à graine fixe sur son numéro : entre
    26 et 50 ans, début de carrière entre 22 et 26 ans, puis entrée dans
    l'entreprise et prise de poste dans l'ordre chronologique."""
    rng = random.Random(f"sunu-bank-senegal-{number}")
    birth = REFERENCE_DAY - timedelta(days=rng.randint(26 * 365, 50 * 365 + 300))
    career = birth + timedelta(days=rng.randint(22 * 365, 26 * 365))
    span = (REFERENCE_DAY - career).days
    hire = career + timedelta(days=rng.randint(0, max(0, span - 365)))
    role_start = hire + timedelta(days=rng.randint(0, max(0, (REFERENCE_DAY - hire).days - 180)))
    return birth, career, hire, role_start


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration SUNU Bank Sénégal (CEO CEOSBS, 5 directions, DIR1…DIR5, EMP1…EMP40)."

    @transaction.atomic
    def handle(self, *args, **options):
        company, created = Company.objects.get_or_create(
            name=COMPANY_NAME,
            defaults={
                "slug": slugify_company(COMPANY_NAME),
                "sector": "Banque",
                # Quarante-et-un comptes : la formule Démo s'arrête à dix.
                "plan": "STANDARD",
                "admin_first_name": CEO_LOGIN,
                "admin_last_name": "",
            },
        )
        self.stdout.write(self.style.SUCCESS(f"Entreprise {'créée' if created else 'réutilisée'} : {company.name}"))

        ceo = self._account(company, CEO_LOGIN, role=User.Role.COMPANY_ADMIN, position="CEO", initials="CEO")
        self._dates(ceo, CEO_DATES)
        if company.admin_user_id != ceo.id:
            company.admin_user = ceo
            company.save(update_fields=["admin_user"])

        # Sans campagne sélectionnable, plusieurs rubriques ne chargent rien.
        campaigns = self._campaigns(company, ceo)

        departments = [
            Department.objects.get_or_create(company=company, code=code, defaults={"name": name})[0]
            for code, name in DEPARTMENTS
        ]
        directors = []
        for rank, department in enumerate(departments, start=1):
            director = self._account(
                company, f"DIR{rank}", role=User.Role.MANAGER, position=DIRECTOR_POSITIONS[department.code],
                initials=f"D{rank}", department=department, manager=ceo,
            )
            if department.manager_id != director.id:
                department.manager = director
                department.save(update_fields=["manager"])
            self._dates(director, DIRECTOR_DATES[director.generated_login.upper()])
            # Seul l'intitulé générique d'origine est remplacé : un poste
            # ressaisi depuis l'application est conservé.
            if director.position in ("", GENERIC_DIRECTOR_POSITION):
                director.position = DIRECTOR_POSITIONS[department.code]
                director.save(update_fields=["position"])
            directors.append(director)

        per_department = EMPLOYEE_COUNT // len(departments)
        for n in range(1, EMPLOYEE_COUNT + 1):
            index = (n - 1) // per_department
            employee = self._account(
                company, f"EMP{n}", role=User.Role.MEMBER, position="Collaborateur",
                initials=str(n), department=departments[index], manager=directors[index],
            )
            self._dates(employee, employee_dates(n))

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {company.name} (slug {company.slug}), {company.employee_count} comptes\n"
            f"  CEO            : {CEO_LOGIN} / {PASSWORD}\n"
            f"  Directeurs     : DIR1 … DIR{len(directors)} / {PASSWORD}\n"
            f"  Collaborateurs : EMP1 … EMP{EMPLOYEE_COUNT} / {PASSWORD}\n"
            f"  Campagnes      : {', '.join(c.name for c in campaigns)}"
        ))
        for index, department in enumerate(departments):
            first = index * per_department + 1
            self.stdout.write(
                f"  {department.code} {department.name} : DIR{index + 1}, EMP{first} … EMP{first + per_department - 1}"
            )

    def _campaigns(self, company, ceo):
        current_name = CAMPAIGNS[-1][0]
        legacy = EvaluationCampaign.objects.filter(company=company, name=LEGACY_CAMPAIGN).first()
        if legacy is not None and not EvaluationCampaign.objects.filter(company=company, name=current_name).exists():
            legacy.name, legacy.start_date, legacy.end_date = CAMPAIGNS[-1][:3]
            legacy.save(update_fields=["name", "start_date", "end_date"])
        campaigns = []
        for name, start, end, closed in CAMPAIGNS:
            campaign, _ = EvaluationCampaign.objects.get_or_create(
                company=company, name=name,
                defaults={"start_date": start, "end_date": end, "created_by": ceo, "is_closed": closed},
            )
            campaigns.append(campaign)
        return campaigns

    def _dates(self, user, dates):
        """Renseigne les dates de carrière encore vides, sans écraser une saisie."""
        missing = [(field, value) for field, value in zip(DATE_FIELDS, dates) if getattr(user, field) is None]
        if missing:
            for field, value in missing:
                setattr(user, field, value)
            user.save(update_fields=[field for field, _ in missing])

    def _account(self, company, login, *, role, position, initials, department=None, manager=None):
        user = User.objects.filter(generated_login__iexact=login).select_related("company").first()
        # Contrôle avant d'écrire : la contrainte d'unicité répondrait par une
        # erreur d'intégrité qui ne dit ni quel login gêne, ni chez qui.
        if user is not None and user.company_id != company.id:
            raise CommandError(
                f"Le login {login} est déjà pris par {user.email} "
                f"({user.company.name if user.company else 'sans entreprise'})."
            )
        if user is not None:
            # Un compte créé avant l'arrivée des directeurs avait le CEO pour
            # responsable : seul ce rattachement est remis en état.
            if user.manager_id != (manager.id if manager else None):
                user.manager = manager
                user.save(update_fields=["manager"])
            return user
        user = User(
            email=f"{login.lower()}@{company.slug}.pmc.local",
            first_name=login,
            last_name="",
            role=role,
            position=position,
            company=company,
            department=department,
            manager=manager,
            generated_login=login,
            # Un mot de passe imposé au premier écran couperait la démo en deux.
            must_change_password=False,
        )
        user.set_password(PASSWORD)
        user.avatar.save(f"{login}.png", make_avatar_file(login, initials), save=False)
        user.save()
        return user
