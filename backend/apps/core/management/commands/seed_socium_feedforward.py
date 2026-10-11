"""
Pré-remplit le 360° Feedforward de SOCIUM au format du guide ID-PMC
Feedforward, sur la campagne en cours. Au sein de l'équipe dirigeante, le
CEO, le DGA et le CTO s'adressent chacun aux deux autres (Round 1), puis
chacun note ce qu'il retient et décide (Round 2). Chaque collaborateur reçoit
le guide du DGA et de deux collègues, et remplit son Round 2.

Les contributions sont signées : elles s'affichent sous le nom de leur auteur.

Ne remplit que les guides encore vides : une contribution saisie dans
l'application n'est jamais écrasée. Relançable sans effet.

Usage:
    python manage.py seed_socium_feedforward
"""
import random

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
        "1. La signature de deux contrats cadres : trois ans de visibilité sur le carnet de commandes. 2. Le chiffre d'affaires en hausse de 15 % sans dégrader la marge : SOCIUM a pu recruter et investir.",
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
        "1. La mise en service du portail client : les clients suivent leurs demandes sans nous appeler. 2. La certification qualité : elle nous a ouvert deux appels d'offres jusque-là fermés.",
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
        "1. Des délais de livraison réduits d'un tiers : les équipes commerciales tiennent enfin leurs promesses aux clients. 2. Aucun incident majeur depuis la mise en service du portail : la confiance des clients s'en ressent.",
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
        "1. Le budget tenu deux années de suite : nous avons pu financer nos projets techniques sans arbitrage de dernière minute. 2. La fidélisation de nos grands comptes : un socle d'activité stable pour toutes les équipes.",
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
        "1. Le repositionnement de SOCIUM sur les services à forte valeur : une marge meilleure et des missions plus intéressantes pour les équipes. 2. L'entrée de deux partenaires de référence : une crédibilité nouvelle auprès des grands clients.",
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
        "1. Le lancement du portail client, que tu as soutenu malgré les réserves du début : l'équipe technique s'est sentie soutenue et les clients y ont gagné en autonomie.",
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


# Formulation de la rubrique 3 avant la nouvelle version du guide : un guide
# qui la porte encore (jamais retouché depuis) reçoit la nouvelle.
PREVIOUS_ACHIEVEMENTS = {
    "Le chiffre d'affaires en hausse de 15 % et la signature de deux contrats cadres, obtenus sans dégrader la marge.":
        "1. La signature de deux contrats cadres : trois ans de visibilité sur le carnet de commandes. 2. Le chiffre d'affaires en hausse de 15 % sans dégrader la marge : SOCIUM a pu recruter et investir.",
    "La mise en service du portail client et l'obtention de la certification qualité.":
        "1. La mise en service du portail client : les clients suivent leurs demandes sans nous appeler. 2. La certification qualité : elle nous a ouvert deux appels d'offres jusque-là fermés.",
    "Des délais de livraison réduits d'un tiers et aucun incident majeur depuis la mise en service du portail.":
        "1. Des délais de livraison réduits d'un tiers : les équipes commerciales tiennent enfin leurs promesses aux clients. 2. Aucun incident majeur depuis la mise en service du portail : la confiance des clients s'en ressent.",
    'La tenue du budget deux années de suite et la fidélisation de nos grands comptes.':
        "1. Le budget tenu deux années de suite : nous avons pu financer nos projets techniques sans arbitrage de dernière minute. 2. La fidélisation de nos grands comptes : un socle d'activité stable pour toutes les équipes.",
    "Le repositionnement de SOCIUM sur les services à forte valeur et l'entrée de deux partenaires de référence.":
        "1. Le repositionnement de SOCIUM sur les services à forte valeur : une marge meilleure et des missions plus intéressantes pour les équipes. 2. L'entrée de deux partenaires de référence : une crédibilité nouvelle auprès des grands clients.",
    'Le lancement du portail client, que tu as soutenu malgré les réserves du début.':
        "1. Le lancement du portail client, que tu as soutenu malgré les réserves du début : l'équipe technique s'est sentie soutenue et les clients y ont gagné en autonomie.",
}

# Collaborateurs : chacun reçoit le guide du DGA, son responsable, et de deux
# collègues, puis remplit son Round 2. Les réponses sont tirées dans ces listes,
# à graine fixe sur les logins : mêmes textes en local et en production.
STAFF_POOLS = {
    "human_qualities": [
        "Ta bonne humeur et ta disponibilité : tu trouves toujours un moment pour aider un collègue débordé.",
        "Ta franchise et ton respect des autres. En réunion, tu dis ton désaccord sans jamais blesser.",
        "Ta persévérance et ton calme : sur le dossier le plus difficile du trimestre, tu n'as jamais baissé les bras.",
        "Ton écoute et ta discrétion : on peut te confier une difficulté sans crainte.",
        "Ton enthousiasme et ta curiosité, qui donnent envie de travailler avec toi.",
        "Ta fiabilité et ta modestie : tu fais ce que tu dis, sans chercher à te mettre en avant.",
    ],
    "professional_contribution": [
        "Rigueur, respect des délais et qualité des livrables.",
        "Sens du client, réactivité et capacité à expliquer simplement.",
        "Esprit d'équipe, capacité d'analyse et goût du travail bien fini.",
        "Autonomie, organisation et maîtrise des outils du poste.",
        "Orientation résultats, fiabilité et partage spontané de l'information.",
        "Expertise sur ton périmètre et capacité à former les nouveaux arrivants.",
    ],
    "achievements": [
        "1. La reprise du suivi des dossiers en retard : le stock a été résorbé en deux mois et les clients concernés ont été rassurés.",
        "1. Le modèle de reporting que tu as proposé : toute l'équipe l'utilise et le DGA lit les chiffres en une page. 2. L'accueil de deux nouveaux collègues, opérationnels en quelques semaines.",
        "1. Ta contribution au portail client : les tests que tu as menés ont évité plusieurs erreurs avant la mise en service.",
        "1. La relation rétablie avec un client mécontent : il a renouvelé son contrat. 2. La procédure que tu as rédigée, reprise par les autres équipes.",
        "1. Ta participation à la certification qualité : tes procédures ont été citées en exemple lors de l'audit.",
        "1. Les délais de traitement divisés par deux sur ton périmètre : tes collègues en aval travaillent plus sereinement.",
    ],
    "impact_leadership": [
        "Prendre davantage la parole en réunion : tes idées méritent d'être entendues.",
        "Oser dire non quand ta charge est trop lourde, plutôt que de tout accepter.",
        "Partager plus tôt tes difficultés, sans attendre que le délai soit menacé.",
        "Aller vers les collègues des autres équipes, que tu connais encore peu.",
        "Accepter de déléguer et de faire confiance sur les tâches que tu maîtrises.",
    ],
    "impact_skills": [
        "Approfondir les outils numériques de suivi pour gagner du temps.",
        "Renforcer la rédaction de tes comptes rendus : plus courts, plus tournés vers la décision.",
        "Te former à la gestion de projet pour piloter un dossier de bout en bout.",
        "Mieux connaître l'ensemble des offres de SOCIUM pour conseiller les clients.",
        "Structurer davantage ton organisation personnelle et tes priorités de la semaine.",
    ],
    "potential": [
        "Je te vois devenir référent de ton domaine et former les nouveaux arrivants.",
        "Un rôle de chef de projet d'ici trois ans, avec une petite équipe.",
        "Je te vois prendre la responsabilité d'un portefeuille de clients importants.",
        "Un poste d'encadrement de proximité, si tu continues à faire grandir les autres.",
        "Une mission transverse sur la qualité ou l'amélioration des processus.",
    ],
    "commitment": [
        "Te donner un retour franc après chaque dossier important.",
        "Partager avec toi mes contacts et ce que je sais du sujet.",
        "Te relire quand tu en as besoin, sans réécrire à ta place.",
        "Te prévenir en amont des changements qui touchent ton travail.",
        "T'associer aux réunions où ton avis compte.",
    ],
    "commitment_first_action": [
        "Un point de trente minutes à deux, chaque mois.",
        "Te transmettre mes notes et mes modèles cette semaine.",
        "T'inviter à la prochaine réunion de préparation.",
        "Relire avec toi ton prochain compte rendu.",
    ],
    "commitment_from": ["Dès la semaine prochaine.", "Dès ce mois-ci.", "À partir de novembre 2026.", "Dès notre prochain dossier commun."],
    "commitment_how": [
        "Je réponds à tes questions dans la journée.",
        "Tu peux venir me voir sans rendez-vous.",
        "Je tiens les dates que je t'annonce, ou je te préviens.",
        "Je te dis les choses en face, jamais dans ton dos.",
    ],
    "touched": [
        "Je ne pensais pas que ma disponibilité était autant remarquée.",
        "J'ai été surpris d'entendre que ma rigueur rassurait mes collègues.",
        "Je ne mesurais pas l'effet de mon calme sur l'équipe.",
        "Entendre que mes idées méritent d'être dites m'a beaucoup touché.",
    ],
    "strengths": [
        "Ma fiabilité et mon sens du client.",
        "Ma rigueur et mon goût du travail bien fini.",
        "Mon esprit d'équipe et ma capacité à expliquer simplement.",
        "Mon autonomie et ma persévérance.",
    ],
    "priorities": [
        "Prendre la parole en réunion ; mieux organiser mes priorités.",
        "Dire mes difficultés plus tôt ; me former à la gestion de projet.",
        "Aller vers les autres équipes ; raccourcir mes comptes rendus.",
        "Apprendre à dire non ; approfondir les outils de suivi.",
    ],
    "commitment_90_days": [
        "Présenter un sujet à chaque réunion d'équipe pendant trois mois.",
        "Signaler toute difficulté dans les 48 heures et suivre une formation à la gestion de projet.",
        "Déjeuner chaque mois avec un collègue d'une autre équipe.",
        "Planifier ma semaine chaque lundi et la partager avec mon responsable.",
    ],
    "support": [
        "Que mes collègues me rappellent mon engagement si je me tais en réunion.",
        "Un retour mensuel de mon responsable sur mes progrès.",
        "Un peu de patience quand je dis non, et un coup de main sur les outils.",
        "Qu'on me dise franchement quand mes comptes rendus sont trop longs.",
    ],
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

        staff = sorted(
            User.objects.filter(company=company, role=User.Role.MEMBER, generated_login__istartswith="EMP"),
            key=lambda u: int(u.generated_login[3:]),
        )
        for member in staff:
            users[member.generated_login.upper()] = member

        def draw(keys, seed):
            rng = random.Random(seed)
            return {key: rng.choice(STAFF_POOLS[key]) for key in keys}

        for member in staff:
            login = member.generated_login.upper()
            pick = random.Random(f"socium-ff-authors-{login}")
            colleagues = pick.sample([m.generated_login.upper() for m in staff if m.pk != member.pk], 2)
            guides.append((DGA, login, "MANAGER", draw(FEEDFORWARD_ROUND1, f"socium-ff-{DGA}-{login}")))
            guides += [(c, login, "PEER", draw(FEEDFORWARD_ROUND1, f"socium-ff-{c}-{login}")) for c in colleagues]
            guides.append((login, login, "SELF", draw(FEEDFORWARD_ROUND2, f"socium-ff-self-{login}")))

        filled = kept = refreshed = 0
        for author, subject, relation, answers in guides:
            row, _ = Feedback360.objects.get_or_create(
                company=company, campaign=campaign, author=users[author], subject=users[subject], kind=Feedback360.Kind.FORWARD,
                defaults={"relation": relation},
            )
            if row.answers:
                newer = PREVIOUS_ACHIEVEMENTS.get(row.answers.get("achievements"))
                if newer:
                    row.answers = {**row.answers, "achievements": newer}
                    row.save(update_fields=["answers", "updated_at"])
                    refreshed += 1
                else:
                    kept += 1
                continue
            row.answers = answers
            row.save(update_fields=["answers", "updated_at"])
            filled += 1
        self.stdout.write(self.style.SUCCESS(
            f"Terminé — {company.name}, {campaign.name} : {filled} guide(s) rempli(s), {refreshed} rubrique(s) 3 mise(s) à jour, "
            f"{kept} déjà saisi(s) et laissé(s) tels quels."
        ))
