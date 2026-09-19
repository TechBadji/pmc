from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from apps.actionplans.models import ActionPlan
from apps.core.models import Company, Department, PerformanceProfile, User
from apps.evaluations.models import Evaluation, EvaluationCampaign, ManagerialSelfAssessment, SkillNote
from apps.teams.models import CohesionResponse, TeamBoard, TeamCohesionAnalysis, TeamRelationship

PATHS = {
    "settings": "/api/company-settings/",
    "catalogue": "/api/company-settings/data-reset/",
    "preview": "/api/company-settings/data-reset/preview/",
    "run": "/api/company-settings/data-reset/run/",
}


class Base(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Reset Co", slug="reset-co")
        self.other = Company.objects.create(name="Other Co", slug="other-co")
        self.ceo = User.objects.create_user(email="ceo@r.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="RCEO")
        self.dept_a = Department.objects.create(company=self.company, code="A", name="Alpha", manager=self.ceo)
        self.dept_b = Department.objects.create(company=self.company, code="B", name="Beta")
        self.a1 = User.objects.create_user(email="a1@r.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept_a, generated_login="RA1")
        self.b1 = User.objects.create_user(email="b1@r.co", password="x", role=User.Role.MEMBER, company=self.company, department=self.dept_b, generated_login="RB1")
        self.foreign = User.objects.create_user(email="f@o.co", password="x", role=User.Role.MEMBER, company=self.company and self.other, generated_login="OF1")
        self.old = EvaluationCampaign.objects.create(company=self.company, name="Old", start_date=date(2024, 1, 1), end_date=date(2024, 12, 31), is_closed=True)
        self.new = EvaluationCampaign.objects.create(company=self.company, name="New", start_date=date(2025, 1, 1), end_date=date(2025, 12, 31), is_closed=True)
        self.foreign_campaign = EvaluationCampaign.objects.create(company=self.other, name="Foreign", start_date=date(2024, 1, 1), end_date=date(2024, 12, 31))
        for user in (self.a1, self.b1):
            for campaign in (self.old, self.new):
                ev = Evaluation.objects.create(user=user, campaign=campaign, evaluator=self.ceo)
                SkillNote.objects.create(evaluation=ev, category="SOFT_STRENGTH", order=1, text="x")
        self.foreign_eval = Evaluation.objects.create(user=self.foreign, campaign=self.foreign_campaign)
        TeamCohesionAnalysis.objects.create(team=self.dept_a, date=date(2024, 6, 1))
        TeamCohesionAnalysis.objects.create(team=self.dept_a, date=date(2025, 6, 1))
        TeamCohesionAnalysis.objects.create(team=self.dept_b, date=date(2025, 6, 1))
        CohesionResponse.objects.create(scope="TEAM", team=self.dept_a, company=self.company, respondent=self.a1, date=date(2024, 6, 1), scores=[])
        CohesionResponse.objects.create(scope="TEAM", team=self.dept_a, company=self.company, respondent=self.a1, date=date(2025, 6, 1), scores=[])
        CohesionResponse.objects.create(scope="ORGANISATION", company=self.company, respondent=self.a1, date=date(2025, 6, 1), scores=[])
        TeamBoard.objects.create(team=self.dept_a, date=date(2025, 6, 1))
        ActionPlan.objects.create(manager=self.ceo, team=self.dept_a, category="HARD_SKILLS", priority="p", objective="o")
        TeamRelationship.objects.create(team=self.dept_a, from_user=self.a1, to_user=self.ceo, quality="CORRECT")
        PerformanceProfile.objects.create(user=self.a1)
        ManagerialSelfAssessment.objects.create(user=self.ceo, campaign=self.new, category="COMMUNICATION", scores=[])
        self.client = APIClient()
        self.client.force_authenticate(self.ceo)

    def call(self, name, body=None, method="post", user=None):
        client = self.client
        if user is not None:
            client = APIClient()
            client.force_authenticate(user)
        return getattr(client, method)(PATHS[name], body, format="json", HTTP_HOST="localhost")


class CompanySettingsTests(Base):
    def test_ceo_reads_and_updates_settings(self):
        self.assertEqual(self.call("settings", method="get").data["cohesion_min_respondents"], 2)
        response = self.call("settings", {"name": "  Nouveau nom ", "cohesion_min_respondents": 5}, method="patch")
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual((self.company.name, self.company.cohesion_min_respondents), ("Nouveau nom", 5))

    def test_invalid_values_are_explained(self):
        low = self.call("settings", {"cohesion_min_respondents": 0}, method="patch")
        self.assertEqual(low.status_code, 400)
        self.assertIn("au moins 1", str(low.data))
        blank = self.call("settings", {"name": "  "}, method="patch")
        self.assertEqual(blank.status_code, 400)

    def test_only_the_ceo_reaches_the_settings(self):
        for user in (self.a1,):
            self.assertEqual(self.call("settings", method="get", user=user).status_code, 403)
            self.assertEqual(self.call("preview", {"rubriques": ["evaluations"], "campaigns": "all"}, user=user).status_code, 403)
            self.assertEqual(self.call("run", {"rubriques": ["evaluations"], "campaigns": "all", "confirm": "REMISE A ZERO"}, user=user).status_code, 403)

    def test_threshold_drives_the_publication_of_cohesion(self):
        aggregate = lambda: self.client.get("/api/cohesion-responses/aggregate/", HTTP_HOST="localhost").data
        team = lambda data: next(d for d in data["directions"] if d["team"] == self.dept_a.pk)
        CohesionResponse.objects.create(scope="TEAM", team=self.dept_a, company=self.company, respondent=self.ceo, date=date(2025, 6, 1), scores=[{"criterion": "c", "score": 4}])
        self.assertTrue(team(aggregate())["published"])
        self.call("settings", {"cohesion_min_respondents": 5}, method="patch")
        data = team(aggregate())
        self.assertFalse(data["published"])
        self.assertEqual(data["min_respondents"], 5)


class DataResetTests(Base):
    def counts(self, campaigns="all", department=None, keys=None):
        body = {"rubriques": keys or ["evaluations"], "campaigns": campaigns, "department": department}
        return {i["key"]: i["count"] for i in self.call("preview", body).data["items"]}

    def test_catalogue_flags_campaign_bound_rubriques(self):
        data = self.call("catalogue", method="get").data
        flags = {r["key"]: r["campaign_scoped"] for r in data["rubriques"]}
        self.assertTrue(flags["evaluations"])
        self.assertFalse(flags["action_plans"])
        self.assertEqual(data["confirmation"], "REMISE A ZERO")

    def test_preview_is_scoped_to_campaign_department_and_company(self):
        self.assertEqual(self.counts("all")["evaluations"], 4)
        self.assertEqual(self.counts([self.old.pk])["evaluations"], 2)
        self.assertEqual(self.counts("all", self.dept_a.pk)["evaluations"], 2)
        self.assertEqual(self.counts([self.new.pk], self.dept_b.pk)["evaluations"], 1)

    def test_cohesion_is_attached_to_a_campaign_by_its_window(self):
        keys = ["cohesion_sheets", "cohesion_answers", "team_boards"]
        self.assertEqual(self.counts([self.old.pk], keys=keys), {"cohesion_sheets": 1, "cohesion_answers": 1, "team_boards": 0})
        self.assertEqual(self.counts([self.new.pk], keys=keys), {"cohesion_sheets": 2, "cohesion_answers": 2, "team_boards": 1})
        self.assertEqual(self.counts("all", self.dept_b.pk, keys=keys), {"cohesion_sheets": 1, "cohesion_answers": 0, "team_boards": 0})

    def test_run_deletes_exactly_the_previewed_scope(self):
        before_foreign = Evaluation.objects.filter(user__company=self.other).count()
        response = self.call("run", {"rubriques": ["evaluations", "cohesion_answers"], "campaigns": [self.old.pk], "confirm": "remise à zéro"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual({i["key"]: i["count"] for i in response.data["items"]}, {"evaluations": 2, "cohesion_answers": 1})
        self.assertEqual(Evaluation.objects.filter(campaign=self.old).count(), 0)
        self.assertEqual(SkillNote.objects.filter(evaluation__campaign=self.old).count(), 0)
        self.assertEqual(Evaluation.objects.filter(campaign=self.new).count(), 2)
        self.assertEqual(SkillNote.objects.filter(evaluation__campaign=self.new).count(), 2)
        self.assertEqual(CohesionResponse.objects.count(), 2)
        self.assertEqual(Evaluation.objects.filter(user__company=self.other).count(), before_foreign)
        self.assertTrue(EvaluationCampaign.objects.filter(pk=self.old.pk).exists())
        self.assertEqual(User.objects.filter(company=self.company).count(), 3)

    def test_general_rubriques_need_all_campaigns(self):
        refused = self.call("preview", {"rubriques": ["action_plans"], "campaigns": [self.old.pk]})
        self.assertEqual(refused.status_code, 400)
        self.assertIn("Toutes les campagnes", str(refused.data["rubriques"]))
        response = self.call("run", {"rubriques": ["action_plans", "relationships", "profiles"], "campaigns": "all", "confirm": "REMISE A ZERO"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((ActionPlan.objects.count(), TeamRelationship.objects.count(), PerformanceProfile.objects.count()), (0, 0, 0))

    def test_confirmation_and_scope_are_required(self):
        body = {"rubriques": ["evaluations"], "campaigns": "all"}
        wrong = self.call("run", {**body, "confirm": "oui"})
        self.assertEqual(wrong.status_code, 400)
        self.assertIn("REMISE A ZERO", str(wrong.data["confirm"]))
        self.assertEqual(Evaluation.objects.filter(user__company=self.company).count(), 4)
        self.assertEqual(self.call("preview", {"rubriques": [], "campaigns": "all"}).status_code, 400)
        self.assertEqual(self.call("preview", {"rubriques": ["evaluations"]}).status_code, 400)
        foreign = self.call("preview", {"rubriques": ["evaluations"], "campaigns": [self.foreign_campaign.pk]})
        self.assertEqual(foreign.status_code, 400)
        self.assertIn("n'appartient pas", str(foreign.data["campaigns"]))
