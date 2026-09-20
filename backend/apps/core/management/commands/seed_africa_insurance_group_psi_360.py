"""
Peuple, pour Africa Insurance Group, le questionnaire Psychological Safety
(PSI) et les avis 360° (Feedback / Forward) :

- Daniel Junior Nkola devient manager de la direction SUNU Group (sans quoi il
  ne voit pas les résultats de son équipe) ;
- chaque collaborateur (EMP et SUNU) répond au PSI sur les 4 campagnes, avec le
  profil de l'exemple du référentiel : appartenance forte, challenge faible ;
- chaque collaborateur reçoit des avis 360° (manager, 3 pairs, lui-même) sur
  les deux dernières campagnes.

Idempotent : les réponses de démo sont réécrites sans doublon.

Usage:
    python manage.py seed_africa_insurance_group_psi_360
"""
import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign, Feedback360
from apps.teams.models import PsychologicalSafetyResponse

COMPANY_NAME = "Africa Insurance Group"
# Moyennes visées par dimension (Belonging, Learning, Contributing, Challenging).
BASE = [4.4, 3.8, 3.5, 2.9]

STRENGTHS = ["Très bonne communication avec l'équipe", "Fiable sur les délais", "Sens du service client", "Partage volontiers son expérience",
             "Calme et posé sous pression", "Force de proposition", "Excellente connaissance des produits", "Bon esprit d'équipe"]
IMPROVE = ["Oser davantage challenger les décisions", "Mieux déléguer", "Structurer ses comptes rendus", "Anticiper les échéances",
           "Prendre plus la parole en réunion", "Gagner en autonomie sur les dossiers complexes"]
START = ["Proposer une idée d'amélioration par mois", "Préparer les réunions avec un ordre du jour", "Former un collègue plus junior"]
STOP = ["Reprendre les tâches déjà déléguées", "Attendre la validation pour les décisions courantes", "Répondre aux mails en dehors des heures"]
CONTINUE = ["Le suivi rigoureux des dossiers clients", "L'entraide au sein de l'équipe", "Le partage de bonnes pratiques"]


class Command(BaseCommand):
    help = "PSI et avis 360° pour Africa Insurance Group ; Daniel Nkola manager de SUNU Group."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        if not campaigns:
            raise CommandError("Aucune campagne.")
        daniel = User.objects.filter(company=company, generated_login="DIR10").first()
        sunu = Department.objects.filter(company=company, code="SUNU").first()
        if daniel and sunu and sunu.manager_id != daniel.id:
            sunu.manager = daniel
            sunu.save(update_fields=["manager"])
            self.stdout.write("Daniel Junior Nkola : manager de SUNU Group.")

        members = list(User.objects.filter(company=company, role=User.Role.MEMBER, department__isnull=False).select_related("department", "manager"))
        rng = random.Random(360)

        # --- PSI
        PsychologicalSafetyResponse.objects.filter(company=company).delete()
        rows = []
        for ci, campaign in enumerate(campaigns):
            drift = 0.12 * ci  # la sécurité psychologique progresse d'une campagne à l'autre
            for m in members:
                team_bias = ((m.department_id * 37) % 9 - 4) / 20  # ±0,2 selon la direction
                scores = []
                for d in range(4):
                    for _ in range(3):
                        scores.append(max(1, min(5, round(rng.gauss(BASE[d] + team_bias + drift - 0.25, 0.8)))))
                rows.append(PsychologicalSafetyResponse(company=company, team=m.department, campaign=campaign, respondent=m, scores=scores))
        PsychologicalSafetyResponse.objects.bulk_create(rows)
        self.stdout.write(f"PSI : {len(rows)} réponses")

        # --- 360°
        Feedback360.objects.filter(company=company).delete()
        by_dept = {}
        for m in members:
            by_dept.setdefault(m.department_id, []).append(m)
        out = []

        def relation(author, subject):
            if author.id == subject.id:
                return "SELF"
            if subject.manager_id == author.id:
                return "MANAGER"
            return "PEER"

        for campaign in campaigns[-2:]:
            for m in members:
                peers = [p for p in by_dept[m.department_id] if p.id != m.id]
                authors = [m] + ([m.manager] if m.manager else []) + rng.sample(peers, min(3, len(peers)))
                for a in authors:
                    rel = relation(a, m)
                    out.append(Feedback360(
                        company=company, campaign=campaign, subject=m, author=a, kind="FEEDBACK", relation=rel,
                        scores=[max(1, min(5, round(rng.gauss(3.7 + (0.2 if rel == "SELF" else 0), 0.8)))) for _ in range(6)],
                        text_a=rng.choice(STRENGTHS), text_b=rng.choice(IMPROVE)))
                    out.append(Feedback360(
                        company=company, campaign=campaign, subject=m, author=a, kind="FORWARD", relation=rel,
                        text_a=rng.choice(START), text_b=rng.choice(STOP), text_c=rng.choice(CONTINUE)))
        Feedback360.objects.bulk_create(out)
        self.stdout.write(self.style.SUCCESS(f"Terminé — {len(out)} avis 360° pour {len(members)} collaborateurs."))
