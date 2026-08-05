from rest_framework import serializers

from apps.core.validators import require_same_company

from .models import CohesionCriterionScore, TeamCohesionAnalysis, TeamRelationship


class CohesionCriterionScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = CohesionCriterionScore
        fields = ["id", "analysis", "criterion", "score", "objective_score", "achieved_score"]
        # `analysis` est toujours fourni par `_sync_criteria` (l'objet n'existe
        # pas encore côté client au moment de l'écriture imbriquée) — jamais
        # par le payload. Sans ce read_only, le champ FK requis fait échouer
        # toute création/mise à jour de TeamCohesionAnalysis.
        read_only_fields = ["id", "analysis"]


class TeamCohesionAnalysisSerializer(serializers.ModelSerializer):
    criterion_scores = CohesionCriterionScoreSerializer(many=True, required=False)
    team_name = serializers.CharField(source="team.name", read_only=True)
    achieved_score = serializers.SerializerMethodField()
    tco = serializers.SerializerMethodField()

    class Meta:
        model = TeamCohesionAnalysis
        fields = [
            "id", "team", "team_name", "date", "ice_score", "oce_score",
            "achieved_score", "tco", "notes", "criterion_scores", "created_at",
        ]
        read_only_fields = ["id", "ice_score", "oce_score", "created_at"]

    def get_achieved_score(self, obj):
        """Moyenne des 'Réalisé' par critère — TCO en dérive. Non stockée
        (calculée à la volée, comme ice_score/oce_score le sont à l'écriture)."""
        values = [c.achieved_score for c in obj.criterion_scores.all() if c.achieved_score is not None]
        return round(sum(values) / len(values), 1) if values else None

    def get_tco(self, obj):
        """Taux de Cohésion Obtenu = Réalisé moyen / OCE moyen (%)."""
        achieved = self.get_achieved_score(obj)
        if achieved is None or not obj.oce_score:
            return None
        return round(float(achieved) / float(obj.oce_score) * 100, 1)

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
            objectives = [c["objective_score"] for c in criteria if c.get("objective_score") is not None]
            analysis.oce_score = round(sum(objectives) / len(objectives), 1) if objectives else 0
            analysis.save(update_fields=["ice_score", "oce_score"])


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
