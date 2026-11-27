"""
Jeu de démonstration « DSI—SENELEC-2026 » : un CEO (CEOSEN) et 100
collaborateurs EMP1…EMP100 rattachés directement à l'entreprise, sans
direction intermédiaire, tous avec une photo de portrait.

La plage EMP1…EMP60 a été libérée au préalable par
`rename_aig_emp_accounts --company "SUNU IARD Mali" --new-prefix MLI`.

Usage:
    python manage.py seed_dsi_senelec

Idempotente : relancée, elle remet les comptes en état sans doublon ni avis.
"""
from datetime import date
from pathlib import Path

from django.core.files.base import ContentFile

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User
from apps.core.text_utils import slugify_company
from apps.evaluations.models import EvaluationCampaign

COMPANY_NAME = "DSI—SENELEC-2026"
CEO_LOGIN = "CEOSEN"
EMPLOYEE_PREFIX = "EMP"
EMPLOYEE_COUNT = 100
PASSWORD = "123456"
CAMPAIGN_NAME = "Novembre 2026"
CAMPAIGN_START = date(2026, 11, 1)
CAMPAIGN_END = date(2026, 11, 30)

PORTRAITS = Path(__file__).resolve().parent.parent / "portraits"
# Tous les portraits versionnés, dans un ordre stable : 111 visages pour 101 comptes.
PHOTOS = sorted(p.relative_to(PORTRAITS).with_suffix("").as_posix() for p in PORTRAITS.glob("*/*.jpg"))


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration DSI—SENELEC-2026 (CEO + 100 collaborateurs, sans photo)."

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
                name=COMPANY_NAME, slug=slugify_company(COMPANY_NAME), sector="Énergie",
                plan="STANDARD", admin_first_name=CEO_LOGIN, admin_last_name="",
            )
        ceo = self._user(company, CEO_LOGIN, User.Role.COMPANY_ADMIN, "CEO")
        if company.admin_user_id != ceo.id:
            company.admin_user = ceo
        users = [ceo] + [
            self._user(company, f"{EMPLOYEE_PREFIX}{n}", User.Role.MEMBER, "Collaborateur")
            for n in range(1, EMPLOYEE_COUNT + 1)
        ]
        # Sans photo à la demande du client (2026-11-27) : on retire celles déjà posées.
        removed = 0
        for user in users:
            if user.avatar:
                user.avatar.delete(save=True)
                removed += 1

        if not EvaluationCampaign.objects.filter(company=company).exists():
            EvaluationCampaign.objects.create(
                company=company, name=CAMPAIGN_NAME,
                start_date=CAMPAIGN_START, end_date=CAMPAIGN_END, created_by=ceo,
            )
        company.employee_count = company.users.count()
        company.save()
        self.stdout.write(self.style.SUCCESS(
            f"{company.name} : CEO {CEO_LOGIN}, {EMPLOYEE_PREFIX}1…{EMPLOYEE_PREFIX}{EMPLOYEE_COUNT}, "
            f"mot de passe {PASSWORD}, campagne {CAMPAIGN_NAME}, {removed} photo(s) retirée(s), aucun portrait"))

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
