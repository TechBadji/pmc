from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Company, Presence, User

URL = "/api/presence/"


class PresenceTests(TestCase):
    """Comptes et instances connectés : signalés par chacun, lus par le seul
    super administrateur."""

    def setUp(self):
        self.company = Company.objects.create(name="Pres Co", slug="pres-co")
        self.admin = User.objects.create_user(email="sa@p.co", password="x", role=User.Role.SUPER_ADMIN, generated_login="PSAD")
        self.a = User.objects.create_user(email="a@p.co", password="x", role=User.Role.MEMBER, company=self.company, generated_login="PA1", first_name="Awa")

    def client_for(self, user):
        client = APIClient(HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36")
        client.force_authenticate(user)
        return client

    def test_two_tabs_one_person(self):
        client = self.client_for(self.a)
        for instance in ("tab-aaaaaaaa", "tab-bbbbbbbb", "tab-aaaaaaaa"):
            self.assertEqual(client.post(URL, {"instance": instance}, format="json", HTTP_HOST="localhost").status_code, 204)
        data = self.client_for(self.admin).get(URL, HTTP_HOST="localhost").data
        self.assertEqual((data["people"], data["instances"]), (1, 2))
        account = data["accounts"][0]
        self.assertEqual((account["login"], account["company"]), ("PA1", "Pres Co"))
        self.assertEqual(account["instances"][0]["browser"], "Chrome sur Windows")

    def test_silent_or_closed_instances_are_not_counted(self):
        client = self.client_for(self.a)
        client.post(URL, {"instance": "tab-aaaaaaaa"}, format="json", HTTP_HOST="localhost")
        client.post(URL, {"instance": "tab-bbbbbbbb"}, format="json", HTTP_HOST="localhost")
        client.delete(URL, {"instance": "tab-bbbbbbbb"}, format="json", HTTP_HOST="localhost")
        Presence.objects.filter(instance="tab-aaaaaaaa").update(last_seen=timezone.now() - timedelta(minutes=10))
        data = self.client_for(self.admin).get(URL, HTTP_HOST="localhost").data
        self.assertEqual((data["people"], data["instances"]), (0, 0))

    def test_only_the_super_admin_reads_it(self):
        self.assertEqual(self.client_for(self.a).get(URL, HTTP_HOST="localhost").status_code, 403)
        self.assertEqual(APIClient().post(URL, {"instance": "tab-aaaaaaaa"}, format="json", HTTP_HOST="localhost").status_code, 401)
        self.assertEqual(self.client_for(self.a).post(URL, {"instance": "x"}, format="json", HTTP_HOST="localhost").status_code, 400)
