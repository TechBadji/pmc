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


class ReportFixture(TestCase):
    """Une entreprise, une campagne, trois contributions Round 1 pour une seule
    personne et son Round 2 ; une autre entreprise pour les contrôles de cloisonnement."""

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




class FeedforwardReportTests(ReportFixture):
    """Rapports PDF du 360° Feedforward : réservés au dirigeant, bornés à son
    entreprise, refusés avec un motif quand il n'y a rien à présenter."""

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


class ReportArchiveTests(ReportFixture):
    """Archives de rapports : produites et téléchargées par le seul super
    administrateur ; l'archive contient le rapport global, un rapport par
    personne ayant reçu une contribution et un LISEZ-MOI."""

    ARCHIVES = "/api/report-archives/"

    def setUp(self):
        super().setUp()
        from apps.evaluations.views import ReportArchiveViewSet

        self.admin = User.objects.create_user(email="sa@r.co", password="x", role=User.Role.SUPER_ADMIN, generated_login="RSA")
        ReportArchiveViewSet.run_in_background = False
        self.addCleanup(setattr, ReportArchiveViewSet, "run_in_background", True)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_super_admin_builds_and_downloads_the_archive(self):
        import io
        import zipfile

        client = self.client_for(self.admin)
        created = client.post(self.ARCHIVES, {"company": self.company.id, "campaign": self.campaign.id}, format="json", HTTP_HOST="localhost")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual((created.data["status"], created.data["individual_count"]), ("READY", 1))
        self.assertEqual(len(created.data["skipped"]), 4)
        listed = client.get(self.ARCHIVES, HTTP_HOST="localhost").data
        self.assertNotIn("content", listed["results"][0])
        download = client.get(f"{self.ARCHIVES}{created.data['id']}/download/", HTTP_HOST="localhost")
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/zip")
        names = zipfile.ZipFile(io.BytesIO(download.content)).namelist()
        root = "Rapport-Co_360-Feedforward_Semestre-1-2026/"
        self.assertIn(root + "00_Rapport-Co_360-Feedforward_Rapport-global_Semestre-1-2026.pdf", names)
        self.assertIn(root + "Rapports-individuels/Rapport-Co_360-Feedforward_Round-1_Coumba0-Sarr_Semestre-1-2026.pdf", names)
        self.assertIn(root + "LISEZ-MOI.txt", names)
        self.assertEqual(len(names), 3)

    def test_only_the_super_admin(self):
        for user in (self.ceo, self.manager):
            client = self.client_for(user)
            self.assertEqual(client.get(self.ARCHIVES, HTTP_HOST="localhost").status_code, 403)
            self.assertEqual(client.post(self.ARCHIVES, {"company": self.company.id, "campaign": self.campaign.id}, format="json", HTTP_HOST="localhost").status_code, 403)

    def test_campaign_of_another_company_and_empty_campaign(self):
        client = self.client_for(self.admin)
        wrong = client.post(self.ARCHIVES, {"company": self.company.id, "campaign": self.other_campaign.id}, format="json", HTTP_HOST="localhost")
        self.assertEqual(wrong.status_code, 400)
        empty = EvaluationCampaign.objects.create(company=self.company, name="2027", start_date=date(2027, 1, 1), end_date=date(2027, 12, 31))
        failed = client.post(self.ARCHIVES, {"company": self.company.id, "campaign": empty.id}, format="json", HTTP_HOST="localhost")
        self.assertEqual(failed.data["status"], "FAILED")
        self.assertIn("aucun rapport à produire", failed.data["error"])
        self.assertEqual(client.get(f"{self.ARCHIVES}{failed.data['id']}/download/", HTTP_HOST="localhost").status_code, 400)


class SessionParticipantsTests(ReportFixture):
    """Participants de la séance : les rapports ne portent que sur eux et sur
    les contributions échangées entre eux ; la liste se règle sur la campagne."""

    def test_scope_limits_people_and_contributions(self):
        from apps.evaluations.feedforward_report import Dataset, ReportError, build_individual_report

        subject, outsider = self.members[0], self.members[2]
        self.campaign.feedforward_participants = [self.manager.id, self.members[0].id, self.members[1].id]
        self.campaign.save()
        data = Dataset.load(self.company, self.campaign)
        self.assertTrue(data.scoped)
        self.assertEqual({u.id for u in data.people}, {self.manager.id, subject.id, self.members[1].id})
        # La contribution d'un non-participant (members[2]) est écartée.
        self.assertEqual((len(data.round1), data.outside), (2, 1))
        with self.assertRaises(ReportError):
            build_individual_report(self.company, self.campaign, outsider, "x", data)

    def test_participants_are_set_on_the_campaign_with_checks(self):
        client = APIClient()
        client.force_authenticate(self.ceo)
        url = f"/api/evaluation-campaigns/{self.campaign.id}/"
        ok = client.patch(url, {"feedforward_participants": [self.manager.id, self.members[0].id, self.members[0].id]}, format="json", HTTP_HOST="localhost")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data["feedforward_participants"], sorted([self.manager.id, self.members[0].id]))
        bad = client.patch(url, {"feedforward_participants": [self.stranger.id]}, format="json", HTTP_HOST="localhost")
        self.assertEqual(bad.status_code, 400)
        activity = client.get(url, {"activity": "1"}, HTTP_HOST="localhost").data["feedforward_activity"]
        self.assertEqual(activity[self.members[0].id]["received"], 3)
        self.assertEqual(activity[self.manager.id]["given"], 1)
        member = APIClient()
        member.force_authenticate(self.members[1])
        self.assertIsNone(member.get(url, {"activity": "1"}, HTTP_HOST="localhost").data["feedforward_activity"])

