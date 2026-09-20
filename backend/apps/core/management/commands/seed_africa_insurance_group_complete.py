"""
Comble les derniers trous de données d'Africa Insurance Group après tous les
autres seeds, pour que l'ensemble de la base soit peuplé :

- date de prise de poste et téléphone de chaque compte (la fiche affiche les
  années dans le poste ; le profil, le téléphone) ;
- avis 360° (Feedback et Forward) reçus par les 9 directeurs et par le PDG ;
- relations entre directeurs et avis de cohésion sur le CODIR (l'équipe des
  directeurs), seules données absentes de l'équipe de direction ;
- avis de cohésion « organisation » de Daniel Nkola.

Ne recrée rien d'existant : chaque bloc ne remplit que ce qui manque.
Idempotent.

Usage:
    python manage.py seed_africa_insurance_group_complete
"""
import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands.seed_africa_insurance_group_psi_360 import CONTINUE, IMPROVE, START, STOP, STRENGTHS
from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign, Feedback360
from apps.teams.models import CohesionResponse, TeamRelationship

COMPANY_NAME = "Africa Insurance Group"


def _phone(rng, dept_code):
    if dept_code == "FIL2":
        return f"+221 77 {rng.randint(100, 999)} {rng.randint(10, 99)} {rng.randint(10, 99)}"
    if dept_code == "FIL1":
        return f"+229 97 {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}"
    return f"+228 9{rng.randint(0, 9)} {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}"


class Command(BaseCommand):
    help = "Comble les derniers trous de données d'Africa Insurance Group."

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")
        campaigns = list(EvaluationCampaign.objects.filter(company=company).order_by("start_date"))
        ceo = User.objects.filter(company=company, role=User.Role.COMPANY_ADMIN).first()
        directors = list(User.objects.filter(company=company, role=User.Role.MANAGER).order_by("generated_login"))
        codir = Department.objects.filter(company=company, code="CDIR").first()
        if not (campaigns and ceo and directors and codir):
            raise CommandError("Lancez d'abord les seeds Africa Insurance Group.")
        rng = random.Random(777)
        today = date.today()

        # 1. Prise de poste et téléphone.
        touched = 0
        for u in User.objects.filter(company=company).select_related("department"):
            fields = []
            if u.role_start_date is None:
                base = u.hire_date or date(2019, 1, 1)
                u.role_start_date = base + timedelta(days=rng.randint(0, 900))
                fields.append("role_start_date")
            if not u.phone:
                u.phone = _phone(rng, u.department.code if u.department else "")
                fields.append("phone")
            if fields:
                u.save(update_fields=fields)
                touched += 1
        self.stdout.write(f"Prise de poste / téléphone : {touched} comptes")

        # 2. Avis 360° reçus par les directeurs (PDG, pairs, eux-mêmes) et par le PDG (directeurs, lui-même).
        rows = []

        def add(subject, author, rel, campaign):
            if Feedback360.objects.filter(subject=subject, author=author, campaign=campaign, kind="FEEDBACK").exists():
                return
            rows.append(Feedback360(company=company, campaign=campaign, subject=subject, author=author, kind="FEEDBACK", relation=rel,
                                    scores=[max(1, min(5, round(rng.gauss(3.9 + (0.2 if rel == "SELF" else 0), 0.7)))) for _ in range(6)],
                                    text_a=rng.choice(STRENGTHS), text_b=rng.choice(IMPROVE)))
            rows.append(Feedback360(company=company, campaign=campaign, subject=subject, author=author, kind="FORWARD", relation=rel,
                                    text_a=rng.choice(START), text_b=rng.choice(STOP), text_c=rng.choice(CONTINUE)))

        # Daniel Nkola a déjà ses avis (seed SUNU) ; les autres sont régénérés à
        # l'identique à chaque exécution, jamais cumulés.
        Feedback360.objects.filter(subject__in=[d for d in directors if d.generated_login != "DIR10"] + [ceo]).delete()
        for campaign in campaigns[-2:]:
            for d in directors:
                if d.generated_login == "DIR10":
                    continue
                pr = random.Random(f"peers-{d.pk}-{campaign.pk}")
                peers = pr.sample([p for p in directors if p.pk != d.pk], 3)
                add(d, d, "SELF", campaign)
                add(d, ceo, "MANAGER", campaign)
                for p in peers:
                    add(d, p, "PEER", campaign)
            add(ceo, ceo, "SELF", campaign)
            for d in directors:
                add(ceo, d, "REPORT", campaign)
        Feedback360.objects.bulk_create(rows)
        self.stdout.write(f"Avis 360° : {len(rows)}")

        # 3. Relations entre directeurs (équipe CODIR).
        n = 0
        if not TeamRelationship.objects.filter(team=codir).exists():
            rel_rows = []
            for u in directors:
                r = random.Random(f"codir-rel-{u.pk}")
                others = [o for o in directors if o.pk != u.pk]
                r.shuffle(others)
                for quality, k in (("EXCELLENT", 3), ("CORRECT", 3), ("DIFFICULT", 2), ("TOXIC", 1)):
                    for o in others[:k]:
                        rel_rows.append(TeamRelationship(team=codir, from_user=u, to_user=o, quality=quality))
                    others = others[k:]
            TeamRelationship.objects.bulk_create(rel_rows)
            n = len(rel_rows)
        self.stdout.write(f"Relations CODIR : {n}")

        # 4. Avis de cohésion des directeurs sur le CODIR + organisation de Daniel.
        rubriques = R.Command()
        labels_team = [label.format(name=codir.name) for label in R.CRITERIA]
        labels_org = [label.format(name=company.name) for label in R.CRITERIA]

        def levels(base):
            return [max(1, min(5, round(base + (i % 3 - 1) * 0.3))) for i in range(len(R.CRITERIA))]

        made = 0
        for i, campaign in enumerate(campaigns):
            deposit = max(min(today, campaign.end_date), campaign.start_date)
            for d in directors:
                r = random.Random(f"codir-resp-{d.pk}-{campaign.pk}")
                base = R.CLIMATE.get("CDIR", 3.6) + R.CAMPAIGN_SHIFTS[i] + r.gauss(0, 0.5)
                scores = [{"criterion": lab, "score": max(1, min(5, round(lv + r.gauss(0, 0.5))))} for lab, lv in zip(labels_team, levels(base))]
                _, created = CohesionResponse.objects.get_or_create(
                    scope=CohesionResponse.Scope.TEAM, team=codir, respondent=d, date=deposit,
                    defaults={"scores": scores, "company": company},
                )
                made += created
            for d in directors:
                if CohesionResponse.objects.filter(scope=CohesionResponse.Scope.ORGANISATION, company=company, respondent=d, date=deposit).exists():
                    continue
                r = random.Random(f"org-dir-{d.pk}-{campaign.pk}")
                base = 3.3 + R.CAMPAIGN_SHIFTS[i] + r.gauss(0, 0.5)
                scores = [{"criterion": lab, "score": max(1, min(5, round(lv + r.gauss(0, 0.5))))} for lab, lv in zip(labels_org, levels(base))]
                CohesionResponse.objects.create(scope=CohesionResponse.Scope.ORGANISATION, company=company, respondent=d, date=deposit, scores=scores, team=None)
                made += 1
        self.stdout.write(self.style.SUCCESS(f"Terminé — {made} avis de cohésion ajoutés ; base d'Africa Insurance Group complétée."))
