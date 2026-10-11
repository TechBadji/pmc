from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import PsychologicalSafetyResponse

URL = "/api/psychological-safety-responses/"
SCORES = [4, 4, 4, 3, 3, 3, 5, 5, 5, 2, 2, 2]


class PsychologicalSafetyScopeTests(TestCase):
    """Chacun répond sur son équipe et, séparément, sur son organisation ; un
    collaborateur sans direction ne répond que sur l'organisation."""

    def setUp(self):
        self.company = Company.objects.create(name="Scope Co", slug="scope-co")
        self.ceo = User.objects.create_user(email="ceo@s.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="SCEO")
        self.dept = Department.objects.create(company=self.company, code="A", name="Alpha")
        self.manager = User.objects.create_user(email="m@s.co", password="x", role=User.Role.MANAGER, company=self.company, department=self.dept, generated_login="SM")
        self.dept.manager = self.manager
        self.dept.save()
        self.member = User.objects.create_user(email="a@s.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept, generated_login="SA")
        self.loose = [
            User.objects.create_user(email=f"l{n}@s.co", password="x", role=User.Role.MEMBER, company=self.company, generated_login=f"SL{n}")
            for n in range(2)
        ]
        self.campaign = EvaluationCampaign.objects.create(company=self.company, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))

    def post(self, user, **body):
        client = APIClient()
        client.force_authenticate(user)
        return client.post(URL, {"campaign": self.campaign.id, "scores": SCORES, **body}, format="json", HTTP_HOST="localhost")

    def test_member_without_department_answers_on_the_organisation_only(self):
        refused = self.post(self.loose[0])
        self.assertEqual(refused.status_code, 400)
        self.assertIn("organisation", str(refused.data))
        accepted = self.post(self.loose[0], scope="ORGANISATION")
        self.assertEqual(accepted.status_code, 201)
        saved = PsychologicalSafetyResponse.objects.get(pk=accepted.data["id"])
        self.assertEqual((saved.scope, saved.team_id, saved.company_id), ("ORGANISATION", None, self.company.id))

    def test_one_answer_per_scope_and_campaign(self):
        self.assertEqual(self.post(self.member).status_code, 201)
        organisation = self.post(self.member, scope="ORGANISATION")
        self.assertEqual(organisation.status_code, 201)
        self.assertIsNone(organisation.data["team"])
        self.assertEqual(self.post(self.member, scope="ORGANISATION").status_code, 400)
        self.assertEqual(self.post(self.member).status_code, 400)

    def test_scope_cannot_change_on_update(self):
        created = self.post(self.member, scope="ORGANISATION")
        client = APIClient()
        client.force_authenticate(self.member)
        response = client.put(f"{URL}{created.data['id']}/", {"campaign": self.campaign.id, "scores": SCORES, "scope": "TEAM"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 400)

    def test_ceo_reads_the_organisation_average_apart_from_teams(self):
        self.post(self.member)
        for user in self.loose:
            self.post(user, scope="ORGANISATION")
        client = APIClient()
        client.force_authenticate(self.ceo)
        data = client.get(f"{URL}results/", {"campaign": self.campaign.id}, HTTP_HOST="localhost").data
        self.assertEqual(data["organisation"]["respondents"], 2)
        self.assertTrue(data["organisation"]["published"])
        self.assertEqual(data["organisation"]["global"], 3.5)
        # Les avis sur l'organisation ne se mêlent pas aux réponses d'équipe.
        self.assertEqual(data["company"]["respondents"], 1)
        self.assertEqual(data["teams"][0]["respondents"], 1)
        manager = APIClient()
        manager.force_authenticate(self.manager)
        self.assertNotIn("organisation", manager.get(f"{URL}results/", {"campaign": self.campaign.id}, HTTP_HOST="localhost").data)
