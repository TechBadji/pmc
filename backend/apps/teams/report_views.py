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
ORG, GROUP, TEAM, PERSON = "org", "group", "team", "person"

# kind → (libellé, constructeur, rubriques de droit, périmètres acceptés, nom de fichier).
# Les rapports fondés sur des avis anonymes (cohésion, PSI) ne descendent pas à
# la personne ; les rapports de talents acceptent tous les périmètres de l'écran.
KINDS = {
    "cohesion": ("Cohésion d'équipe", C.build_cohesion_report, COHESION, {ORG, TEAM}, "Cohesion-equipe"),
    "relational": ("Dynamique relationnelle", C.build_relational_report, COHESION, {ORG, TEAM}, "Dynamique-relationnelle"),
    "psi": ("Psychological Safety", R.build_psi_report, COHESION, {ORG, TEAM}, "Psychological-Safety"),
    "strengths": ("Forces & faiblesses", R.build_strengths_report, COHESION, {ORG, GROUP, TEAM}, "Forces-faiblesses"),
    "team_id": ("Team Performance ID", R.build_team_id_report, COHESION, {TEAM}, "Team-Performance-ID"),
    "id3a": ("Matrice ID-3A", T.build_id3a_report, TALENTS, {ORG, GROUP, TEAM, PERSON}, "Matrice-ID-3A"),
    "ninebox": ("9 Box", T.build_ninebox_report, TALENTS, {ORG, GROUP, TEAM, PERSON}, "9-Box"),
    "tpd": ("ID-TPD", T.build_tpd_report, TALENTS, {ORG, GROUP, TEAM, PERSON}, "ID-TPD"),
    "person_id": ("Performance ID", T.build_person_id_report, TALENTS, {PERSON}, "Performance-ID"),
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
        label, build, rubrics, scopes, file_label = KINDS[kind]
        if user.company_id is None:
            raise PermissionDenied("Les rapports se génèrent depuis le compte d'une entreprise.")
        if scopes != {PERSON} and user.role not in (user.Role.COMPANY_ADMIN, user.Role.MANAGER):
            raise PermissionDenied("Ces rapports sont réservés au dirigeant et à l'encadrement.")
        campaign = EvaluationCampaign.objects.filter(pk=request.query_params.get("campaign"), company_id=user.company_id).first()
        if campaign is None:
            raise ValidationError({"campaign": "Choisissez une campagne de votre entreprise."})
        prepared_for = f"{user.get_full_name() or user.generated_login}{', ' + user.position if user.position else ''}"
        params = request.query_params
        group, team_id, subject_id = params.get("group"), params.get("team"), params.get("subject")
        if scopes == {PERSON} and not subject_id:
            subject_id = user.id
        is_admin = user.role == user.Role.COMPANY_ADMIN

        if subject_id:
            if PERSON not in scopes:
                raise ValidationError({"subject": "Ce rapport repose sur des avis anonymes : il ne se produit pas pour une personne."})
            subject = User.objects.filter(pk=subject_id, company_id=user.company_id).select_related("department").first()
            if subject is None:
                raise ValidationError({"subject": "Choisissez une personne de votre entreprise."})
            if not _can_read_person(request, subject):
                raise PermissionDenied("Vous ne pouvez générer que les rapports des personnes que vous encadrez.")
            target, target_name = (subject if scopes == {PERSON} else T.People(user.company, person=subject)), name_of(subject)
        elif group:
            if GROUP not in scopes or group not in T.GROUPS:
                raise ValidationError({"group": "Ce périmètre n'est pas proposé pour ce rapport."})
            if not is_admin:
                raise ValidationError({"group": "Les périmètres « équipe dirigeante », « directeurs » et « responsables de services » sont réservés au dirigeant."})
            target, target_name = T.People(user.company, group=group), T.GROUPS[group]
        elif team_id:
            departments = Department.objects.filter(company_id=user.company_id)
            if user.role == user.Role.MANAGER:
                departments = departments.filter(id__in=readable_department_ids(request, rubrics))
            target = departments.filter(pk=team_id).first()
            if target is None:
                raise ValidationError({"team": "Choisissez une direction que vous encadrez."})
            target_name = target.name
        else:
            if ORG not in scopes:
                raise ValidationError({"team": "Ce rapport porte sur une équipe : choisissez une direction."})
            if not is_admin:
                raise ValidationError({"team": "Le rapport sur l'organisation entière est réservé au dirigeant : choisissez une de vos directions."})
            target, target_name = None, "Organisation"
        args = (user.company, campaign, target, prepared_for)
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
