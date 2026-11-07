"""
Jeu de démonstration « SUNU IARD Cameroun » : un CEO (CEOCMR) et 45
collaborateurs EMP1…EMP45 rattachés directement à l'entreprise, sans
direction intermédiaire, tous avec une photo de portrait.

La plage EMP1…EMP45 a été libérée au préalable par
`rename_aig_emp_accounts --company SOCIUM --new-prefix SOC`.

Les portraits sont ceux versionnés dans `management/portraits/` (voir
`seed_sunu_bank_senegal_portraits`) ; femmes et hommes alternent.

Usage:
    python manage.py seed_sunu_iard_cameroun

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

COMPANY_NAME = "SUNU IARD Cameroun"
CEO_LOGIN = "CEOCMR"
EMPLOYEE_PREFIX = "CMR"  # EMP renommés le 2026-11-07 pour SUNU Re
EMPLOYEE_COUNT = 45
PASSWORD = "123456"
CAMPAIGN_NAME = "Novembre 2026"
CAMPAIGN_START = date(2026, 1, 1)
CAMPAIGN_END = date(2026, 12, 31)

PORTRAITS = Path(__file__).resolve().parent.parent / "portraits"
FEMALE_POOL = [
    "employees/HIPIOPYz0tQ", "employees/xmSWVeGEnJw", "employees/aZzXKGcyWqk", "employees/kXmKqYOGA4Y",
    "employees/9kQBQqY_xrk", "employees/DrVJk1EaPSc", "employees/_5_CBVCLBsY", "employees/4-UWyfTsFws",
    "employees/WYE2UhXsU1Y", "employees/eXclz2FOr0M", "employees/Ys9lVXQ-EhU", "employees/B0q7eBuXKjA",
    "employees/3dqSZidOkvs", "employees/32sUMIS0Afc", "employees/20e5uGmm2Es", "employees/Jw9PJ0B3Xqg",
    "employees/dYgyzxlHJ58", "employees/i2hoD-C2RUA", "employees/NYiYc13lKAY", "employees/n1yI8oExVns",
    "employees/B4NW2Fk3Bkk", "sunu/vp9mRauo68c", "sunu/DpfkkL1FD20",
    # DIR7, DIR9, puis les collaboratrices des cinq directions ajoutées.
    "sunu/dQyfiYNJoHw", "sunu/bxpiMBp0FtU", "sunu/Q1QRTSeZIxI", "sunu/2JS_KD4vi7o", "sunu/I49bIyEHaIs",
    "sunu/nzR24yJ8Cvo", "sunu/RJVQ_wnwXIM", "sunu/hgVe54j2rt8", "sunu/Ty2WpsNiVtQ", "sunu/nvvvAy3nhX8",
    "sunu/_cvwXhGqG-o", "sunu/yRpe13BHdKw", "sunu/HyoTmwZQwWU", "sunu/J1jYLLlRpA4", "sunu/o-f9IhaLB5k",
    "sunu/ws4fXSuVlkY", "sunu/30DeKCpDLD0",
]
MALE_POOL = [
    "employees/AGlO2jlVE4c", "employees/10fvuGtnoEM", "employees/P_jBxTIYGKg", "employees/2EGNqazbAMk",
    "employees/Ft4p5E9HjTQ", "employees/GntSiIMHyVM", "employees/QWa0TIUW638", "employees/S1z65AHntBo",
    "employees/GsLxMF4CVJg", "employees/0OczC2-oFsA", "employees/oV2G2nhPCXo", "employees/_ObjhzjnMmc",
    "employees/x0A7wgQmmdk", "employees/oXzyPakqsA0", "employees/olasY6OD8pw", "employees/uVduOMRIHHg",
    "employees/O1lbOY0H5rc", "employees/bo7CsaJEuMk", "employees/IJrIeCs3D4g", "employees/QIMjYJSFoXM",
    "employees/Ba1eGcAFj5w", "employees/Ve7xjKImd28", "employees/jC0IQzIm_9Y",
    # DIR6, DIR8, DIR10, puis les collaborateurs des cinq directions ajoutées.
    "sunu/8PidEL3NJLM", "sunu/7TI-3jUObYg", "sunu/5tqiaBDE3pg", "sunu/gisFZKWpKQ4", "sunu/ST_4Rw_8rxA",
    "sunu/gPT2JJdMnag", "sunu/gsw3AP6I-EY", "sunu/7PxveE1Kh5M", "sunu/kUGwR0S8qXo", "sunu/jCeVRUQslTs",
    "sunu/ZsObS42_i_0", "sunu/M7i6iMgzPwc", "sunu/wQwns_wVjYY", "sunu/95UF6LXe-Lo", "sunu/0jLaMXX3wBU",
    "sunu/s6tVlDVKz38", "sunu/UHtIqPrSR_M", "sunu/hWZP_MRoT6I",
]


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration SUNU IARD (CEO + 45 collaborateurs, avec photos)."

    @transaction.atomic
    def handle(self, *args, **options):
        absent = [p for p in FEMALE_POOL + MALE_POOL if not (PORTRAITS / f"{p}.jpg").exists()]
        if absent:
            raise CommandError(f"Portraits introuvables dans {PORTRAITS} : {', '.join(absent)}.")
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
        users = [ceo] + [
            self._user(company, f"{EMPLOYEE_PREFIX}{n}", User.Role.MEMBER, "Collaborateur")
            for n in range(1, EMPLOYEE_COUNT + 1)
        ]
        for index, user in enumerate(users):
            # Un portrait déjà posé est gardé : chaque login garde son visage.
            if "_portrait" in (user.avatar.name or ""):
                continue
            if user.avatar:
                user.avatar.delete(save=False)
            photo = (FEMALE_POOL if index % 2 else MALE_POOL)[index // 2]
            user.avatar.save(f"{user.generated_login}_portrait.jpg",
                             ContentFile((PORTRAITS / f"{photo}.jpg").read_bytes()), save=True)

        # Une fois les campagnes posées par `seed_sunu_iard_rubriques`, on n'en recrée pas.
        if not EvaluationCampaign.objects.filter(company=company).exists():
            EvaluationCampaign.objects.create(
                company=company, name=CAMPAIGN_NAME,
                start_date=CAMPAIGN_START, end_date=CAMPAIGN_END, created_by=ceo,
            )
        company.employee_count = company.users.count()
        company.save()
        self.stdout.write(self.style.SUCCESS(
            f"{company.name} : CEO {CEO_LOGIN}, {EMPLOYEE_PREFIX}1…{EMPLOYEE_PREFIX}{EMPLOYEE_COUNT}, "
            f"mot de passe {PASSWORD}, campagne {CAMPAIGN_NAME}, {len(users)} photos"))

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
