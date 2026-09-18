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
