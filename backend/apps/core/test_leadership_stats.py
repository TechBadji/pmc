from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, User

URL = "/api/users/leadership-stats/"


class LeadershipStatsTests(TestCase):
    """Saisie rapide des chiffres de l'équipe dirigeante : réservée au
    dirigeant, contrôlée avant toute écriture."""

    def setUp(self):
        self.company = Company.objects.create(name="Lead Co", slug="lead-co")
        self.ceo = User.objects.create_user(email="ceo@l.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="LCEO")
        self.a = User.objects.create_user(email="a@l.co", password="x", role=User.Role.MANAGER, company=self.company, generated_login="LA", first_name="Awa")
        self.b = User.objects.create_user(email="b@l.co", password="x", role=User.Role.MANAGER, company=self.company, generated_login="LB", first_name="Bira")
        other = Company.objects.create(name="Autre", slug="autre")
        self.stranger = User.objects.create_user(email="s@o.co", password="x", role=User.Role.MANAGER, company=other, generated_login="LS")

    def post(self, user, rows):
        client = APIClient()
        client.force_authenticate(user)
        return client.post(URL, {"rows": rows}, format="json", HTTP_HOST="localhost")

    def test_ceo_saves_and_the_figures_are_served(self):
        response = self.post(self.ceo, [{"user": self.a.id, "age": 41, "years_in_role": 3, "years_in_company": 8, "total_experience": 17, "team_managers": 5, "extra": 1}])
        self.assertEqual(response.status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.leadership_stats, {"age": 41, "years_in_role": 3, "years_in_company": 8, "total_experience": 17, "team_managers": 5})
        client = APIClient()
        client.force_authenticate(self.ceo)
        served = client.get(f"/api/users/{self.a.id}/", HTTP_HOST="localhost").data
        self.assertEqual(served["leadership_stats"]["age"], 41)

    def test_an_empty_box_gives_back_the_computed_value(self):
        self.post(self.ceo, [{"user": self.a.id, "age": 41}])
        self.post(self.ceo, [{"user": self.a.id, "age": None, "team_managers": ""}])
        self.a.refresh_from_db()
        self.assertEqual(self.a.leadership_stats, {})

    def test_one_bad_line_saves_nothing_and_says_why(self):
        response = self.post(self.ceo, [
            {"user": self.a.id, "age": 40},
            {"user": self.b.id, "age": 12, "years_in_role": 9, "years_in_company": 4},
        ])
        self.assertEqual(response.status_code, 400)
        text = " ".join(response.data["rows"])
        self.assertIn("Bira", text)
        self.assertIn("entre 18 et 80", text)
        self.assertIn("ne peut pas dépasser l'ancienneté", text)
        self.a.refresh_from_db()
        self.assertEqual(self.a.leadership_stats, {})

    def test_only_the_ceo_and_only_inside_the_company(self):
        self.assertEqual(self.post(self.a, [{"user": self.b.id, "age": 40}]).status_code, 403)
        self.assertEqual(self.post(self.ceo, [{"user": self.stranger.id, "age": 40}]).status_code, 400)
        self.stranger.refresh_from_db()
        self.assertEqual(self.stranger.leadership_stats, {})
