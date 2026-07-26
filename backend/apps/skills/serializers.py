from rest_framework import serializers

from .models import SkillItem, SkillMatrix


class SkillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SkillItem
        fields = ["id", "matrix", "name", "description", "weight", "order"]


class SkillMatrixSerializer(serializers.ModelSerializer):
    items = SkillItemSerializer(many=True, read_only=True)

    class Meta:
        model = SkillMatrix
        fields = ["id", "company", "department", "name", "type", "items", "created_at"]
        read_only_fields = ["id", "company", "created_at"]
