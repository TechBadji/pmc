from django.db import transaction
from rest_framework import serializers

from apps.core.validators import require_manages_team, require_same_company
from apps.skills.models import SkillItem

from apps.core.scoping import manages_user

from .models import (
    Evaluation,
    EvaluationCampaign,
    EvaluationSkillScore,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)


class SkillNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SkillNote
        fields = ["id", "evaluation", "category", "order", "text", "score"]
        read_only_fields = ["id"]


class EvaluationCampaignSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)
    evaluations_count = serializers.IntegerField(source="evaluations.count", read_only=True)

    class Meta:
        model = EvaluationCampaign
        fields = [
            "id", "company", "name", "start_date", "end_date", "is_closed",
            "created_by", "created_by_name", "evaluations_count", "created_at",
        ]
        read_only_fields = ["id", "company", "created_by", "created_at"]

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "La date de fin doit être postérieure à la date de début."}
            )
        return attrs


class EvaluationSkillScoreSerializer(serializers.ModelSerializer):
    skill_name = serializers.CharField(source="skill_item.name", read_only=True)
    skill_type = serializers.CharField(source="skill_item.matrix.type", read_only=True)

    class Meta:
        model = EvaluationSkillScore
        fields = [
            "id", "evaluation", "skill_item", "skill_name", "skill_type",
            "score", "objective_score", "achievement_rate",
        ]


class EvaluationSerializer(serializers.ModelSerializer):
    """Sérialiseur de lecture : expose les indices calculés HSI/SSI/Altitude
    utilisés pour positionner le collaborateur sur la matrice ID-3A."""

    skill_scores = EvaluationSkillScoreSerializer(many=True, read_only=True)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    user_position = serializers.CharField(source="user.position", read_only=True)
    user_age = serializers.IntegerField(source="user.age", read_only=True)
    user_role = serializers.CharField(source="user.role", read_only=True)
    user_department = serializers.CharField(source="user.department.name", read_only=True, default=None)
    user_avatar = serializers.SerializerMethodField()
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    campaign_start_date = serializers.DateField(source="campaign.start_date", read_only=True)
    campaign_end_date = serializers.DateField(source="campaign.end_date", read_only=True)
    campaign_is_closed = serializers.BooleanField(source="campaign.is_closed", read_only=True)
    hsi = serializers.DecimalField(max_digits=3, decimal_places=2, read_only=True)
    ssi = serializers.DecimalField(max_digits=3, decimal_places=2, read_only=True)
    hso = serializers.DecimalField(max_digits=3, decimal_places=2, read_only=True)
    ssio = serializers.DecimalField(max_digits=3, decimal_places=2, read_only=True)
    altitude_percentage = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True)
    performance_rating = serializers.CharField(read_only=True)

    def get_user_avatar(self, obj):
        return obj.user.avatar.url if obj.user.avatar else None

    class Meta:
        model = Evaluation
        fields = [
            "id", "user", "user_name", "user_position", "user_age", "user_role",
            "user_department", "user_avatar",
            "evaluator", "campaign", "campaign_name", "campaign_start_date",
            "campaign_end_date", "campaign_is_closed",
            "business_objectives_score", "people_objectives_score",
            "objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa",
            "notes", "skill_scores", "hsi", "ssi", "hso", "ssio", "altitude_percentage",
            "performance_rating", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "evaluator", "created_at", "updated_at"]


class EvaluationWriteSerializer(serializers.ModelSerializer):
    """Sérialiseur d'écriture : permet de soumettre les notes des compétences
    en une seule requête (formulaire d'évaluation Hard/Soft Skills)."""

    skill_scores = serializers.ListField(
        child=serializers.DictField(), write_only=True, required=False
    )

    class Meta:
        model = Evaluation
        fields = [
            "id", "user", "campaign", "business_objectives_score",
            "people_objectives_score", "notes", "skill_scores",
        ]

    def validate_campaign(self, campaign):
        # Une campagne clôturée n'accepte plus de nouvelles évaluations, ni de
        # changement vers celle-ci — mais on peut toujours corriger une
        # évaluation déjà rattachée à cette campagne avant sa clôture.
        already_on_this_campaign = self.instance and self.instance.campaign_id == campaign.id
        if campaign.is_closed and not already_on_this_campaign:
            raise serializers.ValidationError("Cette campagne d'évaluation est clôturée.")
        return campaign

    def validate(self, attrs):
        actor = self.context["request"].user
        target_user = attrs.get("user", getattr(self.instance, "user", None))
        campaign = attrs.get("campaign", getattr(self.instance, "campaign", None))
        require_same_company(actor, user=target_user, campaign=campaign)
        if target_user and campaign and target_user.company_id != campaign.company_id:
            raise serializers.ValidationError(
                {"campaign": "Cette campagne ne correspond pas à l'entreprise du collaborateur."}
            )
        if actor.role == actor.Role.MANAGER and target_user and target_user.id != actor.id:
            is_own_team_member = (
                manages_user(actor, target_user)
            )
            if not is_own_team_member:
                raise serializers.ValidationError(
                    {"user": "Vous ne pouvez évaluer que les membres de votre équipe."}
                )
        # Un Company Admin évalue les directeurs (rôle Manager) ; les
        # collaborateurs sont évalués par leur propre manager. Sans ce
        # garde-fou, rien n'empêchait le CEO de noter n'importe qui
        # directement, contournant silencieusement la hiérarchie.
        if actor.role == actor.Role.COMPANY_ADMIN and target_user and target_user.role != target_user.Role.MANAGER:
            raise serializers.ValidationError(
                {"user": "Vous ne pouvez évaluer directement que les managers. Les collaborateurs sont évalués par leur manager."}
            )
        skill_scores = attrs.get("skill_scores")
        if skill_scores:
            company_id = target_user.company_id if target_user else getattr(campaign, "company_id", None)
            requested_ids = {item.get("skill_item") for item in skill_scores}
            valid_ids = set(
                SkillItem.objects.filter(
                    id__in=requested_ids, matrix__company_id=company_id
                ).values_list("id", flat=True)
            )
            if requested_ids - valid_ids:
                raise serializers.ValidationError(
                    {"skill_scores": "Compétence invalide pour cette entreprise."}
                )
            # skill_scores est un ListField(DictField()) écrit ensuite via
            # bulk_create (_save_scores) : ni les validators du modèle
            # EvaluationSkillScore, ni full_clean(), ne s'exécutent sur ce
            # chemin — la borne 1-5 doit donc être vérifiée ici explicitement.
            for item in skill_scores:
                for field in ("score", "objective_score", "achievement_rate"):
                    value = item.get(field)
                    if value in (None, ""):
                        continue
                    try:
                        value = float(value)
                    except (TypeError, ValueError):
                        raise serializers.ValidationError(
                            {"skill_scores": f"Valeur invalide pour {field}: {item.get(field)!r}."}
                        )
                    if not 1 <= value <= 5:
                        raise serializers.ValidationError(
                            {"skill_scores": f"{field} doit être compris entre 1 et 5 (reçu {value})."}
                        )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        scores = validated_data.pop("skill_scores", [])
        evaluation = Evaluation.objects.create(
            evaluator=self.context["request"].user, **validated_data
        )
        self._save_scores(evaluation, scores)
        return evaluation

    @transaction.atomic
    def update(self, instance, validated_data):
        # atomic : sans ça, un bulk_create qui échoue après le delete()
        # laisserait l'évaluation sans aucune note (perte de données).
        scores = validated_data.pop("skill_scores", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if scores is not None:
            instance.skill_scores.all().delete()
            self._save_scores(instance, scores)
        return instance

    @staticmethod
    def _save_scores(evaluation, scores):
        EvaluationSkillScore.objects.bulk_create(
            [
                EvaluationSkillScore(
                    evaluation=evaluation,
                    skill_item_id=item["skill_item"],
                    score=item["score"],
                    objective_score=item.get("objective_score") or None,
                    achievement_rate=item.get("achievement_rate") or None,
                )
                for item in scores
            ]
        )


class PerformanceObjectiveSerializer(serializers.ModelSerializer):
    """Ligne de la fiche annuelle. Le taux d'atteinte est calculé, jamais saisi."""

    achievement_percent = serializers.FloatField(read_only=True)

    class Meta:
        model = PerformanceObjective
        fields = [
            "id", "evaluation", "team", "campaign", "category", "order",
            "label", "indicator", "reference_value", "target_value",
            "actual_value", "weight", "achievement_percent", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        """La ligne appartient soit à l'évaluation d'un employé, soit à la
        fiche d'une équipe pour une campagne — jamais aux deux, jamais à
        aucune."""
        evaluation = attrs.get("evaluation", getattr(self.instance, "evaluation", None))
        team = attrs.get("team", getattr(self.instance, "team", None))
        campaign = attrs.get("campaign", getattr(self.instance, "campaign", None))
        actor = self.context["request"].user

        if evaluation is not None and team is not None:
            raise serializers.ValidationError(
                {"team": "Une ligne se rattache à un employé ou à une équipe, pas aux deux."}
            )
        if evaluation is None and team is None:
            raise serializers.ValidationError(
                {"evaluation": "Rattachez la ligne à une évaluation ou à une équipe."}
            )
        if team is not None:
            if campaign is None:
                raise serializers.ValidationError({"campaign": "La fiche d'équipe se rapporte à une campagne."})
            require_same_company(actor, team=team)
            require_manages_team(actor, team)
        else:
            require_same_company(actor, target_user=evaluation.user)
        return attrs

    def create(self, validated_data):
        line = super().create(validated_data)
        self._report_to_evaluation(line)
        return line

    def update(self, instance, validated_data):
        line = super().update(instance, validated_data)
        self._report_to_evaluation(line)
        return line

    @staticmethod
    def _report_to_evaluation(line):
        """La fiche est la source : ses totaux redescendent dans l'évaluation,
        d'où l'Altitude est lue par tout le reste de l'application."""
        if line.evaluation_id:
            recompute_evaluation_scores(line.evaluation)
