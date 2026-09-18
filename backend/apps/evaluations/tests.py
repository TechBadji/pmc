from datetime import date, timedelta

from django.test import TestCase

from apps.core.models import Company
from apps.evaluations.models import EvaluationCampaign


class EffectiveEndDateTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Co", slug="test-co")
        self.today = date.today()

    def campaign(self, name, start, end, closed=False):
        return EvaluationCampaign.objects.create(
            company=self.company, name=name, start_date=start, end_date=end, is_closed=closed
        )

    def test_closed_campaign_stops_at_its_end_date(self):
        c = self.campaign("2020", date(2020, 1, 1), date(2020, 12, 31), closed=True)
        self.assertEqual(c.effective_end_date, date(2020, 12, 31))

    def test_open_campaign_keeps_receiving_entries_after_its_end_date(self):
        c = self.campaign("S1", self.today - timedelta(days=400), self.today - timedelta(days=200))
        self.assertEqual(c.effective_end_date, self.today)

    def test_open_campaign_never_reaches_the_next_campaign(self):
        first = self.campaign("A", self.today - timedelta(days=400), self.today - timedelta(days=200))
        self.campaign("B", self.today - timedelta(days=100), self.today + timedelta(days=100))
        self.assertEqual(first.effective_end_date, self.today - timedelta(days=101))

    def test_open_campaign_in_the_future_keeps_its_end_date(self):
        c = self.campaign("F", self.today, self.today + timedelta(days=90))
        self.assertEqual(c.effective_end_date, self.today + timedelta(days=90))

    def test_closing_freezes_the_window_so_late_entries_stay_in_the_campaign(self):
        c = self.campaign("S1", self.today - timedelta(days=400), self.today - timedelta(days=200))
        c.is_closed, c.closed_on = True, self.today - timedelta(days=30)
        c.save()
        self.assertEqual(c.effective_end_date, self.today - timedelta(days=30))

    def test_closed_campaign_without_a_closing_day_keeps_its_end_date(self):
        c = self.campaign("Old", date(2020, 1, 1), date(2020, 6, 30), closed=True)
        self.assertEqual(c.effective_end_date, date(2020, 6, 30))


class CloseCampaignApiTests(TestCase):
    def test_close_records_the_day_and_reopen_clears_it(self):
        from rest_framework.test import APIClient

        from apps.core.models import User

        company = Company.objects.create(name="Api Co", slug="api-co")
        ceo = User.objects.create_user(
            email="ceo@api.co", password="x", role=User.Role.COMPANY_ADMIN, company=company, generated_login="APICEO"
        )
        camp = EvaluationCampaign.objects.create(
            company=company, name="S1", start_date=date(2020, 1, 1), end_date=date(2020, 6, 30)
        )
        client = APIClient()
        client.force_authenticate(ceo)
        client.post(f"/api/evaluation-campaigns/{camp.pk}/close/", HTTP_HOST="localhost")
        camp.refresh_from_db()
        self.assertTrue(camp.is_closed)
        self.assertEqual(camp.closed_on, date.today())
        self.assertEqual(camp.effective_end_date, date.today())
        client.post(f"/api/evaluation-campaigns/{camp.pk}/reopen/", HTTP_HOST="localhost")
        camp.refresh_from_db()
        self.assertFalse(camp.is_closed)
        self.assertIsNone(camp.closed_on)
