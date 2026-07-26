from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError

from apps.core.models import User
from apps.core.permissions import (
    CompanyScopedQuerySetMixin,
    IsSuperAdminOrCompanyAdminOrManager,
)

from .models import SkillItem, SkillMatrix
from .serializers import SkillItemSerializer, SkillMatrixSerializer


class SkillMatrixViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = SkillMatrix.objects.prefetch_related("items")
    serializer_class = SkillMatrixSerializer
    company_lookup = "company_id"
    filterset_fields = ["company", "type"]
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsSuperAdminOrCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == User.Role.SUPER_ADMIN:
            company_id = self.request.data.get("company")
            if not company_id:
                raise ValidationError({"company": "Champ requis pour le Super Admin."})
            serializer.save(company_id=company_id)
        else:
            serializer.save(company=user.company)


class SkillItemViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = SkillItem.objects.select_related("matrix")
    serializer_class = SkillItemSerializer
    company_lookup = "matrix__company_id"
    filterset_fields = ["matrix"]
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsSuperAdminOrCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]
