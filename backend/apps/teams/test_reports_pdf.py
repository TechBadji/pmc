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

    def test_group_and_person_scopes(self):
        self.ceo.department = None
        Evaluation.objects.create(user=self.ceo, campaign=self.c1, business_objectives_score=90, people_objectives_score=90)
        Evaluation.objects.create(user=self.ceo, campaign=self.c2, business_objectives_score=95, people_objectives_score=95)
        for group in ("leadership", "directors"):
            for kind in ("id3a", "ninebox", "tpd"):
                self.assertPdf(self.get(self.ceo, kind=kind, group=group))
        self.assertPdf(self.get(self.ceo, kind="id3a", subject=self.members[0].id))
        self.assertPdf(self.get(self.manager, kind="tpd", subject=self.members[1].id))
        # Réservé au dirigeant, inconnu, ou impossible sur des avis anonymes.
        self.assertEqual(self.get(self.manager, kind="id3a", group="leadership").status_code, 400)
        self.assertEqual(self.get(self.ceo, kind="id3a", group="inconnu").status_code, 400)
        self.assertEqual(self.get(self.ceo, kind="psi", subject=self.members[0].id).status_code, 400)
        self.assertEqual(self.get(self.manager, kind="id3a", subject=self.outsider.id).status_code, 403)

    def test_directors_group_lists_department_heads_only(self):
        from apps.evaluations.talent_reports import People
        service = Department.objects.create(company=self.company, code="A1", name="Alpha service", parent=self.dept, manager=self.members[2])
        self.members[2].role = User.Role.MANAGER
        self.members[2].save()
        self.assertEqual(set(People(self.company, group="directors").users()), {self.manager})
        self.assertEqual(set(People(self.company, group="service_heads").users()), {self.members[2]})
        self.assertEqual(set(People(self.company, group="leadership").users()), {self.ceo, self.manager, self.members[2]})
        self.assertTrue(service.pk)


class ReportJobTests(ReportPdfTests):
    """Production en arrière-plan : lancer, suivre, télécharger — pour son seul demandeur."""

    def setUp(self):
        super().setUp()
        from apps.teams.report_views import ReportJobView
        ReportJobView.run_in_background = False
        self.addCleanup(setattr, ReportJobView, "run_in_background", True)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_job_runs_and_downloads(self):
        ceo = self.client_for(self.ceo)
        started = ceo.post("/api/reports/jobs/", {"campaign": self.c2.id, "kind": "tpd"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(started.status_code, 202, started.data)
        self.assertEqual(started.data["status"], "READY")
        self.assertFalse(started.data["ai_written"])
        status = ceo.get(f"/api/reports/jobs/{started.data['id']}/", HTTP_HOST="localhost")
        self.assertEqual(status.data["status"], "READY")
        pdf = ceo.get(f"/api/reports/jobs/{started.data['id']}/download/", HTTP_HOST="localhost")
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        other = self.client_for(self.manager)
        self.assertEqual(other.get(f"/api/reports/jobs/{started.data['id']}/download/", HTTP_HOST="localhost").status_code, 404)

    def test_job_failure_keeps_its_reason(self):
        started = self.client_for(self.ceo).post("/api/reports/jobs/", {"campaign": self.c1.id, "kind": "ninebox"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(started.data["status"], "FAILED")
        self.assertIn("première fois", started.data["error"])

    def test_job_checks_rights_before_starting(self):
        refused = self.client_for(self.members[0]).post("/api/reports/jobs/", {"campaign": self.c2.id, "kind": "id3a"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(refused.status_code, 403)
