"""
Donne de vraies photos de portrait (selon le genre) à l'Équipe Dirigeante
d'Africa Insurance Group (PDG + DIR1…DIR9) et aux 60 collaborateurs de
SUNU Group, et place ces derniers sous la direction de Daniel Junior Nkola
(directeur, login DIR10, rattaché au PDG comme les autres directeurs).

Les portraits viennent de randomuser.me (banque de photos libres, classées
hommes/femmes). Elle compte peu de visages d'apparence africaine : ils sont
réservés en priorité à l'équipe dirigeante et à Daniel Nkola, les
collaborateurs SUNU complètent avec des portraits variés, sans doublon.
Les 60 comptes reçoivent aussi un prénom/nom cohérent avec leur genre
(logins SUNU1…SUNU60 inchangés).

Idempotent : relançable sans doublon (Daniel est créé une seule fois).

Usage:
    python manage.py seed_africa_insurance_group_portraits
"""
import urllib.request
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, Department, User

COMPANY_NAME = "Africa Insurance Group"
PORTRAIT_URL = "https://randomuser.me/api/portraits/{kind}/{n}.jpg"
PASSWORD = "123456"

# (genre, n° de portrait) — F = "women", M = "men".
LEADERS = {
    "CODIR": ("F", 6), "DIR1": ("M", 80), "DIR2": ("M", 83), "DIR3": ("F", 36),
    "DIR4": ("M", 49), "DIR5": ("M", 53), "DIR6": ("F", 92), "DIR7": ("M", 30),
    "DIR8": ("M", 91), "DIR9": ("F", 69), "DIR10": ("M", 55),
}
# Portraits d'apparence africaine restants, puis portraits variés.
SUNU_FEMALE = [16, 30, 89, 4, 1, 13, 15, 19, 22, 26, 29, 33, 40, 46, 63, 75, 85, 99, 88, 95, 94, 98, 71, 76, 79, 84, 24, 47, 41, 42]
SUNU_MALE = [16, 25, 54, 59, 63, 70, 5, 7, 11, 35, 39, 48, 56, 58, 65, 69, 77, 86, 87, 95, 45, 41, 47, 9, 28, 20, 29, 46, 85, 94]

FIRST_F = ["Abla", "Akossiwa", "Adjoa", "Mawuena", "Afi", "Ténéna", "Rokia", "Aïcha", "Khady", "Ndèye",
           "Awa", "Astou", "Coumba", "Fama", "Salimata", "Nafissatou", "Yvette", "Sylvie", "Ornella", "Prisca",
           "Edwige", "Carine", "Mireille", "Flora", "Gisèle", "Honorine", "Ismaëlle", "Julienne", "Larissa", "Thérèse"]
FIRST_M = ["Kokou", "Komi", "Kodjo", "Yawo", "Mawuli", "Kossi", "Séni", "Mouhamed", "Ousmane", "Pape",
           "Moussa", "Abdoulaye", "Idrissa", "Lamine", "Serigne", "Alassane", "Rodrigue", "Hervé", "Arnaud", "Cédric",
           "Désiré", "Eric", "Fabrice", "Gaston", "Hyacinthe", "Innocent", "Jonas", "Landry", "Marius", "Nicolas"]
LAST = ["Agbéko", "Amouzou", "Atchou", "Awoki", "Dogbé", "Eklou", "Gbadamassi", "Kpodar", "Lawson", "Mensah",
        "Ayivi", "Bocco", "Dosseh", "Fiawoo", "Gnassingbé", "Sanvee", "Tchalla", "Wiyao", "Adjovi", "Ashiakpor",
        "Ba", "Cissé", "Diallo", "Diouf", "Fall", "Gaye", "Kane", "Mbaye", "Niang", "Sarr",
        "Seck", "Sow", "Thiam", "Faye", "Ndour", "Badji", "Camara", "Coulibaly", "Doumbia", "Kamara",
        "Bamba", "Diomandé", "Ouattara", "Sangaré", "Soro", "Tapé", "Zadi", "Ahoua", "Bédié", "Dago",
        "Gohou", "Kacou", "Lago", "Séry", "Tahi", "Yapi", "Zézé", "Gnahoré", "Koné", "Boka"]


# Photos fournies à la main (prioritaires sur la banque) : portrait de la PDG en
# tailleur-veste, Etty Fidele / Unsplash (licence libre), recadré en carré.
LOCAL_PORTRAITS = Path(__file__).resolve().parent.parent / "portraits"


def fetch(kind: str, n: int) -> ContentFile:
    url = PORTRAIT_URL.format(kind="women" if kind == "F" else "men", n=n)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return ContentFile(r.read())


class Command(BaseCommand):
    help = "Photos réelles selon le genre pour l'équipe dirigeante et SUNU Group ; Daniel Nkola dirige SUNU Group."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        sunu = Department.objects.filter(company=company, code="SUNU").first()
        if not sunu:
            raise CommandError("Direction SUNU Group introuvable — lancez d'abord seed_africa_insurance_group_sunu_group.")
        ceo = User.objects.get(company=company, generated_login="CODIR")

        daniel = User.objects.filter(company=company, generated_login="DIR10").first()
        if not daniel:
            if User.objects.filter(generated_login__iexact="DIR10").exists():
                raise CommandError("Le login DIR10 est déjà pris par un autre tenant.")
            daniel = User(
                email=f"dir10@{company.slug}.pmc.local", first_name="Daniel Junior", last_name="Nkola",
                role=User.Role.MANAGER, position="Directeur SUNU Group", company=company,
                department=sunu, manager=ceo, generated_login="DIR10", must_change_password=False,
            )
            daniel.set_password(PASSWORD)
            daniel.save()
            self.stdout.write(self.style.SUCCESS("Daniel Junior Nkola créé (DIR10)."))

        for login, (kind, n) in LEADERS.items():
            u = User.objects.get(company=company, generated_login=login)
            local = LOCAL_PORTRAITS / f"{login}.jpg"
            photo = ContentFile(local.read_bytes()) if local.exists() else fetch(kind, n)
            u.avatar.save(f"{login}_portrait.jpg", photo, save=True)
            self.stdout.write(f"  {login} {u.first_name} {u.last_name} → portrait {kind}{n}")

        staff = list(User.objects.filter(company=company, department=sunu, role=User.Role.MEMBER).exclude(generated_login="DIR10"))
        staff.sort(key=lambda u: int(u.generated_login.removeprefix("SUNU")))
        if len(staff) != 60:
            raise CommandError(f"60 collaborateurs SUNU attendus, {len(staff)} trouvés.")
        fi = mi = 0
        for i, u in enumerate(staff):
            kind = "F" if i % 2 else "M"      # alternance stricte : 30 femmes, 30 hommes
            if kind == "F":
                n, first = SUNU_FEMALE[fi], FIRST_F[fi]; fi += 1
            else:
                n, first = SUNU_MALE[mi], FIRST_M[mi]; mi += 1
            u.first_name, u.last_name, u.manager = first, LAST[i], daniel
            u.avatar.save(f"{u.generated_login}_portrait.jpg", fetch(kind, n), save=False)
            u.save()
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — 11 dirigeants et 60 collaborateurs SUNU photographiés ; SUNU Group sous la direction de {daniel.first_name} {daniel.last_name}."
        ))
