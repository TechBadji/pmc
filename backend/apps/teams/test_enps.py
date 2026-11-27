from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import EnpsResponse


class EnpsTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Enps Co", slug="enps-co", cohesion_min_respondents=3)
        self.ceo = User.objects.create_user(email="ceo@e.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="ENPSCEO")
        self.dept = Department.objects.create(company=self.company, code="D1", name="Direction 1")
        self.members = [
            User.objects.create_user(email=f"m{i}@e.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept, generated_login=f"ENPSM{i}")
            for i in range(4)
        ]
        self.campaign = EvaluationCampaign.objects.create(company=self.company, name="S1", start_date=date(2026, 1, 1), end_date=date(2030, 6, 30))
        self.client = APIClient()

    def answer(self, user, score, reason="Bonne ambiance"):
        self.client.force_authenticate(user)
        return self.client.post("/api/enps-responses/", {"campaign": self.campaign.id, "score": score, "reason": reason}, format="json", HTTP_HOST="localhost")

    def results(self, user):
        self.client.force_authenticate(user)
        return self.client.get(f"/api/enps-responses/results/?campaign={self.campaign.id}", HTTP_HOST="localhost")

    def test_validation(self):
        self.assertEqual(self.answer(self.members[0], 11).status_code, 400)
        self.assertEqual(self.answer(self.members[0], 5, "  ").status_code, 400)
        self.assertEqual(self.answer(self.members[0], 5).status_code, 201)
        r = self.answer(self.members[0], 6)
        self.assertEqual(r.status_code, 400)
        self.assertIn("déjà répondu", str(r.data))

    def test_threshold_then_score(self):
        for m, s in zip(self.members[:2], [10, 3]):
            self.answer(m, s)
        self.assertFalse(self.results(self.ceo).data["company"]["published"])
        self.assertNotIn("comments", self.results(self.ceo).data["company"])
        self.answer(self.members[2], 9)
        self.answer(self.members[3], 7)
        company = self.results(self.ceo).data["company"]
        self.assertTrue(company["published"])
        self.assertEqual(company["counts"], {"detractor": 1, "passive": 1, "promoter": 2})
        self.assertEqual(company["enps"], 25)
        self.assertEqual(len(company["comments"]), 4)
        self.assertNotIn("respondent", str(company["comments"]))
        self.assertEqual(self.results(self.ceo).data["teams"][0]["enps"], 25)
        self.assertEqual(EnpsResponse.objects.get(respondent=self.members[0]).team, self.dept)

    def test_member_cannot_read_results(self):
        self.assertEqual(self.results(self.members[0]).status_code, 403)
