from rest_framework import serializers

from apps.core.validators import require_same_company

from .models import ActionPlan


class ActionPlanSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source="manager.get_full_name", read_only=True)
    team_name = serializers.CharField(source="team.name", read_only=True)
    target_user_name = serializers.CharField(
        source="target_user.get_full_name", read_only=True, default=None
    )

    class Meta:
        model = ActionPlan
        fields = [
            "id", "manager", "manager_name", "team", "team_name",
            "target_user", "target_user_name", "category", "priority",
            "objective", "baseline", "target", "cost", "status",
            "due_date", "responsible", "eval_note", "order", "created_at",
        ]
        # "manager" est toujours l'acteur de la requête (imposé côté vue,
        # jamais saisissable) — voir ActionPlanViewSet.perform_create.
        read_only_fields = ["id", "manager", "created_at"]

    def validate(self, attrs):
        actor = self.context["request"].user
        team = attrs.get("team", getattr(self.instance, "team", None))
        target_user = attrs.get("target_user", getattr(self.instance, "target_user", None))
        require_same_company(actor, team=team, target_user=target_user)
        if team and target_user and target_user.company_id != team.company_id:
            raise serializers.ValidationError(
                {"target_user": "Ce collaborateur n'appartient pas à cette équipe."}
            )
        return attrs
