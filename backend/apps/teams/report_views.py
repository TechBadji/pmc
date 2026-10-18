"""Point d'entrée unique des rapports PDF : `GET /api/reports/pdf/`.

Paramètres : `kind` (voir `KINDS`), `campaign`, et selon le rapport `team`
(une direction ; sans elle, l'organisation entière, réservée au dirigeant) ou
`subject` (une personne). Les droits sont ceux des écrans : le dirigeant lit
toute l'entreprise, un directeur ses directions (ou celle d'un pair qu'il est
autorisé à consulter), un collaborateur seulement sa propre fiche
Performance ID. Rien n'est écrit en base ; chaque génération est journalisée.
"""
from urllib.parse import quote

from django.http import HttpResponse
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.audit import log_event
from apps.core.models import Department, User
from apps.core.scoping import readable_department_ids
from apps.evaluations import talent_reports as T
from apps.evaluations.feedforward_report import ReportError, name_of, slug
from apps.evaluations.models import EvaluationCampaign

from . import cohesion_report as C
from . import team_reports as R

COHESION, TALENTS = ("COHESION",), ("ID3A", "EVALUATIONS")

# kind → (libellé, constructeur, rubriques de droit, cible : "team" | "team_required" | "subject", nom de fichier)
KINDS = {
    "cohesion": ("Cohésion d'équipe", C.build_cohesion_report, COHESION, "team", "Cohesion-equipe"),
    "relational": ("Dynamique relationnelle", C.build_relational_report, COHESION, "team", "Dynamique-relationnelle"),
    "psi": ("Psychological Safety", R.build_psi_report, COHESION, "team", "Psychological-Safety"),
    "strengths": ("Forces & faiblesses", R.build_strengths_report, COHESION, "team", "Forces-faiblesses"),
    "team_id": ("Team Performance ID", R.build_team_id_report, COHESION, "team_required", "Team-Performance-ID"),
    "id3a": ("Matrice ID-3A", T.build_id3a_report, TALENTS, "team", "Matrice-ID-3A"),
    "ninebox": ("9 Box", T.build_ninebox_report, TALENTS, "team", "9-Box"),
    "tpd": ("ID-TPD", T.build_tpd_report, TALENTS, "team", "ID-TPD"),
    "person_id": ("Performance ID", T.build_person_id_report, TALENTS, "subject", "Performance-ID"),
}


def _can_read_person(request, subject):
    user = request.user
    if subject.id == user.id or user.role == user.Role.COMPANY_ADMIN:
        return True
    if user.role == user.Role.MANAGER:
        return subject.manager_id == user.id or subject.department_id in readable_department_ids(request, TALENTS)
    return False


class ReportPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        kind = request.query_params.get("kind")
        if kind not in KINDS:
            raise ValidationError({"kind": "Type de rapport inconnu."})
        label, build, rubrics, target, file_label = KINDS[kind]
        if user.company_id is None:
            raise PermissionDenied("Les rapports se génèrent depuis le compte d'une entreprise.")
        if target != "subject" and user.role not in (user.Role.COMPANY_ADMIN, user.Role.MANAGER):
            raise PermissionDenied("Ces rapports sont réservés au dirigeant et à l'encadrement.")
        campaign = EvaluationCampaign.objects.filter(pk=request.query_params.get("campaign"), company_id=user.company_id).first()
        if campaign is None:
            raise ValidationError({"campaign": "Choisissez une campagne de votre entreprise."})
        prepared_for = f"{user.get_full_name() or user.generated_login}{', ' + user.position if user.position else ''}"

        if target == "subject":
            subject = User.objects.filter(pk=request.query_params.get("subject") or user.id, company_id=user.company_id).select_related("department").first()
            if subject is None:
                raise ValidationError({"subject": "Choisissez une personne de votre entreprise."})
            if not _can_read_person(request, subject):
                raise PermissionDenied("Vous ne pouvez générer que les rapports des personnes que vous encadrez.")
            args, target_name = (user.company, campaign, subject, prepared_for), name_of(subject)
        else:
            team = None
            team_id = request.query_params.get("team")
            if team_id:
                departments = Department.objects.filter(company_id=user.company_id)
                if user.role == user.Role.MANAGER:
                    departments = departments.filter(id__in=readable_department_ids(request, rubrics))
                team = departments.filter(pk=team_id).first()
                if team is None:
                    raise ValidationError({"team": "Choisissez une direction que vous encadrez."})
            elif target == "team_required":
                raise ValidationError({"team": "Ce rapport porte sur une équipe : choisissez une direction."})
            elif user.role != user.Role.COMPANY_ADMIN:
                raise ValidationError({"team": "Le rapport sur l'organisation entière est réservé au dirigeant : choisissez une de vos directions."})
            args, target_name = (user.company, campaign, team, prepared_for), team.name if team else "Organisation"
        try:
            pdf = build(*args)
        except ReportError as error:
            raise ValidationError({"detail": str(error)})
        filename = "_".join([slug(user.company.name), file_label, slug(target_name), slug(campaign.name)]) + ".pdf"
        log_event(user, "report.generated", f"a généré le rapport « {label} » — {target_name} ({campaign.name}).", company=user.company)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
        response["Access-Control-Expose-Headers"] = "Content-Disposition"
        return response
