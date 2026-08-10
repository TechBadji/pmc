from rest_framework import serializers

from apps.core.validators import require_same_company

from .models import SkillItem, SkillMatrix


class SkillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SkillItem
        fields = ["id", "matrix", "name", "description", "weight", "order"]

    def validate(self, attrs):
        actor = self.context["request"].user
        matrix = attrs.get("matrix", getattr(self.instance, "matrix", None))
        require_same_company(actor, matrix=matrix)
        return attrs


class SkillMatrixSerializer(serializers.ModelSerializer):
    items = SkillItemSerializer(many=True, read_only=True)

    class Meta:
        model = SkillMatrix
        fields = ["id", "company", "department", "name", "type", "items", "created_at"]
        read_only_fields = ["id", "company", "created_at"]
