"""Peuple l'eNPS d'entreprises de démonstration : une réponse (note de 0 à 10 et
commentaire) pour environ 80 % des collaborateurs, sur chaque campagne.

Chaque direction a sa propre « humeur » et l'adhésion progresse légèrement de
campagne en campagne, pour que les écrans et les rapports aient quelque chose à
montrer (écarts entre directions, évolution, commentaires variés). Le tirage
est déterministe par entreprise : relancer la commande donne le même résultat.

    python manage.py seed_enps pmc-demo sunu-re
    python manage.py seed_enps pmc-demo --reset      # efface puis recrée

Ne jamais l'utiliser sur un client réel : les réponses sont fictives.
"""
import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import EnpsResponse

PROMOTER_REASONS = [
    "L'ambiance d'équipe est excellente et on se sent soutenu au quotidien.",
    "Les projets sont motivants et j'apprends beaucoup.",
    "Mon manager est à l'écoute et me fait confiance.",
    "Je suis fier des valeurs de l'entreprise et de son image auprès des clients.",
    "Les formations proposées m'ont permis de progresser rapidement.",
    "On me laisse de l'autonomie et mes initiatives sont reconnues.",
    "La direction communique clairement sur la stratégie et les résultats.",
    "Les conditions de travail sont bonnes et l'équilibre vie pro / vie perso est respecté.",
]
PROMOTER_IMPROVEMENTS = [
    "Un peu plus de télétravail rendrait l'expérience parfaite.",
    "Des parcours de carrière plus lisibles me feraient la recommander encore davantage.",
    "Davantage d'échanges entre directions seraient un plus.",
    "Mieux célébrer les réussites collectives renforcerait encore l'engagement.",
    "Moderniser certains outils informatiques serait bienvenu.",
    "Ouvrir plus de mobilités internes donnerait encore plus envie de rester.",
]
PASSIVE_REASONS = [
    "L'environnement est correct, mais la charge de travail est mal répartie.",
    "J'apprécie mon équipe, mais les perspectives d'évolution restent floues.",
    "Le travail est intéressant, mais la rémunération est en dessous du marché.",
    "Les relations sont bonnes, mais les décisions mettent trop de temps à être prises.",
    "C'est un bon employeur, sans plus : peu de reconnaissance du travail accompli.",
    "Les conditions sont satisfaisantes, mais la communication interne manque de clarté.",
    "J'aime mes missions, mais les outils de travail sont vieillissants.",
]
PASSIVE_IMPROVEMENTS = [
    "Une revue des rémunérations changerait ma note.",
    "Des entretiens de carrière réguliers m'inciteraient à recommander davantage.",
    "Simplifier les circuits de validation améliorerait beaucoup le quotidien.",
    "Plus de reconnaissance de la part de la hiérarchie ferait la différence.",
    "Mieux répartir la charge de travail entre les équipes.",
    "Être davantage associé aux décisions qui concernent mon service.",
]
DETRACTOR_REASONS = [
    "Je ne me sens pas reconnu pour le travail fourni.",
    "La charge de travail est trop lourde et les effectifs insuffisants.",
    "Le management est trop directif et laisse peu de place à l'initiative.",
    "La rémunération ne suit pas l'évolution des responsabilités.",
    "Les processus sont lourds et les décisions très lentes.",
    "Le manque de communication crée des tensions entre les services.",
    "Je ne vois aucune perspective d'évolution à moyen terme.",
]
DETRACTOR_IMPROVEMENTS = [
    "Il faudrait une vraie politique de reconnaissance et de promotion interne.",
    "Renforcer les équipes et prioriser les dossiers soulagerait tout le monde.",
    "Former les managers à l'écoute et au feedback changerait beaucoup de choses.",
    "Une grille salariale transparente redonnerait confiance.",
    "Alléger les procédures et déléguer davantage les décisions.",
    "Organiser des points réguliers entre directions pour mieux se coordonner.",
]
POOLS = {
    "promoter": (PROMOTER_REASONS, PROMOTER_IMPROVEMENTS),
    "passive": (PASSIVE_REASONS, PASSIVE_IMPROVEMENTS),
    "detractor": (DETRACTOR_REASONS, DETRACTOR_IMPROVEMENTS),
}
ANSWER_RATE = 0.8


class Command(BaseCommand):
    help = "Peuple l'eNPS d'entreprises de démonstration (réponses fictives, jamais sur un client réel)."

    def add_arguments(self, parser):
        parser.add_argument("slugs", nargs="+", help="Identifiants techniques des entreprises (ex. pmc-demo).")
        parser.add_argument("--reset", action="store_true", help="Efface d'abord les réponses eNPS existantes de ces entreprises.")

    def handle(self, *args, slugs=(), reset=False, **options):
        companies = []
        for slug in slugs:
            company = Company.objects.filter(slug=slug).first()
            if company is None:
                raise CommandError(f"Entreprise introuvable : « {slug} ».")
            companies.append(company)
        for company in companies:
            with transaction.atomic():
                self.stdout.write(self._seed(company, reset))

    def _seed(self, company, reset):
        rng = random.Random(f"enps-{company.slug}")
        if reset:
            EnpsResponse.objects.filter(company=company).delete()
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        people = list(User.objects.filter(company=company, is_active=True).select_related("department"))
        if not people:  # comptes bloqués après une démo : on peuple quand même
            people = list(User.objects.filter(company=company).select_related("department"))
        if not campaigns or not people:
            return f"{company.name} : rien à peupler ({len(campaigns)} campagne(s), {len(people)} compte(s))."
        moods = {}
        for p in sorted(people, key=lambda u: (u.department_id or 0)):
            if p.department_id not in moods:
                moods[p.department_id] = rng.uniform(-1.6, 1.2)
        created = 0
        for index, campaign in enumerate(campaigns):
            trend = 0.35 * index
            for person in people:
                # Tirage propre à la personne et à la campagne : une relance
                # reprend exactement les mêmes décisions et ne crée rien de plus.
                draw = random.Random(f"enps-{company.slug}-{person.pk}-{campaign.pk}")
                if draw.random() > ANSWER_RATE:
                    continue
                if EnpsResponse.objects.filter(respondent=person, campaign=campaign).exists():
                    continue
                mean = 7.0 + moods[person.department_id] + trend
                score = max(0, min(10, round(draw.gauss(mean, 1.9))))
                reasons, improvements = POOLS[EnpsResponse.category(score)]
                EnpsResponse.objects.create(
                    company=company,
                    campaign=campaign,
                    respondent=person,
                    team=person.department,
                    score=score,
                    reason=f"{draw.choice(reasons)} {draw.choice(improvements)}",
                )
                created += 1
        return f"{company.name} : {created} réponse(s) eNPS créée(s) sur {len(campaigns)} campagne(s)."
