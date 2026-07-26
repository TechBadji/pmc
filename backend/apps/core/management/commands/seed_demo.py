"""
Commande de seed : crée un jeu de données de démonstration reprenant
l'équipe dirigeante "Elias" (Charles, Jessica, Gilbert, Jean Jacques,
Aicha, Monique, Nadine) telle que décrite dans les fiches ID-PMC.

Usage: python manage.py seed_demo
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Company, Department, User
from apps.core.text_utils import slugify_company
from apps.evaluations.models import Evaluation, EvaluationCampaign, EvaluationSkillScore
from apps.skills.models import SkillItem, SkillMatrix

# (nom du référentiel, hard skills [(nom, note)], soft skills [(nom, note)])
COMPETENCY_MODELS = {
    "Dir Finances & Administration": {
        "hard": [
            ("Pilotage financier", 3.5), ("Gestion de trésorerie", 4),
            ("Contrôle de gestion", 4), ("Gestion du recouvrement", 4.2),
            ("Analyse de rentabilité projet", 3.9), ("Conformité administrative et fiscale", 2),
            ("Structuration des processus financiers", 1.7), ("IA appliquée à la Finance", 3.0),
            ("Management Stratégique", 5), ("Business English", 4.7),
        ],
        "soft": [
            ("Leadership stratégique et inspiration", 4), ("Communication efficace et assertive", 2.4),
            ("Courage managérial et prise de décision", 4.0), ("Intelligence émotionnelle", 2.5),
            ("Collaboration transverse et esprit d'équipe", 2.5), ("Résolution de conflits et médiation", 3.5),
            ("Culture client et orientation résultats", 2), ("Délégation et responsabilisation", 4),
            ("Motivation et développement des équipes", 4), ("Adaptabilité et ouverture au changement", 3.8),
        ],
    },
    "Dir. Supply Chain & Procurement": {
        "hard": [
            ("Gestion des achats techniques", 3.5), ("Gestion des stocks", 3.7),
            ("Logistique internationale", 2.5), ("Planification des approvisionnements", 4),
            ("Gestion de la relation fournisseurs", 3), ("Optimisation des coûts", 1.9),
            ("Gestion des risques supply chain", 4.6), ("IA appliquée à la Supply Chain", 2.6),
            ("Management Stratégique", 3.5), ("Business English", 2),
        ],
        "soft": [
            ("Leadership stratégique et inspiration", 2.3), ("Communication efficace et assertive", 3.9),
            ("Courage managérial et prise de décision", 2.9), ("Intelligence émotionnelle", 4.0),
            ("Collaboration transverse et esprit d'équipe", 2.5), ("Résolution de conflits et médiation", 3.5),
            ("Culture client et orientation résultats", 2), ("Délégation et responsabilisation", 1),
            ("Motivation et développement des équipes", 4), ("Adaptabilité et ouverture au changement", 4),
        ],
    },
    "Dir. Production": {
        "hard": [
            ("Planification et ordonnancement de la production", 4.5),
            ("Maîtrise des procédés de fabrication et d'assemblage", 4),
            ("Gestion de la capacité de production", 4), ("Pilotage des flux de production", 4.2),
            ("Optimisation de la productivité industrielle", 5),
            ("Gestion des équipements, machines et outillages", 4.8),
            ("Pilotage des indicateurs de performance", 5), ("IA appliquée pour Marketing-Vente", 2.2),
            ("Management Stratégique", 4), ("Business English", 1.5),
        ],
        "soft": [
            ("Leadership stratégique et inspiration", 4), ("Communication efficace et assertive", 4.1),
            ("Courage managérial et prise de décision", 3.9), ("Intelligence émotionnelle", 3.0),
            ("Collaboration transverse et esprit d'équipe", 2.5), ("Résolution de conflits et médiation", 3.5),
            ("Culture client et orientation résultats", 4.5), ("Délégation et responsabilisation", 4),
            ("Motivation et développement des équipes", 4), ("Adaptabilité et ouverture au changement", 5),
        ],
    },
    "Dir. Ingénierie & Solutions Techniques": {
        "hard": [
            ("Ingénierie électrique HT/MT/BT", 4.8), ("Dimensionnement solaire et hybride", 4),
            ("Validation technique des offres", 4), ("Innovation technique", 4.7),
            ("Normes et conformité technique", 4.6), ("Support technique aux projets", 5),
            ("Capitalisation technique", 5), ("IA appliquée à l'Ingénierie technique", 1),
            ("Management Stratégique", 3.5), ("Business English", 2.8),
        ],
        "soft": [
            ("Leadership stratégique et inspiration", 3.2), ("Communication efficace et assertive", 4.1),
            ("Courage managérial et prise de décision", 4.2), ("Intelligence émotionnelle", 2.7),
            ("Collaboration transverse et esprit d'équipe", 2.5), ("Résolution de conflits et médiation", 3.0),
            ("Culture client et orientation résultats", 4), ("Délégation et responsabilisation", 2),
            ("Motivation et développement des équipes", 2), ("Adaptabilité et ouverture au changement", 3),
        ],
    },
    "Dir. People, Culture & Transformation": {
        "hard": [
            ("Gestion des talents", 4), ("Développement managérial", 3.5),
            ("Conduite du changement", 4), ("Gestion de la performance RH", 4.2),
            ("Culture d'entreprise", 3.9), ("Organisation et design des rôles", 4),
            ("Communication interne de transformation", 3), ("IA appliquée aux RH", 2.0),
            ("Management Stratégique", 2.5), ("Business English", 4.5),
        ],
        "soft": [
            ("Leadership stratégique et inspiration", 4), ("Communication efficace et assertive", 4.1),
            ("Courage managérial et prise de décision", 5), ("Intelligence émotionnelle", 3.8),
            ("Collaboration transverse et esprit d'équipe", 4.5), ("Résolution de conflits et médiation", 3.5),
            ("Culture client et orientation résultats", 3.0), ("Délégation et responsabilisation", 4),
            ("Motivation et développement des équipes", 4.5), ("Adaptabilité et ouverture au changement", 4.5),
        ],
    },
    "Dir Commerciale & Business Development": {
        "hard": [
            ("Développement commercial B2B", 3.5), ("Gestion des appels d'offres & négociation", 4),
            ("Vente de solutions complexes", 4), ("Analyse & connaissance de marché énergie", 4.2),
            ("Gestion de la rentabilité commerciale", 3.9), ("Gestion de la relation client & pipeline", 3.9),
            ("Stratégie marketing et structuration de l'offre", 4), ("IA appliquée au Marketing-Vente", 2.5),
            ("Management Stratégique", 3.0), ("Business English", 4.7),
        ],
        "soft": [
            ("Leadership stratégique et inspiration", 4.0), ("Communication efficace et assertive", 3.0),
            ("Courage managérial et prise de décision", 2.5), ("Intelligence émotionnelle", 3.5),
            ("Collaboration transverse et esprit d'équipe", 4.0), ("Résolution de conflits et médiation", 3.5),
            ("Culture client et orientation résultats", 5.0), ("Délégation et responsabilisation", 3.9),
            ("Motivation et développement des équipes", 4.0), ("Adaptabilité et ouverture au changement", 3.5),
        ],
    },
    "CEO & Dir QHSE": {
        "hard": [
            ("Maîtrise des normes QHSE applicables", 4.5), ("Mise en place d'un système de management QHSE", 4.0),
            ("Gestion des risques HSE et sécurité électrique", 3.8), ("Contrôle qualité des équipements", 3),
            ("Gestion des non-conformités et actions correctives", 1.5), ("Audit QHSE et amélioration continue", 4.2),
            ("Gestion environnementale et durabilité", 3.0), ("IA appliquée à la QHSE", 2.5),
            ("Management Stratégique", 3.5), ("Business English", 5),
        ],
        "soft": [
            ("Leadership stratégique et inspiration", 3.0), ("Communication efficace et assertive", 2.5),
            ("Courage managérial et prise de décision", 4.7), ("Intelligence émotionnelle", 2.5),
            ("Collaboration transverse et esprit d'équipe", 2.5), ("Résolution de conflits et médiation", 4.5),
            ("Culture client et orientation résultats", 4), ("Délégation et responsabilisation", 2.7),
            ("Motivation et développement des équipes", 1.8), ("Adaptabilité et ouverture au changement", 4.5),
        ],
    },
}

# (prénom, email, poste = clé de COMPETENCY_MODELS, département, code, business%, people%)
TEAM = [
    ("Charles", "charles@elias-demo.pmc", "CEO & Dir QHSE", "Direction Générale", "DG", 88, 90),
    ("Jessica", "jessica@elias-demo.pmc", "Dir Finances & Administration", "Finances & Administration", "DAF", 70, 75),
    ("Gilbert", "gilbert@elias-demo.pmc", "Dir. Supply Chain & Procurement", "Supply Chain & Procurement", "DSCP", 50, 60),
    ("Jean Jacques", "jean.jacques@elias-demo.pmc", "Dir. Production", "Production", "PROD", 88, 92),
    ("Aicha", "aicha@elias-demo.pmc", "Dir. Ingénierie & Solutions Techniques", "Ingénierie & Solutions Techniques", "DIST", 110, 100),
    ("Monique", "monique@elias-demo.pmc", "Dir. People, Culture & Transformation", "People, Culture & Transformation", "DPCT", 75, 85),
    ("Nadine", "nadine@elias-demo.pmc", "Dir Commerciale & Business Development", "Commerciale & Business Development", "DCOM", 80, 78),
]

DEFAULT_PASSWORD = "IdPmc2026!"


class Command(BaseCommand):
    help = "Crée une entreprise de démonstration avec l'équipe dirigeante des fiches ID-PMC."

    @transaction.atomic
    def handle(self, *args, **options):
        super_admin, created = User.objects.get_or_create(
            email="admin@id-pmc.com",
            defaults={
                "first_name": "Ibrahima",
                "last_name": "Diagne",
                "role": User.Role.SUPER_ADMIN,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created:
            super_admin.set_password(DEFAULT_PASSWORD)
            super_admin.save()
            self.stdout.write(self.style.SUCCESS(f"Super Admin créé: {super_admin.email}"))

        company, _ = Company.objects.get_or_create(
            name="Elias Energy Group (Démo)",
            defaults={
                "slug": slugify_company("Elias Energy Group (Démo)"),
                "sector": "Énergie / Solutions électriques",
                "employee_count": 120,
                "plan": "PREMIUM",
                "admin_first_name": "Charles",
                "admin_last_name": "CEO",
            },
        )

        ceo = self._create_user("Charles", "charles@elias-demo.pmc", User.Role.COMPANY_ADMIN, "CEO & Dir QHSE", company)
        company.admin_user = ceo
        company.save(update_fields=["admin_user"])

        matrices_cache = {}
        campaign, _ = EvaluationCampaign.objects.get_or_create(
            company=company,
            name="Semestre 1 2025",
            defaults={"start_date": "2025-01-01", "end_date": "2025-06-30", "created_by": ceo},
        )

        for first_name, email, position, dept_name, dept_code, biz, people in TEAM:
            department, _ = Department.objects.get_or_create(
                company=company, name=dept_name, defaults={"code": dept_code}
            )

            if first_name == "Charles":
                user = ceo
                user.department = department
                user.save(update_fields=["department"])
            else:
                user = self._create_user(first_name, email, User.Role.MANAGER, position, company)
                user.department = department
                user.manager = ceo
                user.save(update_fields=["department", "manager"])

            department.manager = user
            department.save(update_fields=["manager"])

            item_scores = self._get_or_create_matrices(company, position, matrices_cache)

            evaluation, _ = Evaluation.objects.update_or_create(
                user=user,
                campaign=campaign,
                defaults={
                    "evaluator": ceo if first_name != "Charles" else None,
                    "business_objectives_score": biz,
                    "people_objectives_score": people,
                },
            )
            evaluation.skill_scores.all().delete()
            EvaluationSkillScore.objects.bulk_create(
                [
                    EvaluationSkillScore(evaluation=evaluation, skill_item=item, score=score)
                    for item, score in item_scores
                ]
            )

            self.stdout.write(self.style.SUCCESS(f"  → {user.get_full_name()} ({position}) prêt"))

        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé. Entreprise: {company.name} — mot de passe par défaut: {DEFAULT_PASSWORD}"
        ))

    def _create_user(self, first_name, email, role, position, company):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "role": role,
                "position": position,
                "company": company,
            },
        )
        if created:
            user.set_password(DEFAULT_PASSWORD)
            user.save()
        return user

    def _get_or_create_matrices(self, company, position, cache):
        """Retourne la liste [(SkillItem, note_de_référence), ...] (hard + soft)
        pour ce poste, en créant le référentiel s'il n'existe pas encore."""
        if position in cache:
            return cache[position]
        model = COMPETENCY_MODELS[position]
        item_scores = []
        for skill_type, key in ((SkillMatrix.SkillType.HARD, "hard"), (SkillMatrix.SkillType.SOFT, "soft")):
            matrix, _ = SkillMatrix.objects.get_or_create(
                company=company, name=position, type=skill_type
            )
            if not matrix.items.exists():
                for order, (name, _score) in enumerate(model[key]):
                    SkillItem.objects.create(matrix=matrix, name=name, order=order)
            items_by_name = {item.name: item for item in matrix.items.all()}
            item_scores += [(items_by_name[name], score) for name, score in model[key]]
        cache[position] = item_scores
        return item_scores
