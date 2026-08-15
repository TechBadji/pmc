from rest_framework import serializers

from apps.core.validators import require_manages_team, require_same_company

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
            "start_date", "due_date", "responsible", "eval_note",
            "priority_order", "order", "created_at",
        ]
        # "manager" est toujours l'acteur de la requête (imposé côté vue,
        # jamais saisissable) — voir ActionPlanViewSet.perform_create.
        read_only_fields = ["id", "manager", "created_at"]
        # Sans ceci, DRF déduit `required=True` pour tout champ nullable sans
        # `default=` côté modèle (target_user/order) — cassant la création
        # d'un plan d'action d'équipe classique (ActionPlansPage), qui
        # n'envoie ni l'un ni l'autre (seule la grille fixe du Plan de
        # Développement du Manager les renseigne, via bulk-save-dev-plan).
        extra_kwargs = {
            "target_user": {"required": False},
            "priority_order": {"required": False},
            "order": {"required": False},
        }
        # ModelSerializer ajoute automatiquement un UniqueTogetherValidator
        # pour `unique_together = ("target_user", "category", "order")`, qui
        # re-force `required=True` sur ces trois champs indépendamment des
        # `extra_kwargs` ci-dessus. Désactivé ici : la grille fixe du Plan de
        # Développement passe par `bulk_save_dev_plan` (delete+bulk_create,
        # hors serializer), donc cette validation ne sert qu'à casser les
        # plans d'action libres — la contrainte DB reste appliquée telle
        # quelle en dernier recours.
        validators = []

    def validate(self, attrs):
        actor = self.context["request"].user
        team = attrs.get("team", getattr(self.instance, "team", None))
        target_user = attrs.get("target_user", getattr(self.instance, "target_user", None))
        require_same_company(actor, team=team, target_user=target_user)
        if team and target_user and target_user.company_id != team.company_id:
            raise serializers.ValidationError(
                {"target_user": "Ce collaborateur n'appartient pas à cette équipe."}
            )
        require_manages_team(actor, team, target_user=target_user)
        return attrs
