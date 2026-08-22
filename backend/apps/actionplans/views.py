from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.models import User
from apps.core.permissions import (
    CompanyScopedQuerySetMixin,
    IsCompanyAdminOrManager,
)
from apps.core.scoping import manages_user
from apps.core.validators import require_same_company

from .models import ActionPlan
from .serializers import ActionPlanSerializer

# Garde-fou sur le nombre d'actions rattachées à une même priorité de
# développement : la grille est libre côté UI, mais pas illimitée en base.
MAX_ACTIONS_PER_PRIORITY = 20


class ActionPlanViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = ActionPlan.objects.select_related("manager", "team", "target_user")
    serializer_class = ActionPlanSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team", "manager", "target_user", "status", "category"]

    def get_permissions(self):
        # bulk_save_dev_plan remplace en bloc la fiche de développement d'un
        # manager — réservé au Company Admin/Super Admin (jamais à un pair
        # Manager, qui n'a aucune légitimité à réécrire la fiche d'un autre
        # manager), contrairement aux plans d'action d'équipe classiques.
        if self.action == "bulk_save_dev_plan":
            # Un manager y accède désormais pour les personnes qu'il encadre :
            # la grille sert autant au plan individuel d'un directeur, tenu par
            # le CEO, qu'à celui d'un collaborateur, tenu par son responsable.
            # La légitimité est vérifiée dans l'action elle-même — jamais un
            # pair sur la fiche d'un autre manager.
            return [IsCompanyAdminOrManager()]
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

    @action(detail=False, methods=["post"], url_path="bulk-save-dev-plan")
    def bulk_save_dev_plan(self, request):
        """Grille "Plan de développement du manager" (3 priorités Soft Skills
        + 3 priorités Hard Skills, chacune portant une ou plusieurs actions) —
        même logique "tout ou rien" que SkillNote.bulk_save : remplace en une
        fois les lignes rattachées à ce manager (target_user + order
        renseigné), sans toucher aux plans d'action libres (order NULL) déjà
        créés depuis la page équipe."""
        target_user_id = request.data.get("target_user")
        items = request.data.get("items", [])
        try:
            target_user = User.objects.select_related("company", "department").get(pk=target_user_id)
        except (User.DoesNotExist, TypeError, ValueError):
            raise ValidationError({"target_user": "Manager introuvable."})
        require_same_company(request.user, target_user=target_user)
        actor = request.user
        if actor.role == User.Role.MANAGER:
            # Son périmètre, et pas lui-même : sa propre fiche relève du CEO.
            if target_user.id == actor.id or not manages_user(actor, target_user):
                raise ValidationError(
                    {"target_user": "Ce collaborateur ne fait pas partie de votre équipe."}
                )
        elif target_user.role != User.Role.MANAGER:
            raise ValidationError({"target_user": "Le plan de développement ne concerne que les managers."})

        team = target_user.department
        if team is None:
            raise ValidationError({"target_user": "Ce manager n'est rattaché à aucun département."})

        valid_categories = {c.value for c in ActionPlan.Category}
        cleaned = []
        seen = set()
        for item in items:
            if item.get("category") not in valid_categories:
                continue
            priority_order = item.get("priority_order")
            order = item.get("order")
            if not isinstance(priority_order, int) or not (1 <= priority_order <= 3):
                continue
            # Une priorité porte autant d'actions que voulu ; la borne haute
            # n'existe que pour éviter qu'un client boucle sans fin.
            if not isinstance(order, int) or not (1 <= order <= MAX_ACTIONS_PER_PRIORITY):
                continue
            # bulk_create ne déclenche pas la contrainte d'unicité côté Python :
            # on écarte ici les doublons (category, priorité, action) qui
            # feraient échouer l'INSERT en bloc.
            if (item["category"], priority_order, order) in seen:
                continue
            seen.add((item["category"], priority_order, order))
            start_date = item.get("start_date") or None
            due_date = item.get("due_date") or None
            cleaned.append(
                ActionPlan(
                    manager=request.user,
                    team=team,
                    target_user=target_user,
                    category=item["category"],
                    priority_order=priority_order,
                    order=order,
                    priority=(item.get("priority") or "")[:255],
                    objective=item.get("objective") or "",
                    baseline=(item.get("baseline") or "")[:50],
                    target=(item.get("target") or "")[:50],
                    cost=(item.get("cost") or "")[:100],
                    start_date=start_date,
                    due_date=due_date,
                    responsible=(item.get("responsible") or "")[:150],
                    eval_note=(item.get("eval_note") or "")[:150],
                )
            )

        ActionPlan.objects.filter(target_user=target_user, order__isnull=False).delete()
        ActionPlan.objects.bulk_create(cleaned)
        return Response(
            ActionPlanSerializer(
                ActionPlan.objects.filter(target_user=target_user, order__isnull=False).order_by(
                    "category", "priority_order", "order"
                ),
                many=True,
            ).data
        )
