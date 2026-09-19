from datetime import date, timedelta

from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.exception_handler import custom_exception_handler
from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.models import TeamRelationship


class ExceptionHandlerTests(TestCase):
    def test_integrity_error_becomes_a_readable_400(self):
        response = custom_exception_handler(IntegrityError("duplicate key"), {})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "conflict")
        self.assertIn("existe déjà", response.data["detail"])

    def test_unexpected_error_returns_json_with_a_support_reference(self):
        response = custom_exception_handler(RuntimeError("boom"), {"request": None})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["code"], "server_error")
        self.assertEqual(len(response.data["reference"]), 8)


class ApiMessagesTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Msg Co", slug="msg-co")
        self.ceo = User.objects.create_user(
            email="ceo@msg.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="MSGCEO"
        )
        self.dept = Department.objects.create(company=self.company, code="DT", name="Technique", manager=self.ceo)
        self.a = User.objects.create_user(email="a@msg.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept, generated_login="MSGA")
        self.b = User.objects.create_user(email="b@msg.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept, generated_login="MSGB")
        self.client = APIClient()
        self.client.force_authenticate(self.ceo)

    def post(self, path, body):
        return self.client.post(f"/api/{path}/", body, format="json", HTTP_HOST="localhost")

    def test_missing_object_is_explained_in_french(self):
        response = self.client.get("/api/evaluations/999999/", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 404)
        self.assertIn("introuvable", response.data["detail"].lower())

    def test_duplicate_campaign_name_is_a_clean_400(self):
        EvaluationCampaign.objects.create(company=self.company, name="S1", start_date=date(2030, 1, 1), end_date=date(2030, 6, 30))
        response = self.post("evaluation-campaigns", {"name": "s1", "start_date": "2031-01-01", "end_date": "2031-06-30"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("existe déjà", str(response.data["name"]))

    def test_duplicate_department_code_is_explained(self):
        response = self.post("departments", {"name": "Autre", "code": "dt"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("déjà utilisé", str(response.data["code"]))

    def test_relationship_with_oneself_is_refused(self):
        response = self.post("team-relationships", {"team": self.dept.pk, "from_user": self.a.pk, "to_user": self.a.pk, "quality": "CORRECT"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("deux personnes différentes", str(response.data["to_user"]))
        self.assertEqual(TeamRelationship.objects.count(), 0)

    def test_reverse_duplicate_relationship_is_refused(self):
        TeamRelationship.objects.create(team=self.dept, from_user=self.a, to_user=self.b, quality="CORRECT")
        response = self.post("team-relationships", {"team": self.dept.pk, "from_user": self.b.pk, "to_user": self.a.pk, "quality": "TOXIC"})
        self.assertEqual(response.status_code, 400)

    def test_cohesion_answer_in_the_future_is_refused(self):
        tomorrow = str(date.today() + timedelta(days=1))
        response = self.post("cohesion-responses", {"scope": "TEAM", "team": self.dept.pk, "date": tomorrow, "scores": [{"criterion": "c", "score": 3}]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("futur", str(response.data["date"]))

    def test_cohesion_score_out_of_range_names_the_criterion(self):
        response = self.post("cohesion-responses", {"scope": "TEAM", "team": self.dept.pk, "date": str(date.today()), "scores": [{"criterion": "c", "score": 9}]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("n°1", str(response.data["scores"]))

    def test_user_dates_must_be_consistent(self):
        response = self.client.patch(f"/api/users/{self.a.pk}/", {"birth_date": "1990-01-01", "hire_date": "1980-01-01"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 400)
        self.assertIn("hire_date", response.data)

    def test_dev_plan_bad_date_is_reported_not_a_server_error(self):
        self.ceo.role = User.Role.COMPANY_ADMIN
        manager = User.objects.create_user(email="m@msg.co", password="x", role=User.Role.MANAGER, company=self.company, department=self.dept, generated_login="MSGM")
        item = {"category": "HARD_SKILLS", "priority_order": 1, "order": 1, "priority": "p", "objective": "o", "start_date": "31/02/2026"}
        response = self.post("action-plans/bulk-save-dev-plan", {"target_user": manager.pk, "items": [item]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("date", str(response.data["items"]))


class OwnProfileTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Prof Co", slug="prof-co")
        self.dept = Department.objects.create(company=self.company, code="DT", name="Technique")
        self.member = User.objects.create_user(email="m@prof.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept, generated_login="PM1")
        self.other = User.objects.create_user(email="o@prof.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept, generated_login="PM2")

    def put(self, user, body):
        client = APIClient()
        client.force_authenticate(user)
        return client.put("/api/performance-profiles/save-for-user/", body, format="json", HTTP_HOST="localhost")

    def test_a_member_fills_their_own_sheet_without_the_assessed_fields(self):
        response = self.put(self.member, {"user": self.member.pk, "gender": "Femme", "hobbies": ["Lecture"], "performance_pct": "150", "performer_category": "OUTSTANDING"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["hobbies"], ["Lecture"])
        self.assertEqual(response.data["performance_pct"], "")
        self.assertEqual(response.data["performer_category"], "")

    def test_a_member_cannot_fill_someone_elses_sheet(self):
        response = self.put(self.member, {"user": self.other.pk, "gender": "Homme"})
        self.assertEqual(response.status_code, 403)

    def test_list_limits_and_dates_are_explained(self):
        too_many = self.put(self.member, {"user": self.member.pk, "hobbies": ["a", "b", "c"]})
        self.assertEqual(too_many.status_code, 400)
        self.assertIn("2 lignes au plus", str(too_many.data["hobbies"]))
        bad_date = self.put(self.member, {"user": self.member.pk, "previous_position_dates": ["2999"]})
        self.assertEqual(bad_date.status_code, 400)
        self.assertIn("invalide", str(bad_date.data["previous_position_dates"]))
