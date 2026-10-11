"""
Pré-remplit le 360° Feedforward de SOCIUM au format du guide ID-PMC
Feedforward, sur la campagne en cours, au sein de l'équipe dirigeante : le
CEO, le DGA et le CTO s'adressent chacun aux deux autres (Round 1), puis
chacun note ce qu'il retient et décide (Round 2).

Les contributions sont signées : elles s'affichent sous le nom de leur auteur.

Ne remplit que les guides encore vides : une contribution saisie dans
l'application n'est jamais écrasée. Relançable sans effet.

Usage:
    python manage.py seed_socium_feedforward
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands import seed_socium as SOCIUM
from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign, Feedback360
from apps.evaluations.serializers import FEEDFORWARD_ROUND1, FEEDFORWARD_ROUND2

CEO, DGA, CTO = SOCIUM.CEO_LOGIN, SOCIUM.DGA_LOGIN, SOCIUM.CTO_LOGIN


def r1(*values):
    return dict(zip(FEEDFORWARD_ROUND1, values))


def r2(*values):
    return dict(zip(FEEDFORWARD_ROUND2, values))


# (auteur, bénéficiaire) → relation, réponses. L'ordre des réponses est celui
# des rubriques du guide.
ROUND1 = {
    (CEO, DGA): ("MANAGER", r1(
        "Ta loyauté, ta constance et ton sens de l'écoute. Lors de la renégociation du contrat cadre, tu as pris le temps d'entendre chaque direction avant de trancher.",
        "Rigueur de gestion, fiabilité des engagements, capacité à transformer une orientation en plan d'action suivi.",
        "Le chiffre d'affaires en hausse de 15 % et la signature de deux contrats cadres, obtenus sans dégrader la marge.",
        "Prendre plus souvent la parole en premier devant l'équipe, sans attendre que je fixe le cap.",
        "Renforcer le suivi des indicateurs commerciaux pour anticiper plutôt que constater.",
        "Je te vois prendre la direction générale d'une entité ou conduire notre développement dans la sous-région d'ici trois à cinq ans.",
        "Te confier la présidence du comité de pilotage commercial.",
        "T'associer à la préparation du prochain conseil d'administration.",
        "Dès le mois prochain.",
        "Un point en tête-à-tête toutes les deux semaines, sans ordre du jour imposé.",
    )),
    (CEO, CTO): ("MANAGER", r1(
        "Ton calme, ta franchise et ta curiosité. Tu dis les choses telles qu'elles sont, y compris quand un projet dérape.",
        "Expertise technique reconnue, sens de la qualité, capacité à expliquer simplement un sujet complexe.",
        "La mise en service du portail client et l'obtention de la certification qualité.",
        "Aller davantage au contact des clients et des équipes commerciales pour porter toi-même les sujets techniques.",
        "Consolider le pilotage budgétaire des projets et l'estimation des délais.",
        "Un rôle élargi à l'innovation et aux partenariats technologiques de l'entreprise.",
        "Te donner de la visibilité auprès du conseil d'administration.",
        "Te faire présenter la feuille de route numérique au prochain conseil.",
        "À la séance de décembre 2026.",
        "Je relis ta présentation avec toi une semaine avant.",
    )),
    (DGA, CTO): ("MANAGER", r1(
        "Ton calme dans les moments tendus et ta disponibilité. Pendant la bascule de la plateforme, tu as gardé toute l'équipe sereine.",
        "Fiabilité des livraisons, capacité d'analyse, exigence sur la qualité du code et de la documentation.",
        "Des délais de livraison réduits d'un tiers et aucun incident majeur depuis la mise en service du portail.",
        "Déléguer davantage et faire grandir tes chefs de projet, même si le résultat est d'abord moins parfait.",
        "Formaliser les arbitrages techniques pour que les métiers comprennent les choix.",
        "Je te vois porter la transformation numérique de SOCIUM et siéger pleinement dans les décisions stratégiques.",
        "T'associer aux arbitrages budgétaires dès leur préparation.",
        "Un point mensuel à deux sur la feuille de route et son budget.",
        "Dès novembre 2026.",
        "Je réponds sous 48 heures à tes demandes d'arbitrage.",
    )),
    (CTO, DGA): ("REPORT", r1(
        "Ton sens de l'équité et ta fiabilité : ce que tu annonces, tu le fais.",
        "Organisation, sens des priorités, capacité à mobiliser des équipes très différentes autour d'un même objectif.",
        "La tenue du budget deux années de suite et la fidélisation de nos grands comptes.",
        "Partager plus tôt les décisions en préparation, pour que nous puissions les anticiper.",
        "T'approprier davantage les sujets numériques afin d'arbitrer plus vite.",
        "Un rôle de direction générale, avec la conduite d'un projet de transformation d'ensemble.",
        "Te présenter chaque mois, en clair, l'état des projets techniques et leurs risques.",
        "Une note d'une page avant chaque comité de direction.",
        "Dès le prochain comité.",
        "Tu peux m'appeler avant toute décision engageant les systèmes : je te réponds le jour même.",
    )),
    (DGA, CEO): ("REPORT", r1(
        "Ta vision, ton énergie et la confiance que tu accordes. Tu nous laisses décider dans notre périmètre.",
        "Sens stratégique, relation avec les clients et les partenaires, capacité à décider vite.",
        "Le repositionnement de SOCIUM sur les services à forte valeur et l'entrée de deux partenaires de référence.",
        "Prendre le temps d'expliquer le pourquoi des décisions aux équipes, au-delà du comité de direction.",
        "Stabiliser les priorités sur un trimestre entier avant d'en ouvrir de nouvelles.",
        "Faire de SOCIUM un acteur de référence dans la sous-région, en préparant dès maintenant la relève.",
        "Te remonter sans filtre les signaux du terrain, bons ou mauvais.",
        "Une synthèse mensuelle des remontées des équipes.",
        "Dès ce mois-ci.",
        "Je te préviens avant toute difficulté, pas après.",
    )),
    (CTO, CEO): ("REPORT", r1(
        "Ton ouverture aux idées nouvelles et ta capacité à encourager la prise d'initiative.",
        "Vision du marché, exigence sur le service rendu au client, réseau professionnel.",
        "Le lancement du portail client, que tu as soutenu malgré les réserves du début.",
        "Venir plus souvent rencontrer les équipes techniques, qui te connaissent peu.",
        "Fixer avec nous des critères d'arbitrage entre les demandes urgentes et la feuille de route.",
        "Conduire la diversification de SOCIUM vers de nouvelles offres numériques.",
        "T'alerter tôt sur les risques techniques et te proposer chaque fois une solution.",
        "Un tableau des risques tenu à jour et partagé.",
        "Dès le prochain comité de direction.",
        "Je m'engage sur des dates que je tiens, ou je te préviens à temps.",
    )),
}
ROUND2 = {
    CEO: r2(
        "J'ai mesuré à quel point la liberté de décision que je laisse compte pour l'équipe.",
        "Ma vision du marché et ma capacité à décider vite.",
        "Expliquer le pourquoi de mes décisions ; stabiliser les priorités sur un trimestre.",
        "Tenir une réunion mensuelle ouverte à tous les collaborateurs et ne pas ajouter de priorité avant la fin du trimestre.",
        "Que le DGA et le CTO me disent franchement quand je change de cap trop vite.",
    ),
    DGA: r2(
        "Je ne pensais pas que ma constance était perçue comme une force aussi nette.",
        "Ma rigueur de gestion et ma capacité à fédérer des équipes différentes.",
        "Prendre la parole en premier ; partager plus tôt les décisions en préparation.",
        "Ouvrir moi-même chaque comité de direction par les priorités du mois et diffuser les projets de décision une semaine avant.",
        "Un retour du CEO après chaque comité, et l'appui du CTO sur les sujets numériques.",
    ),
    CTO: r2(
        "Je ne mesurais pas à quel point mon calme comptait pour l'équipe dans les moments tendus.",
        "Mon expertise technique, ma fiabilité et ma capacité à expliquer simplement.",
        "Déléguer davantage ; mieux piloter les budgets des projets.",
        "Confier deux projets en autonomie complète à mes chefs de projet et présenter un suivi budgétaire mensuel.",
        "Un retour franc du DGA à chaque comité, et l'appui du CEO pour aller au contact des clients.",
    ),
}


class Command(BaseCommand):
    help = "Pré-remplit le 360° Feedforward de SOCIUM (CEO, DGA, CTO) sur la campagne en cours, sans écraser une saisie."

    @transaction.atomic
    def handle(self, *args, **options):
        company = Company.objects.filter(name=SOCIUM.COMPANY_NAME).first()
        if company is None:
            raise CommandError(f"Entreprise « {SOCIUM.COMPANY_NAME} » introuvable — lancez d'abord seed_socium.")
        campaign = EvaluationCampaign.objects.filter(company=company, is_closed=False).order_by("-start_date").first()
        if campaign is None:
            raise CommandError(f"{company.name} : aucune campagne ouverte.")
        users = {u.generated_login.upper(): u for u in User.objects.filter(company=company, generated_login__in=[CEO, DGA, CTO])}
        missing = [login for login in (CEO, DGA, CTO) if login not in users]
        if missing:
            raise CommandError(f"Comptes introuvables : {', '.join(missing)} — lancez d'abord seed_socium.")

        guides = [(author, subject, relation, answers) for (author, subject), (relation, answers) in ROUND1.items()]
        guides += [(login, login, "SELF", answers) for login, answers in ROUND2.items()]
        filled = kept = 0
        for author, subject, relation, answers in guides:
            row, _ = Feedback360.objects.get_or_create(
                company=company, campaign=campaign, author=users[author], subject=users[subject], kind=Feedback360.Kind.FORWARD,
                defaults={"relation": relation},
            )
            if row.answers:
                kept += 1
                continue
            row.answers = answers
            row.save(update_fields=["answers", "updated_at"])
            filled += 1
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {company.name}, {campaign.name} : {filled} guide(s) rempli(s), {kept} déjà saisi(s) et laissé(s) tels quels."
        ))
