from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign, Feedback360

URL = "/api/feedback-360/"


class FeedforwardGuideTests(TestCase):
    """Guide ID-PMC Feedforward : Round 1 donné à un collègue, signé ; Round 2
    décidé par la personne elle-même."""

    def setUp(self):
        self.company = Company.objects.create(name="Ff Co", slug="ff-co")
        self.ceo = User.objects.create_user(email="ceo@f.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="FCEO", first_name="Chef")
        self.a = User.objects.create_user(email="a@f.co", password="x", role=User.Role.MEMBER, company=self.company, generated_login="FA", first_name="Awa")
        self.b = User.objects.create_user(email="b@f.co", password="x", role=User.Role.MEMBER, company=self.company, generated_login="FB", first_name="Bira")
        self.campaign = EvaluationCampaign.objects.create(company=self.company, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def give(self, author, subject, answers):
        return self.client_for(author).post(
            URL, {"campaign": self.campaign.id, "subject": subject.id, "kind": "FORWARD", "answers": answers}, format="json", HTTP_HOST="localhost"
        )

    def received(self, reader, subject):
        return self.client_for(reader).get(
            f"{URL}received/", {"campaign": self.campaign.id, "kind": "FORWARD", "subject": subject.id}, HTTP_HOST="localhost"
        )

    def test_round1_is_signed_and_round2_is_the_subjects_own(self):
        self.assertEqual(self.give(self.a, self.b, {"human_qualities": " À l'écoute ", "commitment": "Te relire", "potential": ""}).status_code, 201)
        self.assertEqual(self.give(self.b, self.b, {"priorities": "Déléguer", "commitment_90_days": "Un point hebdomadaire"}).status_code, 201)
        data = self.received(self.b, self.b).data
        self.assertEqual(len(data["round1"]), 1)
        self.assertEqual(data["round1"][0]["author_name"], "Awa")
        # Les rubriques vides ne sont pas gardées, les autres sont nettoyées.
        self.assertEqual(data["round1"][0]["answers"], {"human_qualities": "À l'écoute", "commitment": "Te relire"})
        self.assertEqual(data["round2"], {"priorities": "Déléguer", "commitment_90_days": "Un point hebdomadaire"})

    def test_each_round_only_takes_its_own_questions(self):
        self.assertEqual(self.give(self.a, self.b, {"priorities": "Déléguer"}).status_code, 400)
        self.assertEqual(self.give(self.b, self.b, {"human_qualities": "Modeste"}).status_code, 400)
        self.assertEqual(self.give(self.a, self.b, {}).status_code, 400)
        self.assertEqual(self.give(self.a, self.b, {"potential": "x" * 2001}).status_code, 400)

    def test_answers_given_before_the_guide_stay_hidden(self):
        Feedback360.objects.create(company=self.company, campaign=self.campaign, subject=self.b, author=self.a, kind="FORWARD", relation="PEER", text_a="Commencer à déléguer")
        data = self.received(self.b, self.b).data
        self.assertEqual((data["round1"], data["round2"]), ([], None))

    def test_a_colleague_cannot_read_what_another_received(self):
        self.give(self.a, self.b, {"human_qualities": "À l'écoute"})
        self.assertEqual(self.received(self.a, self.b).status_code, 403)
        self.assertEqual(len(self.received(self.ceo, self.b).data["round1"]), 1)
