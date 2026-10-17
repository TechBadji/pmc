"""
Jeu de démonstration « SUNU IARD » : un CEO et cinquante collaborateurs
rattachés directement à l'entreprise, sans direction intermédiaire.

Le CEO ne voit que trois rubriques : Cohésion d'équipe (dont Forces et
faiblesses) et le 360° Feedforward (rubrique Évaluations, vue Feedforward
seule) — réglage `Company.display_scope` du rôle dirigeant.

Usage:
    python manage.py seed_sunu_iard

Idempotente : relancée, elle remet les comptes en état sans doublon ni avis.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User
from apps.core.text_utils import slugify_company
from apps.evaluations.models import EvaluationCampaign

COMPANY_NAME = "SUNU IARD"
CEO_LOGIN = "CEOIARD"
EMPLOYEE_PREFIX = "SUNU"
EMPLOYEE_COUNT = 50
PASSWORD = "123456"
CAMPAIGN_NAME = "Année 2026"
CAMPAIGN_START = date(2026, 1, 1)
CAMPAIGN_END = date(2026, 12, 31)

# Rubriques et vues du catalogue `frontend/src/utils/displayCatalog.ts`.
CEO_NAV = ["/", "/cohesion", "/evaluations"]
CEO_HIDDEN_VIEWS = [
    "evaluations.id3a", "evaluations.employee", "evaluations.team",
    "evaluations.managerial", "evaluations.monkey", "evaluations.feedback",
]


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration SUNU IARD (CEO + 50 collaborateurs)."

    @transaction.atomic
    def handle(self, *args, **options):
        logins = [CEO_LOGIN] + [f"{EMPLOYEE_PREFIX}{n}" for n in range(1, EMPLOYEE_COUNT + 1)]
        company = Company.objects.filter(name=COMPANY_NAME).first()
        # `generated_login` est unique sur toute la plateforme : on refuse avant d'écrire.
        taken = User.objects.filter(generated_login__in=logins).exclude(company=company) if company else \
            User.objects.filter(generated_login__in=logins)
        if taken.exists():
            raise CommandError("Logins déjà pris ailleurs : " + ", ".join(
                f"{u.generated_login} ({u.company.name if u.company else '-'})" for u in taken))

        if company is None:
            company = Company.objects.create(
                name=COMPANY_NAME, slug=slugify_company(COMPANY_NAME), sector="Assurance",
                plan="STANDARD", admin_first_name=CEO_LOGIN, admin_last_name="",
            )
        ceo = self._user(company, CEO_LOGIN, User.Role.COMPANY_ADMIN, "CEO")
        if company.admin_user_id != ceo.id:
            company.admin_user = ceo
        for n in range(1, EMPLOYEE_COUNT + 1):
            self._user(company, f"{EMPLOYEE_PREFIX}{n}", User.Role.MEMBER, "Collaborateur")

        EvaluationCampaign.objects.get_or_create(
            company=company, name=CAMPAIGN_NAME,
            defaults={"start_date": CAMPAIGN_START, "end_date": CAMPAIGN_END, "created_by": ceo},
        )
        scope = dict(company.display_scope or {})
        scope.setdefault("nav", {})["COMPANY_ADMIN"] = CEO_NAV
        scope.setdefault("hidden_views_by_role", {})["COMPANY_ADMIN"] = CEO_HIDDEN_VIEWS
        company.display_scope = scope
        company.employee_count = company.users.count()
        company.save()
        self.stdout.write(self.style.SUCCESS(
            f"{company.name} : CEO {CEO_LOGIN}, {EMPLOYEE_PREFIX}1…{EMPLOYEE_PREFIX}{EMPLOYEE_COUNT}, "
            f"mot de passe {PASSWORD}, campagne {CAMPAIGN_NAME}"))

    def _user(self, company, login, role, position):
        user = User.objects.filter(generated_login=login).first()
        if user is None:
            user = User(email=f"{login.lower()}@{company.slug}.pmc.local", generated_login=login)
            user.set_password(PASSWORD)
        user.first_name, user.last_name = login, ""
        user.role, user.position = role, position
        user.company, user.department, user.manager = company, None, None
        user.must_change_password = False
        user.is_active = True
        user.save()
        return user
