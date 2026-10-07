"""
Peuple toutes les rubriques de SUNU Bank Sénégal sur ses quatre campagnes
(Année 2023, 2024, 2025 et Semestre 1 2026), pour les directeurs et les
collaborateurs créés par `seed_sunu_bank_senegal` :

  - référentiels de compétences : dix savoir-faire bancaires par direction
    (hard) et les soft skills communs à toutes les démos ;
  - évaluations ID-3A (les collaborateurs par leur directeur, les directeurs
    par le CEO), forces & faiblesses, fiches d'objectifs employé et équipe ;
  - auto-évaluation managériale, sa synthèse et Monkey Management (CEO,
    directeurs et collaborateurs) ;
  - avis 360° Feedback / Forward sur les deux dernières campagnes ;
  - cohésion d'équipe : fiches des directions, avis des collaborateurs sur
    leur direction et sur l'organisation ;
  - Psychological Safety (PSI), relations d'équipe, cartes d'équipe ;
  - fiches Performance ID, plans d'action, téléphone de chaque compte.

Mêmes générateurs que les seeds Africa Insurance Group (niveaux hard, soft
et performance tirés indépendamment, objectifs dont la moyenne pondérée
redonne le score stocké) ; seul le contenu métier est propre à la banque.

Le CEO n'est évalué par personne : il n'a ni évaluation ID-3A ni fiche
d'objectifs. L'entreprise n'a pas de direction « comité de direction » : les
rubriques d'équipe portent sur les directions.

Relançable sans doublon, mais la relance RECONSTRUIT ces rubriques pour
l'entreprise : ce qui aurait été saisi entre-temps dans l'application est
écrasé. Seules les réponses PSI existantes sont conservées. Ne touche à
aucune autre entreprise.

Avec `--only CODE …`, seules les directions citées sont peuplées : leurs
membres, leurs fiches, leurs avis. Rien de ce qui appartient aux autres
directions ni au CEO n'est relu ou réécrit — c'est la voie pour ajouter une
direction à une entreprise où la saisie a commencé.

Usage:
    python manage.py seed_sunu_bank_senegal_rubriques
    python manage.py seed_sunu_bank_senegal_rubriques --only RH DJC MEC AUD DSP
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.actionplans.models import ActionPlan
from apps.core.management.commands import seed_africa_insurance_group as MAIN
from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands import seed_africa_insurance_group_self_assessments as SELF
from apps.core.management.commands import seed_psychological_safety as PSI
from apps.core.management.commands import seed_sunu_bank_senegal_portraits as PORTRAITS
from apps.core.management.commands.seed_africa_insurance_group_psi_360 import CONTINUE, IMPROVE, START, STOP, STRENGTHS
from apps.core.models import Company, Department, PerformanceProfile, User
from apps.evaluations.models import (
    Evaluation,
    EvaluationCampaign,
    Feedback360,
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

COMPANY_NAME = "SUNU Bank Sénégal"
CODES = ["DCO", "DRC", "DFC", "DOP", "DSI", "RH", "DJC", "MEC", "AUD", "DSP"]

# Dix savoir-faire par direction : le référentiel « hard » porte le nom du
# poste du directeur et sert de repli à tous les collaborateurs de sa direction.
HARD_SKILLS = {
    "DCO": [
        "Développement du portefeuille clients", "Vente de produits bancaires et de bancassurance",
        "Analyse des besoins de financement des PME", "Négociation commerciale et tarification",
        "Animation du réseau d'agences", "Gestion de la relation client (CRM)",
        "Montage des dossiers de crédit", "Connaissance du marché bancaire sénégalais",
        "Pilotage des objectifs commerciaux", "Banque digitale et mobile money",
    ],
    "DRC": [
        "Analyse et notation du risque de crédit", "Dispositif prudentiel BCEAO (Bâle II/III)",
        "Lutte anti-blanchiment (LAB/FT)", "Contrôle permanent et conformité",
        "Cartographie des risques opérationnels", "Suivi des engagements et provisionnement",
        "Connaissance client (KYC) et filtrage", "Risque de marché et de liquidité",
        "Relations avec la Commission Bancaire de l'UMOA", "Plan de continuité d'activité",
    ],
    "DFC": [
        "Comptabilité bancaire (PCB révisé)", "Reporting réglementaire BCEAO",
        "Contrôle de gestion et budget", "Gestion de trésorerie et ALM",
        "Fiscalité bancaire", "Consolidation et normes IFRS",
        "Arrêtés comptables mensuels", "Analyse de la rentabilité par agence",
        "Rapprochements bancaires et suspens", "Audit et contrôle interne comptable",
    ],
    "DOP": [
        "Traitement des opérations domestiques", "Opérations internationales et trade finance",
        "Monétique et moyens de paiement", "Gestion des back-offices crédit",
        "Systèmes de paiement UEMOA (STAR-UEMOA, SICA)", "Qualité et délais de traitement",
        "Gestion des réclamations clients", "Conservation et opérations sur titres",
        "Maîtrise des procédures opérationnelles", "Lutte contre la fraude sur les opérations",
    ],
    "DSI": [
        "Administration du système d'information bancaire", "Cybersécurité et gestion des accès",
        "Exploitation et supervision de la production", "Conduite de projets informatiques",
        "Intégration des canaux digitaux", "Bases de données et reporting décisionnel",
        "Réseaux et télécommunications des agences", "Gestion des incidents et support (ITIL)",
        "Plan de reprise d'activité informatique", "Conformité et sécurité monétique (PCI DSS)",
    ],
    "RH": [
        "Recrutement et intégration", "Gestion de la paie et administration du personnel",
        "Droit du travail sénégalais et convention collective des banques", "Gestion prévisionnelle des emplois et compétences",
        "Ingénierie de formation", "Politique de rémunération et avantages sociaux",
        "Dialogue social et relations avec les délégués", "Gestion des carrières et de la mobilité",
        "Système d'information RH et tableaux de bord sociaux", "Santé, sécurité et qualité de vie au travail",
    ],
    "DJC": [
        "Droit bancaire et réglementation UMOA", "Droit des sûretés (OHADA)",
        "Rédaction et validation des contrats", "Recouvrement amiable et judiciaire",
        "Gestion des procédures collectives", "Suivi des contentieux et des provisions",
        "Secrétariat juridique des organes sociaux", "Réalisation des garanties",
        "Veille juridique et réglementaire", "Pilotage des avocats et huissiers",
    ],
    "MEC": [
        "Étude de marché et segmentation clientèle", "Conception des offres et tarification",
        "Marketing digital et réseaux sociaux", "Mesure de la satisfaction client (NPS)",
        "Conception des parcours client", "Communication de marque et événementiel",
        "Gestion des réclamations et de la voix du client", "Animation commerciale et campagnes",
        "Analyse de données clients (CRM)", "Veille concurrentielle bancaire",
    ],
    "AUD": [
        "Conduite de missions d'audit interne", "Normes professionnelles de l'audit (IIA)",
        "Évaluation du contrôle interne", "Audit des agences et des caisses",
        "Audit des systèmes d'information", "Cartographie des risques et plan d'audit",
        "Rédaction des rapports et recommandations", "Suivi de la mise en œuvre des recommandations",
        "Détection de la fraude et investigations", "Relations avec la Commission Bancaire et les commissaires aux comptes",
    ],
    "DSP": [
        "Élaboration du plan stratégique", "Processus budgétaire et plan à moyen terme",
        "Pilotage de la performance et tableaux de bord", "Modélisation financière et simulations",
        "Analyse de la rentabilité par métier", "Études de marché et de développement du réseau",
        "Conduite des projets de transformation", "Reporting à la direction générale et au groupe",
        "Benchmark sectoriel bancaire", "Animation des comités de pilotage",
    ],
}

# Contenu de chaque direction, au format des directions d'Africa Insurance
# Group : vision, valeurs, réalisations, objectifs business (libellé,
# indicateur, cible, valeur de départ) et diplômes usuels.
R.DEPT.update({
    "DCO": dict(
        vision="Faire de SUNU Bank Sénégal la banque de référence des PME et des particuliers, par la proximité et la qualité du conseil.",
        values=["Proximité client", "Sens du conseil", "Réactivité", "Esprit de conquête"],
        counter=["Promesses non tenues", "Vente forcée", "Dossiers incomplets"],
        wins=["Ouverture de 6 agences à Dakar et en région", "Portefeuille PME en hausse de 18 %", "Lancement de l'offre bancassurance",
              "Convention avec trois grandes entreprises", "Collecte de dépôts au-dessus du budget"],
        fails=["Délais d'entrée en relation trop longs", "Taux d'attrition élevé sur les jeunes actifs",
               "Objectifs inégalement répartis entre agences", "Faible équipement des clients en produits digitaux"],
        biz=[("Encours de crédits à la clientèle (Mds FCFA)", "Encours net fin de période", 185, 142),
             ("Collecte de dépôts (Mds FCFA)", "Dépôts à vue et à terme", 240, 198),
             ("Nouveaux comptes ouverts", "Nombre d'entrées en relation", 12000, 8600)],
        qual=["Master Banque-Finance — CESAG Dakar", "Master Marketing — ISM Dakar", "Diplôme de l'ITB (Institut Technique de Banque)",
              "Licence Gestion commerciale — UCAD", "MBA — BEM Dakar"]),
    "DRC": dict(
        vision="Garantir une croissance maîtrisée de la banque, conforme aux exigences de la BCEAO et protectrice des déposants.",
        values=["Rigueur", "Indépendance", "Intégrité", "Anticipation"],
        counter=["Complaisance", "Avis rendus hors délai", "Contrôles de façade"],
        wins=["Taux de créances en souffrance ramené sous 6 %", "Dispositif LAB/FT validé par la Commission Bancaire",
              "Cartographie des risques opérationnels achevée", "Notation interne déployée sur les PME", "Plan de continuité testé avec succès"],
        fails=["Avis de crédit rendus avec retard", "Outil de filtrage partiellement paramétré",
               "Recommandations d'audit non clôturées", "Culture du risque inégale en agence"],
        biz=[("Taux de créances saines (%)", "Créances saines / encours brut", 95, 91),
             ("Avis de crédit rendus dans les délais (%)", "Avis sous 72 heures", 95, 74),
             ("Contrôles de conformité réalisés (%)", "Plan de contrôle exécuté", 100, 83)],
        qual=["Master Gestion des risques — CESAG Dakar", "Master Droit bancaire — UCAD", "Certification Compliance Officer (LAB/FT)",
              "Diplôme d'Études Supérieures Bancaires (DESB)", "Certification FRM"]),
    "DFC": dict(
        vision="Donner à la direction générale une information financière fiable, à temps, et une trésorerie sécurisée.",
        values=["Exactitude", "Transparence", "Prudence", "Respect des délais"],
        counter=["Approximations comptables", "Clôtures tardives", "Suspens non justifiés"],
        wins=["Arrêtés mensuels à J+5", "États réglementaires BCEAO sans rejet", "Commissariat aux comptes sans réserve",
              "Rentabilité par agence publiée chaque mois", "Coût des ressources abaissé de 30 points de base"],
        fails=["Suspens anciens sur les comptes de liaison", "Budget établi trop tardivement",
               "Dépendance à des tableurs manuels", "Rotation dans l'équipe comptable"],
        biz=[("Résultat net (M FCFA)", "Résultat net de l'exercice", 9000, 6800),
             ("Coefficient d'exploitation (score /100)", "Frais généraux / produit net bancaire", 90, 76),
             ("États réglementaires remis à temps (%)", "Respect du calendrier BCEAO", 100, 88)],
        qual=["Master Comptabilité-Contrôle-Audit — CESAG Dakar", "Diplôme d'Expertise Comptable (DECOFI)", "Master Finance — UCAD",
              "Certification IFRS", "Diplôme de l'ITB (Institut Technique de Banque)"]),
    "DOP": dict(
        vision="Traiter chaque opération juste du premier coup, dans les délais promis au client.",
        values=["Fiabilité", "Célérité", "Sens du service", "Discipline opérationnelle"],
        counter=["Opérations en instance", "Ressaisies", "Réclamations sans réponse"],
        wins=["Délai des virements internationaux ramené à 24 h", "Centralisation des back-offices crédit",
              "Taux de disponibilité des GAB de 97 %", "Dématérialisation des remises de chèques", "Réclamations traitées sous 5 jours"],
        fails=["Pics d'instances en fin de mois", "Fraude monétique détectée tardivement",
               "Procédures non mises à jour", "Polyvalence insuffisante des équipes"],
        biz=[("Opérations traitées sans erreur (%)", "Taux de traitement juste du premier coup", 99, 94),
             ("Délai de traitement des opérations (score /100)", "Indice de célérité", 90, 71),
             ("Réclamations résolues dans les délais (%)", "Réclamations closes sous 5 jours", 95, 78)],
        qual=["Diplôme de l'ITB (Institut Technique de Banque)", "Master Banque-Finance — CESAG Dakar", "BTS Banque",
              "Licence Gestion — UGB Saint-Louis", "Certification Lean Six Sigma"]),
    "DSI": dict(
        vision="Offrir à la banque et à ses clients un système d'information sûr, disponible et tourné vers le digital.",
        values=["Fiabilité", "Sécurité", "Innovation", "Sens du service aux métiers"],
        counter=["Mises en production non testées", "Documentation absente", "Travail en silo"],
        wins=["Migration du système bancaire central réussie", "Application mobile lancée",
              "Interconnexion au switch monétique régional (GIM-UEMOA)", "Site de secours opérationnel", "Centre de supervision 24 h/24"],
        fails=["Incidents de production en fin de mois", "Projets livrés avec retard",
               "Dépendance à un éditeur unique", "Postes de travail vieillissants en agence"],
        biz=[("Disponibilité du système bancaire (%)", "Taux de disponibilité mensuel", 99, 96),
             ("Projets livrés dans les délais (%)", "Respect des jalons", 90, 64),
             ("Incidents résolus dans les délais (%)", "Respect des engagements de service", 95, 80)],
        qual=["Ingénieur Informatique — École Supérieure Polytechnique de Dakar", "Master Systèmes d'information — UGB Saint-Louis",
              "Certification ITIL v4", "Certification CISSP", "Certification PMP"]),
    "RH": dict(
        vision="Attirer, développer et fidéliser les talents dont la banque a besoin pour sa croissance.",
        values=["Équité", "Écoute", "Développement", "Confidentialité"],
        counter=["Favoritisme", "Absence de feedback", "Opacité des promotions"],
        wins=["Cartographie des compétences achevée", "Académie interne lancée", "Turnover réduit de 4 points",
              "Paie fiabilisée sans réclamation majeure", "Baromètre social annuel mis en place"],
        fails=["Recrutements longs sur les profils informatiques", "Entretiens annuels tenus en retard",
               "Plan de formation réalisé aux deux tiers", "Relève des postes clés peu préparée"],
        biz=[("Réalisation du plan de formation (%)", "Formations réalisées / prévues", 100, 68),
             ("Rétention des talents (score /100)", "Indice de rétention", 92, 81),
             ("Délai moyen de recrutement (score /100)", "Indice de célérité", 85, 62)],
        qual=["Master Gestion des Ressources Humaines — CESAG Dakar", "Master Droit social — UCAD",
              "Certification en droit du travail OHADA", "Coach professionnel certifié", "Licence Psychologie du travail"]),
    "DJC": dict(
        vision="Sécuriser juridiquement l'activité de la banque et recouvrer ses créances dans le respect du droit.",
        values=["Rigueur", "Intégrité", "Sens du conseil", "Fermeté"],
        counter=["Avis rendus hors délai", "Juridisme bloquant", "Dossiers laissés sans suite"],
        wins=["Taux de recouvrement contentieux en hausse", "Modèles de contrats de crédit refondus",
              "Garanties inscrites dans les délais légaux", "Panel d'avocats renégocié", "Stock de dossiers anciens réduit d'un tiers"],
        fails=["Délais de validation de certaines conventions", "Garanties incomplètes sur d'anciens dossiers",
               "Procédures longues devant les tribunaux", "Archivage des actes encore papier"],
        biz=[("Créances contentieuses recouvrées (M FCFA)", "Encaissements sur dossiers contentieux", 4200, 2900),
             ("Avis juridiques rendus dans les délais (%)", "Avis sous 5 jours ouvrés", 95, 76),
             ("Garanties régulièrement inscrites (%)", "Sûretés conformes / sûretés prises", 100, 87)],
        qual=["Master Droit des affaires — UCAD", "Master Droit bancaire et financier", "Master Droit OHADA — Université Gaston Berger",
              "Certificat d'aptitude à la profession d'avocat (CAPA)", "Diplôme de l'ITB (Institut Technique de Banque)"]),
    "MEC": dict(
        vision="Placer l'expérience client au centre de chaque produit, canal et parcours de la banque.",
        values=["Écoute client", "Créativité", "Simplicité", "Engagement"],
        counter=["Discours sans action", "Complexité inutile", "Indifférence aux réclamations"],
        wins=["Refonte de l'identité de marque", "Parcours d'ouverture de compte simplifié", "Indice de recommandation en hausse de 9 points",
              "Campagne épargne jeunes réussie", "Programme de fidélité lancé"],
        fails=["Campagne digitale sous-performante", "Enquête de satisfaction mal ciblée",
               "Réponses tardives sur les réseaux sociaux", "Budget média inégalement réparti"],
        biz=[("Indice de recommandation client (NPS)", "NPS annuel", 50, 36),
             ("Clients actifs sur les canaux digitaux", "Nombre de clients actifs sur mobile et web", 45000, 31000),
             ("Réclamations traitées dans les délais (%)", "Réclamations closes sous 5 jours", 95, 79)],
        qual=["Master Marketing — ISM Dakar", "Master Communication — CESTI", "Certification Google Analytics",
              "MBA — BEM Dakar", "Licence Gestion commerciale — UCAD"]),
    "AUD": dict(
        vision="Donner au conseil d'administration une assurance indépendante sur la maîtrise des risques de la banque.",
        values=["Indépendance", "Objectivité", "Rigueur", "Confidentialité"],
        counter=["Complaisance", "Constats sans preuve", "Recommandations sans suivi"],
        wins=["Plan d'audit annuel réalisé à 95 %", "Toutes les agences auditées en deux ans", "Suivi des recommandations outillé",
              "Mission informatique menée en interne", "Charte d'audit révisée et approuvée"],
        fails=["Rapports diffusés avec retard", "Recommandations anciennes non clôturées",
               "Compétences limitées en audit informatique", "Couverture insuffisante des filiales de services"],
        biz=[("Réalisation du plan d'audit (%)", "Missions réalisées / planifiées", 100, 82),
             ("Recommandations mises en œuvre (%)", "Recommandations closes dans les délais", 90, 64),
             ("Rapports émis dans les délais (%)", "Rapport définitif sous 30 jours", 95, 71)],
        qual=["Master Audit et Contrôle de gestion — CESAG Dakar", "Certified Internal Auditor (CIA)", "Diplôme d'Expertise Comptable (DECOFI)",
              "Certification CISA", "Diplôme de l'ITB (Institut Technique de Banque)"]),
    "DSP": dict(
        vision="Éclairer les choix de la direction générale par un plan stratégique clair et un pilotage fiable de la performance.",
        values=["Anticipation", "Objectivité", "Clarté", "Fiabilité"],
        counter=["Chiffres non réconciliés", "Réunions sans décision", "Tableaux illisibles"],
        wins=["Plan stratégique 2026-2030 adopté", "Budget bouclé en six semaines", "Tableau de bord mensuel de la direction générale",
              "Prévision glissante sur douze mois", "Étude d'implantation de quatre agences"],
        fails=["Écarts budgétaires expliqués tardivement", "Hypothèses de croissance trop optimistes",
               "Outil de pilotage peu adopté par les métiers", "Projets de transformation en retard"],
        biz=[("Précision du budget (%)", "Écart budget / réalisé", 97, 88),
             ("Tableaux de bord livrés à l'heure (%)", "Respect du calendrier de reporting", 100, 79),
             ("Projets stratégiques tenus dans les délais (%)", "Respect des jalons", 90, 61)],
        qual=["Master Contrôle de gestion — CESAG Dakar", "MBA — BEM Dakar", "Master Finance d'entreprise — UCAD",
              "Certification PMP", "Certification Power BI"]),
})
# Climat de cohésion ressenti par l'équipe, et écart de la note que la
# direction se donne sur sa propre fiche (voir le module d'origine).
R.CLIMATE.update({"DCO": 3.8, "DRC": 4.1, "DFC": 3.5, "DOP": 2.9, "DSI": 3.4,
                  "RH": 3.2, "DJC": 3.7, "MEC": 4.0, "AUD": 3.6, "DSP": 3.1})
R.SELF_GAP.update({"DCO": 0.3, "DRC": -0.2, "DFC": 0.5, "DOP": 1.0, "DSI": 0.2,
                   "RH": 0.8, "DJC": 0.1, "MEC": 0.4, "AUD": -0.3, "DSP": 0.6})

PREV_POSITIONS = [
    "Chargé de clientèle — banque de détail", "Analyste crédit — établissement de microfinance",
    "Auditeur junior — cabinet d'audit", "Gestionnaire back-office — banque régionale",
    "Conseiller financier — compagnie d'assurance", "Caissier principal — agence bancaire",
    "Contrôleur de gestion — groupe industriel", "Technicien support — opérateur télécom",
]
MOTIVATES = [
    "Voir son équipe progresser", "Résoudre des problèmes complexes", "La reconnaissance du travail bien fait",
    "Apprendre en continu", "Accompagner les projets des clients", "Contribuer à la croissance de la banque",
]
PRIORITIES_BUSINESS = [
    "Sécuriser les objectifs de production", "Réduire les délais de traitement", "Digitaliser les processus clés",
    "Fidéliser les clients stratégiques", "Maîtriser le coût du risque", "Optimiser les coûts de fonctionnement",
]
PERSONAL_PROJECTS = [
    "Financer les études des enfants et construire à Thiès",
    "Reprendre un Master en cours du soir",
    "Développer une activité agricole familiale",
    "Enseigner en vacation à l'université",
]


class Command(BaseCommand):
    help = "Peuple toutes les rubriques de SUNU Bank Sénégal sur ses quatre campagnes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--only", nargs="+", metavar="CODE",
            help="Ne peuple que ces directions (codes), sans toucher aux autres ni au CEO.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        only = [code.upper() for code in options["only"] or []]
        unknown = [code for code in only if code not in CODES]
        if unknown:
            raise CommandError(f"Directions inconnues : {', '.join(unknown)}. Codes possibles : {', '.join(CODES)}.")
        self.partial = bool(only)
        # `self.codes` : les directions à peupler. L'ensemble des directions
        # reste lu (`CODES`) : les pairs d'un directeur sont tous les autres.
        self.codes = [code for code in CODES if code in only] if only else list(CODES)
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable — lancez d'abord seed_sunu_bank_senegal.")
        self.company = company
        self.ceo = User.objects.filter(company=company, role=User.Role.COMPANY_ADMIN).first()
        self.campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if self.ceo is None or len(self.campaigns) != len(R.CAMPAIGN_SHIFTS):
            raise CommandError(
                f"CEO et {len(R.CAMPAIGN_SHIFTS)} campagnes attendus ({len(self.campaigns)} trouvées) — "
                "lancez d'abord seed_sunu_bank_senegal."
            )
        self.depts = {d.code: d for d in Department.objects.filter(company=company).select_related("manager")}
        missing = [code for code in CODES if code not in self.depts or self.depts[code].manager is None]
        if missing:
            raise CommandError(f"Directions ou directeurs introuvables : {', '.join(missing)} — lancez d'abord seed_sunu_bank_senegal.")
        self.directors = {code: self.depts[code].manager for code in CODES}
        self.staff = {
            code: sorted(
                User.objects.filter(company=company, department=self.depts[code], role=User.Role.MEMBER),
                key=lambda u: int(u.generated_login[3:]),
            )
            for code in CODES
        }
        short = [code for code in CODES if len(self.staff[code]) < 4]
        if short:
            raise CommandError(f"Directions sans collaborateurs en nombre suffisant : {', '.join(short)}.")
        self.evaluated = [person for code in self.codes for person in [self.directors[code]] + self.staff[code]]
        # Le CEO n'entre dans le périmètre que lorsque toute l'entreprise est peuplée.
        self.everyone = ([] if self.partial else [self.ceo]) + self.evaluated
        self.teams = [self.depts[code] for code in self.codes]
        self.today = date.today()
        # Jour de dépôt des fiches et avis datés : dans la fenêtre de la campagne.
        self.deposit = {c.pk: max(min(self.today, c.end_date), c.start_date) for c in self.campaigns}

        self._phones()
        evaluations = self._evaluations()
        self._skill_notes(evaluations)
        self._objectives(evaluations)
        self._self_assessments()
        self._feedback_360()
        self._cohesion()
        self._relationships()
        self._team_boards()
        self._profiles()
        self._action_plans()
        # Ne crée que les réponses manquantes : sans effet sur les directions déjà peuplées.
        PSI.Command(stdout=self.stdout, stderr=self.stderr).seed(company)
        self.stdout.write(self.style.SUCCESS(
            f"\nTerminé — {company.name} : {len(self.evaluated)} personnes évaluées sur {len(self.campaigns)} campagnes."
        ))

    # -- comptes ---------------------------------------------------------
    def _phones(self):
        for user in self.everyone:
            if not user.phone:
                rng = random.Random(f"sbs-phone-{user.generated_login}")
                user.phone = f"+221 77 {rng.randint(100, 999)} {rng.randint(10, 99)} {rng.randint(10, 99)}"
                user.save(update_fields=["phone"])

    # -- évaluations -----------------------------------------------------
    def _evaluations(self):
        gen = MAIN.Command()
        for code in self.codes:
            dept, director = self.depts[code], self.directors[code]
            hard_items, soft_items = gen._matrices(self.company, dept, director.position, HARD_SKILLS[code])
            gen.rng = random.Random(f"sbs-evaluations-{code}")
            for campaign in self.campaigns:
                gen._evaluate_person(campaign, director, self.ceo, hard_items, soft_items)
                for person in self.staff[code]:
                    gen._evaluate_person(campaign, person, director, hard_items, soft_items)
        evaluations = list(
            Evaluation.objects.filter(user__in=self.evaluated).select_related("user__department", "campaign", "evaluator")
        )
        self.stdout.write(f"Évaluations ID-3A : {len(evaluations)}")
        return evaluations

    def _skill_notes(self, evaluations):
        notes = []
        for ev in evaluations:
            groups = {"HARD": [], "SOFT": []}
            for s in ev.skill_scores.select_related("skill_item__matrix"):
                if s.score is not None:
                    groups[s.skill_item.matrix.type].append((s.score, s.skill_item.name))
            for kind in ("HARD", "SOFT"):
                ordered = sorted(groups[kind], key=lambda t: (-t[0], t[1]))
                for cat, lst in ((f"{kind}_STRENGTH", ordered[:5]), (f"{kind}_WEAKNESS", list(reversed(ordered[-5:])))):
                    for order, (score, name) in enumerate(lst, start=1):
                        notes.append(SkillNote(evaluation=ev, category=cat, order=order, text=name[:255], score=score))
        SkillNote.objects.filter(evaluation__in=evaluations).delete()
        SkillNote.objects.bulk_create(notes)
        self.stdout.write(f"Forces & faiblesses : {len(notes)} lignes")

    def _objectives(self, evaluations):
        rub = R.Command()
        director_ids = {d.pk for d in self.directors.values()}
        PerformanceObjective.objects.filter(evaluation__in=evaluations).delete()
        PerformanceObjective.objects.filter(team__in=self.teams).delete()
        lines = []
        for ev in evaluations:
            rng = random.Random(f"sbs-obj-{ev.user.generated_login}-{ev.campaign.name}")
            lines += rub._make_lines({"evaluation": ev}, ev.user.department.code, ev.business_objectives_score,
                                     ev.people_objectives_score, ev.user_id in director_ids, rng)
            # En-tête de la fiche annuelle : trois dates du cycle et visa.
            camp = ev.campaign
            evaluated = min(self.today, max(camp.start_date + timedelta(days=30), camp.end_date - timedelta(days=12)))
            ev.objectives_set_on = camp.start_date + timedelta(days=14 + rng.randint(0, 10))
            ev.evaluated_on = evaluated
            ev.next_evaluation_on = evaluated + timedelta(days=365 if camp.end_date - camp.start_date > timedelta(days=200) else 182)
            ev.manager_visa = f"{(ev.evaluator or self.ceo).get_full_name()} — visé le {evaluated.strftime('%d/%m/%Y')}"
            ev.save(update_fields=["objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa"])
        PerformanceObjective.objects.bulk_create(lines)
        for ev in evaluations:
            recompute_evaluation_scores(ev)  # l'Altitude suit les objectifs saisis
        team_lines = []
        for code in self.codes:
            for campaign in self.campaigns:
                group = list(Evaluation.objects.filter(user__in=self.staff[code], campaign=campaign))
                business = sum(float(e.business_objectives_score) for e in group) / len(group)
                people = sum(float(e.people_objectives_score) for e in group) / len(group)
                rng = random.Random(f"sbs-tobj-{code}-{campaign.name}")
                team_lines += rub._make_lines({"team": self.depts[code], "campaign_id": campaign.pk}, code,
                                              round(business, 1), round(people, 1), True, rng)
        PerformanceObjective.objects.bulk_create(team_lines)
        self.stdout.write(f"Objectifs : {len(lines)} lignes employés, {len(team_lines)} lignes équipes")

    def _self_assessments(self):
        maker = SELF.Command()
        for user in self.everyone:
            maker.rng = random.Random(f"sbs-self-{user.generated_login}")
            for campaign in self.campaigns:
                for category in SELF.CATEGORIES:
                    maker._managerial(user, campaign, category)
                maker._monkey(user, campaign)
                rows = list(ManagerialSelfAssessment.objects.filter(user=user, campaign=campaign))
                ordered = sorted(rows, key=lambda r: (-(r.ic_score or 0), r.category))
                ManagerialSynthesis.objects.update_or_create(
                    user=user, campaign=campaign,
                    defaults={
                        "key_skills": [R.STRONG[r.category] for r in ordered[:3]],
                        "improvement_areas": [R.WEAK[r.category] for r in reversed(ordered[-3:])],
                    },
                )
        self.stdout.write(f"Auto-évaluation managériale, synthèse et Monkey Management : {len(self.everyone)} personnes")

    def _feedback_360(self):
        """CEO : lui-même et ses cinq directeurs. Directeur : lui-même, le CEO,
        trois autres directeurs, trois de ses collaborateurs. Collaborateur :
        lui-même, son directeur, trois collègues de sa direction."""
        directors = list(self.directors.values())
        Feedback360.objects.filter(subject__in=self.everyone).delete()
        rows = []
        for campaign in self.campaigns[-2:]:
            # Tirage propre à la campagne et, en peuplement partiel, aux
            # directions visées : il ne rejoue pas celui des autres.
            r = random.Random(f"sbs-360-{campaign.name}" + (f"-{'-'.join(self.codes)}" if self.partial else ""))
            circles = [] if self.partial else [(self.ceo, [(self.ceo, "SELF")] + [(d, "REPORT") for d in directors])]
            for code in self.codes:
                director, staff = self.directors[code], self.staff[code]
                circles.append((director, [(director, "SELF"), (self.ceo, "MANAGER")]
                                + [(p, "PEER") for p in r.sample([d for d in directors if d.pk != director.pk], 3)]
                                + [(m, "REPORT") for m in r.sample(staff, 3)]))
                for member in staff:
                    colleagues = r.sample([o for o in staff if o.pk != member.pk], 3)
                    circles.append((member, [(member, "SELF"), (director, "MANAGER")] + [(o, "PEER") for o in colleagues]))
            for subject, authors in circles:
                for author, rel in authors:
                    rows.append(Feedback360(
                        company=self.company, campaign=campaign, subject=subject, author=author, kind="FEEDBACK", relation=rel,
                        scores=[max(1, min(5, round(r.gauss(3.8 + (0.2 if rel == "SELF" else 0), 0.7)))) for _ in range(6)],
                        text_a=r.choice(STRENGTHS), text_b=r.choice(IMPROVE)))
                    rows.append(Feedback360(
                        company=self.company, campaign=campaign, subject=subject, author=author, kind="FORWARD", relation=rel,
                        text_a=r.choice(START), text_b=r.choice(STOP), text_c=r.choice(CONTINUE)))
        Feedback360.objects.bulk_create(rows)
        self.stdout.write(f"Avis 360° : {len(rows)}")

    # -- équipes ---------------------------------------------------------
    def _cohesion(self):
        rub = R.Command()
        CohesionResponse.objects.filter(company=self.company, respondent__in=self.everyone).delete()
        TeamCohesionAnalysis.objects.filter(team__in=self.teams).delete()
        sheets = team_count = org_count = 0
        for code in self.codes:
            dept = self.depts[code]
            labels = rub._labels(dept.name)
            members = [self.directors[code]] + self.staff[code]
            for i, camp in enumerate(self.campaigns):
                # Fiche de la direction : la note qu'elle se donne (ICE), son
                # objectif (OCE) et le réalisé, critère par critère.
                rng = random.Random(f"sbs-sheet-{code}-{camp.name}")
                base = R.CLIMATE[code] + R.CAMPAIGN_SHIFTS[i] + R.SELF_GAP[code]
                sheet = TeamCohesionAnalysis.objects.create(team=dept, date=self.deposit[camp.pk])
                rows = []
                for label, level in zip(labels, rub._levels(base)):
                    ice = R._clamp_score(level + rng.gauss(0, 0.35))
                    objective = round(min(5.0, max(ice + 0.5, 4.0 + rng.choice([0, 0.5]))), 1)
                    achieved = round(min(5.0, max(1.0, (ice + objective) / 2 - 0.2 + rng.gauss(0, 0.2))), 1)
                    rows.append(CohesionCriterionScore(analysis=sheet, criterion=label, score=ice,
                                                       objective_score=objective, achieved_score=achieved))
                CohesionCriterionScore.objects.bulk_create(rows)
                sheet.ice_score = round(sum(row.score for row in rows) / len(rows), 1)
                sheet.oce_score = round(sum(float(row.objective_score) for row in rows) / len(rows), 1)
                sheet.notes = f"Fiche de cohésion {camp.name} — {dept.name}."
                sheet.save(update_fields=["ice_score", "oce_score", "notes"])
                sheets += 1
                # Avis des membres sur leur direction : un ou deux s'abstiennent.
                rng = random.Random(f"sbs-resp-{code}-{camp.name}")
                shuffled = list(members)
                rng.shuffle(shuffled)
                for respondent in shuffled[: max(4, len(shuffled) - rng.choice([0, 0, 1, 2]))]:
                    base = R.CLIMATE[code] + R.CAMPAIGN_SHIFTS[i] + rng.gauss(0, 0.6)
                    scores = [{"criterion": label, "score": R._clamp_score(level + rng.gauss(0, 0.5))}
                              for label, level in zip(labels, rub._levels(base))]
                    CohesionResponse.objects.create(
                        scope=CohesionResponse.Scope.TEAM, team=dept, company=self.company,
                        respondent=respondent, date=self.deposit[camp.pk], scores=scores,
                    )
                    team_count += 1
        labels = rub._labels(self.company.name)
        for i, camp in enumerate(self.campaigns):
            rng = random.Random(f"sbs-org-{camp.name}" + (f"-{'-'.join(self.codes)}" if self.partial else ""))
            users = list(self.everyone)
            rng.shuffle(users)
            for respondent in users[: round(len(users) * R.ORG_PARTICIPATION[i])]:
                base = 3.3 + R.CAMPAIGN_SHIFTS[i] + rng.gauss(0, 0.6)
                scores = [{"criterion": label, "score": R._clamp_score(level + rng.gauss(0, 0.5))}
                          for label, level in zip(labels, rub._levels(base))]
                CohesionResponse.objects.create(
                    scope=CohesionResponse.Scope.ORGANISATION, company=self.company, team=None,
                    respondent=respondent, date=self.deposit[camp.pk], scores=scores,
                )
                org_count += 1
        self.stdout.write(f"Cohésion : {sheets} fiches de direction, {team_count} avis sur sa direction, {org_count} avis sur l'organisation")

    def _relationships(self):
        TeamRelationship.objects.filter(team__in=self.teams).delete()
        rows = []
        for code in self.codes:
            people = sorted([self.directors[code]] + self.staff[code], key=lambda u: u.id)
            rng = random.Random(f"sbs-rel-{code}")
            good = min(0.85, max(0.25, (R.CLIMATE[code] - 2.0) / 2.5))
            for a in range(len(people)):
                for b in range(a + 1, len(people)):
                    r = rng.random()
                    if r < good * 0.55:
                        quality = "EXCELLENT"
                    elif r < good + 0.2:
                        quality = "CORRECT"
                    elif r < 0.93:
                        quality = "DIFFICULT"
                    else:
                        quality = "TOXIC"
                    rows.append(TeamRelationship(team=self.depts[code], from_user=people[a], to_user=people[b], quality=quality))
        TeamRelationship.objects.bulk_create(rows)
        self.stdout.write(f"Relations d'équipe : {len(rows)}")

    def _team_boards(self):
        count = 0
        for code in self.codes:
            dept, spec = self.depts[code], R.DEPT[code]
            rng = random.Random(f"sbs-board-{code}")
            base = rng.choice([180, 260, 340, 420, 520])
            growth = 1.06 + rng.random() * 0.06
            for camp in self.campaigns:
                year = self.deposit[camp.pk].year
                target_series = {y: round(base * growth ** (y - 2022), 1) for y in range(2019, year + 4)}
                srng = random.Random(f"sbs-series-{code}")
                actuals = {y: round(target_series[y] * (0.86 + srng.random() * 0.2), 1) for y in range(2019, year + 1)}
                pick = random.Random(f"sbs-pick-{code}-{camp.name}")
                TeamBoard.objects.update_or_create(
                    team=dept, date=self.deposit[camp.pk],
                    defaults=dict(
                        people_strengths=pick.sample(R.PEOPLE_STRENGTHS, 3), people_weaknesses=pick.sample(R.PEOPLE_WEAKNESSES, 3),
                        business_strengths=pick.sample(R.BUSINESS_STRENGTHS, 3), business_weaknesses=pick.sample(R.BUSINESS_WEAKNESSES, 3),
                        catalysts=pick.sample(R.CATALYSTS, 5), nourishers=pick.sample(R.NOURISHERS, 5),
                        inhibitors=pick.sample(R.INHIBITORS, 5), toxins=pick.sample(R.TOXINS, 5),
                        vision_missions=spec["vision"], values=spec["values"], counter_values=spec["counter"],
                        achievements=spec["wins"], failures_lessons=spec["fails"],
                        objectives=[b[0] for b in spec["biz"]],
                        priorities_cohesion=pick.sample(R.PRIORITIES_COHESION, 5), priorities_business=pick.sample(PRIORITIES_BUSINESS, 5),
                        targets_vs_actuals=[{"year": str(y), "target": target_series[y], "actual": actuals[y]}
                                            for y in range(year - 3, year + 1)],
                        objectives_plan=[{"year": str(y), "target": target_series[y], "actual": None}
                                         for y in range(year + 1, year + 4)],
                    ),
                )
                count += 1
        self.stdout.write(f"Cartes d'équipe : {count}")

    # -- fiches individuelles ---------------------------------------------
    def _profiles(self):
        latest = self.campaigns[-1]
        evals = {e.user_id: e for e in Evaluation.objects.filter(campaign=latest, user__in=self.evaluated)}
        # Le genre suit le portrait attribué : femmes et hommes alternent dans
        # l'ordre des logins de `seed_sunu_bank_senegal_portraits`.
        female = {login for index, login in enumerate(PORTRAITS.LOGINS) if index % 2 == 1}
        for user in self.everyone:
            r = random.Random(f"sbs-profile-{user.generated_login}")
            ev = evals.get(user.pk)
            spec = R.DEPT[user.department.code] if user.department else None
            start_year = user.career_start_date.year if user.career_start_date else 2005
            is_leader = user.role != User.Role.MEMBER

            def pick(pool, k):
                return r.sample(pool, min(k, len(pool)))

            scope = f"de la {user.department.name}" if user.department else f"de {self.company.name}"
            PerformanceProfile.objects.update_or_create(user=user, defaults=dict(
                gender="Femme" if user.generated_login.upper() in female else "Homme",
                contract_type="CDI" if is_leader or r.random() < 0.9 else "CDD",
                performance_pct=f"{ev.altitude_percentage}" if ev else "",
                performer_category=ev.performance_rating if ev else "",
                qualifications=pick(spec["qual"] if spec else ["MBA — BEM Dakar", "Master Banque-Finance — CESAG Dakar", "Executive Education — HEC Paris"], 3),
                previous_positions=r.sample(PREV_POSITIONS, 2),
                previous_position_dates=[str(start_year + r.randint(1, 5)), str(start_year + r.randint(6, 11))],
                professional_achievements=pick(spec["wins"] if spec else R.PROF_ACHIEVEMENTS, 3),
                personal_achievements=pick(R.PERS_ACHIEVEMENTS, 2),
                vision_aspirations=f"Contribuer durablement à la performance {scope} et transmettre son savoir.",
                personal_projects=r.choice(PERSONAL_PROJECTS),
                professional_role_models=pick(R.ROLE_MODELS, 2), role_models_in_life=pick(R.LIFE_MODELS, 2),
                dislikes=pick(R.DISLIKES, 2), motivates=pick(MOTIVATES, 3), personality_traits=pick(R.TRAITS, 3),
                hobbies=pick(R.HOBBIES, 2), bono_hat=r.choice(R.BONO_HATS),
                brings_to_team=pick(R.NOURISHERS, 3), brings_to_manager=pick(["Loyauté", "Fiabilité", "Force de proposition", "Remontée d'information"], 2),
                expects_from_team=pick(["Transparence", "Entraide", "Respect des délais"], 2),
                expects_from_manager=pick(["Feedback régulier", "Autonomie", "Clarté des priorités"], 2),
                dev_priorities=pick(R.DEV_PRIORITIES, 3), dev_professional_perspectives=pick(R.DEV_PERSPECTIVES, 2),
                dev_actions_support=pick(R.DEV_SUPPORT, 2), dev_risks_obstacles=pick(R.DEV_RISKS, 2),
            ))
        self.stdout.write(f"Fiches Performance ID : {len(self.everyone)}")

    def _action_plans(self):
        rub = R.Command()
        ActionPlan.objects.filter(team__in=self.teams).delete()
        latest = self.campaigns[-1]
        evals = {e.user_id: e for e in Evaluation.objects.filter(campaign=latest, user__in=self.evaluated)}
        weaknesses = {}
        for note in SkillNote.objects.filter(evaluation__in=evals.values(), category__in=["HARD_WEAKNESS", "SOFT_WEAKNESS"]).select_related("evaluation"):
            kind = "HARD" if note.category == "HARD_WEAKNESS" else "SOFT"
            weaknesses.setdefault(note.evaluation.user_id, {}).setdefault(kind, []).append((note.order, note.text, note.score))
        for by_kind in weaknesses.values():
            for kind in by_kind:
                by_kind[kind] = [(text, score) for _, text, score in sorted(by_kind[kind])]
        rows = []
        start = date(2026, 10, 1)
        statuses = ["DONE", "IN_PROGRESS", "TODO", "IN_PROGRESS"]
        for code in self.codes:
            dept, director = self.depts[code], self.directors[code]
            # Plan de développement du directeur, posé par le CEO.
            rows += rub._dev_rows(self.ceo, dept, director, weaknesses.get(director.pk, {}), 2, 3, start, self.ceo.get_full_name())
            # Les deux collaborateurs les moins bien notés : plan posé par leur directeur.
            lowest = sorted(self.staff[code], key=lambda m: float(evals[m.pk].altitude_percentage))[:2]
            for member in lowest:
                rows += rub._dev_rows(director, dept, member, weaknesses.get(member.pk, {}), 1, 2, start, director.get_full_name())
            # Grille d'équipe posée par le directeur.
            team_weak = {"HARD": [(b, Decimal("3.0")) for b in R.BUSINESS_WEAKNESSES[:3]],
                         "SOFT": [(p, Decimal("3.0")) for p in R.PEOPLE_WEAKNESSES[:3]]}
            rows += rub._dev_rows(director, dept, None, team_weak, 1, 3, start, director.get_full_name())
            # Plans libres : quatre par direction, statuts variés.
            rng = random.Random(f"sbs-free-{code}")
            for k, (category, priority, objective, cost) in enumerate(R.FREE_PLAN_TEMPLATES):
                begin = date(2026, 3, 1) + timedelta(days=45 * k)
                rows.append(ActionPlan(
                    manager=director, team=dept, target_user=None, category=category, priority=priority,
                    objective=objective, baseline="3.0", target="4.0", cost=cost, status=statuses[k],
                    start_date=begin, due_date=begin + timedelta(days=60 + rng.randint(0, 30)),
                    responsible=director.get_full_name(), eval_note="Suivi mensuel",
                ))
        ActionPlan.objects.bulk_create(rows)
        self.stdout.write(f"Plans d'action : {len(rows)}")
