from datetime import date as _date

from rest_framework import serializers

from apps.core.serializer_fields import DecimalCommaMixin
from apps.core.validators import require_manages_team, require_same_company

from .models import (
    CohesionCriterionScore,
    CohesionResponse,
    TeamBoard,
    TeamCohesionAnalysis,
    TeamRelationship,
)


class CohesionCriterionScoreSerializer(DecimalCommaMixin, serializers.ModelSerializer):
    class Meta:
        model = CohesionCriterionScore
        fields = ["id", "analysis", "criterion", "score", "objective_score", "achieved_score"]
        # `analysis` est toujours fourni par `_sync_criteria` (l'objet n'existe
        # pas encore côté client au moment de l'écriture imbriquée) — jamais
        # par le payload. Sans ce read_only, le champ FK requis fait échouer
        # toute création/mise à jour de TeamCohesionAnalysis.
        read_only_fields = ["id", "analysis"]


class TeamCohesionAnalysisSerializer(DecimalCommaMixin, serializers.ModelSerializer):
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
        require_manages_team(actor, team)
        day = attrs.get("date")
        if day and day > _date.today():
            raise serializers.ValidationError({"date": "La date de la fiche ne peut pas être dans le futur : saisissez la date du jour ou une date passée."})
        criteria = attrs.get("criterion_scores")
        if criteria is not None:
            if not criteria and self.instance is None:
                raise serializers.ValidationError({"criterion_scores": "Renseignez la note d'au moins un critère avant d'enregistrer la fiche."})
            labels = [(c.get("criterion") or "").strip().lower() for c in criteria]
            if len(set(labels)) != len(labels):
                raise serializers.ValidationError({"criterion_scores": "Un même critère apparaît deux fois dans la fiche : chaque critère ne doit être noté qu'une seule fois."})
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
        if from_user and to_user and from_user.pk == to_user.pk:
            raise serializers.ValidationError({"to_user": "Choisissez deux personnes différentes : une relation lie deux collaborateurs."})
        if team and from_user and to_user and self.instance is None:
            if TeamRelationship.objects.filter(team=team, from_user=from_user, to_user=to_user).exists() or TeamRelationship.objects.filter(team=team, from_user=to_user, to_user=from_user).exists():
                raise serializers.ValidationError({"to_user": "La relation entre ces deux personnes existe déjà dans cette équipe : modifiez sa qualité au lieu d'en créer une seconde."})
        for field_name, member in (("from_user", from_user), ("to_user", to_user)):
            if team and member and member.company_id != team.company_id:
                raise serializers.ValidationError(
                    {field_name: "Cette personne n'appartient pas à l'entreprise de cette équipe."}
                )
        require_manages_team(actor, team)
        return attrs


class TeamBoardSerializer(serializers.ModelSerializer):
    """Carte d'équipe : listes libres, toutes facultatives. Une saisie
    incomplète est la règle — on remplit ce que l'atelier a produit."""

    team_name = serializers.CharField(source="team.name", read_only=True)

    class Meta:
        model = TeamBoard
        fields = [
            "id", "team", "team_name", "date",
            "people_strengths", "people_weaknesses",
            "business_strengths", "business_weaknesses",
            "catalysts", "nourishers", "inhibitors", "toxins",
            "vision_missions", "values", "counter_values",
            "achievements", "failures_lessons", "objectives",
            "priorities_cohesion", "priorities_business", "targets_vs_actuals",
            "objectives_plan",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    TEXT_LISTS = [
        "people_strengths", "people_weaknesses", "business_strengths", "business_weaknesses",
        "catalysts", "nourishers", "inhibitors", "toxins", "values", "counter_values",
        "achievements", "failures_lessons", "objectives", "priorities_cohesion", "priorities_business",
    ]
    SERIES = {"targets_vs_actuals": "Réalisations vs objectifs", "objectives_plan": "Objectifs par année"}

    def validate(self, attrs):
        actor = self.context["request"].user
        team = attrs.get("team", getattr(self.instance, "team", None))
        require_same_company(actor, team=team)
        require_manages_team(actor, team)
        day = attrs.get("date")
        if day and day > _date.today():
            raise serializers.ValidationError({"date": "La date de la carte ne peut pas être dans le futur : saisissez la date du jour ou une date passée."})
        for name in self.TEXT_LISTS:
            value = attrs.get(name)
            if value is None:
                continue
            if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
                raise serializers.ValidationError({name: "Ce champ attend une liste de textes."})
            if len(value) > 30 or any(len(v) > 500 for v in value):
                raise serializers.ValidationError({name: "Liste trop longue : 30 lignes au plus, 500 caractères par ligne."})
        for name, label in self.SERIES.items():
            rows = attrs.get(name)
            if rows is None:
                continue
            if not isinstance(rows, list):
                raise serializers.ValidationError({name: f"{label} : format de liste attendu."})
            years = set()
            for row in rows:
                year = str(row.get("year", "")).strip() if isinstance(row, dict) else ""
                if not (year.isdigit() and len(year) == 4):
                    raise serializers.ValidationError({name: f"{label} : chaque ligne doit porter une année à 4 chiffres (exemple : 2026)."})
                if year in years:
                    raise serializers.ValidationError({name: f"{label} : l'année {year} apparaît deux fois. Regroupez-la sur une seule ligne."})
                years.add(year)
                for key in ("target", "actual"):
                    v = row.get(key)
                    if v is not None and (isinstance(v, bool) or not isinstance(v, (int, float))):
                        raise serializers.ValidationError({name: f"{label} : la valeur « {key} » de l'année {year} doit être un nombre."})
        return attrs


class CohesionResponseSerializer(serializers.ModelSerializer):
    """L'avis d'un collaborateur sur sa direction.

    Le répondant n'est jamais choisi par le client : c'est l'utilisateur
    connecté, sans quoi on pourrait déposer un avis sous le nom d'un autre.
    """

    respondent_name = serializers.CharField(source="respondent.full_name", read_only=True)

    class Meta:
        model = CohesionResponse
        fields = [
            "id", "scope", "team", "company", "respondent", "respondent_name",
            "date", "scores", "updated_at",
        ]
        read_only_fields = ["respondent", "respondent_name", "company", "updated_at"]
        extra_kwargs = {"team": {"required": False, "allow_null": True}}

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", None)) or "TEAM"
        team = attrs.get("team", getattr(self.instance, "team", None))
        if scope == "TEAM" and team is None:
            raise serializers.ValidationError({"team": "Indiquez la direction notée : votre avis porte sur votre direction, elle doit être précisée."})
        actor = self.context["request"].user
        if team is not None:
            require_same_company(actor, team=team)
        day = attrs.get("date")
        if day and day > _date.today():
            raise serializers.ValidationError({"date": "La date de l'avis ne peut pas être dans le futur."})
        return attrs

    def validate_scores(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Les notes doivent être envoyées sous forme de liste.")
        if not value:
            raise serializers.ValidationError("Notez au moins un critère avant d'envoyer votre avis.")
        seen = set()
        for position, entry in enumerate(value, start=1):
            if not isinstance(entry, dict) or not str(entry.get("criterion", "")).strip():
                raise serializers.ValidationError(f"La note n°{position} n'indique pas le critère noté.")
            label = str(entry["criterion"]).strip()
            if label in seen:
                raise serializers.ValidationError(f"Le critère n°{position} est noté deux fois.")
            seen.add(label)
            score = entry.get("score")
            if isinstance(score, bool) or not isinstance(score, int) or not (1 <= score <= 5):
                raise serializers.ValidationError(f"La note du critère n°{position} doit être un entier de 1 à 5 (vous avez saisi {score!r}).")
        return value
