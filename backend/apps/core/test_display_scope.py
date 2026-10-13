from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, User


class DisplayScopeTests(TestCase):
    """Rubriques affichées d'une entreprise : réglées par le super
    administrateur, lues par les utilisateurs de l'entreprise."""

    def setUp(self):
        self.company = Company.objects.create(name="Scope Co", slug="scope-co")
        self.admin = User.objects.create_user(email="sa@x.co", password="x", role=User.Role.SUPER_ADMIN, generated_login="DSA")
        self.ceo = User.objects.create_user(email="ceo@x.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="DCEO")
        self.url = f"/api/companies/{self.company.id}/"

    def patch(self, user, scope):
        client = APIClient()
        client.force_authenticate(user)
        return client.patch(self.url, {"display_scope": scope}, format="json", HTTP_HOST="localhost")

    def test_super_admin_sets_it_and_the_company_reads_it(self):
        scope = {"nav": {"MANAGER": ["/evaluations", "/"]}, "hidden_views_by_role": {"MEMBER": ["evaluations.id3a"], "MANAGER": []}}
        response = self.patch(self.admin, scope)
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.display_scope, {"nav": {"MANAGER": ["/", "/evaluations"]}, "hidden_views_by_role": {"MEMBER": ["evaluations.id3a"]}})
        client = APIClient()
        client.force_authenticate(self.ceo)
        self.assertEqual(client.get("/api/auth/me/", HTTP_HOST="localhost").data["company_display_scope"], self.company.display_scope)

    def test_everything_shown_is_an_empty_scope(self):
        self.patch(self.admin, {"nav": {"MANAGER": ["/"]}})
        self.assertEqual(self.patch(self.admin, {}).status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.display_scope, {})

    def test_the_company_itself_cannot_change_it(self):
        self.assertEqual(self.patch(self.ceo, {"nav": {"MANAGER": ["/"]}}).status_code, 403)

    def test_unexpected_shapes_are_refused_with_a_reason(self):
        for scope in ({"nav": {"SUPER_ADMIN": ["/"]}}, {"nav": {"MANAGER": ["javascript:alert(1)"]}}, {"hidden_views": ["<b>"]}, {"other": 1}, []):
            response = self.patch(self.admin, scope)
            self.assertEqual(response.status_code, 400, scope)
            self.assertTrue(str(response.data["display_scope"][0]))
