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
ses collaborateurs, pour que la démo se fasse en direct.

Idempotent : peut être relancée pour compléter jusqu'à EMPLOYEE_COUNT si la
direction ou une partie des collaborateurs existent déjà (crée uniquement
les logins SUNU<n> manquants).

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
EMPLOYEE_COUNT = 60


class Command(BaseCommand):
    help = "Crée/complète la direction SUNU Group (jusqu'à SUNU1…SUNU60) au sein d'Africa Insurance Group."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable — lancez d'abord seed_africa_insurance_group.")

        department, dept_created = Department.objects.get_or_create(
            company=company, code=DEPT_CODE, defaults={"name": DEPT_NAME}
        )
        if dept_created:
            self.stdout.write(self.style.SUCCESS(f"Direction créée : {DEPT_NAME}"))

        existing_logins = set(
            User.objects.filter(company=company, department=department).values_list("generated_login", flat=True)
        )
        used_logins = set(User.objects.exclude(company=company).values_list("generated_login", flat=True))

        created = 0
        for n in range(1, EMPLOYEE_COUNT + 1):
            login = f"SUNU{n}"
            if login in existing_logins:
                continue
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

        if created == 0:
            raise CommandError(f"SUNU Group a déjà {len(existing_logins)} collaborateurs (cible {EMPLOYEE_COUNT}) — rien à faire.")

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        total = len(existing_logins) + created
        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {DEPT_NAME} : {created} collaborateur(s) ajouté(s), {total} au total (SUNU1…SUNU{total} / {PASSWORD})."
        ))
