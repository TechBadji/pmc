from django.db import transaction
from rest_framework import serializers

from apps.core.serializer_fields import DecimalCommaMixin, normalize_decimal
from apps.core.validators import require_manages_team, require_same_company
from apps.skills.models import SkillItem

from apps.core.scoping import manages_user

from .models import (
    Evaluation,
    EvaluationCampaign,
    EvaluationSkillScore,
    ManagerialSelfAssessment,
    ManagerialSynthesis,
    MonkeyManagementAssessment,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)


class SkillNoteSerializer(DecimalCommaMixin, serializers.ModelSerializer):
    class Meta:
        model = SkillNote
        fields = ["id", "evaluation", "category", "order", "text", "score"]
        read_only_fields = ["id"]


class EvaluationCampaignSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)
    evaluations_count = serializers.IntegerField(source="evaluations.count", read_only=True)
    effective_end_date = serializers.DateField(read_only=True)

    class Meta:
        model = EvaluationCampaign
        fields = [
            "id", "company", "name", "start_date", "end_date", "effective_end_date", "is_closed",
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


class EvaluationSkillScoreSerializer(DecimalCommaMixin, serializers.ModelSerializer):
    skill_name = serializers.CharField(source="skill_item.name", read_only=True)
    skill_type = serializers.CharField(source="skill_item.matrix.type", read_only=True)

    class Meta:
        model = EvaluationSkillScore
        fields = [
            "id", "evaluation", "skill_item", "skill_name", "skill_type",
            "score", "objective_score", "achievement_rate",
        ]


class EvaluationSerializer(DecimalCommaMixin, serializers.ModelSerializer):
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


class EvaluationWriteSerializer(DecimalCommaMixin, serializers.ModelSerializer):
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
            "objectives_set_on", "evaluated_on", "next_evaluation_on", "manager_visa",
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
                    value = normalize_decimal(item.get(field))
                    if value in (None, ""):
                        continue
                    # La valeur normalisée est réécrite dans l'entrée : c'est
                    # elle qui part en base plus bas, `_save_scores` écrivant
                    # le dictionnaire tel quel.
                    item[field] = value
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


class ManagerialSelfAssessmentSerializer(DecimalCommaMixin, serializers.ModelSerializer):
    """Fiche d'auto-évaluation managériale : le manager ne note que lui-même,
    `user` est donc forcé côté serveur (jamais fourni par le client) — même
    principe que `respondent` sur `CohesionResponse`."""

    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    campaign_is_closed = serializers.BooleanField(source="campaign.is_closed", read_only=True)

    class Meta:
        model = ManagerialSelfAssessment
        fields = [
            "id", "user", "campaign", "campaign_name", "campaign_is_closed",
            "category", "scores", "ic_score", "oc_score", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "user", "ic_score", "oc_score", "created_at", "updated_at"]

    def validate_campaign(self, campaign):
        already_on_this_campaign = self.instance and self.instance.campaign_id == campaign.id
        if campaign.is_closed and not already_on_this_campaign:
            raise serializers.ValidationError("Cette campagne d'évaluation est clôturée.")
        return campaign

    def validate_scores(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Les notes doivent être une liste.")
        seen_orders = set()
        cleaned = []
        for entry in value:
            if not isinstance(entry, dict) or "order" not in entry:
                raise serializers.ValidationError("Chaque note porte un rang (order).")
            order = entry.get("order")
            if not isinstance(order, int) or not (1 <= order <= 10) or order in seen_orders:
                raise serializers.ValidationError("Rang de question invalide ou dupliqué.")
            seen_orders.add(order)
            cleaned_entry = {"order": order}
            for field in ("score", "objective_score"):
                raw = entry.get(field)
                if raw in (None, ""):
                    cleaned_entry[field] = None
                    continue
                raw = normalize_decimal(raw)
                try:
                    num = float(raw)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(f"Valeur invalide pour {field}.")
                if not 1 <= num <= 5:
                    raise serializers.ValidationError(f"{field} doit être compris entre 1 et 5 (reçu {num}).")
                cleaned_entry[field] = round(num, 1)
            comment = entry.get("comment")
            cleaned_entry["comment"] = comment[:255] if isinstance(comment, str) else ""
            cleaned.append(cleaned_entry)
        return cleaned

    def validate(self, attrs):
        actor = self.context["request"].user
        campaign = attrs.get("campaign", getattr(self.instance, "campaign", None))
        require_same_company(actor, campaign=campaign)
        category = attrs.get("category", getattr(self.instance, "category", None))
        # `user` est read_only (forcé au serveur) : le UniqueTogetherValidator
        # que DRF génère automatiquement à partir de `unique_together` exclut
        # les champs read_only de son contrôle, donc ne voit jamais ce
        # doublon — sans ce contrôle explicite, une seconde fiche pour la
        # même campagne remontait un 500 (IntegrityError brut) au lieu d'un
        # message clair.
        duplicate = ManagerialSelfAssessment.objects.filter(
            user=actor, campaign=campaign, category=category
        )
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                {"category": "Une auto-évaluation existe déjà pour cette fiche et cette campagne."}
            )
        return attrs

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        instance = super().create(validated_data)
        self._recompute(instance)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._recompute(instance)
        return instance

    @staticmethod
    def _recompute(instance):
        """Même logique que `TeamCohesionAnalysis._sync_criteria` : IC/OC sont
        des colonnes mises en cache, recalculées à chaque écriture plutôt que
        lues à l'affichage — cette fiche est consultée aussi souvent que les
        autres indices ID-3A/cohésion."""
        scores = [e["score"] for e in instance.scores if e.get("score") is not None]
        objectives = [e["objective_score"] for e in instance.scores if e.get("objective_score") is not None]
        instance.ic_score = round(sum(scores) / len(scores), 1) if scores else 0
        instance.oc_score = round(sum(objectives) / len(objectives), 1) if objectives else 0
        instance.save(update_fields=["ic_score", "oc_score"])


class ManagerialSynthesisSerializer(serializers.ModelSerializer):
    """Compétences clés / axes d'amélioration de la synthèse — `user` forcé
    côté serveur, même principe que les autres fiches d'auto-évaluation."""

    class Meta:
        model = ManagerialSynthesis
        fields = ["id", "user", "campaign", "key_skills", "improvement_areas", "created_at", "updated_at"]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def validate_campaign(self, campaign):
        already_on_this_campaign = self.instance and self.instance.campaign_id == campaign.id
        if campaign.is_closed and not already_on_this_campaign:
            raise serializers.ValidationError("Cette campagne d'évaluation est clôturée.")
        return campaign

    def _validate_list(self, value, field_name):
        if not isinstance(value, list) or len(value) > 3 or not all(isinstance(v, str) for v in value):
            raise serializers.ValidationError(f"{field_name} : trois réponses courtes au plus.")
        return [v[:255] for v in value]

    def validate_key_skills(self, value):
        return self._validate_list(value, "Compétences clés")

    def validate_improvement_areas(self, value):
        return self._validate_list(value, "Axes d'amélioration")

    def validate(self, attrs):
        actor = self.context["request"].user
        campaign = attrs.get("campaign", getattr(self.instance, "campaign", None))
        require_same_company(actor, campaign=campaign)
        duplicate = ManagerialSynthesis.objects.filter(user=actor, campaign=campaign)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                {"campaign": "Une synthèse existe déjà pour cette campagne."}
            )
        return attrs

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class MonkeyManagementAssessmentSerializer(serializers.ModelSerializer):
    """Auto-diagnostic Monkey Management : comme `ManagerialSelfAssessment`,
    `user` est forcé côté serveur — personne ne note quelqu'un d'autre que
    soi-même. Contrairement à cette dernière, les scores sont des entiers
    (pas de virgule décimale : l'échelle Jamais..Toujours de la fiche papier
    n'a pas de position intermédiaire), d'où l'absence de `DecimalCommaMixin`."""

    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    campaign_is_closed = serializers.BooleanField(source="campaign.is_closed", read_only=True)
    level = serializers.SerializerMethodField()

    class Meta:
        model = MonkeyManagementAssessment
        fields = [
            "id", "user", "campaign", "campaign_name", "campaign_is_closed",
            "scores", "total_score", "level",
            "monkeys", "why_accepted", "return_to_whom", "behavior_to_change", "next_responsibility",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "user", "total_score", "level", "created_at", "updated_at"]

    def get_level(self, obj):
        """Palier d'interprétation — seulement une fois les 10 affirmations
        notées : un total partiel (fiche en cours de saisie) ne veut rien dire
        rapporté aux bornes 10-50 de la fiche papier, toutes conçues pour une
        fiche complète."""
        answered = [e for e in obj.scores if e.get("score") is not None]
        if len(answered) < 10:
            return None
        total = obj.total_score
        if total >= 41:
            return "EMPOWERING_LEADER"
        if total >= 31:
            return "GOOD_DELEGATOR"
        if total >= 21:
            return "MONKEY_RISK"
        return "MONKEY_MAGNET"

    def validate_campaign(self, campaign):
        already_on_this_campaign = self.instance and self.instance.campaign_id == campaign.id
        if campaign.is_closed and not already_on_this_campaign:
            raise serializers.ValidationError("Cette campagne d'évaluation est clôturée.")
        return campaign

    def validate_scores(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Les notes doivent être une liste.")
        seen_orders = set()
        cleaned = []
        for entry in value:
            if not isinstance(entry, dict) or "order" not in entry:
                raise serializers.ValidationError("Chaque note porte un rang (order).")
            order = entry.get("order")
            if not isinstance(order, int) or not (1 <= order <= 10) or order in seen_orders:
                raise serializers.ValidationError("Rang de question invalide ou dupliqué.")
            seen_orders.add(order)
            score = entry.get("score")
            if score is None:
                cleaned.append({"order": order, "score": None})
                continue
            if not isinstance(score, int) or not (1 <= score <= 5):
                raise serializers.ValidationError(f"Le score doit être un entier entre 1 et 5 (reçu {score!r}).")
            cleaned.append({"order": order, "score": score})
        return cleaned

    def validate_monkeys(self, value):
        if not isinstance(value, list) or len(value) > 3 or not all(isinstance(v, str) for v in value):
            raise serializers.ValidationError("Trois réponses courtes au plus.")
        return [v[:255] for v in value]

    def validate(self, attrs):
        actor = self.context["request"].user
        campaign = attrs.get("campaign", getattr(self.instance, "campaign", None))
        require_same_company(actor, campaign=campaign)
        # `user` est read_only (forcé au serveur) : le UniqueTogetherValidator
        # généré par DRF à partir de `unique_together` exclut les champs
        # read_only de son contrôle, donc ne voit jamais ce doublon (même
        # constat que sur ManagerialSelfAssessmentSerializer).
        duplicate = MonkeyManagementAssessment.objects.filter(user=actor, campaign=campaign)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                {"campaign": "Un auto-diagnostic Monkey Management existe déjà pour cette campagne."}
            )
        return attrs

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        instance = super().create(validated_data)
        self._recompute(instance)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        self._recompute(instance)
        return instance

    @staticmethod
    def _recompute(instance):
        valid = [e["score"] for e in instance.scores if e.get("score") is not None]
        instance.total_score = sum(valid) if valid else 0
        instance.save(update_fields=["total_score"])


class PerformanceObjectiveSerializer(DecimalCommaMixin, serializers.ModelSerializer):
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
