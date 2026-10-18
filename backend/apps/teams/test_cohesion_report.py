from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Company, Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.teams.cohesion_report import CRITERIA, criterion_of
from apps.teams.models import CohesionResponse, TeamBoard, TeamRelationship

URL = "/api/cohesion-responses/report/"
LABELS = [
    "La vision de {c} sur les 10 à 15 prochaines années est clairement définie",
    "Tout le personnel comprend la vision et les valeurs de {c} et peut l'expliquer clairement",
    "Tous les employés se sont appropriés la vision et les valeurs de {c}",
    "Chaque employé connaît ses objectifs individuels et comment ils sont liés aux objectifs globaux",
    "Chaque membre est très engagé pour atteindre les objectifs fixés à l'équipe",
    "Tous les employés de {c} mettent les intérêts de l'organisation au-dessus de leurs intérêts personnels",
    "Il y a une bonne communication verticale entre le Top Management et le reste de {c}",
    "Il y a une bonne communication horizontale entre les différents départements/directions",
    "Il y a un niveau élevé de confiance entre le Top Management et le reste de {c}",
    "Il y a un niveau élevé de confiance entre les employés de {c} eux-mêmes",
]


class CohesionReportTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Rapport Co", slug="rapport-co")
        self.ceo = User.objects.create_user(email="ceo@r.co", password="x", role=User.Role.COMPANY_ADMIN, company=self.company, generated_login="RCEO")
        self.dept = Department.objects.create(company=self.company, code="A", name="Alpha")
        self.other = Department.objects.create(company=self.company, code="B", name="Beta")
        self.manager = User.objects.create_user(email="m@r.co", password="x", role=User.Role.MANAGER, company=self.company, department=self.dept, generated_login="RM")
        self.dept.manager = self.manager
        self.dept.save()
        self.members = [User.objects.create_user(email=f"e{n}@r.co", password="x", role=User.Role.MEMBER, company=self.company,
                                                 department=self.dept, generated_login=f"RE{n}") for n in range(3)]
        self.campaign = EvaluationCampaign.objects.create(company=self.company, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))

    def get(self, user, **params):
        client = APIClient()
        client.force_authenticate(user)
        return client.get(URL, {"campaign": self.campaign.id, **params}, HTTP_HOST="localhost")

    def answer(self, user, scope="ORGANISATION"):
        name = self.company.name if scope == "ORGANISATION" else self.dept.name
        CohesionResponse.objects.create(scope=scope, company=self.company, team=None if scope == "ORGANISATION" else self.dept,
                                        respondent=user, date=date(2026, 3, 1),
                                        scores=[{"criterion": label.format(c=name), "score": 1 + (i + user.id) % 5} for i, label in enumerate(LABELS)])

    def test_every_criterion_label_is_recognised(self):
        self.assertEqual([criterion_of(label.format(c="X")).key for label in LABELS], [c.key for c in CRITERIA])

    def test_members_are_refused(self):
        self.assertEqual(self.get(self.members[0], kind="cohesion").status_code, 403)

    def test_report_waits_for_the_anonymity_threshold(self):
        self.answer(self.members[0])
        refused = self.get(self.ceo, kind="cohesion")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("1 à ce jour", str(refused.data))

    def test_ceo_gets_the_organisation_report_once_enough_people_answered(self):
        for member in self.members:
            self.answer(member)
        response = self.get(self.ceo, kind="cohesion")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn("Organisation", response["Content-Disposition"])

    def test_manager_reads_his_own_direction_only(self):
        for member in self.members:
            self.answer(member, scope="TEAM")
        self.assertEqual(self.get(self.manager, kind="cohesion", team=self.dept.id).status_code, 200)
        self.assertEqual(self.get(self.manager, kind="cohesion").status_code, 400)
        self.assertEqual(self.get(self.manager, kind="cohesion", team=self.other.id).status_code, 400)

    def test_relational_report_needs_relationships_or_a_board(self):
        self.assertEqual(self.get(self.ceo, kind="relational", team=self.dept.id).status_code, 400)
        TeamRelationship.objects.create(team=self.dept, from_user=self.members[0], to_user=self.members[1], quality="EXCELLENT")
        TeamRelationship.objects.create(team=self.dept, from_user=self.members[1], to_user=self.members[0], quality="DIFFICULT")
        TeamBoard.objects.create(team=self.dept, date=date(2026, 3, 1), toxins=["Rumeurs"], catalysts=["Entraide"])
        response = self.get(self.ceo, kind="relational", team=self.dept.id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b"%PDF"))


class IceReadingTests(TestCase):
    def test_ice_is_read_on_its_value_rounded_to_one_decimal(self):
        from apps.teams.cohesion_report import ice_band
        self.assertEqual([ice_band(v) for v in (2.94, 2.95, 3.5, 3.94, 3.95, 4.0, 4.6)],
                         ["group", "average", "average", "average", "strong", "strong", "strong"])
