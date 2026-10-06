"""
Donne une vraie photo de portrait aux 46 comptes de SUNU Bank Sénégal
(CEOSBS, DIR1…DIR5, EMP1…EMP40), à la place de la pastille à initiales.

Les portraits sont ceux déjà versionnés dans `management/portraits/`
(personnes noires africaines, Unsplash, licence libre) : aucun téléchargement.
La banque d'images ne dit pas la nationalité des modèles — « sénégalais »
n'est donc pas garanti photo par photo. Ces portraits servent aussi à Africa
Insurance Group ; aucun n'est attribué deux fois au sein de SUNU Bank Sénégal.

Les comptes portent leur login pour nom, sans genre : femmes et hommes
alternent dans l'ordre CEOSBS, DIR1…DIR5, EMP1…EMP40.

Idempotent : relançable, chaque login reçoit toujours le même portrait.

Usage:
    python manage.py seed_sunu_bank_senegal_portraits
"""
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User

COMPANY_NAME = "SUNU Bank Sénégal"
PORTRAITS = Path(__file__).resolve().parent.parent / "portraits"
LOGINS = ["CEOSBS"] + [f"DIR{n}" for n in range(1, 6)] + [f"EMP{n}" for n in range(1, 41)]
# S3GrMiUhpNU (dossier employees) est écarté : même visage que kXmKqYOGA4Y.
# Les deux derniers portraits féminins viennent du dossier sunu.
FEMALE_POOL = [
    "employees/HIPIOPYz0tQ", "employees/xmSWVeGEnJw", "employees/aZzXKGcyWqk", "employees/kXmKqYOGA4Y",
    "employees/9kQBQqY_xrk", "employees/DrVJk1EaPSc", "employees/_5_CBVCLBsY", "employees/4-UWyfTsFws",
    "employees/WYE2UhXsU1Y", "employees/eXclz2FOr0M", "employees/Ys9lVXQ-EhU", "employees/B0q7eBuXKjA",
    "employees/3dqSZidOkvs", "employees/32sUMIS0Afc", "employees/20e5uGmm2Es", "employees/Jw9PJ0B3Xqg",
    "employees/dYgyzxlHJ58", "employees/i2hoD-C2RUA", "employees/NYiYc13lKAY", "employees/n1yI8oExVns",
    "employees/B4NW2Fk3Bkk", "sunu/vp9mRauo68c", "sunu/DpfkkL1FD20",
]
MALE_POOL = [
    "employees/AGlO2jlVE4c", "employees/10fvuGtnoEM", "employees/P_jBxTIYGKg", "employees/2EGNqazbAMk",
    "employees/Ft4p5E9HjTQ", "employees/GntSiIMHyVM", "employees/QWa0TIUW638", "employees/S1z65AHntBo",
    "employees/GsLxMF4CVJg", "employees/0OczC2-oFsA", "employees/oV2G2nhPCXo", "employees/_ObjhzjnMmc",
    "employees/x0A7wgQmmdk", "employees/oXzyPakqsA0", "employees/olasY6OD8pw", "employees/uVduOMRIHHg",
    "employees/O1lbOY0H5rc", "employees/bo7CsaJEuMk", "employees/IJrIeCs3D4g", "employees/QIMjYJSFoXM",
    "employees/Ba1eGcAFj5w", "employees/Ve7xjKImd28", "employees/jC0IQzIm_9Y",
]


class Command(BaseCommand):
    help = "Photos de portrait réelles pour les 46 comptes de SUNU Bank Sénégal."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable — lancez d'abord seed_sunu_bank_senegal.")
        users = {u.generated_login.upper(): u for u in company.users.all()}
        missing = [login for login in LOGINS if login not in users]
        if missing:
            raise CommandError(f"Comptes introuvables : {', '.join(missing)} — lancez d'abord seed_sunu_bank_senegal.")
        # Contrôle avant d'écrire : un fichier absent laisserait la moitié des
        # comptes sans photo, au milieu de la boucle.
        absent = [p for p in FEMALE_POOL + MALE_POOL if not (PORTRAITS / f"{p}.jpg").exists()]
        if absent:
            raise CommandError(f"Portraits introuvables dans {PORTRAITS} : {', '.join(absent)}.")

        for index, login in enumerate(LOGINS):
            female = index % 2 == 1
            photo = (FEMALE_POOL if female else MALE_POOL)[index // 2]
            user = users[login]
            if user.avatar:
                # Sans cela, chaque relance laisserait un fichier orphelin.
                user.avatar.delete(save=False)
            user.avatar.save(f"{login}_portrait.jpg", ContentFile((PORTRAITS / f"{photo}.jpg").read_bytes()), save=True)
            self.stdout.write(f"  {login} → {'F' if female else 'M'} {photo}")
        self.stdout.write(self.style.SUCCESS(f"Terminé — {len(LOGINS)} comptes photographiés."))
