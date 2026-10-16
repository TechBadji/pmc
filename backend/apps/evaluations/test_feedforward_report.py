from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign, Feedback360

URL = "/api/feedback-360/report/"
ROUND1 = {
    "human_qualities": "Ton écoute et ta disponibilité 🙂 : tu trouves toujours un moment pour aider.",
    "professional_contribution": "Rigueur, fiabilité et sens du client.",
    "achievements": "1. La mise en service du portail client : les clients suivent leurs demandes.",
    "impact_leadership": "Déléguer davantage et faire grandir ton équipe.",
    "impact_skills": "Mieux organiser tes priorités de la semaine.",
    "potential": "Un rôle d'encadrement d'ici trois ans.",
    "commitment": "Te donner un retour franc après chaque dossier.",
    "commitment_first_action": "Un point mensuel à deux.",
    "commitment_from": "Dès novembre.",
    "commitment_how": "Je réponds dans la journée.",
}


class FeedforwardReportTests(TestCase):
    """Rapports PDF du 360° Feedforward : réservés au dirigeant, bornés à son
    entreprise, refusés avec un motif quand il n'y a rien à présenter."""

    def setUp(self):
        self.company = Company.objects.create(name="Rapport Co", slug="rapport-co")
        self.dept = Department.objects.create(company=self.company, code="OPS", name="Opérations")
        self.ceo = User.objects.create_user(email="ceo@r.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company,
                                            generated_login="RCEO", first_name="Awa", last_name="Diop", position="CEO")
        self.manager = User.objects.create_user(email="m@r.co", password="x", role=User.Role.MANAGER, company=self.company,
                                                department=self.dept, generated_login="RM", first_name="Bira", last_name="Ndiaye", position="COO")
        self.dept.manager = self.manager
        self.dept.save()
        self.members = [
            User.objects.create_user(email=f"e{n}@r.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept,
                                     manager=self.manager, generated_login=f"RE{n}", first_name=f"Coumba{n}", last_name="Sarr")
            for n in range(3)
        ]
        self.campaign = EvaluationCampaign.objects.create(company=self.company, name="Semestre 1 2026", start_date=date(2026, 1, 1), end_date=date(2026, 6, 30))
        subject = self.members[0]
        for author, relation in ((self.manager, "MANAGER"), (self.members[1], "PEER"), (self.members[2], "PEER")):
            Feedback360.objects.create(company=self.company, campaign=self.campaign, subject=subject, author=author, kind="FORWARD",
                                       relation=relation, answers=ROUND1)
        Feedback360.objects.create(company=self.company, campaign=self.campaign, subject=subject, author=subject, kind="FORWARD", relation="SELF",
                                   answers={"priorities": "Déléguer davantage", "support": "Un retour mensuel"})
        # Un avis d'avant le guide, sans réponse : il ne compte pas.
        Feedback360.objects.create(company=self.company, campaign=self.campaign, subject=self.members[1], author=self.members[0],
                                   kind="FORWARD", relation="PEER", text_a="Commencer à déléguer")
        other = Company.objects.create(name="Autre", slug="autre")
        self.other_campaign = EvaluationCampaign.objects.create(company=other, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        self.stranger = User.objects.create_user(email="s@o.co", password="x", role=User.Role.MEMBER, company=other, generated_login="RSTR")

    def get(self, user, **params):
        client = APIClient()
        client.force_authenticate(user)
        return client.get(URL, params, HTTP_HOST="localhost")

    def test_global_report_is_a_pdf_with_a_meaningful_name(self):
        response = self.get(self.ceo, campaign=self.campaign.id, scope="global")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn("Rapport-Co_360-Feedforward_Rapport-global_Semestre-1-2026.pdf", response["Content-Disposition"])

    def test_individual_report_is_a_pdf(self):
        response = self.get(self.ceo, campaign=self.campaign.id, scope="individual", subject=self.members[0].id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn("Round-1_Coumba0-Sarr", response["Content-Disposition"])

    def test_nothing_to_report_is_refused_with_a_reason(self):
        response = self.get(self.ceo, campaign=self.campaign.id, scope="individual", subject=self.members[2].id)
        self.assertEqual(response.status_code, 400)
        self.assertIn("aucune contribution Round 1", str(response.data))
        empty = EvaluationCampaign.objects.create(company=self.company, name="2027", start_date=date(2027, 1, 1), end_date=date(2027, 12, 31))
        self.assertEqual(self.get(self.ceo, campaign=empty.id, scope="global").status_code, 400)

    def test_only_the_leader_and_only_inside_the_company(self):
        for user in (self.manager, self.members[0]):
            self.assertEqual(self.get(user, campaign=self.campaign.id, scope="global").status_code, 403)
        self.assertEqual(self.get(self.ceo, campaign=self.other_campaign.id, scope="global").status_code, 400)
        self.assertEqual(self.get(self.ceo, campaign=self.campaign.id, scope="individual", subject=self.stranger.id).status_code, 400)
        self.assertEqual(self.get(self.ceo, campaign=self.campaign.id, scope="autre").status_code, 400)

    def test_theme_coding(self):
        from apps.evaluations.feedforward_report import BEHAVIOUR, POTENTIAL, themes_in

        self.assertEqual(themes_in("Ton ÉCOUTE et ta disponibilité", BEHAVIOUR), {"ecoute"})
        self.assertIn("delegation", themes_in("Déléguer davantage et faire grandir ton équipe.", BEHAVIOUR))
        self.assertNotIn("communication", themes_in("Ce projet nous a éclairés.", BEHAVIOUR))
        self.assertEqual(themes_in("Un rôle d'encadrement d'ici trois ans.", POTENTIAL), {"management"})
        self.assertIn("energie", themes_in("Toujours de bonne humeur, très positive", BEHAVIOUR))
        self.assertNotIn("energie", themes_in("Sa position sur le sujet est claire", BEHAVIOUR))
        self.assertIn("direction", themes_in("Je te vois prendre des responsabilités plus larges, jusqu'au C-level", POTENTIAL))
