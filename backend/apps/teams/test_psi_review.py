from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import PsychologicalSafetyResponse

URL = "/api/psychological-safety-review/"


class PsychologicalSafetyReviewTests(TestCase):
    """Les réponses individuelles au PSI et l'appréciation du consultant ne
    sont accessibles qu'au super administrateur : pour l'entreprise, le
    questionnaire reste anonyme."""

    def setUp(self):
        self.company = Company.objects.create(name="Psi Co", slug="psi-co")
        self.admin = User.objects.create_user(email="sa@p.co", password="x", role=User.Role.SUPER_ADMIN, generated_login="PSA")
        self.ceo = User.objects.create_user(email="ceo@p.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="PCEO")
        self.dept = Department.objects.create(company=self.company, code="A", name="Alpha")
        self.manager = User.objects.create_user(email="m@p.co", password="x", role=User.Role.MANAGER, company=self.company, department=self.dept, generated_login="PM")
        self.dept.manager = self.manager
        self.dept.save()
        self.member = User.objects.create_user(email="a@p.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept, generated_login="PA")
        self.campaign = EvaluationCampaign.objects.create(company=self.company, name="2025", start_date=date(2025, 1, 1), end_date=date(2025, 12, 31))
        self.response = PsychologicalSafetyResponse.objects.create(
            company=self.company, team=self.dept, campaign=self.campaign, respondent=self.member,
            scores=[5, 5, 4, 4, 3, 4, 3, 3, 3, 2, 2, 1],
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_super_admin_reads_individual_answers(self):
        response = self.client_for(self.admin).get(URL, {"company": self.company.id, "campaign": self.campaign.id}, HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual(row["respondent"], self.member.id)
        self.assertEqual([d["score"] for d in row["dimensions"]], [4.67, 3.67, 3.0, 1.67])
        self.assertEqual(row["global_score"], 3.25)

    def test_company_never_reads_individual_answers(self):
        for user in (self.ceo, self.manager, self.member):
            client = self.client_for(user)
            self.assertEqual(client.get(URL, HTTP_HOST="localhost").status_code, 403)
            self.assertEqual(
                client.patch(f"{URL}{self.response.id}/", {"verdict": "SAFE"}, format="json", HTTP_HOST="localhost").status_code,
                403,
            )

    def test_verdict_is_saved_but_scores_stay_the_respondents(self):
        client = self.client_for(self.admin)
        response = client.patch(
            f"{URL}{self.response.id}/", {"verdict": "UNSAFE", "verdict_comment": " Challenge au plus bas ", "scores": [1] * 12},
            format="json", HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.response.refresh_from_db()
        self.assertEqual((self.response.verdict, self.response.verdict_comment, self.response.verdict_by), ("UNSAFE", "Challenge au plus bas", self.admin))
        self.assertEqual(self.response.scores[0], 5)
        bad = client.patch(f"{URL}{self.response.id}/", {"verdict": "MAYBE"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(bad.status_code, 400)

    def test_respondent_never_sees_the_verdict(self):
        self.response.verdict = "WATCH"
        self.response.save()
        response = self.client_for(self.member).get("/api/psychological-safety-responses/", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("verdict", response.data["results"][0])
