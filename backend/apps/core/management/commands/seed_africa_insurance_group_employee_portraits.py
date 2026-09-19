"""
Donne une vraie photo de portrait (selon le genre du prénom) aux 45
collaborateurs des directions d'Africa Insurance Group (EMP1…EMP45).

Complète `seed_africa_insurance_group_portraits` (équipe dirigeante + SUNU
Group) : les portraits déjà attribués là-bas sont exclus, aucune photo n'est
partagée. Les visages d'apparence africaine de la banque randomuser.me étant
épuisés, on choisit ici des portraits variés.

Idempotent : relançable, chaque login reçoit toujours le même portrait.

Usage:
    python manage.py seed_africa_insurance_group_employee_portraits
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands.seed_africa_insurance_group_portraits import fetch
from apps.core.management.commands.seed_africa_insurance_group_rubriques import FEMALE_NAMES
from apps.core.models import Company, User

COMPANY_NAME = "Africa Insurance Group"
# Prénoms masculins que le jeu de données pourrait confondre : seuls ceux de
# FEMALE_NAMES sont féminins, tout le reste (Adama, Ayité, Kwesi…) est masculin.
FEMALE_POOL = [10, 11, 12, 14, 21, 23, 25, 28, 32, 34, 38, 39, 43, 45, 54, 56, 58, 64, 66, 68, 72, 73, 74, 77]
MALE_POOL = [1, 10, 14, 18, 81, 31, 33, 36, 37, 40, 42, 43, 44, 51, 52, 57, 60, 61, 62, 64, 71, 73, 74, 75]


class Command(BaseCommand):
    help = "Photos réelles selon le genre pour les employés EMP1…EMP45."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        staff = [User.objects.filter(company=company, generated_login=f"EMP{n}").first() for n in range(1, 46)]
        if not all(staff):
            raise CommandError("EMP1…EMP45 attendus — lancez d'abord seed_africa_insurance_group.")
        fi = mi = 0
        for u in staff:
            female = u.first_name in FEMALE_NAMES
            kind, n = ("F", FEMALE_POOL[fi]) if female else ("M", MALE_POOL[mi])
            fi, mi = fi + female, mi + (not female)
            u.avatar.save(f"{u.generated_login}_portrait.jpg", fetch(kind, n), save=True)
            self.stdout.write(f"  {u.generated_login} {u.first_name} {u.last_name} → portrait {kind}{n}")
        self.stdout.write(self.style.SUCCESS(f"Terminé — {fi} femmes et {mi} hommes photographiés."))
