from rest_framework import permissions, viewsets

from apps.core.permissions import CompanyScopedQuerySetMixin, IsCompanyAdminOrManager

from .models import ActionPlan
from .serializers import ActionPlanSerializer


class ActionPlanViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = ActionPlan.objects.select_related("manager", "team", "target_user")
    serializer_class = ActionPlanSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team", "manager", "status", "category"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            qs = qs.filter(manager=user)
        elif user.role == user.Role.MEMBER:
            qs = qs.filter(target_user=user)
        return qs

    def perform_create(self, serializer):
        serializer.save(manager=self.request.user)
