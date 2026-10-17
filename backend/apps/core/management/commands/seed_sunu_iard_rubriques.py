"""
Peuple SUNU IARD sur quatre campagnes (Année 2023, 2024, 2025 closes,
Semestre 1 2026 ouverte), pour les rubriques que voit son CEO :

- Cohésion d'équipe : avis des collaborateurs sur l'organisation (portée
  ORGANISATION), réponses PSI sur l'organisation, et carte « Forces et
  faiblesses » portée par l'équipe du CEO (Comité de Direction, code DIR —
  celle que crée le bouton de la page Cohésion), sans y déplacer personne ;
- 360° Feedforward : chaque collaborateur reçoit le guide Round 1 de deux
  collègues et remplit son Round 2 ; le CEO reçoit celui de cinq collaborateurs.

L'ancienne campagne unique « Année 2026 » devient « Semestre 1 2026 ».
Relancée, la commande RECONSTRUIT ces données (graines fixes : mêmes chiffres
en local et en production) — ne pas la relancer une fois la démo commencée.

Usage:
    python manage.py seed_sunu_iard_rubriques
"""
import random
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.management.commands import seed_africa_insurance_group_rubriques as R
from apps.core.management.commands import seed_psychological_safety as PSI
from apps.core.management.commands import seed_socium_feedforward as FF
from apps.core.management.commands import seed_sunu_iard as IARD
from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign, Feedback360
from apps.evaluations.serializers import FEEDFORWARD_ROUND1, FEEDFORWARD_ROUND2
from apps.teams.models import CohesionResponse, PsychologicalSafetyResponse, TeamBoard

CAMPAIGNS = [
    ("Année 2023", date(2023, 1, 1), date(2023, 12, 31), True),
    ("Année 2024", date(2024, 1, 1), date(2024, 12, 31), True),
    ("Année 2025", date(2025, 1, 1), date(2025, 12, 31), True),
    ("Semestre 1 2026", date(2026, 1, 1), date(2026, 6, 30), False),
]
LEGACY_CAMPAIGN = "Année 2026"
PSI_TARGETS = PSI.PROFILES["appartenance sans challenge"]
PSI_TREND = PSI.TRENDS["progres"]
BOARD = dict(
    vision_missions="Être l'assureur IARD de référence pour les entreprises et les particuliers, par la qualité de "
                    "la souscription, la rapidité d'indemnisation et la proximité avec nos intermédiaires.",
    values=["Intégrité", "Proximité client", "Excellence technique", "Solidarité"],
    counter_values=["Opacité", "Lenteur de règlement", "Travail en silo"],
    achievements=["Délai moyen de règlement des sinistres auto ramené sous 30 jours", "Lancement de la souscription en ligne multirisque habitation",
                  "Renouvellement du programme de réassurance à des conditions améliorées"],
    failures_lessons=["Retard de la refonte du système de gestion des contrats", "Sinistralité flotte automobile au-dessus du budget"],
    objectives=["Croissance du chiffre d'affaires IARD", "Ratio combiné sous 95 %", "Satisfaction des intermédiaires"],
)


class Command(BaseCommand):
    help = "Peuple SUNU IARD (cohésion, PSI, forces et faiblesses, Feedforward) sur quatre campagnes."

    @transaction.atomic
    def handle(self, *args, **options):
        company = Company.objects.filter(name=IARD.COMPANY_NAME).first()
        ceo = User.objects.filter(company=company, generated_login=IARD.CEO_LOGIN).first() if company else None
        if ceo is None:
            raise CommandError("SUNU IARD ou son CEO introuvable — lancez d'abord seed_sunu_iard.")
        staff = sorted(User.objects.filter(company=company, role=User.Role.MEMBER, generated_login__startswith=IARD.EMPLOYEE_PREFIX),
                       key=lambda u: int(u.generated_login[len(IARD.EMPLOYEE_PREFIX):]))
        if len(staff) < 10:
            raise CommandError("Collaborateurs introuvables — lancez d'abord seed_sunu_iard.")
        self.company, self.ceo, self.staff = company, ceo, staff
        self.campaigns = self._campaigns()
        self.deposit = {c.pk: max(min(date.today(), c.end_date), c.start_date) for c in self.campaigns}
        self._opinions()
        self._psi()
        self._board()
        self._feedforward()
        self.stdout.write(self.style.SUCCESS(f"Terminé — {company.name} : {len(staff)} collaborateurs, {len(self.campaigns)} campagnes."))

    def _campaigns(self):
        legacy = EvaluationCampaign.objects.filter(company=self.company, name=LEGACY_CAMPAIGN).first()
        if legacy and not EvaluationCampaign.objects.filter(company=self.company, name=CAMPAIGNS[-1][0]).exists():
            legacy.name, legacy.start_date, legacy.end_date = CAMPAIGNS[-1][:3]
            legacy.save()
        result = []
        for name, start, end, closed in CAMPAIGNS:
            camp, _ = EvaluationCampaign.objects.update_or_create(
                company=self.company, name=name,
                defaults={"start_date": start, "end_date": end, "is_closed": closed, "created_by": self.ceo})
            result.append(camp)
        return result

    def _opinions(self):
        rub = R.Command()
        labels = rub._labels(self.company.name)
        CohesionResponse.objects.filter(company=self.company).delete()
        count = 0
        for i, camp in enumerate(self.campaigns):
            rng = random.Random(f"iard-org-{camp.name}")
            users = list(self.staff)
            rng.shuffle(users)
            for respondent in users[: round(len(users) * R.ORG_PARTICIPATION[i])]:
                base = 3.2 + R.CAMPAIGN_SHIFTS[i] + rng.gauss(0, 0.6)
                scores = [{"criterion": label, "score": R._clamp_score(level + rng.gauss(0, 0.5))}
                          for label, level in zip(labels, rub._levels(base))]
                CohesionResponse.objects.create(scope=CohesionResponse.Scope.ORGANISATION, company=self.company, team=None,
                                                respondent=respondent, date=self.deposit[camp.pk], scores=scores)
                count += 1
        self.stdout.write(f"Avis sur l'organisation : {count}")

    def _psi(self):
        PsychologicalSafetyResponse.objects.filter(company=self.company).delete()
        rows = []
        last = len(self.campaigns) - 1
        for i, camp in enumerate(self.campaigns):
            targets = [v + PSI_TREND * (i - last) for v in PSI_TARGETS]
            rng = random.Random(f"iard-psi-{camp.name}")
            for person in self.staff:
                if rng.random() < R.ORG_PARTICIPATION[i] + 0.05:
                    rows.append(PsychologicalSafetyResponse(
                        company=self.company, scope=PsychologicalSafetyResponse.Scope.ORGANISATION, team=None, campaign=camp,
                        respondent=person, scores=PSI.draw_scores(person, camp, targets, False)))
        PsychologicalSafetyResponse.objects.bulk_create(rows)
        self.stdout.write(f"Réponses PSI (organisation) : {len(rows)}")

    def _board(self):
        team = Department.objects.filter(company=self.company, manager=self.ceo).first()
        if team is None:
            team = Department.objects.create(company=self.company, name="Comité de Direction", code="DIR", manager=self.ceo)
        TeamBoard.objects.filter(team=team).delete()
        for camp in self.campaigns:
            pick = random.Random(f"iard-board-{camp.name}")
            year = self.deposit[camp.pk].year
            TeamBoard.objects.create(
                team=team, date=self.deposit[camp.pk],
                people_strengths=pick.sample(R.PEOPLE_STRENGTHS, 3), people_weaknesses=pick.sample(R.PEOPLE_WEAKNESSES, 3),
                business_strengths=pick.sample(R.BUSINESS_STRENGTHS, 3), business_weaknesses=pick.sample(R.BUSINESS_WEAKNESSES, 3),
                catalysts=pick.sample(R.CATALYSTS, 5), nourishers=pick.sample(R.NOURISHERS, 5),
                inhibitors=pick.sample(R.INHIBITORS, 5), toxins=pick.sample(R.TOXINS, 5),
                priorities_cohesion=pick.sample(R.PRIORITIES_COHESION, 5), priorities_business=pick.sample(R.PRIORITIES_BUSINESS, 5),
                targets_vs_actuals=[{"year": str(y), "target": round(12.0 * 1.08 ** (y - 2020), 1),
                                     "actual": round(12.0 * 1.08 ** (y - 2020) * (0.9 + pick.random() * 0.15), 1)}
                                    for y in range(year - 3, year + 1)],
                objectives_plan=[{"year": str(y), "target": round(12.0 * 1.08 ** (y - 2020), 1), "actual": None}
                                 for y in range(year + 1, year + 4)],
                **BOARD,
            )
        self.stdout.write(f"Forces et faiblesses ({team.name}) : {len(self.campaigns)} cartes")

    def _feedforward(self):
        name = self.company.name
        pools = {k: [text.replace("SOCIUM", name) for text in v] for k, v in FF.STAFF_POOLS.items()}
        Feedback360.objects.filter(company=self.company).delete()
        rows = []
        for camp in self.campaigns:
            def guide(author, subject, relation, keys, seed):
                rng = random.Random(f"iard-ff-{camp.name}-{seed}")
                rows.append(Feedback360(company=self.company, campaign=camp, author=author, subject=subject,
                                        kind=Feedback360.Kind.FORWARD, relation=relation,
                                        answers={k: rng.choice(pools[k]) for k in keys}))
            pick = random.Random(f"iard-ff-authors-{camp.name}")
            for member in self.staff:
                for colleague in pick.sample([m for m in self.staff if m.pk != member.pk], 2):
                    guide(colleague, member, "PEER", FEEDFORWARD_ROUND1, f"{colleague.pk}-{member.pk}")
                guide(member, member, "SELF", FEEDFORWARD_ROUND2, f"self-{member.pk}")
            for member in pick.sample(self.staff, 5):
                guide(member, self.ceo, "REPORT", FEEDFORWARD_ROUND1, f"{member.pk}-ceo")
            guide(self.ceo, self.ceo, "SELF", FEEDFORWARD_ROUND2, "self-ceo")
        Feedback360.objects.bulk_create(rows)
        self.stdout.write(f"Guides Feedforward : {len(rows)}")
