"""
Réorganise les filiales d'Africa Insurance Group et étoffe l'équipe dirigeante :

  - Filiale Bénin   → « Filiale BANQUE »
  - Filiale Sénégal → « Filiale IARD »
  - création de « Filiale Assurance Vie » et de « Filiale SANTE », rattachées à la
    Direction de Zone comme les deux premières ; chacune reçoit son directeur
    (DIR11, DIR12, avec photo) et 5 collaborateurs (EMP46…EMP55) dont les métiers
    correspondent à la filiale, évalués sur les 4 campagnes ;
  - un directeur délégué (DIR13, avec photo) pour SUNU Group, qui apparaît dans
    l'« Aperçu de l'Équipe Dirigeante » comme les autres directeurs.

Les renommages sont propagés là où le nom de la direction est recopié en texte
(critères de cohésion, référentiels de compétences, postes) pour ne rien
orpheliner. Idempotent : relançable sans doublon.

Usage:
    python manage.py seed_africa_insurance_group_filiales
"""
import random
from datetime import date
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.avatar_utils import make_avatar_file
from apps.core.management.commands import seed_africa_insurance_group as MAIN
from apps.core.management.commands import seed_africa_insurance_group_self_assessments as SELF
from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.skills.models import SkillItem, SkillMatrix
from apps.teams.models import CohesionCriterionScore, CohesionResponse

COMPANY_NAME = "Africa Insurance Group"
PASSWORD = "123456"
PORTRAITS = Path(__file__).resolve().parent.parent / "portraits" / "leaders"

RENAMES = [
    # code, ancien nom, nouveau nom, ancien libellé de poste, nouveau
    ("FIL1", "Filiale Bénin", "Filiale BANQUE", "Bénin", "Banque"),
    ("FIL2", "Filiale Sénégal", "Filiale IARD", "Sénégal", "IARD"),
]
BANQUE_JOBS = [
    "Chargé de Clientèle Bancaire", "Gestionnaire de Crédits", "Responsable Conformité (LAB/FT)",
    "Trésorier", "Analyste Risques Crédit",
]
BANQUE_SKILLS = [
    "Octroi et suivi des crédits", "Gestion de la relation clientèle bancaire", "Conformité LAB/FT",
    "Gestion de trésorerie", "Analyse des risques de crédit", "Monétique et moyens de paiement",
    "Pilotage commercial de l'agence", "Réglementation bancaire (BCEAO)",
    "Management d'équipe terrain", "Bancassurance",
]
IARD_LAST_SKILL = ("Connaissance du marché sénégalais", "Expertise des produits IARD")

NEW_FILIALES = [
    {
        "code": "FIL3", "name": "Filiale Assurance Vie", "login": "DIR11", "first": "Mariam", "last": "Diakité",
        "position": "Directeur de Filiale — Assurance Vie", "phone": "+225 07 {} {} {}",
        "skills": [
            "Conception de produits d'épargne et de retraite", "Tarification actuarielle Vie", "Souscription et sélection médicale",
            "Gestion des prestations Vie", "Animation du réseau commercial Vie", "Provisionnement mathématique",
            "Conformité réglementaire (CIMA Vie)", "Gestion des actifs en représentation des engagements",
            "Management d'équipe terrain", "Culture client et fidélisation",
        ],
        "jobs": ["Actuaire Vie", "Conseiller en Épargne et Retraite", "Gestionnaire de Prestations Vie",
                 "Souscripteur Vie", "Chargé de Fidélisation Clients"],
    },
    {
        "code": "FIL4", "name": "Filiale SANTE", "login": "DIR12", "first": "Emmanuel", "last": "Fotso",
        "position": "Directeur de Filiale — Santé", "phone": "+228 90 {} {} {}",
        "skills": [
            "Conception des garanties santé", "Tarification et suivi de la sinistralité santé", "Gestion des réseaux de soins",
            "Contrôle médical des prestations", "Gestion du tiers payant", "Lutte contre la fraude santé",
            "Conformité réglementaire (CIMA)", "Relation avec les prestataires de santé",
            "Management d'équipe terrain", "Culture client et fidélisation",
        ],
        "jobs": ["Médecin-Conseil", "Gestionnaire de Prestations Santé", "Chargé de Réseau de Soins",
                 "Souscripteur Santé", "Chargé de Tiers Payant"],
    },
]
DELEGUE = {"login": "DIR13", "first": "Estelle", "last": "Agbodjan", "position": "Directeur Délégué — SUNU Group"}


def _phone(rng, template):
    return template.format(rng.randint(10, 99), rng.randint(10, 99), rng.randint(10, 99))


class Command(BaseCommand):
    help = "Renomme les filiales, crée Assurance Vie et Santé, et ajoute le directeur délégué SUNU Group."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        pdg = User.objects.get(company=company, generated_login="CODIR")
        dz = Department.objects.get(company=company, code="DZ")
        sunu = Department.objects.filter(company=company, code="SUNU").first()
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if not campaigns:
            raise CommandError("Aucune campagne : lancez d'abord seed_africa_insurance_group.")

        # Générateurs partagés avec les autres seeds : mêmes barèmes, mêmes noms.
        self.main = MAIN.Command()
        self.main.rng = random.Random(4242)
        self.main.used_logins = set(User.objects.values_list("generated_login", flat=True))
        self.main.used_names = {u.get_full_name() for u in User.objects.filter(company=company)}
        self.main.stdout = self.stdout
        self.self_cmd = SELF.Command()
        self.self_cmd.rng = random.Random(4242)
        self.rng = random.Random(4243)

        self._rename(company)
        for spec in NEW_FILIALES:
            self._create_filiale(company, pdg, dz, campaigns, spec)
        if sunu:
            self._create_delegue(company, pdg, sunu, campaigns)

        company.employee_count = company.users.count()
        company.save(update_fields=["employee_count"])
        self.stdout.write(self.style.SUCCESS("Terminé — filiales réorganisées, Assurance Vie et Santé créées, directeur délégué SUNU ajouté."))

    # -- renommages ------------------------------------------------------
    def _rename(self, company):
        for code, old, new, old_short, new_short in RENAMES:
            dept = Department.objects.filter(company=company, code=code).first()
            if dept is None:
                continue
            if dept.name == old:
                dept.name = new
                dept.save(update_fields=["name"])
            # Le nom de la direction est recopié dans les critères de cohésion.
            for r in CohesionResponse.objects.filter(company=company):
                blob = str(r.scores)
                if old in blob:
                    r.scores = [{**e, "criterion": str(e.get("criterion", "")).replace(old, new)} for e in r.scores]
                    r.save(update_fields=["scores"])
            for s in CohesionCriterionScore.objects.filter(criterion__contains=old):
                s.criterion = s.criterion.replace(old, new)
                s.save(update_fields=["criterion"])
            # Postes et référentiels de compétences du directeur.
            old_pos = f"Directeur de Filiale — {old_short}"
            new_pos = f"Directeur de Filiale — {new_short}"
            User.objects.filter(company=company, position=old_pos).update(position=new_pos)
            SkillMatrix.objects.filter(company=company, name=old_pos).update(name=new_pos)
            if code == "FIL1":
                self._reshape_banque(company, dept, new_pos)
            if code == "FIL2":
                SkillItem.objects.filter(matrix__company=company, matrix__name=new_pos, name=IARD_LAST_SKILL[0]).update(name=IARD_LAST_SKILL[1])
            self.stdout.write(f"  {old} → {new}")

    def _reshape_banque(self, company, dept, position):
        """Métiers et compétences bancaires pour les collaborateurs et le référentiel de l'ex-Bénin."""
        for matrix in SkillMatrix.objects.filter(company=company, name=position, type=SkillMatrix.SkillType.HARD):
            for item, name in zip(matrix.items.order_by("order"), BANQUE_SKILLS):
                if item.name != name:
                    item.name = name
                    item.save(update_fields=["name"])
        staff = list(User.objects.filter(company=company, department=dept, role=User.Role.MEMBER).order_by("id"))
        for user, job in zip(staff, BANQUE_JOBS):
            if user.position != job:
                user.position = job
                user.save(update_fields=["position"])

    # -- création --------------------------------------------------------
    def _portrait(self, user, login):
        path = PORTRAITS / f"{login}.jpg"
        if path.exists():
            user.avatar.save(f"{login}_portrait.jpg", ContentFile(path.read_bytes()), save=True)

    def _create_filiale(self, company, pdg, dz, campaigns, spec):
        dept, _ = Department.objects.get_or_create(
            company=company, code=spec["code"], defaults={"name": spec["name"], "parent": dz},
        )
        if dept.parent_id != dz.id or dept.name != spec["name"]:
            dept.parent, dept.name = dz, spec["name"]
            dept.save(update_fields=["parent", "name"])
        hard_items, soft_items = self.main._matrices(company, dept, spec["position"], spec["skills"])

        director = User.objects.filter(company=company, generated_login=spec["login"]).first()
        if director is None:
            self._guard_login(spec["login"], company)
            director = User.objects.create(
                email=f"{spec['login'].lower()}@{company.slug}.pmc.local", first_name=spec["first"], last_name=spec["last"],
                role=User.Role.MANAGER, position=spec["position"], company=company, department=dept, manager=pdg,
                generated_login=spec["login"], must_change_password=False, phone=_phone(self.rng, spec["phone"]),
                birth_date=MAIN.random_birth_date(self.rng, 42, 55), hire_date=date(2019, 1, 1),
                career_start_date=date(2000, 1, 1), role_start_date=date(2021, 1, 1),
            )
            director.set_password(PASSWORD)
            director.save()
            self._portrait(director, spec["login"])
            self.stdout.write(f"  + {dept.name} : directeur {director.get_full_name()} ({spec['login']})")
        if dept.manager_id != director.id:
            dept.manager = director
            dept.save(update_fields=["manager"])
        for campaign in campaigns:
            self.main._evaluate_person(campaign, director, pdg, hard_items, soft_items)
            for category in SELF.CATEGORIES:
                self.self_cmd._managerial(director, campaign, category)
            self.self_cmd._monkey(director, campaign)

        existing = User.objects.filter(company=company, department=dept, role=User.Role.MEMBER).count()
        for job in spec["jobs"][existing:]:
            number = self._next_emp(company)
            login = f"EMP{number}"
            self._guard_login(login, company)
            first, last = self.main._unique_name()
            employee = User.objects.create(
                email=f"{login.lower()}@{company.slug}.pmc.local", first_name=first, last_name=last, role=User.Role.MEMBER,
                position=job, company=company, department=dept, manager=director, generated_login=login,
                must_change_password=True, phone=_phone(self.rng, spec["phone"]),
                birth_date=MAIN.random_birth_date(self.rng, 30, 50), hire_date=date(2021, 6, 1),
                career_start_date=date(2005, 1, 1), role_start_date=date(2022, 1, 1),
            )
            employee.set_password(PASSWORD)
            employee.avatar.save(f"{login}.png", make_avatar_file(login, f"{first[0]}{last[0]}".upper()), save=False)
            employee.save()
            for campaign in campaigns:
                self.main._evaluate_person(campaign, employee, director, hard_items, soft_items)
            self.stdout.write(f"    {login} {employee.get_full_name()} — {job}")

    def _create_delegue(self, company, pdg, sunu, campaigns):
        spec = DELEGUE
        user = User.objects.filter(company=company, generated_login=spec["login"]).first()
        daniel = User.objects.filter(company=company, generated_login="DIR10").first()
        if user is None:
            self._guard_login(spec["login"], company)
            user = User.objects.create(
                email=f"{spec['login'].lower()}@{company.slug}.pmc.local", first_name=spec["first"], last_name=spec["last"],
                role=User.Role.MANAGER, position=spec["position"], company=company, department=sunu, manager=daniel or pdg,
                generated_login=spec["login"], must_change_password=False, phone=_phone(self.rng, "+228 91 {} {} {}"),
                birth_date=MAIN.random_birth_date(self.rng, 38, 50), hire_date=date(2020, 1, 1),
                career_start_date=date(2002, 1, 1), role_start_date=date(2023, 1, 1),
            )
            user.set_password(PASSWORD)
            user.save()
            self._portrait(user, spec["login"])
            self.stdout.write(f"  + SUNU Group : directeur délégué {user.get_full_name()} ({spec['login']})")
        hard = SkillMatrix.objects.filter(company=company, department=sunu, type=SkillMatrix.SkillType.HARD).first()
        soft = SkillMatrix.objects.filter(company=company, department=sunu, type=SkillMatrix.SkillType.SOFT).first()
        for campaign in campaigns:
            if hard and soft:
                self.main._evaluate_person(campaign, user, pdg, list(hard.items.all()), list(soft.items.all()))
            for category in SELF.CATEGORIES:
                self.self_cmd._managerial(user, campaign, category)
            self.self_cmd._monkey(user, campaign)

    # -- utilitaires -----------------------------------------------------
    def _next_emp(self, company):
        numbers = [
            int(login[3:]) for login in User.objects.filter(generated_login__regex=r"^EMP[0-9]+$").values_list("generated_login", flat=True)
        ]
        return max(numbers or [0]) + 1

    def _guard_login(self, login, company):
        other = User.objects.filter(generated_login__iexact=login).exclude(company=company).first()
        if other is not None:
            raise CommandError(f"Le login {login} est déjà pris par un autre tenant.")
