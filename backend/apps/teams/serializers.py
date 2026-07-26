from rest_framework import serializers

from apps.core.validators import require_same_company

from .models import CohesionCriterionScore, TeamCohesionAnalysis, TeamRelationship


class CohesionCriterionScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = CohesionCriterionScore
        fields = ["id", "analysis", "criterion", "score"]


class TeamCohesionAnalysisSerializer(serializers.ModelSerializer):
    criterion_scores = CohesionCriterionScoreSerializer(many=True, required=False)
    team_name = serializers.CharField(source="team.name", read_only=True)

    class Meta:
        model = TeamCohesionAnalysis
        fields = [
            "id", "team", "team_name", "date", "ice_score", "notes",
            "criterion_scores", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        actor = self.context["request"].user
        team = attrs.get("team", getattr(self.instance, "team", None))
        require_same_company(actor, team=team)
        return attrs

    def create(self, validated_data):
        criteria = validated_data.pop("criterion_scores", [])
        analysis = TeamCohesionAnalysis.objects.create(**validated_data)
        self._sync_criteria(analysis, criteria)
        return analysis

    def update(self, instance, validated_data):
        criteria = validated_data.pop("criterion_scores", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if criteria is not None:
            instance.criterion_scores.all().delete()
            self._sync_criteria(instance, criteria)
        return instance

    @staticmethod
    def _sync_criteria(analysis, criteria):
        CohesionCriterionScore.objects.bulk_create(
            [CohesionCriterionScore(analysis=analysis, **c) for c in criteria]
        )
        if criteria:
            avg = sum(c["score"] for c in criteria) / len(criteria)
            analysis.ice_score = round(avg, 1)
            analysis.save(update_fields=["ice_score"])


class TeamRelationshipSerializer(serializers.ModelSerializer):
    from_user_name = serializers.CharField(source="from_user.get_full_name", read_only=True)
    to_user_name = serializers.CharField(source="to_user.get_full_name", read_only=True)

    class Meta:
        model = TeamRelationship
        fields = [
            "id", "team", "from_user", "from_user_name",
            "to_user", "to_user_name", "quality",
        ]

    def validate(self, attrs):
        actor = self.context["request"].user
        team = attrs.get("team", getattr(self.instance, "team", None))
        from_user = attrs.get("from_user", getattr(self.instance, "from_user", None))
        to_user = attrs.get("to_user", getattr(self.instance, "to_user", None))
        require_same_company(actor, team=team, from_user=from_user, to_user=to_user)
        for field_name, member in (("from_user", from_user), ("to_user", to_user)):
            if team and member and member.company_id != team.company_id:
                raise serializers.ValidationError(
                    {field_name: "Ce membre n'appartient pas à cette équipe."}
                )
        return attrs
