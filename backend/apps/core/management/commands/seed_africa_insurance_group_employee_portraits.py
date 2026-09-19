"""
Donne une vraie photo de portrait (selon le genre du prénom) aux 45
collaborateurs des directions d'Africa Insurance Group (EMP1…EMP45).

Complète `seed_africa_insurance_group_portraits` (équipe dirigeante + SUNU
Group) : les portraits déjà attribués là-bas sont exclus, aucune photo n'est
partagée. Portraits de personnes noires africaines (Unsplash, licence libre).

Idempotent : relançable, chaque login reçoit toujours le même portrait.

Usage:
    python manage.py seed_africa_insurance_group_employee_portraits
"""
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands.seed_africa_insurance_group_rubriques import FEMALE_NAMES
from apps.core.models import Company, User

COMPANY_NAME = "Africa Insurance Group"
# Portraits de personnes noires africaines (Unsplash, licence libre), recadrés
# en carré et rangés dans `management/portraits/employees/<id>.jpg`. Le genre
# vient du prénom : seuls ceux de FEMALE_NAMES sont féminins, tout le reste
# (Adama, Ayité, Kwesi…) est masculin.
PHOTO_DIR = Path(__file__).resolve().parent.parent / "portraits" / "employees"
FEMALE_POOL = ['HIPIOPYz0tQ', 'xmSWVeGEnJw', 'aZzXKGcyWqk', 'kXmKqYOGA4Y', '9kQBQqY_xrk', 'DrVJk1EaPSc', '_5_CBVCLBsY', '4-UWyfTsFws', 'WYE2UhXsU1Y', 'eXclz2FOr0M', 'S3GrMiUhpNU', 'Ys9lVXQ-EhU', 'B0q7eBuXKjA', '3dqSZidOkvs', '32sUMIS0Afc', '20e5uGmm2Es', 'Jw9PJ0B3Xqg', 'dYgyzxlHJ58', 'i2hoD-C2RUA', 'NYiYc13lKAY', 'n1yI8oExVns', 'B4NW2Fk3Bkk']
MALE_POOL = ['AGlO2jlVE4c', '10fvuGtnoEM', 'P_jBxTIYGKg', '2EGNqazbAMk', 'Ft4p5E9HjTQ', 'GntSiIMHyVM', 'QWa0TIUW638', 'S1z65AHntBo', 'GsLxMF4CVJg', '0OczC2-oFsA', 'oV2G2nhPCXo', '_ObjhzjnMmc', 'x0A7wgQmmdk', 'oXzyPakqsA0', 'olasY6OD8pw', 'uVduOMRIHHg', 'O1lbOY0H5rc', 'bo7CsaJEuMk', 'IJrIeCs3D4g', 'QIMjYJSFoXM', 'Ba1eGcAFj5w', 'Ve7xjKImd28', 'jC0IQzIm_9Y']


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
            photo = (FEMALE_POOL[fi] if female else MALE_POOL[mi])
            fi, mi = fi + female, mi + (not female)
            u.avatar.save(f"{u.generated_login}_portrait.jpg", ContentFile((PHOTO_DIR / f"{photo}.jpg").read_bytes()), save=True)
            self.stdout.write(f"  {u.generated_login} {u.first_name} {u.last_name} → {'F' if female else 'M'} {photo}")
        self.stdout.write(self.style.SUCCESS(f"Terminé — {fi} femmes et {mi} hommes photographiés."))
