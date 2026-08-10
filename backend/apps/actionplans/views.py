from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.models import User
from apps.core.permissions import CompanyScopedQuerySetMixin, IsCompanyAdminOrManager
from apps.core.validators import require_same_company

from .models import ActionPlan
from .serializers import ActionPlanSerializer


class ActionPlanViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = ActionPlan.objects.select_related("manager", "team", "target_user")
    serializer_class = ActionPlanSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team", "manager", "target_user", "status", "category"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "bulk_save_dev_plan"):
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

    @action(detail=False, methods=["post"], url_path="bulk-save-dev-plan")
    def bulk_save_dev_plan(self, request):
        """Grille fixe "Plan de développement du manager" (3 lignes Soft
        Skills + 3 lignes Hard Skills) — même logique "tout ou rien" que
        SkillNote.bulk_save : remplace en une fois les lignes rattachées à
        ce manager (target_user + order renseigné), sans toucher aux plans
        d'action libres (order NULL) déjà créés depuis la page équipe."""
        target_user_id = request.data.get("target_user")
        items = request.data.get("items", [])
        try:
            target_user = User.objects.select_related("company", "department").get(pk=target_user_id)
        except (User.DoesNotExist, TypeError, ValueError):
            raise ValidationError({"target_user": "Manager introuvable."})
        require_same_company(request.user, target_user=target_user)
        if target_user.role != User.Role.MANAGER:
            raise ValidationError({"target_user": "Le plan de développement ne concerne que les managers."})

        team = target_user.department
        if team is None:
            raise ValidationError({"target_user": "Ce manager n'est rattaché à aucun département."})

        valid_categories = {c.value for c in ActionPlan.Category}
        cleaned = []
        for item in items:
            if item.get("category") not in valid_categories:
                continue
            order = item.get("order")
            if not isinstance(order, int) or not (1 <= order <= 3):
                continue
            due_date = item.get("due_date") or None
            cleaned.append(
                ActionPlan(
                    manager=request.user,
                    team=team,
                    target_user=target_user,
                    category=item["category"],
                    order=order,
                    priority=(item.get("priority") or "")[:255],
                    objective=item.get("objective") or "",
                    baseline=(item.get("baseline") or "")[:50],
                    target=(item.get("target") or "")[:50],
                    cost=(item.get("cost") or "")[:100],
                    due_date=due_date,
                    responsible=(item.get("responsible") or "")[:150],
                    eval_note=(item.get("eval_note") or "")[:150],
                )
            )

        ActionPlan.objects.filter(target_user=target_user, order__isnull=False).delete()
        ActionPlan.objects.bulk_create(cleaned)
        return Response(
            ActionPlanSerializer(
                ActionPlan.objects.filter(target_user=target_user, order__isnull=False).order_by("category", "order"),
                many=True,
            ).data
        )
