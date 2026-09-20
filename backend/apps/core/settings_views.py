"""Paramètres de l'entreprise, réservés à son CEO."""
from django.db import transaction
from rest_framework import permissions, serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import data_reset
from .audit import log_event
from .models import Company, Department, PeerAccess, User
from .scoping import managed_department_ids
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


class PeerAccessView(APIView):
    """Qui peut consulter quelle direction, rubrique par rubrique (CEO).

    GET livre la grille : les directeurs (lignes), les directions consultables
    (colonnes) et les accès actuels. PUT remplace l'ensemble des accès."""

    permission_classes = [permissions.IsAuthenticated, IsCompanyAdmin]

    @staticmethod
    def _directions(company):
        return list(
            Department.objects.filter(company=company, manager__role=User.Role.MANAGER)
            .select_related("manager")
            .order_by("name")
        )

    def get(self, request):
        company = request.user.company
        directors = User.objects.filter(company=company, role=User.Role.MANAGER).select_related("department").order_by("generated_login")
        return Response(
            {
                "rubrics": list(PeerAccess.RUBRICS),
                "directors": [
                    {
                        "id": u.id,
                        "name": u.get_full_name() or u.email,
                        "position": u.position,
                        "avatar": u.avatar.url if u.avatar else None,
                        "department_name": u.department.name if u.department else "",
                        "own": managed_department_ids(u),
                    }
                    for u in directors
                ],
                "directions": [
                    {"id": d.id, "name": d.name, "manager_name": d.manager.get_full_name() if d.manager else ""}
                    for d in self._directions(company)
                ],
                "grants": [
                    {"viewer": a.viewer_id, "department": a.department_id, "rubrics": a.rubrics}
                    for a in PeerAccess.objects.filter(company=company)
                ],
            }
        )

    @transaction.atomic
    def put(self, request):
        company = request.user.company
        grants = request.data.get("grants")
        if not isinstance(grants, list):
            raise ValidationError({"grants": "La liste des accès est attendue."})
        viewers = {u.id: u for u in User.objects.filter(company=company, role=User.Role.MANAGER)}
        directions = {d.id: d for d in self._directions(company)}
        cleaned = {}
        for entry in grants:
            if not isinstance(entry, dict):
                raise ValidationError({"grants": "Chaque accès doit indiquer un directeur, une direction et des rubriques."})
            viewer = viewers.get(entry.get("viewer"))
            department = directions.get(entry.get("department"))
            rubrics = entry.get("rubrics")
            if viewer is None:
                raise ValidationError({"grants": "Un des directeurs indiqués n'existe pas dans votre entreprise."})
            if department is None:
                raise ValidationError({"grants": "Une des directions indiquées n'existe pas ou n'a pas de directeur."})
            if department.id in managed_department_ids(viewer):
                raise ValidationError({"grants": f"{viewer.get_full_name()} dirige déjà « {department.name} » : inutile de l'autoriser à la consulter."})
            if not isinstance(rubrics, list) or any(r not in PeerAccess.RUBRICS for r in rubrics):
                raise ValidationError({"grants": "Rubrique inconnue : choisissez parmi Cohésion, Matrice ID-3A et Évaluations."})
            if rubrics:
                cleaned[(viewer.id, department.id)] = sorted(set(rubrics))
        before = PeerAccess.objects.filter(company=company).count()
        PeerAccess.objects.filter(company=company).delete()
        PeerAccess.objects.bulk_create(
            [PeerAccess(company=company, viewer_id=v, department_id=d, rubrics=r) for (v, d), r in cleaned.items()]
        )
        log_event(
            request.user,
            "company.peer_access_updated",
            f"a modifié les accès entre directions ({before} → {len(cleaned)} autorisation(s)).",
            company=company,
        )
        return self.get(request)
