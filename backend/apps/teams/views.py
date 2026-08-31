from django.db.models import Count
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.core.models import Department
from apps.core.permissions import CompanyScopedQuerySetMixin, IsCompanyAdminOrManager
from apps.core.scoping import managed_department_ids

from .aggregation import aggregate_responses, company_score
from .models import CohesionResponse, TeamBoard, TeamCohesionAnalysis, TeamRelationship
from .serializers import (
    CohesionResponseSerializer,
    TeamBoardSerializer,
    TeamCohesionAnalysisSerializer,
    TeamRelationshipSerializer,
)


class TeamCohesionAnalysisViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = TeamCohesionAnalysis.objects.select_related("team").prefetch_related(
        "criterion_scores"
    )
    serializer_class = TeamCohesionAnalysisSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            qs = qs.filter(team_id__in=managed_department_ids(user))
        return qs


class TeamRelationshipViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = TeamRelationship.objects.select_related("from_user", "to_user", "team")
    serializer_class = TeamRelationshipSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team"]
    permission_classes = [IsCompanyAdminOrManager]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            qs = qs.filter(team_id__in=managed_department_ids(user))
        return qs


class TeamBoardViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Cartes d'équipe (forces/faiblesses, dynamique relationnelle, Team
    Performance ID). Mêmes règles que la cohésion : lecture pour l'entreprise,
    écriture pour le CEO et l'encadrant de l'équipe."""

    queryset = TeamBoard.objects.select_related("team")
    serializer_class = TeamBoardSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            qs = qs.filter(team_id__in=managed_department_ids(user))
        return qs


class CohesionResponseViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Les avis individuels — et le seul endroit d'où sortent les agrégats.

    Règle de confidentialité, qui conditionne la sincérité des réponses : un
    avis nominatif n'est jamais lisible que par son auteur. L'encadrement, CEO
    compris, n'accède qu'à l'agrégat, et seulement au-delà du seuil de
    répondants. C'est pour cela que le `get_queryset` ne fait aucune exception
    de rôle : y ouvrir une porte pour le CEO reviendrait à publier les avis
    nominatifs.
    """

    queryset = CohesionResponse.objects.select_related("team", "respondent")
    serializer_class = CohesionResponseSerializer
    company_lookup = "team__company_id"
    filterset_fields = ["team", "date"]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(respondent=self.request.user)

    def perform_create(self, serializer):
        serializer.save(respondent=self.request.user)

    @action(detail=False, methods=["get"], url_path="aggregate")
    def aggregate(self, request):
        """Résultat par direction, pour l'encadrement.

        Le CEO voit toutes les directions de son entreprise, un encadrant les
        siennes. Chaque direction porte son indice, sa dispersion, sa
        participation — et l'écart avec la note que son propre encadrant lui a
        donnée sur sa fiche, qui est le signal le plus riche de l'exercice.
        """
        user = request.user
        if user.role == user.Role.MEMBER:
            raise PermissionDenied("Les résultats agrégés sont réservés à l'encadrement.")

        departments = Department.objects.filter(company_id=user.company_id)
        if user.role == user.Role.MANAGER:
            departments = departments.filter(id__in=managed_department_ids(user))

        date = request.query_params.get("date")
        responses = CohesionResponse.objects.filter(team__in=departments)
        if date:
            responses = responses.filter(date=date)

        # Sans tour précisé, on lit l'état courant : le dernier avis de chacun.
        # Additionner tous les avis d'une personne la ferait peser autant de
        # fois qu'elle a répondu, et mêlerait des états d'esprit distants de
        # plusieurs mois.
        latest = {}
        for response in responses.order_by("date"):
            latest[(response.team_id, response.respondent_id)] = response

        by_team = {}
        for (team_id, _), response in latest.items():
            by_team.setdefault(team_id, []).append(response)

        headcounts = {
            row["id"]: row["headcount"]
            for row in departments.annotate(headcount=Count("members")).values("id", "headcount")
        }
        # Note portée par l'encadrant sur sa propre fiche, pour l'écart.
        own_sheets = {}
        sheets = TeamCohesionAnalysis.objects.filter(team__in=departments)
        if date:
            sheets = sheets.filter(date=date)
        for sheet in sheets.order_by("team_id", "-date"):
            own_sheets.setdefault(sheet.team_id, float(sheet.ice_score))

        directions = []
        for department in departments.order_by("name"):
            summary = aggregate_responses(
                by_team.get(department.id, []), headcount=headcounts.get(department.id)
            )
            manager_score = own_sheets.get(department.id)
            summary.update(
                {
                    "team": department.id,
                    "team_name": department.name,
                    "manager_score": manager_score,
                    # L'écart n'a de sens que si les deux notes existent : un
                    # zéro affiché faute de données se lirait comme un accord
                    # parfait, ce qui est l'inverse de la vérité.
                    "gap": (
                        round(manager_score - summary["score"], 2)
                        if manager_score is not None and summary["score"] is not None
                        else None
                    ),
                }
            )
            directions.append(summary)

        return Response({"directions": directions, "company_score": company_score(directions)})
