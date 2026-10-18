"""Point d'entrée unique des rapports PDF : `GET /api/reports/pdf/`.

Paramètres : `kind` (voir `KINDS`), `campaign`, et selon le rapport `team`
(une direction ; sans elle, l'organisation entière, réservée au dirigeant) ou
`subject` (une personne). Les droits sont ceux des écrans : le dirigeant lit
toute l'entreprise, un directeur ses directions (ou celle d'un pair qu'il est
autorisé à consulter), un collaborateur seulement sa propre fiche
Performance ID. Rien n'est écrit en base ; chaque génération est journalisée.
"""
import logging
import threading
from datetime import timedelta
from urllib.parse import quote

from django.db import connection
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import log_event
from apps.core.models import Department, User
from apps.core.scoping import readable_department_ids
from apps.evaluations import report_ai
from apps.evaluations import talent_reports as T
from apps.evaluations.feedforward_report import ReportError, name_of, slug
from apps.evaluations.models import EvaluationCampaign

from . import cohesion_report as C
from .models import GeneratedReport
from . import team_reports as R

logger = logging.getLogger(__name__)

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


def resolve(request, params):
    """Contrôle une demande de rapport (type, campagne, périmètre, droits) et renvoie
    (type, libellé, constructeur, arguments, nom du périmètre, libellé de fichier)."""
    user = request.user
    kind = params.get("kind")
    if kind not in KINDS:
        raise ValidationError({"kind": "Type de rapport inconnu."})
    label, build, rubrics, scopes, file_label = KINDS[kind]
    if user.company_id is None:
        raise PermissionDenied("Les rapports se génèrent depuis le compte d'une entreprise.")
    if scopes != {PERSON} and user.role not in (user.Role.COMPANY_ADMIN, user.Role.MANAGER):
        raise PermissionDenied("Ces rapports sont réservés au dirigeant et à l'encadrement.")
    campaign = EvaluationCampaign.objects.filter(pk=params.get("campaign"), company_id=user.company_id).first()
    if campaign is None:
        raise ValidationError({"campaign": "Choisissez une campagne de votre entreprise."})
    prepared_for = f"{user.get_full_name() or user.generated_login}{', ' + user.position if user.position else ''}"
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
    return kind, label, build, args, target_name, file_label


class ReportPdfView(APIView):
    """Production immédiate, sans rédaction par Claude (trop longue pour une requête) :
    l'écran passe par `ReportJobView`, qui produit en arrière-plan."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kind, label, build, args, target_name, file_label = resolve(request, request.query_params)
        user = request.user
        try:
            with report_ai.disabled():
                pdf = build(*args)
        except ReportError as error:
            raise ValidationError({"detail": str(error)})
        filename = _filename(user.company, file_label, target_name, args[1])
        log_event(user, "report.generated", f"a généré le rapport « {label} » — {target_name} ({args[1].name}).", company=user.company)
        return _pdf_response(pdf, filename)


def _filename(company, file_label, target_name, campaign):
    return "_".join([slug(company.name), file_label, slug(target_name), slug(campaign.name)]) + ".pdf"


def _pdf_response(pdf, filename):
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
    response["Access-Control-Expose-Headers"] = "Content-Disposition"
    return response


STALE_AFTER = timedelta(minutes=15)


def produce(report_id, build, args, file_label, close_connection=False):
    """Remplit un `GeneratedReport` en attente ; appelée dans un fil d'exécution à part."""
    try:
        record = GeneratedReport.objects.select_related("company").get(pk=report_id)
        report_ai.reset_usage()
        pdf = build(*args)
        record.content, record.filename = pdf, _filename(record.company, file_label, record.target_name, args[1])
        record.ai_written = report_ai.was_used()
        record.status, record.finished_at, record.error = GeneratedReport.Status.READY, timezone.now(), ""
        record.save()
    except ReportError as error:
        GeneratedReport.objects.filter(pk=report_id).update(status=GeneratedReport.Status.FAILED, error=str(error), finished_at=timezone.now())
    except Exception:  # noqa: BLE001 — l'échec doit s'afficher à l'écran, pas rester « en cours »
        logger.exception("Rapport %s : échec de la génération", report_id)
        GeneratedReport.objects.filter(pk=report_id).update(
            status=GeneratedReport.Status.FAILED, finished_at=timezone.now(),
            error="La génération a échoué sur une erreur interne : réessayez, puis signalez-le si elle persiste.")
    finally:
        if close_connection:
            connection.close()


def _serialize(record):
    return {"id": record.id, "status": record.status, "label": record.label, "target": record.target_name, "filename": record.filename,
            "error": record.error, "ai_written": record.ai_written, "created_at": record.created_at}


class ReportJobView(APIView):
    """`POST /api/reports/jobs/` lance la production (mêmes paramètres que
    `/api/reports/pdf/`) ; `GET /api/reports/jobs/<id>/` en donne l'état."""

    permission_classes = [IsAuthenticated]
    run_in_background = True

    def post(self, request):
        kind, label, build, args, target_name, file_label = resolve(request, request.data)
        user = request.user
        # Ménage : les rapports de plus de 7 jours ne sont plus téléchargeables.
        GeneratedReport.objects.filter(requested_by=user, created_at__lt=timezone.now() - timedelta(days=7)).delete()
        record = GeneratedReport.objects.create(company=user.company, requested_by=user, kind=kind, label=label, target_name=target_name[:255])
        log_event(user, "report.generated", f"a généré le rapport « {label} » — {target_name} ({args[1].name}).", company=user.company)
        if self.run_in_background:
            threading.Thread(target=produce, args=(record.id, build, args, file_label, True), daemon=True).start()
        else:
            produce(record.id, build, args, file_label)
            record.refresh_from_db()
        return Response(_serialize(record), status=202)

    def get(self, request, pk):
        record = GeneratedReport.objects.filter(pk=pk, requested_by=request.user).first()
        if record is None:
            raise NotFound("Rapport introuvable.")
        if record.status == GeneratedReport.Status.PENDING and timezone.now() - record.created_at > STALE_AFTER:
            record.status, record.error, record.finished_at = GeneratedReport.Status.FAILED, "La génération n'a pas abouti : relancez-la.", timezone.now()
            record.save(update_fields=["status", "error", "finished_at"])
        return Response(_serialize(record))


class ReportJobDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        record = GeneratedReport.objects.filter(pk=pk, requested_by=request.user, status=GeneratedReport.Status.READY).first()
        if record is None:
            raise NotFound("Rapport introuvable ou pas encore prêt.")
        return _pdf_response(bytes(record.content), record.filename)
