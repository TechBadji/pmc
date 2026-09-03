from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError

from apps.core.audit import log_event
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
            matrix = serializer.save(company_id=company_id)
        else:
            matrix = serializer.save(company=user.company)
        log_event(
            user,
            "skillmatrix.created",
            f"a créé le référentiel « {matrix.name} » ({matrix.get_type_display()}).",
            company=matrix.company,
        )

    def perform_update(self, serializer):
        before = {"name": serializer.instance.name}
        matrix = serializer.save()
        if before["name"] != matrix.name:
            log_event(
                self.request.user,
                "skillmatrix.updated",
                f"a renommé le référentiel « {before['name']} » en « {matrix.name} ».",
                company=matrix.company,
            )

    def perform_destroy(self, instance):
        name, company = instance.name, instance.company
        instance.delete()
        log_event(
            self.request.user,
            "skillmatrix.deleted",
            f"a supprimé le référentiel « {name} ».",
            company=company,
        )


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

    def perform_create(self, serializer):
        item = serializer.save()
        log_event(
            self.request.user,
            "skillitem.created",
            f"a ajouté la compétence « {item.name} » au référentiel « {item.matrix.name} ».",
            company=item.matrix.company,
        )

    def perform_update(self, serializer):
        before_name = serializer.instance.name
        item = serializer.save()
        if before_name != item.name:
            log_event(
                self.request.user,
                "skillitem.updated",
                f"a renommé la compétence « {before_name} » en « {item.name} » ({item.matrix.name}).",
                company=item.matrix.company,
            )

    def perform_destroy(self, instance):
        name, matrix_name, company = instance.name, instance.matrix.name, instance.matrix.company
        instance.delete()
        log_event(
            self.request.user,
            "skillitem.deleted",
            f"a supprimé la compétence « {name} » du référentiel « {matrix_name} ».",
            company=company,
        )
