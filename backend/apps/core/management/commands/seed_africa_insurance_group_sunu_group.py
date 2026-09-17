"""
Crée la direction SUNU Group (société du groupe, rattachée directement au
CODIR — même niveau que le DZ et les six directions fonctionnelles) au sein
d'Africa Insurance Group, avec 50 collaborateurs.

Sert à vérifier en conditions réelles que le libellé des critères de
cohésion nomme la direction visée (« SUNU Group »), et non plus l'entreprise
(« Africa Insurance Group »), pour un avis « sur sa direction » — correctif
apporté à `useCohesionCriteria` (frontend/src/utils/cohesionCriteria.ts).

Volontairement minimal par rapport au premier jeu SUNU Group (annulé) : pas
de directeur, pas d'évaluations ID-3A/auto-évaluation managériale/Monkey
Management, pas d'avis de cohésion pré-remplis — seulement la direction et
ses 50 collaborateurs, pour que la démo se fasse en direct.

Usage:
    python manage.py seed_africa_insurance_group_sunu_group
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.avatar_utils import make_avatar_file
from apps.core.models import Company, Department, User

COMPANY_NAME = "Africa Insurance Group"
DEPT_CODE, DEPT_NAME = "SUNU", "SUNU Group"
PASSWORD = "123456"
EMPLOYEE_COUNT = 50


class Command(BaseCommand):
    help = "Crée la direction SUNU Group (50 collaborateurs, logins SUNU1…SUNU50) au sein d'Africa Insurance Group."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable — lancez d'abord seed_africa_insurance_group.")

        if Department.objects.filter(company=company, code=DEPT_CODE).exists():
            raise CommandError("SUNU Group existe déjà pour cette entreprise — rien à faire.")

        used_logins = set(User.objects.exclude(company=company).values_list("generated_login", flat=True))

        department = Department.objects.create(company=company, code=DEPT_CODE, name=DEPT_NAME)
        self.stdout.write(self.style.SUCCESS(f"Direction créée : {DEPT_NAME}"))

        created = 0
        for n in range(1, EMPLOYEE_COUNT + 1):
            login = f"SUNU{n}"
            if login in used_logins:
                raise CommandError(f"Le login {login} est déjà pris par un autre tenant.")
            user = User(
                email=f"{login.lower()}@{company.slug}.pmc.local",
                first_name=login,
                last_name="",
                role=User.Role.MEMBER,
                position="Collaborateur",
                company=company,
                department=department,
                generated_login=login,
                must_change_password=False,
            )
            user.set_password(PASSWORD)
            user.avatar.save(f"{login}.png", make_avatar_file(login, "SG"), save=False)
            user.save()
            created += 1

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {DEPT_NAME} : {created} collaborateurs (SUNU1…SUNU{created} / {PASSWORD})."
        ))
