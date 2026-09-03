from django.db.models import ProtectedError, Q
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.audit import log_event
from apps.core.permissions import (
    CompanyScopedQuerySetMixin,
    IsCompanyAdminOrManager,
    IsSuperAdminOrCompanyAdmin,
)
from apps.core.validators import require_same_company

from apps.core.scoping import managed_department_ids

from .models import (
    Evaluation,
    EvaluationCampaign,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)
from .serializers import (
    EvaluationCampaignSerializer,
    EvaluationSerializer,
    EvaluationWriteSerializer,
    PerformanceObjectiveSerializer,
    SkillNoteSerializer,
)


class EvaluationCampaignViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Campagnes d'évaluation : créées par le Company Admin (ou le Super
    Admin), valables pour tous les départements de l'entreprise. Les
    managers peuvent seulement les consulter, pour y rattacher les
    évaluations de leur équipe."""

    queryset = EvaluationCampaign.objects.select_related("company", "created_by")
    serializer_class = EvaluationCampaignSerializer
    company_lookup = "company_id"
    filterset_fields = ["company", "is_closed"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "close", "reopen"):
            return [IsSuperAdminOrCompanyAdmin()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == user.Role.SUPER_ADMIN:
            company_id = self.request.data.get("company")
            campaign = serializer.save(company_id=company_id, created_by=user)
        else:
            campaign = serializer.save(company=user.company, created_by=user)
        log_event(
            user,
            "campaign.created",
            f"a créé la campagne « {campaign.name} ».",
            company=campaign.company,
        )

    def perform_update(self, serializer):
        before = {"name": serializer.instance.name, "start_date": serializer.instance.start_date, "end_date": serializer.instance.end_date}
        campaign = serializer.save()
        changed = [
            field for field, old in before.items() if old != getattr(campaign, field)
        ]
        if changed:
            log_event(
                self.request.user,
                "campaign.updated",
                f"a modifié la campagne « {campaign.name} » ({', '.join(changed)}).",
                company=campaign.company,
            )

    def perform_destroy(self, instance):
        # Evaluation.campaign est en PROTECT (garde-fou volontaire) : on
        # transforme le ProtectedError brut en erreur de validation lisible
        # plutôt que de laisser remonter un 500.
        name, company = instance.name, instance.company
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError(
                {"detail": "Impossible de supprimer une campagne qui contient déjà des évaluations."}
            )
        log_event(
            self.request.user,
            "campaign.deleted",
            f"a supprimé la campagne « {name} ».",
            company=company,
        )

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        campaign = self.get_object()
        campaign.is_closed = True
        campaign.save(update_fields=["is_closed"])
        log_event(
            request.user,
            "campaign.closed",
            f"a clôturé la campagne « {campaign.name} ».",
            company=campaign.company,
        )
        return Response(self.get_serializer(campaign).data)

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen(self, request, pk=None):
        campaign = self.get_object()
        campaign.is_closed = False
        campaign.save(update_fields=["is_closed"])
        log_event(
            request.user,
            "campaign.reopened",
            f"a rouvert la campagne « {campaign.name} ».",
            company=campaign.company,
        )
        return Response(self.get_serializer(campaign).data)


class EvaluationViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    # `user__department` est indispensable : le serializer expose le nom du
    # département, qui déclenchait sinon une requête par évaluation.
    queryset = Evaluation.objects.select_related(
        "user", "user__department", "evaluator", "campaign"
    ).prefetch_related("skill_scores__skill_item__matrix")
    company_lookup = "user__company_id"
    filterset_fields = ["user", "campaign", "user__role"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return EvaluationWriteSerializer
        return EvaluationSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MEMBER:
            qs = qs.filter(user=user)
        elif user.role == user.Role.MANAGER:
            # Un manager ne voit que les évaluations de son équipe (+ les siennes).
            qs = qs.filter(user__department_id__in=managed_department_ids(user)) | qs.filter(user=user)
        return qs.distinct()

    def perform_create(self, serializer):
        evaluation = serializer.save()
        log_event(
            self.request.user,
            "evaluation.created",
            f"a créé l'évaluation de {evaluation.user.get_full_name()} ({evaluation.campaign.name}).",
            company=evaluation.user.company,
        )

    def perform_update(self, serializer):
        evaluation = serializer.save()
        log_event(
            self.request.user,
            "evaluation.updated",
            f"a modifié l'évaluation de {evaluation.user.get_full_name()} ({evaluation.campaign.name}).",
            company=evaluation.user.company,
        )

    def perform_destroy(self, instance):
        user_name, campaign_name, company = instance.user.get_full_name(), instance.campaign.name, instance.user.company
        instance.delete()
        log_event(
            self.request.user,
            "evaluation.deleted",
            f"a supprimé l'évaluation de {user_name} ({campaign_name}).",
            company=company,
        )


class SkillNoteViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Fiche "Forces & Faiblesses" (Hard/Soft Skills) — rattachée à une
    évaluation précise (donc à sa campagne) plutôt qu'au seul collaborateur,
    pour conserver un historique par période. Mêmes règles de visibilité
    que les évaluations : un manager ne voit/édite que sa propre équipe
    (+ lui-même), un membre ne voit que la sienne."""

    queryset = SkillNote.objects.select_related("evaluation__user")
    serializer_class = SkillNoteSerializer
    company_lookup = "evaluation__user__company_id"
    filterset_fields = ["evaluation"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "bulk_save"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MEMBER:
            qs = qs.filter(evaluation__user=user)
        elif user.role == user.Role.MANAGER:
            qs = qs.filter(
                evaluation__user__department_id__in=managed_department_ids(user)
            ) | qs.filter(evaluation__user=user)
        return qs.distinct()

    @action(detail=False, methods=["post"], url_path="bulk-save")
    def bulk_save(self, request):
        """Remplace en une fois les 20 lignes (4 catégories × 5) de la fiche
        d'une évaluation — même logique que les autres fiches "tout ou rien"
        de l'app (scores de compétences, critères de cohésion)."""
        evaluation_id = request.data.get("evaluation")
        notes = request.data.get("notes", [])
        try:
            evaluation = Evaluation.objects.select_related("user", "user__department").get(pk=evaluation_id)
        except (Evaluation.DoesNotExist, TypeError, ValueError):
            raise ValidationError({"evaluation": "Évaluation introuvable."})
        require_same_company(request.user, target_user=evaluation.user)

        actor = request.user
        target_user = evaluation.user
        if actor.role == actor.Role.MANAGER and target_user.department_id and target_user.department.manager_id != actor.id and target_user.id != actor.id:
            raise ValidationError({"evaluation": "Ce collaborateur ne fait pas partie de votre équipe."})

        valid_categories = {c.value for c in SkillNote.Category}
        cleaned = []
        for n in notes:
            if n.get("category") not in valid_categories:
                continue
            order = n.get("order")
            if not isinstance(order, int) or not (1 <= order <= 5):
                continue
            score = n.get("score")
            if score is not None:
                try:
                    score = min(5, max(1, float(score)))
                except (TypeError, ValueError):
                    score = None
            cleaned.append(
                SkillNote(
                    evaluation=evaluation,
                    category=n["category"],
                    order=order,
                    text=(n.get("text") or "")[:255],
                    score=score,
                )
            )

        SkillNote.objects.filter(evaluation=evaluation).delete()
        SkillNote.objects.bulk_create(cleaned)
        log_event(
            actor,
            "skillnote.bulk_saved",
            f"a mis à jour la fiche Forces & Faiblesses de {target_user.get_full_name()} ({evaluation.campaign.name}).",
            company=target_user.company,
        )
        return Response(SkillNoteSerializer(SkillNote.objects.filter(evaluation=evaluation), many=True).data)


class PerformanceObjectiveViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Lignes de la fiche annuelle — d'un employé ou d'une équipe.

    La portée suit celle des évaluations : un manager ne voit que son périmètre,
    un membre que sa propre fiche. Les lignes d'équipe se filtrent, elles, sur
    les départements qu'il encadre.
    """

    queryset = PerformanceObjective.objects.select_related("evaluation__user", "team", "campaign")
    serializer_class = PerformanceObjectiveSerializer
    company_lookup = "campaign__company_id"
    filterset_fields = ["evaluation", "team", "campaign", "category"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        # `company_lookup` ne couvre pas les lignes d'un employé, dont la
        # campagne est portée par l'évaluation : on borne donc à la main.
        qs = PerformanceObjective.objects.select_related("evaluation__user", "team", "campaign")
        user = self.request.user
        if user.role == user.Role.SUPER_ADMIN:
            return qs
        qs = qs.filter(
            Q(evaluation__user__company_id=user.company_id) | Q(team__company_id=user.company_id)
        )
        if user.role == user.Role.MANAGER:
            scope = managed_department_ids(user)
            qs = qs.filter(
                Q(evaluation__user__department_id__in=scope)
                | Q(evaluation__user=user)
                | Q(team_id__in=scope)
            )
        elif user.role == user.Role.MEMBER:
            qs = qs.filter(evaluation__user=user)
        return qs.distinct()

    def perform_destroy(self, instance):
        """Retirer une ligne change la moyenne : le report vaut aussi à la
        suppression, sans quoi l'Altitude garderait la trace d'un objectif
        effacé."""
        evaluation = instance.evaluation
        super().perform_destroy(instance)
        if evaluation is not None:
            recompute_evaluation_scores(evaluation)
