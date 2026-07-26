"""
Peuple chaque département d'Elias Energy Group avec 10 employés sénégalais
(noms, âges, photos générées) et une évaluation ID-3A répartie sur les 5
paliers de performance (2 collaborateurs par palier), afin de pouvoir
visualiser des performances individuelles contrastées dans la matrice ID-3A.

Usage: python manage.py seed_department_employees
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.avatar_utils import make_avatar_file
from apps.core.models import Company, Department, User
from apps.core.text_utils import make_login
from apps.evaluations.models import Evaluation, EvaluationCampaign, EvaluationSkillScore
from apps.skills.models import SkillMatrix

DEFAULT_PASSWORD = "123456"

FIRST_NAMES_M = [
    "Mamadou", "Ousmane", "Ibrahima", "Moussa", "Abdoulaye", "Cheikh", "Modou",
    "Alioune", "Babacar", "Amadou", "Souleymane", "Pape", "Mor", "Malick",
    "Lamine", "Assane", "Idrissa", "Boubacar", "Mbaye", "Serigne",
]
FIRST_NAMES_F = [
    "Awa", "Fatou", "Aminata", "Aissatou", "Khady", "Mariama", "Ndeye",
    "Coumba", "Astou", "Bineta", "Sokhna", "Adama", "Aida", "Rokhaya",
    "Marieme", "Fatoumata", "Dieynaba", "Yacine", "Aby", "Absa",
]
LAST_NAMES = [
    "Diop", "Ndiaye", "Fall", "Gueye", "Diallo", "Sarr", "Faye", "Ba", "Sy",
    "Cisse", "Diagne", "Sow", "Thiam", "Kane", "Ndour", "Seck", "Wade",
    "Toure", "Camara", "Niang", "Diouf", "Sane", "Diatta", "Badji", "Mendy",
]

# (code_departement, poste x10)
JOB_TITLES = {
    "Direction Générale": [
        "Assistante de Direction", "Chargé de Communication", "Chauffeur de Direction",
        "Secrétaire Général", "Conseiller Juridique", "Chargé de Mission",
        "Responsable Audit Interne", "Assistant Administratif",
        "Coordinateur QHSE", "Assistant RH",
    ],
    "Finances & Administration": [
        "Comptable", "Contrôleur de Gestion", "Trésorier", "Assistant Comptable",
        "Auditeur Interne", "Analyste Financier", "Caissier Principal",
        "Gestionnaire de Paie", "Responsable Recouvrement", "Comptable Fournisseurs",
    ],
    "Supply Chain & Procurement": [
        "Acheteur", "Responsable Logistique", "Magasinier", "Gestionnaire de Stocks",
        "Approvisionneur", "Chargé des Douanes", "Coordinateur Transport",
        "Agent Logistique", "Responsable Entrepôt", "Négociateur Fournisseurs",
    ],
    "Production": [
        "Chef d'Équipe", "Technicien de Production", "Opérateur Machine",
        "Contremaître", "Agent de Maintenance", "Technicien Qualité",
        "Superviseur de Ligne", "Électromécanicien", "Technicien Électricien",
        "Ouvrier Spécialisé",
    ],
    "Ingénierie & Solutions Techniques": [
        "Ingénieur Électricien", "Technicien Solaire", "Dessinateur Projeteur",
        "Ingénieur Études", "Technicien Bureau d'Études", "Ingénieur Réseaux",
        "Technicien Maintenance", "Chargé d'Affaires Techniques",
        "Ingénieur Photovoltaïque", "Technicien Support",
    ],
    "People, Culture & Transformation": [
        "Chargé RH", "Gestionnaire de Paie", "Chargé de Recrutement",
        "Assistant RH", "Responsable Formation", "Chargé de Communication Interne",
        "Gestionnaire Carrières", "Assistant Administratif RH",
        "Coordinateur Bien-être", "Chargé du Changement",
    ],
    "Commerciale & Business Development": [
        "Commercial Terrain", "Chargé de Clientèle", "Business Developer",
        "Assistant Commercial", "Responsable Grands Comptes",
        "Chargé d'Études Marché", "Commercial Senior", "Négociateur Commercial",
        "Chargé de Prospection", "Responsable Zone",
    ],
}

# Nom exact du référentiel (SkillMatrix) partagé par département, déjà créé
# pour le directeur — les membres de l'équipe sont évalués sur le même
# référentiel que leur direction.
MATRIX_NAME_BY_DEPARTMENT = {
    "Direction Générale": "CEO & Dir QHSE",
    "Finances & Administration": "Dir Finances & Administration",
    "Supply Chain & Procurement": "Dir. Supply Chain & Procurement",
    "Production": "Dir. Production",
    "Ingénierie & Solutions Techniques": "Dir. Ingénierie & Solutions Techniques",
    "People, Culture & Transformation": "Dir. People, Culture & Transformation",
    "Commerciale & Business Development": "Dir Commerciale & Business Development",
}

# (label, plage altitude %, plage notes hard/soft 1-5) — 2 collaborateurs par palier.
PERFORMANCE_BUCKETS = [
    ("Très faible", (30, 48), (1.0, 2.2)),
    ("Faible", (52, 72), (2.0, 3.0)),
    ("Moyenne", (76, 88), (3.0, 3.8)),
    ("Bonne", (91, 99), (3.8, 4.6)),
    ("Exceptionnelle", (102, 128), (4.4, 5.0)),
]


def random_birth_date(rng: random.Random) -> date:
    age_years = rng.randint(24, 58)
    today = date.today()
    return today.replace(year=today.year - age_years) - timedelta(days=rng.randint(0, 364))


class Command(BaseCommand):
    help = "Peuple chaque département d'Elias Energy Group avec 10 employés évalués."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=42, help="Graine aléatoire (reproductibilité)")

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options["seed"])

        try:
            company = Company.objects.get(name__icontains="Elias")
        except Company.DoesNotExist:
            self.stderr.write("Entreprise Elias introuvable — lancez d'abord seed_demo.")
            return

        campaign, _ = EvaluationCampaign.objects.get_or_create(
            company=company,
            name="Semestre 1 2025",
            defaults={"start_date": "2025-01-01", "end_date": "2025-06-30", "created_by": company.admin_user},
        )

        used_full_names: set[str] = set()
        used_emails: set[str] = set(User.objects.values_list("email", flat=True))
        created_count = 0

        for department in company.departments.all():
            if department.members.filter(role=User.Role.MEMBER).count() >= 10:
                self.stdout.write(f"  → {department.name}: déjà peuplé, ignoré.")
                continue

            matrix_name = MATRIX_NAME_BY_DEPARTMENT.get(department.name)
            titles = list(JOB_TITLES.get(department.name, ["Collaborateur"] * 10))
            rng.shuffle(titles)

            hard_items = list(
                SkillMatrix.objects.get(company=company, name=matrix_name, type="HARD").items.all()
            ) if matrix_name else []
            soft_items = list(
                SkillMatrix.objects.get(company=company, name=matrix_name, type="SOFT").items.all()
            ) if matrix_name else []

            buckets = PERFORMANCE_BUCKETS * 2  # 2 collaborateurs par palier = 10
            rng.shuffle(buckets)

            for i, (label, (biz_lo, biz_hi), (skill_lo, skill_hi)) in enumerate(buckets):
                # Nom unique
                for _ in range(50):
                    gender_female = rng.random() < 0.5
                    first = rng.choice(FIRST_NAMES_F if gender_female else FIRST_NAMES_M)
                    last = rng.choice(LAST_NAMES)
                    full_name = f"{first} {last}"
                    if full_name not in used_full_names:
                        used_full_names.add(full_name)
                        break

                login = make_login(first, last)
                candidate_email = f"{login}@elias-demo.pmc"
                suffix = 2
                while candidate_email in used_emails:
                    candidate_email = f"{login}{suffix}@elias-demo.pmc"
                    suffix += 1
                used_emails.add(candidate_email)

                position = titles[i % len(titles)]
                birth = random_birth_date(rng)

                user = User(
                    email=candidate_email,
                    first_name=first,
                    last_name=last,
                    role=User.Role.MEMBER,
                    position=position,
                    company=company,
                    department=department,
                    manager=department.manager,
                    generated_login=login,
                    must_change_password=True,
                    birth_date=birth,
                )
                user.set_password(DEFAULT_PASSWORD)
                initials = f"{first[0]}{last[0]}".upper()
                user.avatar.save(
                    f"{login}.png", make_avatar_file(login, initials), save=False
                )
                user.save()

                biz_score = round(rng.uniform(biz_lo, biz_hi), 1)
                people_score = round(rng.uniform(biz_lo, biz_hi), 1)

                evaluation = Evaluation.objects.create(
                    user=user,
                    evaluator=department.manager,
                    campaign=campaign,
                    business_objectives_score=Decimal(str(biz_score)),
                    people_objectives_score=Decimal(str(people_score)),
                    notes=f"Palier de performance cible: {label}.",
                )

                for item in hard_items + soft_items:
                    score = round(rng.uniform(skill_lo, skill_hi), 1)
                    EvaluationSkillScore.objects.create(
                        evaluation=evaluation, skill_item=item, score=Decimal(str(score))
                    )

                created_count += 1
                self.stdout.write(
                    f"  → {department.name}: {full_name} ({position}, {user.age} ans) "
                    f"— {label} [{evaluation.altitude_percentage}%]"
                )

        self.stdout.write(self.style.SUCCESS(f"Terminé. {created_count} employé(s) créé(s)."))
