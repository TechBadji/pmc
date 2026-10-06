"""
Jeu de démonstration « SUNU Bank Sénégal » : un CEO (login CEOSBS) et
quarante collaborateurs génériques EMP1…EMP40, répartis à parts égales dans
cinq directions.

Les comptes sont nommés d'après leur login et ne portent aucune donnée
pré-remplie : la démo se fait en direct, chacun saisit sous son identifiant.
Les directions n'ont pas de directeur — seuls le CEO et les quarante
collaborateurs existent ; chaque collaborateur a le CEO pour responsable.

Les logins EMP1…EMP40 doivent être libres : `generated_login` est unique sur
toute la plateforme. S'ils appartiennent encore à Africa Insurance Group,
lancer d'abord `rename_aig_emp_accounts`.

Idempotent : relancée, la commande crée les comptes manquants et laisse les
existants tels quels (mot de passe compris).

Usage:
    python manage.py seed_sunu_bank_senegal
"""
from datetime import date

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
CAMPAIGN_NAME = "Année 2026"
CAMPAIGN_START = date(2026, 1, 1)
CAMPAIGN_END = date(2026, 12, 31)

# Les collaborateurs sont répartis dans l'ordre : EMP1…EMP8 dans la première
# direction, EMP9…EMP16 dans la deuxième, et ainsi de suite.
DEPARTMENTS = [
    ("DCO", "Direction Commerciale"),
    ("DRC", "Direction des Risques et de la Conformité"),
    ("DFC", "Direction Financière et Comptable"),
    ("DOP", "Direction des Opérations"),
    ("DSI", "Direction des Systèmes d'Information"),
]


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration SUNU Bank Sénégal (CEO CEOSBS, 5 directions, EMP1…EMP40)."

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
        if company.admin_user_id != ceo.id:
            company.admin_user = ceo
            company.save(update_fields=["admin_user"])

        # Sans campagne sélectionnable, plusieurs rubriques ne chargent rien.
        campaign, _ = EvaluationCampaign.objects.get_or_create(
            company=company,
            name=CAMPAIGN_NAME,
            defaults={"start_date": CAMPAIGN_START, "end_date": CAMPAIGN_END, "created_by": ceo},
        )

        departments = [
            Department.objects.get_or_create(company=company, code=code, defaults={"name": name})[0]
            for code, name in DEPARTMENTS
        ]
        per_department = EMPLOYEE_COUNT // len(departments)
        for n in range(1, EMPLOYEE_COUNT + 1):
            department = departments[(n - 1) // per_department]
            self._account(
                company, f"EMP{n}", role=User.Role.MEMBER, position="Collaborateur",
                initials=str(n), department=department, manager=ceo,
            )

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {company.name} (slug {company.slug}), {company.employee_count} comptes\n"
            f"  CEO            : {CEO_LOGIN} / {PASSWORD}\n"
            f"  Collaborateurs : EMP1 … EMP{EMPLOYEE_COUNT} / {PASSWORD}\n"
            f"  Campagne       : {campaign.name} ({campaign.start_date} → {campaign.end_date})"
        ))
        for index, department in enumerate(departments):
            first = index * per_department + 1
            self.stdout.write(f"  {department.code} {department.name} : EMP{first} … EMP{first + per_department - 1}")

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
