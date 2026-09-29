"""
Peuple le questionnaire Psychological Safety (PSI) d'une ou plusieurs
entreprises de démo, sur toutes leurs campagnes.

Répondent les directeurs et les collaborateurs rattachés à une direction (pas
le CEO), chacun sur sa propre direction ; quelques collaborateurs s'abstiennent
d'une campagne à l'autre, sans jamais passer sous le seuil de publication.

Chaque direction a son profil sur les 4 dimensions (Belonging, Learning,
Contributing, Challenging) et sa trajectoire d'une campagne à l'autre, pour que
la vue CEO montre des équipes solides, à consolider et fragiles, et des écarts
entre dimensions. Le directeur se voit un peu plus optimiste que son équipe.

Ne touche à aucune réponse existante : seules les réponses manquantes sont
créées, et les tirages dépendent de la personne et de la campagne — relancer la
commande ne change rien.

Usage:
    python manage.py seed_psychological_safety                  # PMC-DEMO et Africa Insurance Group
    python manage.py seed_psychological_safety "Nom de l'entreprise" ...
"""
import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import PsychologicalSafetyResponse

DEFAULT_COMPANIES = ["PMC-DEMO", "Africa Insurance Group"]

# Moyennes visées sur la dernière campagne : Belonging, Learning, Contributing, Challenging.
PROFILES = {
    "solide": [4.6, 4.4, 4.4, 4.1],
    "appartenance sans challenge": [4.5, 3.9, 3.6, 2.8],
    "apprenante": [3.9, 4.5, 4.1, 3.6],
    "contributive peu inclusive": [3.3, 3.7, 4.3, 3.9],
    "a consolider": [4.1, 3.7, 3.7, 3.3],
    "fragile": [3.2, 2.9, 3.0, 2.4],
}
# Écart par campagne : la plus ancienne est à (nb campagnes - 1) pas de la dernière.
TRENDS = {"progres": 0.18, "stable": 0.0, "degradation": -0.14}

# Profil et trajectoire par code de direction (les ids diffèrent entre local et prod).
TEAM_SETTINGS = {
    # PMC-DEMO
    "DG": ("solide", "stable"),
    "DAF": ("a consolider", "progres"),
    "PROD": ("fragile", "degradation"),
    "DSCP": ("appartenance sans challenge", "stable"),
    "DIST": ("apprenante", "progres"),
    "DPCT": ("solide", "progres"),
    "DCOM": ("contributive peu inclusive", "degradation"),
    # Africa Insurance Group
    "DZ": ("a consolider", "stable"),
    "DT": ("appartenance sans challenge", "progres"),
    "DEP": ("apprenante", "stable"),
    "DMEC": ("contributive peu inclusive", "progres"),
    "DFI": ("fragile", "progres"),
    "DRH": ("solide", "stable"),
    "DPBP": ("a consolider", "degradation"),
    "FIL1": ("solide", "progres"),
    "FIL2": ("fragile", "degradation"),
    "FIL3": ("appartenance sans challenge", "degradation"),
    "FIL4": ("apprenante", "progres"),
    "SUNU": ("appartenance sans challenge", "progres"),
}
PARTICIPATION = 0.9  # part des collaborateurs qui répondent à une campagne donnée
MIN_RESPONDENTS = 4  # plancher par direction et par campagne, au-dessus du seuil d'anonymat


def team_setting(code):
    if code in TEAM_SETTINGS:
        return TEAM_SETTINGS[code]
    rng = random.Random(f"psi-team-{code}")
    return rng.choice(list(PROFILES)), rng.choice(list(TRENDS))


def draw_scores(user, campaign, targets, leader):
    rng = random.Random(f"psi-{user.id}-{campaign.id}")
    personal = rng.gauss(0, 0.3) + (0.3 if leader else 0)
    return [
        max(1, min(5, round(rng.gauss(targets[i // 3] + personal, 0.6))))
        for i in range(12)
    ]


class Command(BaseCommand):
    help = "Réponses de démo au questionnaire Psychological Safety (PSI), sans toucher aux réponses existantes."

    def add_arguments(self, parser):
        parser.add_argument("companies", nargs="*", help="Noms des entreprises (défaut : PMC-DEMO et Africa Insurance Group).")

    @transaction.atomic
    def handle(self, *args, **options):
        names = options["companies"] or DEFAULT_COMPANIES
        companies = []
        for name in names:
            company = Company.objects.filter(name=name).first()
            if company is None:
                raise CommandError(f"Entreprise « {name} » introuvable.")
            companies.append(company)
        for company in companies:
            self.seed(company)

    def seed(self, company):
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if not campaigns:
            raise CommandError(f"{company.name} : aucune campagne.")
        people = (
            User.objects.filter(company=company, department__isnull=False, role__in=[User.Role.MANAGER, User.Role.MEMBER])
            .select_related("department")
            .order_by("department__code", "id")
        )
        by_team = {}
        for person in people:
            by_team.setdefault(person.department, []).append(person)
        existing = set(
            PsychologicalSafetyResponse.objects.filter(company=company).values_list("respondent_id", "campaign_id")
        )

        rows = []
        self.stdout.write(f"— {company.name}")
        for team, members in sorted(by_team.items(), key=lambda kv: kv[0].code or ""):
            profile, trend = team_setting(team.code)
            for ci, campaign in enumerate(campaigns):
                shift = TRENDS[trend] * (ci - (len(campaigns) - 1))
                targets = [v + shift for v in PROFILES[profile]]
                rng = random.Random(f"psi-participation-{team.id}-{campaign.id}")
                respondents = [
                    p for p in members if p.role == User.Role.MANAGER or rng.random() < PARTICIPATION
                ]
                missing = [p for p in members if p not in respondents]
                while len(respondents) < min(MIN_RESPONDENTS, len(members)):
                    respondents.append(missing.pop(0))
                for person in respondents:
                    if (person.id, campaign.id) in existing:
                        continue
                    rows.append(PsychologicalSafetyResponse(
                        company=company, team=team, campaign=campaign, respondent=person,
                        scores=draw_scores(person, campaign, targets, person.role == User.Role.MANAGER),
                    ))
            self.stdout.write(f"  {team.code or team.name} : {profile}, {trend} ({len(members)} personnes)")
        PsychologicalSafetyResponse.objects.bulk_create(rows)
        total = PsychologicalSafetyResponse.objects.filter(company=company).count()
        self.stdout.write(self.style.SUCCESS(
            f"  {len(rows)} réponses créées ({total} au total, {len(campaigns)} campagnes)."
        ))
