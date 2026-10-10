"""
Jeu de démonstration « SOCIUM » : un CEO (login CEOSOC), un directeur général
adjoint (DGASOC), un directeur technique (CTOSOC) et trente collaborateurs
génériques EMP1…EMP30 rattachés directement à l'entreprise.

Aucune direction n'est créée : c'est le choix structurant de cette démo. Les
collaborateurs ont le DGA pour responsable, le DGA le CEO, le CTO le DGA. Les
rubriques qui se lisent par direction (PSI, fiche de cohésion d'une direction,
cartes et relations d'équipe) n'ont donc ici personne à viser.

Les comptes sont nommés d'après leur login. Les rubriques (évaluations,
objectifs, auto-évaluations, 360°, avis sur l'organisation…) sont peuplées par
`seed_socium_rubriques`, sur les quatre campagnes créées ici (Année 2023,
2024, 2025 et Semestre 1 2026).

Les logins EMP1…EMP30 doivent être libres : `generated_login` est unique sur
toute la plateforme. S'ils appartiennent encore à SUNU Bank Sénégal, lancer
d'abord `rename_aig_emp_accounts --company "SUNU Bank Sénégal" --new-prefix SBS`.

Idempotent : relancée, la commande crée les comptes manquants, remet le
rattachement hiérarchique en état et ne touche pas au reste des comptes
existants (mot de passe compris).

Usage:
    python manage.py seed_socium
"""
import random
from datetime import date, timedelta

from django.db import transaction

from apps.core.management.commands import seed_sunu_bank_senegal as BASE
from apps.core.models import Company, User
from apps.core.text_utils import slugify_company

COMPANY_NAME = "SOCIUM"
CEO_LOGIN, DGA_LOGIN, CTO_LOGIN = "CEOSOC", "DGASOC", "CTOSOC"
PASSWORD = BASE.PASSWORD
EMPLOYEE_COUNT = 30
DGA_POSITION = "Directeur Général Adjoint"
CTO_POSITION = "Directeur Technique (CTO)"
EMPLOYEE_POSITION = "Collaborateur"

# Naissance, début de carrière, entrée dans l'entreprise, prise de poste —
# dans l'ordre chronologique que contrôle la saisie du profil.
CEO_DATES = (date(1970, 4, 22), date(1994, 9, 1), date(2011, 1, 3), date(2016, 3, 1))
DGA_DATES = (date(1976, 10, 9), date(2000, 10, 2), date(2013, 6, 3), date(2020, 1, 6))
CTO_DATES = (date(1984, 2, 17), date(2007, 9, 3), date(2017, 4, 3), date(2021, 9, 1))


def employee_dates(number):
    """Dates d'un collaborateur, tirées à graine fixe sur son numéro : entre
    25 et 48 ans, début de carrière entre 22 et 26 ans, puis entrée dans
    l'entreprise et prise de poste dans l'ordre chronologique."""
    rng = random.Random(f"socium-{number}")
    birth = BASE.REFERENCE_DAY - timedelta(days=rng.randint(25 * 365, 48 * 365 + 300))
    career = birth + timedelta(days=rng.randint(22 * 365, 26 * 365))
    span = (BASE.REFERENCE_DAY - career).days
    hire = career + timedelta(days=rng.randint(0, max(0, span - 365)))
    role_start = hire + timedelta(days=rng.randint(0, max(0, (BASE.REFERENCE_DAY - hire).days - 180)))
    return birth, career, hire, role_start


class Command(BASE.Command):
    help = "Crée l'entreprise de démonstration SOCIUM (CEO CEOSOC, DGASOC, CTOSOC, EMP1…EMP30, sans direction)."

    @transaction.atomic
    def handle(self, *args, **options):
        company, created = Company.objects.get_or_create(
            name=COMPANY_NAME,
            defaults={
                "slug": slugify_company(COMPANY_NAME),
                "sector": "Services",
                # Trente-trois comptes : la formule Démo s'arrête à dix.
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
        campaigns = self._campaigns(company, ceo)

        dga = self._account(company, DGA_LOGIN, role=User.Role.MANAGER, position=DGA_POSITION, initials="DGA", manager=ceo)
        self._dates(dga, DGA_DATES)
        cto = self._account(company, CTO_LOGIN, role=User.Role.MANAGER, position=CTO_POSITION, initials="CTO", manager=dga)
        self._dates(cto, CTO_DATES)
        for n in range(1, EMPLOYEE_COUNT + 1):
            employee = self._account(
                company, f"EMP{n}", role=User.Role.MEMBER, position=EMPLOYEE_POSITION, initials=str(n), manager=dga,
            )
            self._dates(employee, employee_dates(n))

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {company.name} (slug {company.slug}), {company.employee_count} comptes, aucune direction\n"
            f"  CEO            : {CEO_LOGIN} / {PASSWORD}\n"
            f"  DGA            : {DGA_LOGIN} / {PASSWORD}\n"
            f"  CTO            : {CTO_LOGIN} / {PASSWORD}\n"
            f"  Collaborateurs : EMP1 … EMP{EMPLOYEE_COUNT} / {PASSWORD}\n"
            f"  Campagnes      : {', '.join(c.name for c in campaigns)}"
        ))
