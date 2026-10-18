from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, Department, PerformanceProfile, User
from apps.evaluations.models import Evaluation, EvaluationCampaign
from apps.teams.models import PsychologicalSafetyResponse, TeamBoard

URL = "/api/reports/pdf/"


class ReportPdfTests(TestCase):
    """Point d'entrée commun des rapports : chaque type produit un PDF quand
    les données existent, refuse avec un motif sinon, et respecte les droits."""

    def setUp(self):
        self.company = Company.objects.create(name="Pdf Co", slug="pdf-co")
        self.ceo = User.objects.create_user(email="ceo@p.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="PCEO")
        self.dept = Department.objects.create(company=self.company, code="A", name="Alpha")
        self.other = Department.objects.create(company=self.company, code="B", name="Beta")
        self.manager = User.objects.create_user(email="m@p.co", password="x", role=User.Role.MANAGER, company=self.company, department=self.dept, generated_login="PM")
        self.dept.manager = self.manager
        self.dept.save()
        self.members = [User.objects.create_user(email=f"e{n}@p.co", password="x", role=User.Role.MEMBER, company=self.company,
                                                 department=self.dept, manager=self.manager, generated_login=f"PE{n}") for n in range(3)]
        self.outsider = User.objects.create_user(email="o@p.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.other, generated_login="PO")
        self.c1 = EvaluationCampaign.objects.create(company=self.company, name="2025", start_date=date(2025, 1, 1), end_date=date(2025, 12, 31))
        self.c2 = EvaluationCampaign.objects.create(company=self.company, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        for i, person in enumerate(self.members + [self.manager]):
            Evaluation.objects.create(user=person, campaign=self.c1, business_objectives_score=70 + 5 * i, people_objectives_score=80)
            Evaluation.objects.create(user=person, campaign=self.c2, business_objectives_score=95 - 10 * i, people_objectives_score=90)

    def get(self, user, **params):
        client = APIClient()
        client.force_authenticate(user)
        return client.get(URL, {"campaign": self.c2.id, **params}, HTTP_HOST="localhost")

    def assertPdf(self, response):
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_talent_reports_for_the_organisation_and_a_direction(self):
        for kind in ("id3a", "ninebox", "tpd"):
            self.assertPdf(self.get(self.ceo, kind=kind))
            self.assertPdf(self.get(self.manager, kind=kind, team=self.dept.id))

    def test_ninebox_explains_why_a_first_campaign_cannot_be_placed(self):
        response = self.get(self.ceo, kind="ninebox", campaign=self.c1.id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("première fois", str(response.data))

    def test_person_report_respects_who_may_read_whom(self):
        PerformanceProfile.objects.create(user=self.members[0], motivates=["Apprendre"], dev_priorities=["Prise de parole"])
        self.assertPdf(self.get(self.ceo, kind="person_id", subject=self.members[0].id))
        self.assertPdf(self.get(self.manager, kind="person_id", subject=self.members[0].id))
        self.assertPdf(self.get(self.members[0], kind="person_id"))
        self.assertEqual(self.get(self.manager, kind="person_id", subject=self.outsider.id).status_code, 403)
        self.assertEqual(self.get(self.members[1], kind="person_id", subject=self.members[0].id).status_code, 403)

    def test_team_reports(self):
        TeamBoard.objects.create(team=self.dept, date=date(2026, 3, 1), people_strengths=["Solidarité"], business_weaknesses=["Outils"],
                                 vision_missions="Servir nos clients", values=["Intégrité"], targets_vs_actuals=[{"year": "2025", "target": 10, "actual": 9}])
        self.assertPdf(self.get(self.manager, kind="strengths", team=self.dept.id))
        self.assertPdf(self.get(self.manager, kind="team_id", team=self.dept.id))
        self.assertEqual(self.get(self.ceo, kind="team_id").status_code, 400)

    def test_psi_waits_for_the_threshold(self):
        self.assertEqual(self.get(self.ceo, kind="psi", team=self.dept.id).status_code, 400)
        for person in self.members:
            PsychologicalSafetyResponse.objects.create(company=self.company, team=self.dept, campaign=self.c2, respondent=person,
                                                       scores=[4, 4, 3, 3, 4, 2, 5, 4, 4, 3, 2, 3])
        self.assertPdf(self.get(self.ceo, kind="psi", team=self.dept.id))

    def test_members_and_strangers_are_refused(self):
        self.assertEqual(self.get(self.members[0], kind="id3a").status_code, 403)
        self.assertEqual(self.get(self.manager, kind="id3a").status_code, 400)
        self.assertEqual(self.get(self.manager, kind="id3a", team=self.other.id).status_code, 400)
        self.assertEqual(self.get(self.ceo, kind="inconnu").status_code, 400)
