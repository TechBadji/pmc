"""
Pré-remplit le questionnaire Psychological Safety (PSI) de SOCIUM à l'échelle
de l'organisation, sur ses quatre campagnes : SOCIUM n'ayant aucune direction,
c'est la seule portée ouverte à ses collaborateurs.

Répondent le DGA, le CTO et les collaborateurs (pas le CEO) ; la participation
monte d'une campagne à l'autre. Le profil visé — une appartenance forte, un
droit de contester encore fragile — progresse au fil des campagnes, pour que
la fiche du CEO ait une évolution à montrer.

Ne touche à aucune réponse existante : seules les réponses manquantes sont
créées, et les tirages dépendent du login et de la campagne — relancer la
commande ne change rien, et le local et la production reçoivent les mêmes notes.

Usage:
    python manage.py seed_socium_psi
"""
import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands import seed_socium as SOCIUM
from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import PsychologicalSafetyResponse

# Moyennes visées sur la dernière campagne : Belonging, Learning, Contributing, Challenging.
TARGETS = [4.2, 3.7, 3.8, 3.0]
STEP = 0.15  # progression d'une campagne à la suivante
PARTICIPATION = [0.60, 0.72, 0.84, 0.94]


class Command(BaseCommand):
    help = "Avis PSI sur l'organisation pour SOCIUM, sur ses quatre campagnes, sans toucher aux réponses existantes."

    @transaction.atomic
    def handle(self, *args, **options):
        company = Company.objects.filter(name=SOCIUM.COMPANY_NAME).first()
        if company is None:
            raise CommandError(f"Entreprise « {SOCIUM.COMPANY_NAME} » introuvable — lancez d'abord seed_socium.")
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if len(campaigns) != len(PARTICIPATION):
            raise CommandError(f"{len(PARTICIPATION)} campagnes attendues, {len(campaigns)} trouvées — lancez d'abord seed_socium.")
        people = list(
            User.objects.filter(company=company, role__in=[User.Role.MANAGER, User.Role.MEMBER]).order_by("id")
        )
        scope = PsychologicalSafetyResponse.Scope.ORGANISATION
        existing = set(
            PsychologicalSafetyResponse.objects.filter(company=company, scope=scope).values_list("respondent_id", "campaign_id")
        )
        rows = []
        for index, campaign in enumerate(campaigns):
            targets = [t - STEP * (len(campaigns) - 1 - index) for t in TARGETS]
            draw = random.Random(f"socium-psi-participation-{campaign.name}")
            respondents = [p for p in people if p.role == User.Role.MANAGER or draw.random() < PARTICIPATION[index]]
            created = 0
            for person in respondents:
                if (person.id, campaign.id) in existing:
                    continue
                rng = random.Random(f"socium-psi-{person.generated_login}-{campaign.name}")
                # L'encadrement se voit un peu plus optimiste que les collaborateurs.
                personal = rng.gauss(0, 0.3) + (0.3 if person.role == User.Role.MANAGER else 0)
                rows.append(PsychologicalSafetyResponse(
                    company=company, team=None, scope=scope, campaign=campaign, respondent=person,
                    scores=[max(1, min(5, round(rng.gauss(targets[i // 3] + personal, 0.6)))) for i in range(12)],
                ))
                created += 1
            self.stdout.write(f"  {campaign.name} : {len(respondents)} répondants sur {len(people) + 1} comptes, {created} réponse(s) créée(s)")
        PsychologicalSafetyResponse.objects.bulk_create(rows)
        self.stdout.write(self.style.SUCCESS(f"Terminé — {company.name} : {len(rows)} avis PSI sur l'organisation créés."))
