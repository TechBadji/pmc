import re

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.models import Company, LoginChallenge, User


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", TWO_FACTOR_CONSOLE_EMAIL=True)
class TwoFactorTests(TestCase):
    def setUp(self):
        cache.clear()
        self.company = Company.objects.create(name="Deux Co", slug="deux-co", two_factor_enabled=True)
        self.user = User.objects.create_user(
            email="awa@example.com", password="secret123", role=User.Role.MEMBER, company=self.company, generated_login="AWA1"
        )
        self.tech = User.objects.create_user(
            email="bob@deux-co.pmc.local", password="secret123", role=User.Role.MEMBER, company=self.company, generated_login="BOB1"
        )
        self.root = User.objects.create_user(email="root@x.io", password="secret123", role=User.Role.SUPER_ADMIN, generated_login="ROOT2FA")
        self.client = APIClient()

    def login(self, ident, pwd="secret123"):
        return self.client.post("/api/auth/login/", {"email": ident, "password": pwd}, format="json", HTTP_HOST="localhost")

    def code(self, body):
        return self.client.post("/api/auth/login/code/", body, format="json", HTTP_HOST="localhost")

    def sent_code(self):
        return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)

    def test_login_by_login_sends_code_then_code_gives_tokens(self):
        r = self.login("AWA1")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["two_factor_required"])
        self.assertNotIn("access", r.data)
        self.assertEqual(mail.outbox[-1].to, ["awa@example.com"])
        r2 = self.code({"challenge": r.data["challenge"], "code": self.sent_code()})
        self.assertEqual(r2.status_code, 200)
        self.assertIn("access", r2.data)
        # Code à usage unique
        r3 = self.code({"challenge": r.data["challenge"], "code": self.sent_code()})
        self.assertEqual(r3.status_code, 400)

    @override_settings(TWO_FACTOR_DEV_CODE="121212")
    def test_dev_code_is_accepted_and_shown(self):
        r = self.login("AWA1")
        self.assertEqual(r.data["dev_code"], "121212")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("access", self.code({"challenge": r.data["challenge"], "code": "121212"}).data)

    def test_no_dev_code_by_default(self):
        r = self.login("AWA1")
        self.assertIsNone(r.data["dev_code"])
        self.assertEqual(self.code({"challenge": r.data["challenge"], "code": "121212"}).status_code, 400) if self.sent_code() != "121212" else None

    def test_login_by_real_email_also_works(self):
        self.assertTrue(self.login("awa@example.com").data["two_factor_required"])

    def test_wrong_code_counts_attempts_then_cancels(self):
        r = self.login("AWA1")
        good = self.sent_code()
        bad = "000000" if good != "000000" else "111111"
        for _ in range(LoginChallenge.MAX_ATTEMPTS - 1):
            self.assertEqual(self.code({"challenge": r.data["challenge"], "code": bad}).data["code"], "code_invalid")
        last = self.code({"challenge": r.data["challenge"], "code": bad})
        self.assertEqual(last.data["code"], "challenge_expired")
        self.assertEqual(self.code({"challenge": r.data["challenge"], "code": good}).status_code, 400)

    def test_technical_email_is_refused_with_explanation(self):
        r = self.login("BOB1")
        self.assertEqual(r.status_code, 400)
        self.assertIn("aucune adresse e-mail", str(r.data))
        self.assertEqual(len(mail.outbox), 0)

    def test_old_demo_domain_counts_as_technical(self):
        User.objects.create_user(email="ana@elias-demo.pmc", password="secret123", role=User.Role.MEMBER, company=self.company)
        r = self.login("ana@elias-demo.pmc")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_wrong_password_sends_nothing(self):
        self.assertIn(self.login("AWA1", "nope").status_code, (400, 401))
        self.assertEqual(len(mail.outbox), 0)

    def test_company_without_2fa_logs_in_directly(self):
        self.company.two_factor_enabled = False
        self.company.save()
        self.assertIn("access", self.login("BOB1").data)

    @override_settings(EMAIL_HOST="", TWO_FACTOR_CONSOLE_EMAIL=False)
    def test_cannot_enable_without_smtp(self):
        self.client.force_authenticate(self.root)
        r = self.client.post(f"/api/companies/{self.company.id}/two-factor/", {"enabled": True}, format="json", HTTP_HOST="localhost")
        self.assertEqual(r.status_code, 400)

    def test_super_admin_toggles_and_sets_email(self):
        self.client.force_authenticate(self.root)
        url = f"/api/companies/{self.company.id}/"
        r = self.client.get(url + "two-factor/", HTTP_HOST="localhost")
        self.assertEqual(sum(not a["has_real_email"] for a in r.data["accounts"]), 1)
        r = self.client.post(url + "account-email/", {"user": self.tech.id, "email": "awa@example.com"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(r.status_code, 400)
        r = self.client.post(url + "account-email/", {"user": self.tech.id, "email": "Bob@Example.com"}, format="json", HTTP_HOST="localhost")
        self.assertEqual(r.data["email"], "bob@example.com")
        r = self.client.post(url + "two-factor/", {"enabled": False}, format="json", HTTP_HOST="localhost")
        self.assertFalse(r.data["enabled"])
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post(url + "two-factor/", {"enabled": True}, format="json", HTTP_HOST="localhost").status_code, 403)
