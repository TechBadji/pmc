"""
Jeu de démonstration « SUNU Re » : un CEO (CEOSRE, le Directeur Général) et
45 collaborateurs EMP1…EMP45, tous avec une photo de portrait, mot de passe
1234, campagne « Novembre 2026 ».

Organisation : deux directions (Technique et Rétrocession, Financière et
Comptable) avec leurs services, plus la Direction Générale qui regroupe les
fonctions rattachées au DG. Chaque direction et chaque service reçoit un
référentiel Hard Skills et un référentiel Soft Skills de 10 compétences.

EMP1…EMP13 sont les responsables de la liste fournie par le client, EMP14…EMP45
des collaborateurs répartis dans les services. Les noms réels ne sont pas
versionnés : ils viennent d'un fichier JSON passé par `--roster`, de la forme
`{"CEOSRE": {"first_name": "…", "last_name": "…"}, "EMP1": {…}, …}`.
Sans ce fichier, le prénom affiché est le login.

La plage EMP1…EMP45 a été libérée au préalable par
`rename_aig_emp_accounts --company "SUNU IARD Cameroun" --new-prefix CMR`.

Usage:
    python manage.py seed_sunu_re --roster /chemin/sunu_re_roster.json

Idempotente : relancée, elle remet les comptes en état sans doublon.
"""
import json
from datetime import date
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, Department, User
from apps.core.text_utils import slugify_company
from apps.evaluations.models import EvaluationCampaign
from apps.skills.models import SkillItem, SkillMatrix

from .seed_sunu_iard_cameroun import FEMALE_POOL, MALE_POOL, PORTRAITS

COMPANY_NAME = "SUNU Re"
CEO_LOGIN = "CEOSRE"
EMPLOYEE_PREFIX = "EMP"
EMPLOYEE_COUNT = 45
PASSWORD = "1234"
CAMPAIGN_NAME = "Novembre 2026"
CAMPAIGN_START = date(2026, 11, 1)
CAMPAIGN_END = date(2026, 11, 30)

# code, nom, direction parente (None = direction), login du responsable
DEPARTMENTS = [
    ("DG", "Direction Générale", None, CEO_LOGIN),
    ("DTR", "Direction Technique et Rétrocession", None, "EMP1"),
    ("DFC", "Direction Financière et Comptable", None, "EMP9"),
    ("SIN", "Service Sinistres", "DTR", "EMP4"),
    ("SOU", "Département Souscription", "DTR", "EMP5"),
    ("SVIE", "Service Souscription Vie", "DTR", "EMP11"),
    ("CTEC", "Service Comptabilité Technique", "DTR", "EMP6"),
    ("DATA", "Service Data et Actuariat", "DTR", "EMP7"),
    ("INFO", "Service Informatique", "DG", "EMP8"),
    ("PBP", "Service Planification, Budget et Pilotage", "DFC", "EMP10"),
    ("TRES", "Service Trésorerie et Placements", "DFC", "EMP13"),
]

# login, poste, département, sexe (F/M), login du manager
LEADERS = [
    ("EMP1", "Directeur Technique et Rétrocession", "DTR", "M", CEO_LOGIN),
    ("EMP2", "Assistante de Direction", "DG", "F", CEO_LOGIN),
    ("EMP3", "Chauffeur-coursier", "DG", "M", CEO_LOGIN),
    ("EMP4", "Responsable Sinistres", "SIN", "M", "EMP1"),
    ("EMP5", "Chef de Département Souscription", "SOU", "M", "EMP1"),
    ("EMP6", "Responsable Comptabilité Technique", "CTEC", "M", "EMP1"),
    ("EMP7", "Responsable Data et Actuariat", "DATA", "M", "EMP1"),
    ("EMP8", "Responsable Informatique", "INFO", "M", CEO_LOGIN),
    ("EMP9", "Directeur Financier et Comptable", "DFC", "M", CEO_LOGIN),
    ("EMP10", "Responsable Planification, Budget et Pilotage", "PBP", "F", "EMP9"),
    ("EMP11", "Responsable Souscription Vie", "SVIE", "M", "EMP1"),
    ("EMP12", "Chargé des Processus", "DG", "M", CEO_LOGIN),
    ("EMP13", "Responsable Trésorerie et Placements", "TRES", "M", "EMP9"),
]

# Collaborateurs EMP14…EMP45 : (département, poste, nombre)
STAFF = [
    ("SOU", "Chargé de souscription non-vie", 5),
    ("SVIE", "Chargé de souscription vie", 3),
    ("SIN", "Gestionnaire sinistres", 4),
    ("DTR", "Chargé de rétrocession", 3),
    ("CTEC", "Comptable technique", 4),
    ("DATA", "Actuaire / Data analyst", 3),
    ("INFO", "Technicien informatique", 2),
    ("PBP", "Contrôleur de gestion", 2),
    ("TRES", "Chargé de trésorerie et placements", 2),
    ("DFC", "Comptable général", 3),
    ("DG", "Chargé de communication et RH", 1),
]

SKILLS = {
    "DG": (
        ["Pilotage stratégique de la réassurance", "Gouvernance et conformité réglementaire (CIMA)",
         "Lecture des états financiers", "Gestion des relations cédantes et partenaires",
         "Conduite des processus et procédures", "Organisation administrative et agenda de direction",
         "Gestion documentaire et archivage", "Maîtrise des outils bureautiques",
         "Communication institutionnelle", "Logistique et sécurité des déplacements"],
        ["Leadership et vision", "Sens des responsabilités", "Discrétion et confidentialité",
         "Rigueur et organisation", "Capacité d'écoute", "Diplomatie",
         "Réactivité", "Esprit d'équipe", "Intégrité", "Gestion du stress"],
    ),
    "DTR": (
        ["Techniques de réassurance proportionnelle et non proportionnelle", "Montage des programmes de rétrocession",
         "Tarification et cotation des traités", "Analyse des risques et des cumuls",
         "Négociation avec les rétrocessionnaires", "Rédaction des clauses et wordings",
         "Suivi technique des portefeuilles", "Réglementation CIMA de la réassurance",
         "Analyse de la rentabilité technique", "Connaissance des marchés africains et internationaux"],
        ["Leadership technique", "Sens de la négociation", "Esprit d'analyse", "Prise de décision",
         "Rigueur", "Capacité à fédérer", "Communication", "Vision stratégique",
         "Gestion des priorités", "Résilience"],
    ),
    "DFC": (
        ["Comptabilité générale et normes SYSCOHADA / CIMA", "Établissement des états financiers",
         "Fiscalité des entreprises d'assurance", "Contrôle interne et audit comptable",
         "Gestion des provisions techniques", "Consolidation et reporting groupe",
         "Gestion de la trésorerie", "Politique de placements", "Pilotage budgétaire",
         "Maîtrise des ERP comptables"],
        ["Rigueur et fiabilité", "Intégrité", "Sens de l'anticipation", "Esprit de synthèse",
         "Leadership", "Capacité à arbitrer", "Communication financière", "Organisation",
         "Résistance à la pression", "Esprit d'équipe"],
    ),
    "SIN": (
        ["Gestion des déclarations de sinistres", "Analyse de la garantie et des exclusions",
         "Évaluation et provisionnement des sinistres", "Gestion des recours et sauvetages",
         "Suivi des expertises", "Calcul des parts de réassurance", "Gestion des sinistres majeurs (cash call)",
         "Tenue des bordereaux sinistres", "Lutte contre la fraude", "Reporting sinistres"],
        ["Rigueur", "Sens de l'équité", "Réactivité", "Esprit d'analyse", "Écoute",
         "Diplomatie", "Organisation", "Fiabilité", "Gestion du stress", "Esprit d'équipe"],
    ),
    "SOU": (
        ["Analyse des offres de réassurance", "Souscription des traités et facultatives non-vie",
         "Tarification des risques IARD", "Appréciation des risques industriels et techniques",
         "Gestion des renouvellements", "Rédaction des slips et notes de couverture",
         "Suivi des capacités et limites de souscription", "Analyse des statistiques des cédantes",
         "Connaissance des branches (incendie, transport, RC, engineering)", "Développement commercial"],
        ["Sens commercial", "Esprit d'analyse", "Prise de décision", "Négociation",
         "Rigueur", "Curiosité", "Relation client", "Organisation", "Leadership", "Persévérance"],
    ),
    "SVIE": (
        ["Souscription des traités vie et prévoyance", "Tarification vie et tables de mortalité",
         "Sélection médicale et financière des risques", "Gestion des traités en quote-part et excédent",
         "Analyse des portefeuilles vie des cédantes", "Suivi des renouvellements vie",
         "Calcul des provisions mathématiques", "Réglementation de l'assurance vie (CIMA)",
         "Produits d'épargne et de prévoyance", "Reporting technique vie"],
        ["Rigueur", "Esprit d'analyse", "Sens commercial", "Écoute", "Discrétion",
         "Fiabilité", "Organisation", "Curiosité", "Communication", "Esprit d'équipe"],
    ),
    "CTEC": (
        ["Comptabilisation des primes et sinistres acceptés", "Traitement des bordereaux et comptes techniques",
         "Rapprochement des comptes cédantes et rétrocessionnaires", "Gestion des soldes et relances",
         "Calcul des commissions et participations aux bénéfices", "Arrêtés techniques",
         "Normes comptables CIMA", "Suivi des dépôts et réserves", "Maîtrise du logiciel de réassurance",
         "Analyse des écarts"],
        ["Rigueur", "Minutie", "Fiabilité", "Organisation", "Persévérance",
         "Esprit d'équipe", "Réactivité", "Respect des délais", "Intégrité", "Esprit d'analyse"],
    ),
    "DATA": (
        ["Modélisation actuarielle", "Calcul des provisions techniques (IBNR)",
         "Tarification et études de rentabilité", "Analyse statistique des portefeuilles",
         "Modélisation des catastrophes naturelles", "Exploitation des bases de données (SQL)",
         "Programmation (Python, R)", "Visualisation et tableaux de bord",
         "Solvabilité et allocation du capital", "Qualité et gouvernance des données"],
        ["Esprit d'analyse", "Rigueur scientifique", "Curiosité", "Pédagogie",
         "Esprit de synthèse", "Autonomie", "Créativité", "Organisation", "Communication", "Esprit d'équipe"],
    ),
    "INFO": (
        ["Administration des systèmes et réseaux", "Sécurité informatique et cybersécurité",
         "Gestion du logiciel métier de réassurance", "Support utilisateurs",
         "Sauvegarde et plan de continuité", "Gestion des bases de données",
         "Pilotage des projets informatiques", "Gestion des prestataires et licences",
         "Veille technologique", "Automatisation et outils collaboratifs"],
        ["Réactivité", "Sens du service", "Pédagogie", "Rigueur", "Autonomie",
         "Discrétion", "Résolution de problèmes", "Organisation", "Curiosité", "Esprit d'équipe"],
    ),
    "PBP": (
        ["Élaboration du budget", "Contrôle de gestion et analyse des écarts",
         "Construction des tableaux de bord", "Suivi des indicateurs de performance",
         "Plan stratégique et prévisions", "Analyse de la rentabilité par branche",
         "Calcul des coûts", "Reporting à la direction et au groupe",
         "Maîtrise d'Excel et des outils de BI", "Suivi des plans d'actions"],
        ["Esprit de synthèse", "Rigueur", "Sens de l'anticipation", "Communication",
         "Force de proposition", "Organisation", "Esprit d'analyse", "Diplomatie", "Fiabilité", "Autonomie"],
    ),
    "TRES": (
        ["Gestion de la trésorerie quotidienne", "Prévisions de trésorerie",
         "Gestion des placements et du portefeuille financier", "Relations bancaires",
         "Règlement des soldes de réassurance", "Gestion du risque de change",
         "Réglementation CIMA des placements", "Rapprochements bancaires",
         "Analyse des marchés financiers", "Reporting financier"],
        ["Rigueur", "Intégrité", "Prise de décision", "Sens de la négociation",
         "Réactivité", "Esprit d'analyse", "Discrétion", "Organisation", "Fiabilité", "Gestion du stress"],
    ),
}


class Command(BaseCommand):
    help = "Crée l'entreprise de démonstration SUNU Re (CEO + 45 collaborateurs, directions, référentiels, photos)."

    def add_arguments(self, parser):
        parser.add_argument("--roster", help="Fichier JSON des noms réels (non versionné).")

    @transaction.atomic
    def handle(self, *args, **options):
        roster = {}
        if options["roster"]:
            try:
                roster = json.loads(Path(options["roster"]).read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                raise CommandError(f"Fichier --roster illisible : {exc}")
        absent = [p for p in FEMALE_POOL + MALE_POOL if not (PORTRAITS / f"{p}.jpg").exists()]
        if absent:
            raise CommandError(f"Portraits introuvables dans {PORTRAITS} : {', '.join(absent)}.")

        people = [(CEO_LOGIN, "Directeur Général", "DG", "M", None)] + LEADERS
        n = len(LEADERS) + 1
        for code, position, count in STAFF:
            for _ in range(count):
                # Alternance F/H pour les collaborateurs ; manager = responsable du service.
                people.append((f"{EMPLOYEE_PREFIX}{n}", position, code, "F" if n % 2 else "M", None))
                n += 1
        if n - 1 != EMPLOYEE_COUNT:
            raise CommandError(f"La répartition donne {n - 1} collaborateurs au lieu de {EMPLOYEE_COUNT}.")

        logins = [p[0] for p in people]
        company = Company.objects.filter(name=COMPANY_NAME).first()
        taken = User.objects.filter(generated_login__in=logins)
        if company:
            taken = taken.exclude(company=company)
        if taken.exists():
            raise CommandError("Logins déjà pris ailleurs : " + ", ".join(
                f"{u.generated_login} ({u.company.name if u.company else '-'})" for u in taken))

        if company is None:
            company = Company.objects.create(
                name=COMPANY_NAME, slug=slugify_company(COMPANY_NAME), sector="Réassurance",
                plan="STANDARD", admin_first_name=CEO_LOGIN, admin_last_name="",
            )

        departments = {}
        for code, name, parent, _ in DEPARTMENTS:
            dept, _ = Department.objects.get_or_create(company=company, code=code, defaults={"name": name})
            dept.name, dept.parent = name, departments.get(parent)
            dept.save()
            departments[code] = dept
        managers = {code: head for code, _, _, head in DEPARTMENTS}

        users = {}
        for login, position, code, _, _ in people:
            role = (User.Role.COMPANY_ADMIN if login == CEO_LOGIN
                    else User.Role.MANAGER if login in managers.values() else User.Role.MEMBER)
            users[login] = self._user(company, login, role, position, departments[code], roster.get(login, {}))
        for login, _, code, _, manager in people:
            if login == CEO_LOGIN:
                continue
            boss = manager or managers[code]
            if boss == login:  # responsable d'un service : remonte à sa direction
                boss = managers[DEPARTMENTS_PARENT[code]]
            users[login].manager = users[boss]
            users[login].save(update_fields=["manager"])
        for code, head in managers.items():
            departments[code].manager = users[head]
            departments[code].save(update_fields=["manager"])
        ceo = users[CEO_LOGIN]
        company.admin_user = ceo
        first, last = roster.get(CEO_LOGIN, {}).get("first_name"), roster.get(CEO_LOGIN, {}).get("last_name")
        if first:
            company.admin_first_name, company.admin_last_name = first, last or ""

        pools = {"F": iter(FEMALE_POOL), "M": iter(MALE_POOL)}
        for login, _, _, sex, _ in people:
            user = users[login]
            photo = next(pools[sex])
            if "_portrait" in (user.avatar.name or ""):
                continue
            if user.avatar:
                user.avatar.delete(save=False)
            user.avatar.save(f"{login}_portrait.jpg",
                             ContentFile((PORTRAITS / f"{photo}.jpg").read_bytes()), save=True)

        for code, (hard, soft) in SKILLS.items():
            dept = departments[code]
            for kind, items in ((SkillMatrix.SkillType.HARD, hard), (SkillMatrix.SkillType.SOFT, soft)):
                matrix, created = SkillMatrix.objects.get_or_create(
                    company=company, department=dept, type=kind, defaults={"name": dept.name})
                if created:
                    SkillItem.objects.bulk_create(
                        SkillItem(matrix=matrix, name=name, order=i) for i, name in enumerate(items, 1))

        if not EvaluationCampaign.objects.filter(company=company, name=CAMPAIGN_NAME).exists():
            EvaluationCampaign.objects.create(
                company=company, name=CAMPAIGN_NAME,
                start_date=CAMPAIGN_START, end_date=CAMPAIGN_END, created_by=ceo,
            )
        company.employee_count = company.users.count()
        company.save()
        self.stdout.write(self.style.SUCCESS(
            f"{company.name} : CEO {CEO_LOGIN}, {EMPLOYEE_PREFIX}1…{EMPLOYEE_PREFIX}{EMPLOYEE_COUNT}, "
            f"mot de passe {PASSWORD}, {len(departments)} directions/services, "
            f"{SkillMatrix.objects.filter(company=company).count()} référentiels, campagne {CAMPAIGN_NAME}"))

    def _user(self, company, login, role, position, department, names):
        user = User.objects.filter(generated_login=login).first()
        if user is None:
            user = User(email=f"{login.lower()}@{company.slug}.pmc.local", generated_login=login)
            user.set_password(PASSWORD)
        user.first_name = names.get("first_name") or login
        user.last_name = names.get("last_name", "") if names.get("first_name") else ""
        user.role, user.position = role, position
        user.company, user.department = company, department
        user.must_change_password = False
        user.is_active = True
        user.save()
        return user


DEPARTMENTS_PARENT = {code: parent for code, _, parent, _ in DEPARTMENTS}
