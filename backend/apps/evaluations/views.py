from django.db.models import ProtectedError
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

from .models import Evaluation, EvaluationCampaign
from .serializers import EvaluationCampaignSerializer, EvaluationSerializer, EvaluationWriteSerializer


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
    queryset = Evaluation.objects.select_related(
        "user", "evaluator", "campaign"
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
            qs = qs.filter(user__department__manager=user) | qs.filter(user=user)
        return qs.distinct()
