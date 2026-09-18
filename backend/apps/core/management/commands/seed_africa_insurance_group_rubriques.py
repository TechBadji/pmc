"""
Peuple TOUTES les rubriques restantes d'Africa Insurance Group, en s'appuyant sur
les évaluations ID-3A, auto-évaluations et Monkey Management déjà présentes,
pour que chaque écran de l'application ait des données cohérentes entre elles :

  - Cohésion d'équipe : fiches des directions (ICE / OCE / Réalisé), avis des
    collaborateurs (« sa direction ») et avis sur l'organisation, par campagne
  - Relationship Dynamic : relations entre membres de chaque direction
  - Cartes d'équipe (Team Performance ID / Strengths & Weaknesses / Relationship)
  - Fiches Performance 360° (dérivées de l'altitude de la dernière campagne)
  - Forces & Faiblesses (dérivées des notes de compétences de chaque évaluation)
  - Fiches d'objectifs (employés et équipes) — leurs moyennes pondérées
    reproduisent les scores business/people déjà stockés, et l'en-tête de fiche
    (dates, visa)
  - Synthèses d'auto-évaluation managériale (dérivées des notes de chaque fiche)
  - Plans d'action : plans libres, plans de développement des directeurs et de
    collaborateurs, plans d'équipe

Idempotente : relancée, elle reconstruit ces rubriques pour l'entreprise sans
doublon. Ne touche ni aux comptes, ni aux évaluations, ni aux avis de
cohésion de SUNU Group.

Usage:
    python manage.py seed_africa_insurance_group_rubriques
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.actionplans.models import ActionPlan
from apps.core.models import Company, Department, PerformanceProfile, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    ManagerialSelfAssessment,
    ManagerialSynthesis,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)
from apps.teams.models import (
    CohesionCriterionScore,
    CohesionResponse,
    TeamBoard,
    TeamCohesionAnalysis,
    TeamRelationship,
)

COMPANY_NAME = "Africa Insurance Group"

CRITERIA = [
    "La vision de {name} sur les 10 à 15 prochaines années est clairement définie",
    "Tout le personnel comprend la vision et les valeurs de {name} et peut l'expliquer clairement",
    "Tous les employés se sont appropriés la vision et les valeurs de {name}",
    "Chaque employé connaît ses objectifs individuels et comment ils sont liés aux objectifs globaux",
    "Chaque membre est très engagé pour atteindre les objectifs fixés à l'équipe",
    "Tous les employés de {name} mettent les intérêts de l'organisation au-dessus de leurs intérêts personnels",
    "Il y a une bonne communication verticale entre le Top Management et le reste de {name}",
    "Il y a une bonne communication horizontale entre les différents départements/directions",
    "Il y a un niveau élevé de confiance entre le Top Management et le reste de {name}",
    "Il y a un niveau élevé de confiance entre les employés de {name} eux-mêmes",
]
TARGET_LEVELS = [4.1, 3.4, 3.0, 3.6, 3.8, 2.8, 2.9, 2.4, 2.7, 3.5]
TARGET_MEAN = sum(TARGET_LEVELS) / len(TARGET_LEVELS)

# Climat de cohésion par direction (niveau moyen ressenti par l'équipe) et
# écart de la note que la direction se donne sur sa propre fiche : c'est cet
# écart, positif ou négatif, que l'écran « avis des collaborateurs » met en scène.
CLIMATE = {"CDIR": 4.2, "DZ": 3.9, "FIL1": 3.2, "FIL2": 3.6, "DT": 3.4, "DEP": 2.9,
           "DMEC": 3.7, "DFI": 4.1, "DRH": 3.0, "DPBP": 3.5, "SUNU": 3.3}
SELF_GAP = {"CDIR": 0.2, "DZ": 0.4, "FIL1": 0.9, "FIL2": -0.3, "DT": 0.5, "DEP": 1.0,
            "DMEC": 0.1, "DFI": -0.2, "DRH": 0.8, "DPBP": 0.3, "SUNU": 0.4}
CAMPAIGN_SHIFTS = [-0.4, -0.1, 0.1, 0.25]
ORG_PARTICIPATION = [0.55, 0.70, 0.80, 0.90]

FEMALE_NAMES = {"Abena", "Adjoua", "Affoué", "Akissi", "Ama", "Amina", "Aminata", "Aïda", "Chantal",
                "Clarisse", "Essi", "Estelle", "Fatou", "Josiane", "Mariam", "Nadège", "Solange"}

# Contenu propre à chaque direction : vision, valeurs, réalisations, objectifs
# business (libellé, indicateur, cible, valeur de départ) et diplômes usuels.
DEPT = {
    "CDIR": dict(
        vision="Faire d'Africa Insurance Group le premier assureur panafricain de proximité, solide, digital et proche de ses assurés.",
        values=["Solidité financière", "Proximité client", "Intégrité", "Ambition africaine"],
        counter=["Court-termisme", "Cloisonnement", "Opacité"],
        wins=["Ouverture des filiales Bénin et Sénégal", "Notation financière confirmée", "Plan stratégique 2026-2030 adopté", "Programme de digitalisation lancé", "Entrée au capital d'un partenaire régional"],
        fails=["Retard d'intégration de la filiale Bénin", "Sous-estimation des délais réglementaires CIMA", "Communication interne tardive sur les réorganisations", "Dépendance à quelques grands comptes"],
        biz=[("Chiffre d'affaires consolidé du groupe (M FCFA)", "Primes émises consolidées", 12000, 9800),
             ("Ratio combiné du groupe (%)", "Sinistres + frais / primes", 98, 104),
             ("Taux de satisfaction client groupe (%)", "Enquête annuelle", 85, 74)],
        qual=["MBA — ESMT Dakar", "Master Actuariat — ISFA Lyon", "Diplôme CIMA — Cycle supérieur", "Executive Education — HEC Paris"]),
    "DZ": dict(
        vision="Piloter la performance de la zone Afrique de l'Ouest et accompagner la croissance des filiales.",
        values=["Rigueur", "Responsabilité", "Esprit d'équipe", "Résultats durables"],
        counter=["Attentisme", "Silo par pays", "Reporting tardif"],
        wins=["Croissance de 14 % du portefeuille zone", "Consolidation mensuelle automatisée", "Ouverture de 12 agences", "Certification qualité de la zone", "Programme de mobilité entre filiales"],
        fails=["Retards de remontée des comptes filiales", "Trop de dérogations tarifaires", "Turnover élevé en agences", "Pilotage trop centralisé"],
        biz=[("Croissance du portefeuille de la zone (M FCFA)", "Primes émises zone", 7800, 6600),
             ("Respect du calendrier de consolidation (%)", "Comptes consolidés dans les délais", 100, 82),
             ("Rétention des grands comptes (%)", "Taux de renouvellement", 92, 85)],
        qual=["MBA — ESMT Dakar", "Master Finance — Université de Lomé", "Diplôme CIMA — Cycle supérieur", "Certification PMP"]),
    "FIL1": dict(
        vision="Devenir l'assureur de référence des PME et des particuliers au Bénin.",
        values=["Proximité", "Réactivité", "Transparence", "Solidarité"],
        counter=["Lenteur de règlement", "Promesses non tenues", "Rétention d'information"],
        wins=["Lancement de l'assurance micro-santé", "Réseau de 25 agents généraux", "Délai moyen de sinistre ramené à 18 jours", "Partenariat avec une banque locale", "Obtention de l'agrément étendu"],
        fails=["Retard de la souscription en ligne", "Fraude sur des sinistres auto", "Formation insuffisante des agents", "Tension de trésorerie au T2"],
        biz=[("Primes émises Bénin (M FCFA)", "Chiffre d'affaires filiale", 1800, 1250),
             ("Délai moyen de règlement des sinistres (score /100)", "Indice de célérité", 85, 68),
             ("Nouveaux contrats PME", "Nombre de contrats signés", 240, 170)],
        qual=["Master Assurance — Université d'Abomey-Calavi", "Diplôme CIMA — Cycle moyen", "Licence Gestion commerciale"]),
    "FIL2": dict(
        vision="Consolider la position d'Africa Insurance Group au Sénégal sur l'assurance santé et l'agricole.",
        values=["Qualité de service", "Innovation", "Confiance", "Ancrage local"],
        counter=["Routine", "Approximation", "Individualisme"],
        wins=["Produit assurance agricole indexée", "Digitalisation des attestations", "Partenariat avec une mutuelle", "Certification ISO 9001 du service client", "Croissance de 11 % en santé collective"],
        fails=["Retards de mise en production du portail", "Sinistralité auto supérieure au budget", "Départ de deux commerciaux clés", "Communication inégale avec la zone"],
        biz=[("Primes émises Sénégal (M FCFA)", "Chiffre d'affaires filiale", 2600, 2200),
             ("Ratio sinistres / primes auto (%)", "Maîtrise de la sinistralité", 68, 61),
             ("Satisfaction client (score /100)", "Enquête post-sinistre", 82, 77)],
        qual=["Master Actuariat — Université Cheikh Anta Diop", "Diplôme CIMA — Cycle supérieur", "Certification ITIL v4"]),
    "DT": dict(
        vision="Assurer une tarification juste, une souscription maîtrisée et une gestion des sinistres irréprochable.",
        values=["Précision", "Équité", "Innovation technique", "Confidentialité"],
        counter=["Approximation actuarielle", "Sous-évaluation des risques", "Dossiers en souffrance"],
        wins=["Nouveau modèle de tarification auto", "Réduction de 15 % des délais de sinistre", "Cartographie des risques catastrophes", "Outil de détection de fraude", "Provisionnement conforme CIMA"],
        fails=["Écart de provisionnement sur la santé", "Migration du moteur de tarification retardée", "Dépendance à un expert externe unique", "Documentation technique incomplète"],
        biz=[("Disponibilité des outils de tarification (%)", "Taux de disponibilité", 99, 95),
             ("Délai moyen de traitement sinistre (score /100)", "Indice de célérité", 90, 72),
             ("Précision des provisions (%)", "Écart provisions / règlements", 98, 91)],
        qual=["Master Actuariat — ISFA Lyon", "Ingénieur Statisticien — ENSAE Dakar", "Diplôme CIMA — Cycle supérieur", "Certification IFRS 17"]),
    "DEP": dict(
        vision="Conduire les projets de transformation et de développement produit du groupe dans les délais et le budget.",
        values=["Rigueur projet", "Collaboration", "Innovation", "Respect des engagements"],
        counter=["Dérive de périmètre", "Cloisonnement des équipes projet", "Absence de retour d'expérience"],
        wins=["Livraison du portail assurés", "Refonte du référentiel produits", "Méthode projet groupe déployée", "Migration du système sinistres", "Étude de marché Côte d'Ivoire"],
        fails=["Deux projets livrés avec retard", "Budget dépassé sur la refonte CRM", "Implication tardive des métiers", "Reporting projet incohérent"],
        biz=[("Projets livrés dans les délais (%)", "Respect des jalons", 90, 62),
             ("Respect du budget projets (%)", "Écart budget consommé / prévu", 100, 84),
             ("Satisfaction des métiers (score /100)", "Enquête fin de projet", 80, 66)],
        qual=["Master Management de projet — ESGI", "Certification PMP", "Ingénieur Informatique — ESATIC", "Certification PRINCE2"]),
    "DMEC": dict(
        vision="Placer l'expérience client au centre de chaque produit, canal et parcours du groupe.",
        values=["Écoute client", "Créativité", "Simplicité", "Engagement"],
        counter=["Discours sans action", "Complexité inutile", "Indifférence aux réclamations"],
        wins=["Refonte de l'identité de marque", "Application mobile lancée", "NPS en hausse de 12 points", "Campagne radio pluri-pays", "Programme de fidélité assurés"],
        fails=["Campagne digitale sous-performante", "Enquête client mal ciblée", "Doublons de contenus entre pays", "Budget média mal réparti"],
        biz=[("Net Promoter Score groupe", "NPS annuel", 55, 41),
             ("Leads qualifiés générés", "Nombre de leads", 5000, 3400),
             ("Taux de conversion digital (%)", "Souscriptions / visites", 100, 71)],
        qual=["Master Marketing — ESSEC Afrique", "Certification Google Analytics", "Licence Communication"]),
    "DFI": dict(
        vision="Garantir la solidité financière du groupe et la fiabilité de l'information comptable et financière.",
        values=["Intégrité", "Exactitude", "Transparence", "Prudence"],
        counter=["Approximations comptables", "Clôtures tardives", "Cloisonnement des données"],
        wins=["Clôtures mensuelles à J+6", "Ratio de solvabilité au-dessus du seuil", "Automatisation du rapprochement bancaire", "Audit externe sans réserve", "Trésorerie centralisée"],
        fails=["Retard sur la liasse fiscale d'une filiale", "Écart de change non couvert", "Dépendance à des tableurs manuels", "Rotation dans l'équipe comptable"],
        biz=[("Résultat net du groupe (M FCFA)", "Résultat net consolidé", 900, 720),
             ("Délai de clôture mensuelle (score /100)", "Clôture à J+6", 100, 88),
             ("Ratio de solvabilité (%)", "Marge de solvabilité", 150, 138)],
        qual=["Master Finance — Université de Lomé", "Diplôme d'Expertise Comptable", "Certification IFRS 17", "Diplôme CIMA — Cycle supérieur"]),
    "DRH": dict(
        vision="Attirer, développer et fidéliser les talents africains dont le groupe a besoin pour sa croissance.",
        values=["Équité", "Écoute", "Développement", "Confiance"],
        counter=["Favoritisme", "Absence de feedback", "Opacité des promotions"],
        wins=["Cartographie des compétences du groupe", "Lancement de l'académie interne", "Baisse du turnover de 5 points", "Politique de mobilité intra-groupe", "Baromètre social annuel"],
        fails=["Recrutements longs sur les postes techniques", "Faible taux de formation en filiales", "Entretiens annuels non tenus", "Conflit social évité de justesse"],
        biz=[("Taux de réalisation du plan de formation (%)", "Formations réalisées / prévues", 100, 72),
             ("Turnover annuel (score /100)", "Indice de rétention", 90, 78),
             ("Délai moyen de recrutement (score /100)", "Indice de célérité", 85, 64)],
        qual=["Master RH — Université Cheikh Anta Diop", "Certification en droit du travail OHADA", "Coach professionnel certifié", "Licence Psychologie du travail"]),
    "DPBP": dict(
        vision="Donner à la direction générale un budget fiable et un pilotage de la performance en temps réel.",
        values=["Fiabilité", "Anticipation", "Objectivité", "Clarté"],
        counter=["Chiffres non réconciliés", "Réunions sans décision", "Tableaux illisibles"],
        wins=["Budget 2026 bouclé en 5 semaines", "Tableau de bord groupe mensuel", "Prévision glissante sur 12 mois", "Contrôle de gestion des filiales", "Simulation des scénarios de croissance"],
        fails=["Écarts non expliqués sur trois mois", "Hypothèses budgétaires trop optimistes", "Outil de pilotage peu adopté", "Absence de comité de suivi budgétaire"],
        biz=[("Précision du budget (%)", "Écart budget / réalisé", 97, 89),
             ("Tableaux de bord livrés à l'heure (%)", "Respect du calendrier", 100, 80),
             ("Économies identifiées (M FCFA)", "Plan d'optimisation", 600, 380)],
        qual=["Master Contrôle de gestion — CESAG Dakar", "Master Finance d'entreprise", "Certification Power BI", "Diplôme CIMA — Cycle moyen"]),
    "SUNU": dict(
        vision="Être le partenaire de proximité du groupe pour l'assurance des particuliers et des entreprises.",
        values=["Service", "Proximité", "Fiabilité", "Esprit d'équipe"],
        counter=["Indifférence", "Lenteur", "Cloisonnement"],
        wins=["Ouverture de 8 points de vente", "Campagne de fidélisation réussie", "Digitalisation de la souscription", "Formation de 40 conseillers", "Partenariat avec un réseau bancaire"],
        fails=["Ruptures de stock de documents contractuels", "Délais de traitement trop longs", "Communication irrégulière avec le siège", "Turnover sur la vente"],
        biz=[("Chiffre d'affaires SUNU Group (M FCFA)", "Primes émises", 3200, 2600),
             ("Taux de rétention clients (%)", "Renouvellements", 90, 80),
             ("Satisfaction client (score /100)", "Enquête annuelle", 80, 70)],
        qual=["Licence Gestion commerciale", "Diplôme CIMA — Cycle moyen", "BTS Assurance"]),
}
DEPT_ORDER = ["CDIR", "DZ", "FIL1", "FIL2", "DT", "DEP", "DMEC", "DFI", "DRH", "DPBP"]

CATALYSTS = ["Anticipe les problèmes", "Partage l'information spontanément", "Propose des solutions concrètes", "Fédère autour d'un objectif", "Prend l'initiative des rituels d'équipe", "Aide les nouveaux à s'intégrer"]
NOURISHERS = ["Reconnaît le travail des autres", "Écoute sans interrompre", "Donne du feedback constructif", "Célèbre les réussites collectives", "Tient ses engagements", "Encourage la prise d'initiative"]
INHIBITORS = ["Retient l'information", "Décide seul sans consulter", "Reporte les décisions", "Multiplie les réunions sans issue", "Bloque le changement", "Néglige le suivi des actions"]
TOXINS = ["Critique en public", "Rumeurs et commérages", "Mépris des idées d'autrui", "Sarcasme systématique", "Rivalités entre services", "Favoritisme"]
PRIORITIES_COHESION = ["Rituel hebdomadaire de partage", "Clarifier les rôles et responsabilités", "Améliorer la communication entre directions", "Séminaire de cohésion semestriel", "Instaurer un feedback à 360°", "Reconnaître les contributions individuelles"]
PRIORITIES_BUSINESS = ["Sécuriser les objectifs de production", "Réduire les délais de traitement", "Digitaliser les processus clés", "Fidéliser les clients stratégiques", "Maîtriser la sinistralité", "Optimiser les coûts de fonctionnement"]
PEOPLE_STRENGTHS = ["Équipe expérimentée", "Forte solidarité", "Grande culture de service", "Compétences techniques solides", "Esprit d'initiative", "Bonne mixité des profils"]
PEOPLE_WEAKNESSES = ["Charge de travail inégale", "Peu de mobilité interne", "Communication informelle insuffisante", "Relève à préparer", "Compétences digitales inégales", "Manque de feedback régulier"]
BUSINESS_STRENGTHS = ["Portefeuille clients fidèle", "Connaissance fine du marché local", "Processus maîtrisés", "Réactivité commerciale", "Relations institutionnelles solides", "Bonne réputation de paiement"]
BUSINESS_WEAKNESSES = ["Outils de reporting hétérogènes", "Dépendance à quelques clients", "Délais de décision longs", "Faible digitalisation", "Coûts de fonctionnement élevés", "Veille concurrentielle limitée"]

TRAITS = ["Rigoureux", "Empathique", "Persévérant", "Curieux", "Diplomate", "Organisé", "Créatif", "Fiable", "Analytique", "Optimiste"]
HOBBIES = ["Football", "Lecture", "Randonnée", "Musique traditionnelle", "Cuisine", "Photographie", "Course à pied", "Jardinage", "Échecs", "Bénévolat associatif"]
MOTIVATES = ["Voir son équipe progresser", "Résoudre des problèmes complexes", "La reconnaissance du travail bien fait", "Apprendre en continu", "Servir les assurés dans les moments difficiles", "Contribuer à la croissance du groupe"]
DISLIKES = ["L'injustice", "Les réunions sans décision", "Le travail bâclé", "Le manque de transparence", "Les retards répétés"]
ROLE_MODELS = ["Ngozi Okonjo-Iweala", "Tidjane Thiam", "Nelson Mandela", "Wangari Maathai", "Aliko Dangote", "Kofi Annan", "Mo Ibrahim", "Thomas Sankara"]
LIFE_MODELS = ["Ma mère", "Mon père", "Un ancien professeur", "Mon premier manager", "Un mentor du groupe"]
PREV_POSITIONS = ["Analyste junior — cabinet de courtage", "Gestionnaire sinistres — compagnie IARD", "Contrôleur de gestion — groupe bancaire régional", "Chargé de clientèle — réseau d'agences", "Chef de projet — cabinet de conseil", "Assistant de direction — filiale régionale", "Comptable — PME industrielle", "Souscripteur — compagnie vie"]
BONO_HATS = ["Blanc", "Rouge", "Noir", "Jaune", "Vert", "Bleu"]
PROF_ACHIEVEMENTS = ["Mise en place d'un tableau de bord partagé", "Réduction des délais de traitement", "Obtention d'une certification professionnelle", "Encadrement de stagiaires", "Pilotage d'un projet transverse", "Reconnaissance client formalisée"]
PERS_ACHIEVEMENTS = ["Master obtenu en cours du soir", "Marathon terminé", "Création d'une association de quartier", "Publication d'un article professionnel", "Construction de sa maison familiale"]
DEV_PRIORITIES = ["Renforcer le leadership", "Approfondir l'expertise métier", "Développer les compétences digitales", "Améliorer la gestion du temps", "Gagner en impact à l'oral", "Élargir son réseau interne"]
DEV_PERSPECTIVES = ["Évolution vers un poste de responsable", "Mobilité en filiale", "Mission transverse groupe", "Formation diplômante"]
DEV_SUPPORT = ["Coaching mensuel", "Mentorat par un pair senior", "Formation certifiante", "Projet d'application terrain"]
DEV_RISKS = ["Surcharge de travail", "Départ d'un collègue clé", "Évolution réglementaire", "Disponibilité du budget formation"]

ACTION_TEMPLATES = {
    "HARD_SKILLS": [
        ("Formation certifiante ciblée", "Session de formation en présentiel", "450 000 FCFA"),
        ("Mission d'application sur un dossier réel", "Mise en pratique encadrée", "0 FCFA"),
        ("Auto-formation et restitution à l'équipe", "Parcours e-learning", "120 000 FCFA"),
    ],
    "SOFT_SKILLS": [
        ("Coaching individuel mensuel", "6 séances de coaching", "600 000 FCFA"),
        ("Mentorat par un pair senior", "Rendez-vous bimensuels", "0 FCFA"),
        ("Atelier pratique en équipe", "Atelier interne animé", "80 000 FCFA"),
    ],
}
FREE_PLAN_TEMPLATES = [
    ("HARD_SKILLS", "Maîtrise des outils de pilotage", "Former l'équipe au nouvel outil de reporting", "Formation interne"),
    ("SOFT_SKILLS", "Communication et feedback", "Instaurer un point de feedback mensuel en équipe", "Rituel d'équipe"),
    ("HARD_SKILLS", "Qualité de service client", "Refondre le processus de traitement des réclamations", "Groupe de travail"),
    ("SOFT_SKILLS", "Esprit d'équipe", "Organiser un séminaire de cohésion semestriel", "Séminaire"),
]
STRONG = {
    "COMMUNICATION": "Communication claire et adaptée à chaque interlocuteur",
    "ECOUTE": "Écoute active et disponibilité auprès des équipes",
    "MOTIVATION": "Capacité à mobiliser et à reconnaître les efforts",
    "DELEGATION": "Délégation ciblée avec un suivi rigoureux",
    "TEMPS_PRIORITES": "Gestion rigoureuse des priorités et des échéances",
}
WEAK = {
    "COMMUNICATION": "Structurer davantage le feedback et les messages clés",
    "ECOUTE": "Prendre plus de temps d'écoute individuelle",
    "MOTIVATION": "Renforcer la reconnaissance au quotidien",
    "DELEGATION": "Déléguer davantage et lâcher prise sur l'opérationnel",
    "TEMPS_PRIORITES": "Protéger du temps pour les sujets importants non urgents",
}


def _clamp_score(value):
    return max(1, min(5, round(value)))


class Command(BaseCommand):
    help = "Peuple toutes les rubriques restantes d'Africa Insurance Group (cohésion, cartes d'équipe, profils, objectifs, plans d'action…)."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            self.company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError("Entreprise introuvable — lancez d'abord seed_africa_insurance_group.")
        c = self.company
        self.campaigns = list(EvaluationCampaign.objects.filter(company=c).order_by("start_date"))
        if not self.campaigns:
            raise CommandError("Aucune campagne — lancez d'abord seed_africa_insurance_group.")
        self.today = date.today()
        self.depts = {d.code: d for d in Department.objects.filter(company=c)}
        missing = [code for code in DEPT_ORDER if code not in self.depts]
        if missing:
            raise CommandError(f"Directions introuvables : {missing}")
        self.ceo = User.objects.get(company=c, role=User.Role.COMPANY_ADMIN)
        self.users = list(User.objects.filter(company=c).select_related("department").order_by("generated_login"))
        self.members = {code: list(User.objects.filter(department=d).order_by("generated_login")) for code, d in self.depts.items()}
        self.deposit = {}
        for camp in self.campaigns:
            dep = min(self.today, camp.end_date)
            self.deposit[camp.pk] = max(dep, camp.start_date)

        for step in (
            self.cohesion_sheets, self.cohesion_team_responses, self.cohesion_org_responses,
            self.relationships, self.team_boards, self.skill_notes, self.objectives,
            self.profiles, self.syntheses, self.action_plans,
        ):
            step()
        self.stdout.write(self.style.SUCCESS("\nTerminé — rubriques d'Africa Insurance Group peuplées."))

    # ---------------------------------------------------------------- cohésion
    def _labels(self, name):
        return [label.format(name=name) for label in CRITERIA]

    def _levels(self, base):
        return [t - TARGET_MEAN + base for t in TARGET_LEVELS]

    def cohesion_sheets(self):
        n = 0
        for code in DEPT_ORDER:
            dept = self.depts[code]
            labels = self._labels(dept.name)
            for i, camp in enumerate(self.campaigns):
                rng = random.Random(f"sheet-{code}-{camp.pk}")
                base = CLIMATE[code] + CAMPAIGN_SHIFTS[i] + SELF_GAP[code]
                sheet, _ = TeamCohesionAnalysis.objects.get_or_create(team=dept, date=self.deposit[camp.pk])
                sheet.criterion_scores.all().delete()
                rows = []
                for label, level in zip(labels, self._levels(base)):
                    ice = _clamp_score(level + rng.gauss(0, 0.35))
                    objective = round(min(5.0, max(ice + 0.5, 4.0 + rng.choice([0, 0.5]))), 1)
                    achieved = round(min(5.0, max(1.0, (ice + objective) / 2 - 0.2 + rng.gauss(0, 0.2))), 1)
                    rows.append(CohesionCriterionScore(analysis=sheet, criterion=label, score=ice,
                                                       objective_score=objective, achieved_score=achieved))
                CohesionCriterionScore.objects.bulk_create(rows)
                sheet.ice_score = round(sum(r.score for r in rows) / len(rows), 1)
                sheet.oce_score = round(sum(float(r.objective_score) for r in rows) / len(rows), 1)
                sheet.notes = f"Fiche de cohésion {camp.name} — {dept.name}."
                sheet.save(update_fields=["ice_score", "oce_score", "notes"])
                n += 1
        self.stdout.write(f"Fiches de cohésion : {n}")

    def cohesion_team_responses(self):
        n = 0
        for code in DEPT_ORDER:
            if code == "CDIR":
                continue
            dept = self.depts[code]
            labels = self._labels(dept.name)
            for i, camp in enumerate(self.campaigns):
                rng = random.Random(f"resp-{code}-{camp.pk}")
                members = list(self.members[code])
                rng.shuffle(members)
                # Une direction, un exercice : pas assez de réponses (seuil de 4)
                # pour montrer l'écran « non publié ».
                count = 3 if (code == "DPBP" and i == 0) else max(4, len(members) - rng.choice([0, 0, 1, 2]))
                for respondent in members[:count]:
                    humeur = rng.gauss(0, 0.6)
                    base = CLIMATE[code] + CAMPAIGN_SHIFTS[i] + humeur
                    scores = [{"criterion": label, "score": _clamp_score(level + rng.gauss(0, 0.5))}
                              for label, level in zip(labels, self._levels(base))]
                    CohesionResponse.objects.update_or_create(
                        scope=CohesionResponse.Scope.TEAM, team=dept, respondent=respondent,
                        date=self.deposit[camp.pk],
                        defaults={"scores": scores, "company": self.company},
                    )
                    n += 1
        self.stdout.write(f"Avis de cohésion (sa direction) : {n}")

    def cohesion_org_responses(self):
        n = 0
        labels = self._labels(self.company.name)
        for i, camp in enumerate(self.campaigns):
            rng = random.Random(f"org-{camp.pk}")
            users = list(self.users)
            rng.shuffle(users)
            for respondent in users[: round(len(users) * ORG_PARTICIPATION[i])]:
                humeur = rng.gauss(0, 0.6)
                base = 3.3 + CAMPAIGN_SHIFTS[i] + humeur
                scores = [{"criterion": label, "score": _clamp_score(level + rng.gauss(0, 0.5))}
                          for label, level in zip(labels, self._levels(base))]
                CohesionResponse.objects.update_or_create(
                    scope=CohesionResponse.Scope.ORGANISATION, company=self.company,
                    respondent=respondent, date=self.deposit[camp.pk],
                    defaults={"scores": scores, "team": None},
                )
                n += 1
        self.stdout.write(f"Avis de cohésion (organisation) : {n}")

    # ---------------------------------------------------------- relationships
    def relationships(self):
        TeamRelationship.objects.filter(team__company=self.company).delete()
        rows = []
        for code in DEPT_ORDER:
            if code == "CDIR":
                continue
            dept = self.depts[code]
            people = sorted(self.members[code], key=lambda u: u.id)
            rng = random.Random(f"rel-{code}")
            good = min(0.85, max(0.25, (CLIMATE[code] - 2.0) / 2.5))
            for a in range(len(people)):
                for b in range(a + 1, len(people)):
                    r = rng.random()
                    if r < good * 0.55:
                        q = "EXCELLENT"
                    elif r < good + 0.2:
                        q = "CORRECT"
                    elif r < 0.93:
                        q = "DIFFICULT"
                    else:
                        q = "TOXIC"
                    rows.append(TeamRelationship(team=dept, from_user=people[a], to_user=people[b], quality=q))
        TeamRelationship.objects.bulk_create(rows)
        self.stdout.write(f"Relations d'équipe : {len(rows)}")

    # ------------------------------------------------------------ team boards
    def team_boards(self):
        n = 0
        for code in DEPT_ORDER + ["SUNU"]:
            dept, spec = self.depts[code], DEPT[code]
            rng = random.Random(f"board-{code}")
            base = rng.choice([180, 260, 340, 420, 520]) * (3 if code in ("CDIR", "DZ") else 1)
            growth = 1.06 + rng.random() * 0.06
            for i, camp in enumerate(self.campaigns):
                year = self.deposit[camp.pk].year
                target_series = {y: round(base * growth ** (y - 2022), 1) for y in range(2019, year + 4)}
                srng = random.Random(f"series-{code}")
                actuals = {y: round(target_series[y] * (0.86 + srng.random() * 0.2), 1) for y in range(2019, year + 1)}
                pick = random.Random(f"pick-{code}-{camp.pk}")
                def sample(pool, k):
                    return pick.sample(pool, k)
                TeamBoard.objects.update_or_create(
                    team=dept, date=self.deposit[camp.pk],
                    defaults=dict(
                        people_strengths=sample(PEOPLE_STRENGTHS, 3), people_weaknesses=sample(PEOPLE_WEAKNESSES, 3),
                        business_strengths=sample(BUSINESS_STRENGTHS, 3), business_weaknesses=sample(BUSINESS_WEAKNESSES, 3),
                        catalysts=sample(CATALYSTS, 5), nourishers=sample(NOURISHERS, 5),
                        inhibitors=sample(INHIBITORS, 5), toxins=sample(TOXINS, 5),
                        vision_missions=spec["vision"], values=spec["values"], counter_values=spec["counter"],
                        achievements=spec["wins"], failures_lessons=spec["fails"],
                        objectives=[b[0] for b in spec["biz"]],
                        priorities_cohesion=sample(PRIORITIES_COHESION, 5), priorities_business=sample(PRIORITIES_BUSINESS, 5),
                        targets_vs_actuals=[{"year": str(y), "target": target_series[y], "actual": actuals[y]}
                                            for y in range(year - 3, year + 1)],
                        objectives_plan=[{"year": str(y), "target": target_series[y], "actual": None}
                                         for y in range(year + 1, year + 4)],
                    ),
                )
                n += 1
        self.stdout.write(f"Cartes d'équipe : {n}")

    # ------------------------------------------------------------ skill notes
    def skill_notes(self):
        evaluations = Evaluation.objects.filter(user__company=self.company).select_related("user").prefetch_related("skill_scores__skill_item__matrix")
        notes = []
        touched = []
        for ev in evaluations:
            touched.append(ev.pk)
            groups = {"HARD": [], "SOFT": []}
            for s in ev.skill_scores.all():
                if s.score is not None:
                    groups[s.skill_item.matrix.type].append((s.score, s.skill_item.name))
            for kind in ("HARD", "SOFT"):
                ordered = sorted(groups[kind], key=lambda t: (-t[0], t[1]))
                top, low = ordered[:5], list(reversed(ordered[-5:]))
                for cat, lst in ((f"{kind}_STRENGTH", top), (f"{kind}_WEAKNESS", low)):
                    for order, (score, name) in enumerate(lst, start=1):
                        notes.append(SkillNote(evaluation=ev, category=cat, order=order, text=name[:255], score=score))
        SkillNote.objects.filter(evaluation_id__in=touched).delete()
        SkillNote.objects.bulk_create(notes)
        self.stdout.write(f"Forces & Faiblesses : {len(notes)} lignes pour {len(touched)} évaluations")

    # -------------------------------------------------------------- objectives
    @staticmethod
    def _spread(target_mean, weights, rng, amplitude=9):
        """Pourcentages d'atteinte dont la moyenne pondérée vaut exactement `target_mean`."""
        noises = [rng.uniform(-amplitude, amplitude) for _ in weights[:-1]]
        last = -sum(w * nz for w, nz in zip(weights, noises)) / weights[-1]
        pcts = [round(target_mean + nz, 1) for nz in noises]
        pcts.append(round(target_mean + last, 1))
        return [max(5.0, p) for p in pcts]

    def _managerial_lines(self, is_manager):
        if is_manager:
            return [("Développer les compétences de l'équipe", "Réalisation du plan de formation (%)", 100),
                    ("Renforcer l'engagement des collaborateurs", "Score d'engagement (/100)", 80)]
        return [("Progresser sur son plan de développement", "Actions du plan réalisées (%)", 100),
                ("Contribuer à l'esprit d'équipe", "Score de contribution (/100)", 80)]

    def _make_lines(self, anchor, dept_code, business_mean, people_mean, is_manager, rng):
        spec = DEPT[dept_code]["biz"]
        weights_b = [Decimal("40"), Decimal("30"), Decimal("30")]
        pcts_b = self._spread(float(business_mean), [float(w) for w in weights_b], rng)
        lines = []
        for order, ((label, indicator, target, ref), w, p) in enumerate(zip(spec, weights_b, pcts_b), start=1):
            lines.append(PerformanceObjective(**anchor, category="BUSINESS", order=order, label=label, indicator=indicator,
                                              reference_value=Decimal(ref), target_value=Decimal(target),
                                              actual_value=(Decimal(target) * Decimal(str(p)) / 100).quantize(Decimal("0.01")),
                                              weight=w))
        weights_m = [Decimal("50"), Decimal("50")]
        pcts_m = self._spread(float(people_mean), [float(w) for w in weights_m], rng)
        for order, ((label, indicator, target), w, p) in enumerate(zip(self._managerial_lines(is_manager), weights_m, pcts_m), start=1):
            lines.append(PerformanceObjective(**anchor, category="MANAGERIAL", order=order, label=label, indicator=indicator,
                                              reference_value=Decimal(target) * Decimal("0.6"), target_value=Decimal(target),
                                              actual_value=(Decimal(target) * Decimal(str(p)) / 100).quantize(Decimal("0.01")),
                                              weight=w))
        return lines

    def objectives(self):
        PerformanceObjective.objects.filter(evaluation__user__company=self.company).delete()
        PerformanceObjective.objects.filter(team__company=self.company).delete()
        evals = list(Evaluation.objects.filter(user__company=self.company).select_related("user__department", "evaluator", "campaign"))
        emp_lines, by_team = [], {}
        for ev in evals:
            code = ev.user.department.code if ev.user.department else None
            if code not in DEPT:
                continue
            rng = random.Random(f"obj-{ev.pk}")
            emp_lines += self._make_lines({"evaluation": ev}, code, ev.business_objectives_score, ev.people_objectives_score,
                                          ev.user.role == User.Role.MANAGER, rng)
            key = ("CDIR" if ev.user.role == User.Role.MANAGER else code, ev.campaign_id)
            by_team.setdefault(key, []).append(ev)
            # En-tête de la fiche annuelle : trois dates du cycle et visa.
            camp = ev.campaign
            evaluated = min(self.today, max(camp.start_date + timedelta(days=30), camp.end_date - timedelta(days=12)))
            ev.objectives_set_on = camp.start_date + timedelta(days=14 + rng.randint(0, 10))
            ev.evaluated_on = evaluated
            ev.next_evaluation_on = evaluated + timedelta(days=365 if camp.end_date - camp.start_date > timedelta(days=200) else 182)
            evaluator = ev.evaluator
            ev.manager_visa = f"{evaluator.get_full_name() if evaluator else self.ceo.get_full_name()} — visé le {evaluated.strftime('%d/%m/%Y')}"
            ev.save(update_fields=["objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa"])
        PerformanceObjective.objects.bulk_create(emp_lines)
        drift = 0.0
        for ev in evals:
            before = (ev.business_objectives_score, ev.people_objectives_score)
            recompute_evaluation_scores(ev)
            ev.refresh_from_db()
            drift = max(drift, abs(float(ev.business_objectives_score - before[0])), abs(float(ev.people_objectives_score - before[1])))
        team_lines = []
        for (code, camp_id), group in by_team.items():
            team = self.depts[code]
            business = sum(float(e.business_objectives_score) for e in group) / len(group)
            people = sum(float(e.people_objectives_score) for e in group) / len(group)
            rng = random.Random(f"tobj-{code}-{camp_id}")
            team_lines += self._make_lines({"team": team, "campaign_id": camp_id}, code, round(business, 1), round(people, 1), True, rng)
        PerformanceObjective.objects.bulk_create(team_lines)
        self.stdout.write(f"Objectifs : {len(emp_lines)} lignes employés, {len(team_lines)} lignes équipes (écart max de recalcul {drift:.2f} pt)")

    # ---------------------------------------------------------------- profiles
    def profiles(self):
        latest = self.campaigns[-1]
        evals = {e.user_id: e for e in Evaluation.objects.filter(campaign=latest, user__company=self.company)}
        n = 0
        for user in self.users:
            code = user.department.code if user.department else None
            if code == "SUNU" or code not in DEPT:
                continue
            rng = random.Random(f"profile-{user.pk}")
            ev = evals.get(user.pk)
            pool_q = DEPT[code]["qual"]
            prev = rng.sample(PREV_POSITIONS, 2)
            start_year = (user.career_start_date.year if user.career_start_date else 2000)
            def pick(pool, k):
                return rng.sample(pool, min(k, len(pool)))
            PerformanceProfile.objects.update_or_create(
                user=user,
                defaults=dict(
                    gender="Femme" if user.first_name in FEMALE_NAMES else "Homme",
                    contract_type="CDI" if rng.random() < 0.9 else "CDD",
                    performance_pct=f"{ev.altitude_percentage}" if ev else "",
                    performer_category=ev.performance_rating if ev else "",
                    qualifications=pick(pool_q, 3), previous_positions=prev,
                    previous_position_dates=[str(start_year + rng.randint(1, 6)), str(start_year + rng.randint(7, 12))],
                    professional_achievements=pick(PROF_ACHIEVEMENTS, 3), personal_achievements=pick(PERS_ACHIEVEMENTS, 2),
                    vision_aspirations=f"Contribuer durablement à la croissance de la {user.department.name if user.department else 'direction'} et transmettre son savoir.",
                    personal_projects="Financer les études des enfants et développer une activité associative locale.",
                    professional_role_models=pick(ROLE_MODELS, 2), role_models_in_life=pick(LIFE_MODELS, 2),
                    dislikes=pick(DISLIKES, 2), motivates=pick(MOTIVATES, 3), personality_traits=pick(TRAITS, 3),
                    hobbies=pick(HOBBIES, 2), bono_hat=rng.choice(BONO_HATS),
                    brings_to_team=pick(NOURISHERS, 3), brings_to_manager=pick(["Loyauté", "Fiabilité", "Force de proposition", "Remontée d'information"], 2),
                    expects_from_team=pick(["Transparence", "Entraide", "Respect des délais"], 2),
                    expects_from_manager=pick(["Feedback régulier", "Autonomie", "Clarté des priorités"], 2),
                    dev_priorities=pick(DEV_PRIORITIES, 3), dev_professional_perspectives=pick(DEV_PERSPECTIVES, 2),
                    dev_actions_support=pick(DEV_SUPPORT, 2), dev_risks_obstacles=pick(DEV_RISKS, 2),
                ),
            )
            n += 1
        self.stdout.write(f"Fiches Performance 360° : {n}")

    # -------------------------------------------------------------- syntheses
    def syntheses(self):
        n = 0
        grouped = {}
        for a in ManagerialSelfAssessment.objects.filter(user__company=self.company):
            grouped.setdefault((a.user_id, a.campaign_id), []).append(a)
        for (user_id, camp_id), rows in grouped.items():
            ordered = sorted(rows, key=lambda r: (-(r.ic_score or 0), r.category))
            strong = [STRONG[r.category] for r in ordered[:3]]
            weak = [WEAK[r.category] for r in reversed(ordered[-3:])]
            ManagerialSynthesis.objects.update_or_create(
                user_id=user_id, campaign_id=camp_id,
                defaults={"key_skills": strong, "improvement_areas": weak},
            )
            n += 1
        self.stdout.write(f"Synthèses managériales : {n}")

    # ------------------------------------------------------------ action plans
    def _dev_rows(self, manager, team, target_user, weaknesses, actions_per_priority, priorities, start, name_for_responsible):
        rows = []
        for category in ("HARD_SKILLS", "SOFT_SKILLS"):
            kind = "HARD" if category == "HARD_SKILLS" else "SOFT"
            ws = weaknesses.get(kind, [])
            for p in range(1, priorities + 1):
                name, score = ws[p - 1] if p - 1 < len(ws) else (f"Priorité {p}", Decimal("3.0"))
                for order in range(1, actions_per_priority + 1):
                    label, detail, cost = ACTION_TEMPLATES[category][(p + order) % 3]
                    begin = start + timedelta(days=60 * (p - 1) + 20 * (order - 1))
                    rows.append(ActionPlan(
                        manager=manager, team=team, target_user=target_user, category=category,
                        priority=name[:255], objective=f"{label} — {detail}.",
                        baseline=f"{score}", target=f"{min(Decimal('5.0'), score + Decimal('1.0'))}",
                        cost=cost, status="TODO", start_date=begin, due_date=begin + timedelta(days=75),
                        responsible=name_for_responsible, eval_note="Revue trimestrielle",
                        priority_order=p, order=order,
                    ))
        return rows

    def action_plans(self):
        ActionPlan.objects.filter(team__company=self.company).delete()
        latest = self.campaigns[-1]
        evals = {e.user_id: e for e in Evaluation.objects.filter(campaign=latest, user__company=self.company).select_related("user__department")}
        weaknesses_by_user = {}
        for note in SkillNote.objects.filter(evaluation__in=evals.values(), category__in=["HARD_WEAKNESS", "SOFT_WEAKNESS"]).select_related("evaluation"):
            kind = "HARD" if note.category == "HARD_WEAKNESS" else "SOFT"
            weaknesses_by_user.setdefault(note.evaluation.user_id, {}).setdefault(kind, []).append((note.order, note.text, note.score))
        for w in weaknesses_by_user.values():
            for kind in w:
                w[kind] = [(t, s) for _, t, s in sorted(w[kind])]
        rows = []
        start = date(2026, 10, 1)
        # Plan de développement de chaque directeur, posé par le PDG.
        for code in DEPT_ORDER[1:]:
            dept = self.depts[code]
            director = dept.manager
            if director is None:
                continue
            rows += self._dev_rows(self.ceo, dept, director, weaknesses_by_user.get(director.pk, {}), 2, 3, start, self.ceo.get_full_name())
            # Deux collaborateurs les moins bien notés : plan posé par leur directeur.
            members = [m for m in self.members[code] if m.pk != director.pk and m.pk in evals]
            members.sort(key=lambda m: float(evals[m.pk].altitude_percentage))
            for member in members[:2]:
                rows += self._dev_rows(director, dept, member, weaknesses_by_user.get(member.pk, {}), 1, 2, start, director.get_full_name())
            # Grille d'équipe posée par le directeur.
            team_weak = {"HARD": [(b, Decimal("3.0")) for b in BUSINESS_WEAKNESSES[:3]],
                         "SOFT": [(p, Decimal("3.0")) for p in PEOPLE_WEAKNESSES[:3]]}
            rows += self._dev_rows(director, dept, None, team_weak, 1, 3, start, director.get_full_name())
        # Plans libres : quatre par direction, statuts variés.
        statuses = ["DONE", "IN_PROGRESS", "TODO", "IN_PROGRESS"]
        for code in DEPT_ORDER + ["SUNU"]:
            dept = self.depts[code]
            manager = dept.manager or self.ceo
            rng = random.Random(f"free-{code}")
            for k, (category, priority, objective, cost) in enumerate(FREE_PLAN_TEMPLATES):
                begin = date(2026, 3, 1) + timedelta(days=45 * k)
                rows.append(ActionPlan(
                    manager=manager, team=dept, target_user=None, category=category, priority=priority,
                    objective=objective, baseline="3.0", target="4.0", cost=cost, status=statuses[k],
                    start_date=begin, due_date=begin + timedelta(days=60 + rng.randint(0, 30)),
                    responsible=manager.get_full_name(), eval_note="Suivi mensuel",
                ))
        ActionPlan.objects.bulk_create(rows)
        self.stdout.write(f"Plans d'action : {len(rows)}")
