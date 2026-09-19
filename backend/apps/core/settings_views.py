"""Paramètres de l'entreprise, réservés à son CEO."""
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from . import data_reset
from .audit import log_event
from .models import Company
from .permissions import IsCompanyAdmin


class CompanySettingsSerializer(serializers.ModelSerializer):
    name = serializers.CharField(
        max_length=255,
        error_messages={"blank": "Le nom de l'entreprise est obligatoire.", "required": "Le nom de l'entreprise est obligatoire."},
    )
    cohesion_min_respondents = serializers.IntegerField(
        min_value=1, max_value=20,
        error_messages={
            "min_value": "Le seuil de publication doit être d'au moins 1 répondant.",
            "max_value": "Le seuil de publication ne peut pas dépasser 20 répondants.",
            "invalid": "Le seuil de publication doit être un nombre entier (par exemple 2).",
        },
    )

    class Meta:
        model = Company
        fields = ["id", "name", "sector", "employee_count", "plan", "cohesion_min_respondents"]
        read_only_fields = ["id", "employee_count", "plan"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Le nom de l'entreprise est obligatoire.")
        return value


class CompanySettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        return Response(CompanySettingsSerializer(request.user.company).data)

    def patch(self, request):
        company = request.user.company
        before = CompanySettingsSerializer(company).data
        serializer = CompanySettingsSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        changed = [k for k, v in serializer.data.items() if before.get(k) != v]
        if changed:
            log_event(request.user, "company.settings_updated", f"a modifié les paramètres de l'entreprise ({', '.join(changed)}).", company=company)
        return Response(serializer.data)


class DataResetCatalogueView(APIView):
    """Les rubriques que le CEO peut remettre à zéro, et celles qui dépendent d'une campagne."""

    permission_classes = [permissions.IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        return Response({
            "confirmation": data_reset.CONFIRMATION_PHRASE,
            "rubriques": [
                {"key": r.key, "group": r.group, "campaign_scoped": r.campaign_scoped} for r in data_reset.RUBRIQUES
            ],
        })


class DataResetPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCompanyAdmin]

    def post(self, request):
        company = request.user.company
        keys, campaigns, department = data_reset.parse_scope(company, request.data)
        items = data_reset.preview(company, keys, campaigns, department)
        return Response({"items": items, "total": sum(i["count"] for i in items)})


class DataResetView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCompanyAdmin]

    def post(self, request):
        company = request.user.company
        keys, campaigns, department = data_reset.parse_scope(company, request.data)
        if data_reset.normalize_phrase(request.data.get("confirm")) != data_reset.CONFIRMATION_PHRASE:
            raise serializers.ValidationError({
                "confirm": f"Confirmation incorrecte : saisissez exactement « {data_reset.CONFIRMATION_PHRASE} » pour valider la suppression."
            })
        done = data_reset.execute(company, keys, campaigns, department)
        scope = "toutes les campagnes" if campaigns is None else ", ".join(c.name for c in campaigns)
        where = f" — direction « {department.name} »" if department else ""
        log_event(
            request.user,
            "company.data_reset",
            f"a remis à zéro des données ({scope}{where}) : " + ", ".join(f"{d['key']}={d['count']}" for d in done) + ".",
            company=company,
        )
        return Response({"items": done, "total": sum(d["count"] for d in done)})
