from rest_framework import permissions, viewsets

from apps.core.permissions import CompanyScopedQuerySetMixin, IsCompanyAdminOrManager
from apps.core.scoping import managed_department_ids

from .models import TeamCohesionAnalysis, TeamRelationship
from .serializers import TeamCohesionAnalysisSerializer, TeamRelationshipSerializer


class TeamCohesionAnalysisViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = TeamCohesionAnalysis.objects.select_related("team").prefetch_related(
        "criterion_scores"
    )
    serializer_class = TeamCohesionAnalysisSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            qs = qs.filter(team_id__in=managed_department_ids(user))
        return qs


class TeamRelationshipViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = TeamRelationship.objects.select_related("from_user", "to_user", "team")
    serializer_class = TeamRelationshipSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team"]
    permission_classes = [IsCompanyAdminOrManager]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            qs = qs.filter(team_id__in=managed_department_ids(user))
        return qs
