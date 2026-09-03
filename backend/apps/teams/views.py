from django.db.models import Count
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.core.audit import log_event
from apps.core.models import Department, User
from apps.evaluations.models import EvaluationCampaign
from apps.core.permissions import CompanyScopedQuerySetMixin, IsCompanyAdminOrManager
from apps.core.scoping import managed_department_ids

from .aggregation import aggregate_organisation, aggregate_responses, company_score
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

    def perform_create(self, serializer):
        analysis = serializer.save()
        log_event(
            self.request.user,
            "cohesion.created",
            f"a créé une analyse de cohésion pour « {analysis.team.name} » ({analysis.date}).",
            company=analysis.team.company,
        )

    def perform_update(self, serializer):
        analysis = serializer.save()
        log_event(
            self.request.user,
            "cohesion.updated",
            f"a modifié l'analyse de cohésion de « {analysis.team.name} » ({analysis.date}).",
            company=analysis.team.company,
        )

    def perform_destroy(self, instance):
        team_name, date, company = instance.team.name, instance.date, instance.team.company
        instance.delete()
        log_event(
            self.request.user,
            "cohesion.deleted",
            f"a supprimé l'analyse de cohésion de « {team_name} » ({date}).",
            company=company,
        )


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

    def perform_create(self, serializer):
        rel = serializer.save()
        log_event(
            self.request.user,
            "relationship.created",
            f"a ajouté une relation « {rel.get_quality_display()} » entre {rel.from_user.get_full_name()} et {rel.to_user.get_full_name()}.",
            company=rel.team.company,
        )

    def perform_destroy(self, instance):
        from_name, to_name, quality, company = (
            instance.from_user.get_full_name(),
            instance.to_user.get_full_name(),
            instance.get_quality_display(),
            instance.team.company,
        )
        instance.delete()
        log_event(
            self.request.user,
            "relationship.deleted",
            f"a supprimé la relation « {quality} » entre {from_name} et {to_name}.",
            company=company,
        )


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

    def perform_create(self, serializer):
        board = serializer.save()
        log_event(
            self.request.user,
            "teamboard.created",
            f"a créé la fiche d'équipe de « {board.team.name} » ({board.date}).",
            company=board.team.company,
        )

    def perform_update(self, serializer):
        board = serializer.save()
        log_event(
            self.request.user,
            "teamboard.updated",
            f"a modifié la fiche d'équipe de « {board.team.name} » ({board.date}).",
            company=board.team.company,
        )

    def perform_destroy(self, instance):
        team_name, date, company = instance.team.name, instance.date, instance.team.company
        instance.delete()
        log_event(
            self.request.user,
            "teamboard.deleted",
            f"a supprimé la fiche d'équipe de « {team_name} » ({date}).",
            company=company,
        )


class CohesionResponseViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Les avis individuels — et le seul endroit d'où sortent les agrégats.

    Règle de confidentialité, qui conditionne la sincérité des réponses : un
    avis nominatif n'est jamais lisible que par son auteur. L'encadrement, CEO
    compris, n'accède qu'à l'agrégat, et seulement au-delà du seuil de
    répondants. C'est pour cela que le `get_queryset` ne fait aucune exception
    de rôle : y ouvrir une porte pour le CEO reviendrait à publier les avis
    nominatifs.
    """

    queryset = CohesionResponse.objects.select_related("team", "company", "respondent")
    serializer_class = CohesionResponseSerializer
    # Le cloisonnement passe par l'entreprise portée directement, et non par
    # la direction : un avis sur l'organisation n'en vise aucune, et le
    # chemin `team__company_id` le rendait invisible à son propre auteur —
    # donc impossible à relire ou à corriger.
    company_lookup = "company_id"
    filterset_fields = ["team", "date", "scope"]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(respondent=self.request.user)

    def perform_create(self, serializer):
        """Redéposer un avis le même jour corrige le précédent.

        `respondent` étant imposé par le serveur et absent du payload, DRF ne
        peut pas construire le contrôle d'unicité sur (équipe, répondant,
        date) : un second envoi remontait l'erreur de base en 500. Or c'est un
        cas ordinaire — un double clic, ou une page rouverte le même jour après
        un chargement manqué. On écrit donc par-dessus, ce qui est aussi la
        sémantique attendue : un avis par personne et par jour, le dernier
        faisant foi.
        """
        data = serializer.validated_data
        scope = data.get("scope") or CohesionResponse.Scope.TEAM
        company = self.request.user.company
        if scope == CohesionResponse.Scope.ORGANISATION:
            # L'avis porte sur l'entreprise : aucune direction n'est visée, et
            # l'entreprise se lit sur le répondant plutôt que sur le payload —
            # personne ne juge une organisation qui n'est pas la sienne.
            response, _ = CohesionResponse.objects.update_or_create(
                scope=scope,
                company=company,
                respondent=self.request.user,
                date=data["date"],
                defaults={"scores": data.get("scores", []), "team": None},
            )
        else:
            response, _ = CohesionResponse.objects.update_or_create(
                scope=scope,
                team=data["team"],
                respondent=self.request.user,
                date=data["date"],
                defaults={"scores": data.get("scores", []), "company": company},
            )
        serializer.instance = response

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

        team = request.query_params.get("team")
        if team:
            departments = departments.filter(id=team)

        date = request.query_params.get("date")
        responses = CohesionResponse.objects.filter(team__in=departments)
        if date:
            responses = responses.filter(date=date)

        # Une campagne remplace la date isolée : elle borne une période, et
        # tout avis déposé dans cette fenêtre lui appartient. C'est ce qui
        # permet de comparer deux exercices sans imposer aux collaborateurs de
        # répondre tous le même jour.
        campaign_id = request.query_params.get("campaign")
        campaign = None
        if campaign_id:
            campaign = EvaluationCampaign.objects.filter(
                pk=campaign_id, company_id=user.company_id
            ).first()
            if campaign is None:
                raise ValidationError({"campaign": "Campagne introuvable."})
            responses = responses.filter(date__range=(campaign.start_date, campaign.end_date))

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
        own_targets = {}
        sheets = TeamCohesionAnalysis.objects.filter(team__in=departments)
        if date:
            sheets = sheets.filter(date=date)
        if campaign is not None:
            sheets = sheets.filter(date__range=(campaign.start_date, campaign.end_date))
        for sheet in sheets.order_by("team_id", "-date"):
            own_sheets.setdefault(sheet.team_id, float(sheet.ice_score))
            if sheet.oce_score:
                own_targets.setdefault(sheet.team_id, float(sheet.oce_score))

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
                    "oce": own_targets.get(department.id),
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

        # Avis portant sur l'organisation elle-même, agrégés à part : ils ne
        # se déduisent pas de ceux des directions et se lisent en regard.
        org_responses = CohesionResponse.objects.filter(
            scope=CohesionResponse.Scope.ORGANISATION, company_id=user.company_id
        )
        if date:
            org_responses = org_responses.filter(date=date)
        if campaign is not None:
            org_responses = org_responses.filter(
                date__range=(campaign.start_date, campaign.end_date)
            )
        latest_org = {}
        for response in org_responses.order_by("date"):
            latest_org[response.respondent_id] = response
        organisation = aggregate_organisation(
            list(latest_org.values()),
            headcount=User.objects.filter(company_id=user.company_id, is_active=True).count(),
        )
        # Même forme qu'une direction : l'écran affiche les deux avec le même
        # composant, et rien ne l'oblige à distinguer les cas.
        # L'OCE de l'organisation : la moyenne des objectifs que les directions
        # se sont fixés. L'entreprise n'a pas de fiche propre où en saisir un,
        # et l'inventer serait pire que de l'agréger — au moins celui-ci est
        # tenu par des engagements réels.
        cibles = list(own_targets.values())
        organisation.update({
            "team": 0,
            "team_name": user.company.name if user.company else "",
            "manager_score": None,
            "gap": None,
            "oce": (sum(cibles) / len(cibles)) if cibles else None,
            "oce_source_count": len(cibles),
        })

        return Response({
            "directions": directions,
            "company_score": company_score(directions),
            "organisation": organisation,
        })
