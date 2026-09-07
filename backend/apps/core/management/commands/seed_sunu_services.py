"""
Jeu de démonstration « SUNU Services » : un CEO et quarante-cinq
collaborateurs rattachés directement à l'entreprise, sans direction
intermédiaire.

Ce que la démo montre : chaque collaborateur note l'entreprise dans
« Cohésion d'équipe » (portée ORGANISATION), et le CEO lit l'agrégat — jamais
les avis nominatifs. C'est pour cela qu'aucun département n'est créé : la
portée « sa direction » n'aurait ici personne à viser, et l'exercice porte sur
l'organisation entière.

Usage:
    python manage.py seed_sunu_services
    python manage.py seed_sunu_services --responses   # pré-remplit un avis par personne
    python manage.py seed_sunu_services --reset       # repart d'une entreprise vide

La commande est idempotente : relancée, elle remet les comptes en état sans
créer de doublons.
"""
import random
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User
from apps.core.text_utils import slugify_company
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import CohesionResponse

COMPANY_NAME = "SUNU Services"
CEO_FIRST_NAME = "Ibrahima"
CEO_LAST_NAME = "DIAGNE"
CEO_LOGIN = "id.sunuserv"
PASSWORD = "123456"
EMPLOYEE_COUNT = 45
CAMPAIGN_NAME = "Année 2026"
CAMPAIGN_START = date(2026, 1, 1)
CAMPAIGN_END = date(2026, 12, 31)

# Les dix critères de la fiche de cohésion, tels que le front les compose pour
# l'entreprise connectée (`frontend/src/utils/cohesionCriteria.ts`). Le libellé
# EST la clé de rapprochement entre un avis et la ligne affichée : il doit être
# reproduit au caractère près, nom de l'entreprise substitué compris.
CRITERIA = [
    "La vision de {company} sur les 10 à 15 prochaines années est clairement définie",
    "Tout le personnel comprend la vision et les valeurs de {company} et peut l'expliquer clairement",
    "Tous les employés se sont appropriés la vision et les valeurs de {company}",
    "Chaque employé connaît ses objectifs individuels et comment ils sont liés aux objectifs globaux",
    "Chaque membre est très engagé pour atteindre les objectifs fixés à l'équipe",
    "Tous les employés de {company} mettent les intérêts de l'organisation au-dessus de leurs intérêts personnels",
    "Il y a une bonne communication verticale entre le Top Management et le reste de {company}",
    "Il y a une bonne communication horizontale entre les différents départements/directions",
    "Il y a un niveau élevé de confiance entre le Top Management et le reste de {company}",
    "Il y a un niveau élevé de confiance entre les employés de {company} eux-mêmes",
]

# Niveau moyen visé par critère, quand `--responses` pré-remplit les avis.
# Les valeurs sont contrastées à dessein : une démo où les dix lignes tombent
# à la même note ne montre rien: c'est l'écart entre « la vision est claire »
# et « la communication horizontale » qui donne à lire quelque chose.
TARGET_LEVELS = [4.1, 3.4, 3.0, 3.6, 3.8, 2.8, 2.9, 2.4, 2.7, 3.5]


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration SUNU Services (CEO + 30 collaborateurs)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--responses",
            action="store_true",
            help="Dépose un avis d'organisation pour chacun des 30 collaborateurs.",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Supprime les collaborateurs et les avis existants avant de recréer.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        company = self._company()
        if options["reset"]:
            self._reset(company)

        ceo = self._ceo(company)
        campaign, _ = EvaluationCampaign.objects.get_or_create(
            company=company,
            name=CAMPAIGN_NAME,
            defaults={
                "start_date": CAMPAIGN_START,
                "end_date": CAMPAIGN_END,
                "created_by": ceo,
            },
        )

        employees = [self._employee(company, n) for n in range(1, EMPLOYEE_COUNT + 1)]
        self.stdout.write(self.style.SUCCESS(f"{len(employees)} collaborateurs prêts (EMP1…EMP{EMPLOYEE_COUNT})"))

        if options["responses"]:
            count = self._responses(company, employees)
            self.stdout.write(self.style.SUCCESS(f"{count} avis d'organisation déposés"))

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])

        self.stdout.write(
            self.style.SUCCESS(
                f"\nTerminé — {company.name} (slug {company.slug})\n"
                f"  CEO         : {CEO_LOGIN} / {PASSWORD}\n"
                f"  Collaborateurs : EMP1 … EMP{EMPLOYEE_COUNT} / {PASSWORD}\n"
                f"  Campagne    : {campaign.name} ({campaign.start_date} → {campaign.end_date})"
            )
        )

    # ------------------------------------------------------------------

    def _company(self):
        company, created = Company.objects.get_or_create(
            name=COMPANY_NAME,
            defaults={
                "slug": slugify_company(COMPANY_NAME),
                "sector": "Services",
                # Trente-et-un comptes : la formule Démo s'arrête à dix et
                # afficherait l'entreprise « hors limites » côté Super Admin.
                "plan": "STANDARD",
                "admin_first_name": CEO_FIRST_NAME,
                "admin_last_name": CEO_LAST_NAME,
            },
        )
        self.stdout.write(self.style.SUCCESS(f"Entreprise {'créée' if created else 'réutilisée'} : {company.name}"))
        return company

    def _reset(self, company):
        """Purge bornée à cette entreprise : le CEO est conservé, son mot de
        passe ayant pu être changé depuis."""
        CohesionResponse.objects.filter(company=company).delete()
        company.users.exclude(generated_login__iexact=CEO_LOGIN).delete()
        self.stdout.write(self.style.WARNING("Collaborateurs et avis existants supprimés"))

    def _ceo(self, company):
        ceo = User.objects.filter(generated_login__iexact=CEO_LOGIN).first()
        if ceo is not None and ceo.company_id not in (None, company.id):
            raise CommandError(
                f"Le login {CEO_LOGIN} est déjà pris par {ceo.email} ({ceo.company.name})."
            )
        if ceo is None:
            ceo = User(email=f"{CEO_LOGIN}@{company.slug}.pmc.local", generated_login=CEO_LOGIN)
            ceo.set_password(PASSWORD)
        ceo.first_name = CEO_FIRST_NAME
        ceo.last_name = CEO_LAST_NAME
        ceo.role = User.Role.COMPANY_ADMIN
        ceo.position = "CEO"
        ceo.company = company
        ceo.department = None
        # Un mot de passe imposé au premier écran couperait la démo en deux.
        ceo.must_change_password = False
        ceo.is_active = True
        ceo.save()
        if company.admin_user_id != ceo.id:
            company.admin_user = ceo
            company.save(update_fields=["admin_user"])
        self.stdout.write(self.style.SUCCESS(f"CEO : {ceo.get_full_name()} — login {CEO_LOGIN}"))
        return ceo

    def _employee(self, company, number):
        login = f"EMP{number}"
        user = User.objects.filter(generated_login__iexact=login).first()
        # `generated_login` est unique sur toute la plateforme, pas par
        # entreprise : un homonyme chez un autre tenant ferait échouer la
        # création plus loin, avec une erreur d'intégrité illisible. On le dit
        # ici, avant d'avoir rien écrit.
        if user is not None and user.company_id != company.id:
            raise CommandError(
                f"Le login {login} est déjà pris par {user.email} "
                f"({user.company.name if user.company else 'sans entreprise'})."
            )
        if user is None:
            user = User(email=f"{login.lower()}@{company.slug}.pmc.local", generated_login=login)
        user.set_password(PASSWORD)
        user.first_name = login
        user.last_name = ""
        user.role = User.Role.MEMBER
        user.position = "Collaborateur"
        user.company = company
        # Rattachement direct à l'entreprise : aucune direction, donc aucun
        # manager intermédiaire.
        user.department = None
        user.manager = None
        user.must_change_password = False
        user.is_active = True
        user.save()
        return user

    def _responses(self, company, employees):
        """Un avis par collaborateur, tiré autour du niveau visé par critère.

        Le tirage est fixé (`seed`) pour que deux exécutions donnent le même
        agrégat : une démo dont les chiffres bougent d'un lancement à l'autre
        ne se raconte pas.
        """
        criteria = [c.format(company=company.name) for c in CRITERIA]
        rng = random.Random(2026)
        deposit = min(date.today(), CAMPAIGN_END)
        if deposit < CAMPAIGN_START:
            deposit = CAMPAIGN_START
        count = 0
        for employee in employees:
            # Tempérament du répondant : certains notent haut, d'autres bas, et
            # c'est ce qui produit une dispersion — sans elle, la part d'avis
            # bas serait nulle partout et la lecture n'aurait aucun relief.
            humeur = rng.gauss(0, 0.75)
            scores = []
            for label, cible in zip(criteria, TARGET_LEVELS):
                note = round(cible + humeur + rng.gauss(0, 0.5))
                scores.append({"criterion": label, "score": max(1, min(5, note))})
            CohesionResponse.objects.update_or_create(
                scope=CohesionResponse.Scope.ORGANISATION,
                company=company,
                respondent=employee,
                date=deposit,
                defaults={"scores": scores, "team": None},
            )
            count += 1
        return count
