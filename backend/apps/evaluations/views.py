from django.db.models import ProtectedError, Q
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.core.audit import log_event
from apps.core.models import User
from apps.core.permissions import (
    CompanyScopedQuerySetMixin,
    IsCompanyAdminOrManager,
    IsSuperAdminOrCompanyAdmin,
)
from apps.core.serializer_fields import normalize_decimal
from apps.core.validators import require_same_company

from apps.core.scoping import managed_department_ids, readable_department_ids, viewing_peer

from .models import (
    Feedback360,
    Evaluation,
    EvaluationCampaign,
    ManagerialSelfAssessment,
    ManagerialSynthesis,
    MonkeyManagementAssessment,
    PerformanceObjective,
    SkillNote,
    recompute_evaluation_scores,
)
from .serializers import (
    Feedback360Serializer,
    EvaluationCampaignSerializer,
    EvaluationSerializer,
    EvaluationWriteSerializer,
    ManagerialSelfAssessmentSerializer,
    ManagerialSynthesisSerializer,
    MonkeyManagementAssessmentSerializer,
    PerformanceObjectiveSerializer,
    SkillNoteSerializer,
)


class EvaluationCampaignViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Campagnes d'évaluation : créées par le Company Admin (ou le Super
    Admin), valables pour tous les départements de l'entreprise. Les
    managers peuvent seulement les consulter, pour y rattacher les
    évaluations de leur équipe."""

    queryset = EvaluationCampaign.objects.select_related("company", "created_by")
    serializer_class = EvaluationCampaignSerializer
    company_lookup = "company_id"
    filterset_fields = ["company", "is_closed"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "close", "reopen"):
            return [IsSuperAdminOrCompanyAdmin()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == user.Role.SUPER_ADMIN:
            company_id = self.request.data.get("company")
            campaign = serializer.save(company_id=company_id, created_by=user)
        else:
            campaign = serializer.save(company=user.company, created_by=user)
        log_event(
            user,
            "campaign.created",
            f"a créé la campagne « {campaign.name} ».",
            company=campaign.company,
        )

    def perform_update(self, serializer):
        before = {"name": serializer.instance.name, "start_date": serializer.instance.start_date, "end_date": serializer.instance.end_date}
        campaign = serializer.save()
        changed = [
            field for field, old in before.items() if old != getattr(campaign, field)
        ]
        if changed:
            log_event(
                self.request.user,
                "campaign.updated",
                f"a modifié la campagne « {campaign.name} » ({', '.join(changed)}).",
                company=campaign.company,
            )

    def perform_destroy(self, instance):
        # Evaluation.campaign est en PROTECT (garde-fou volontaire) : on
        # transforme le ProtectedError brut en erreur de validation lisible
        # plutôt que de laisser remonter un 500.
        name, company = instance.name, instance.company
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError(
                {"detail": "Impossible de supprimer une campagne qui contient déjà des évaluations."}
            )
        log_event(
            self.request.user,
            "campaign.deleted",
            f"a supprimé la campagne « {name} ».",
            company=company,
        )

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        campaign = self.get_object()
        campaign.is_closed = True
        campaign.closed_on = timezone.localdate()
        campaign.save(update_fields=["is_closed", "closed_on"])
        log_event(
            request.user,
            "campaign.closed",
            f"a clôturé la campagne « {campaign.name} ».",
            company=campaign.company,
        )
        return Response(self.get_serializer(campaign).data)

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen(self, request, pk=None):
        campaign = self.get_object()
        campaign.is_closed = False
        campaign.closed_on = None
        campaign.save(update_fields=["is_closed", "closed_on"])
        log_event(
            request.user,
            "campaign.reopened",
            f"a rouvert la campagne « {campaign.name} ».",
            company=campaign.company,
        )
        return Response(self.get_serializer(campaign).data)


class EvaluationViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    # `user__department` est indispensable : le serializer expose le nom du
    # département, qui déclenchait sinon une requête par évaluation.
    queryset = Evaluation.objects.select_related(
        "user", "user__department", "evaluator", "campaign"
    ).prefetch_related("skill_scores__skill_item__matrix")
    company_lookup = "user__company_id"
    filterset_fields = ["user", "campaign", "user__role"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return EvaluationWriteSerializer
        return EvaluationSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MEMBER:
            qs = qs.filter(user=user)
        elif user.role == user.Role.MANAGER:
            # Un manager ne voit que les évaluations de son équipe (+ les siennes).
            own = qs.filter(user=user)
            qs = qs.filter(user__department_id__in=readable_department_ids(self.request, ("ID3A", "EVALUATIONS")))
            if not viewing_peer(self.request, ("ID3A", "EVALUATIONS")):
                qs = qs | own
        return qs.distinct()

    def perform_create(self, serializer):
        evaluation = serializer.save()
        log_event(
            self.request.user,
            "evaluation.created",
            f"a créé l'évaluation de {evaluation.user.get_full_name()} ({evaluation.campaign.name}).",
            company=evaluation.user.company,
        )

    def perform_update(self, serializer):
        evaluation = serializer.save()
        log_event(
            self.request.user,
            "evaluation.updated",
            f"a modifié l'évaluation de {evaluation.user.get_full_name()} ({evaluation.campaign.name}).",
            company=evaluation.user.company,
        )

    def perform_destroy(self, instance):
        user_name, campaign_name, company = instance.user.get_full_name(), instance.campaign.name, instance.user.company
        instance.delete()
        log_event(
            self.request.user,
            "evaluation.deleted",
            f"a supprimé l'évaluation de {user_name} ({campaign_name}).",
            company=company,
        )


class SkillNoteViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Fiche "Forces & Faiblesses" (Hard/Soft Skills) — rattachée à une
    évaluation précise (donc à sa campagne) plutôt qu'au seul collaborateur,
    pour conserver un historique par période. Mêmes règles de visibilité
    que les évaluations : un manager ne voit/édite que sa propre équipe
    (+ lui-même), un membre ne voit que la sienne."""

    queryset = SkillNote.objects.select_related("evaluation__user")
    serializer_class = SkillNoteSerializer
    company_lookup = "evaluation__user__company_id"
    filterset_fields = ["evaluation"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "bulk_save"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MEMBER:
            qs = qs.filter(evaluation__user=user)
        elif user.role == user.Role.MANAGER:
            own = qs.filter(evaluation__user=user)
            qs = qs.filter(evaluation__user__department_id__in=readable_department_ids(self.request, ("ID3A", "EVALUATIONS")))
            if not viewing_peer(self.request, ("ID3A", "EVALUATIONS")):
                qs = qs | own
        return qs.distinct()

    @action(detail=False, methods=["post"], url_path="bulk-save")
    def bulk_save(self, request):
        """Remplace en une fois les 20 lignes (4 catégories × 5) de la fiche
        d'une évaluation — même logique que les autres fiches "tout ou rien"
        de l'app (scores de compétences, critères de cohésion)."""
        evaluation_id = request.data.get("evaluation")
        notes = request.data.get("notes", [])
        try:
            evaluation = Evaluation.objects.select_related("user", "user__department").get(pk=evaluation_id)
        except (Evaluation.DoesNotExist, TypeError, ValueError):
            raise ValidationError({"evaluation": "Évaluation introuvable : elle a peut-être été supprimée. Actualisez la page puis réessayez."})
        require_same_company(request.user, target_user=evaluation.user)

        actor = request.user
        target_user = evaluation.user
        if actor.role == actor.Role.MANAGER and target_user.department_id and target_user.department.manager_id != actor.id and target_user.id != actor.id:
            raise ValidationError({"evaluation": "Ce collaborateur ne fait pas partie de votre équipe."})

        if not isinstance(notes, list):
            raise ValidationError({"notes": "Les lignes Forces & Faiblesses doivent être envoyées sous forme de liste."})
        section = {
            "SOFT_STRENGTH": "Forces — Soft Skills", "SOFT_WEAKNESS": "Faiblesses — Soft Skills",
            "HARD_STRENGTH": "Forces — Hard Skills", "HARD_WEAKNESS": "Faiblesses — Hard Skills",
        }
        valid_categories = {c.value for c in SkillNote.Category}
        cleaned = []
        for n in notes:
            if not isinstance(n, dict) or n.get("category") not in valid_categories:
                continue
            order = n.get("order")
            if not isinstance(order, int) or not (1 <= order <= 10):
                continue
            where = f"{section[n['category']]}, ligne {order}"
            if len(n.get("text") or "") > 255:
                raise ValidationError({"notes": f"{where} : le texte dépasse 255 caractères. Raccourcissez-le."})
            score = n.get("score")
            if score not in (None, ""):
                try:
                    # La virgule décimale passe ici comme ailleurs.
                    score = float(normalize_decimal(score))
                except (TypeError, ValueError):
                    raise ValidationError({"notes": f"{where} : l'indice « {score} » n'est pas un nombre. Saisissez une valeur entre 1 et 5, par exemple 3,5."})
                if not 1 <= score <= 5:
                    raise ValidationError({"notes": f"{where} : l'indice doit être compris entre 1 et 5 (vous avez saisi {score:g})."})
                # La colonne ne garde qu'une décimale : on arrondit ici
                # plutôt que de laisser le SGBD le faire en silence.
                score = round(score, 1)
            else:
                score = None
            cleaned.append(
                SkillNote(
                    evaluation=evaluation,
                    category=n["category"],
                    order=order,
                    text=(n.get("text") or "")[:255],
                    score=score,
                )
            )

        SkillNote.objects.filter(evaluation=evaluation).delete()
        SkillNote.objects.bulk_create(cleaned)
        log_event(
            actor,
            "skillnote.bulk_saved",
            f"a mis à jour la fiche Forces & Faiblesses de {target_user.get_full_name()} ({evaluation.campaign.name}).",
            company=target_user.company,
        )
        return Response(SkillNoteSerializer(SkillNote.objects.filter(evaluation=evaluation), many=True).data)


class ManagerialSelfAssessmentViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Auto-évaluation managériale : chacun n'édite que la sienne — ni un
    Company Admin ni un Manager ne notent quelqu'un d'autre ici, `serializer.
    create()` force `user` au collaborateur connecté quoi qu'il arrive.

    En lecture, le CODIR (Company Admin) voit les fiches de tous les
    managers de son entreprise, pour pouvoir suivre leur auto-évaluation —
    un manager, lui, ne voit toujours que la sienne. La restriction en
    écriture (`update`/`partial_update`/`destroy` bornés à `user=request.
    user` ci-dessous, quel que soit le rôle) est ce qui empêche le CODIR de
    modifier la fiche d'un manager sous prétexte qu'il peut désormais la lire."""

    queryset = ManagerialSelfAssessment.objects.select_related("user", "campaign")
    serializer_class = ManagerialSelfAssessmentSerializer
    company_lookup = "user__company_id"
    filterset_fields = ["campaign", "category", "user"]

    def get_permissions(self):
        # Chacun ne remplit que sa propre fiche (le serializer force `user` et
        # `get_queryset` borne la modification à ses lignes) : tout rôle peut
        # donc écrire, un collaborateur comme un manager.
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.action in ("list", "retrieve") and user.role == user.Role.COMPANY_ADMIN:
            return qs
        return qs.filter(user=user)

    def perform_create(self, serializer):
        assessment = serializer.save()
        log_event(
            self.request.user,
            "managerial_self_assessment.saved",
            f"a enregistré son auto-évaluation « {assessment.get_category_display()} » ({assessment.campaign.name}).",
            company=self.request.user.company,
        )

    def perform_update(self, serializer):
        assessment = serializer.save()
        log_event(
            self.request.user,
            "managerial_self_assessment.saved",
            f"a mis à jour son auto-évaluation « {assessment.get_category_display()} » ({assessment.campaign.name}).",
            company=self.request.user.company,
        )


class ManagerialSynthesisViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Compétences clés / axes d'amélioration de la synthèse — même portée
    que l'auto-évaluation managériale : le CODIR voit celles de tous les
    managers de son entreprise, chacun n'édite que la sienne."""

    queryset = ManagerialSynthesis.objects.select_related("user", "campaign")
    serializer_class = ManagerialSynthesisSerializer
    company_lookup = "user__company_id"
    filterset_fields = ["campaign", "user"]

    def get_permissions(self):
        # Chacun ne remplit que sa propre fiche (le serializer force `user` et
        # `get_queryset` borne la modification à ses lignes) : tout rôle peut
        # donc écrire, un collaborateur comme un manager.
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.action in ("list", "retrieve") and user.role == user.Role.COMPANY_ADMIN:
            return qs
        return qs.filter(user=user)

    def perform_create(self, serializer):
        synthesis = serializer.save()
        log_event(
            self.request.user,
            "managerial_synthesis.saved",
            f"a enregistré sa synthèse d'auto-évaluation managériale ({synthesis.campaign.name}).",
            company=self.request.user.company,
        )

    def perform_update(self, serializer):
        synthesis = serializer.save()
        log_event(
            self.request.user,
            "managerial_synthesis.saved",
            f"a mis à jour sa synthèse d'auto-évaluation managériale ({synthesis.campaign.name}).",
            company=self.request.user.company,
        )


class MonkeyManagementAssessmentViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Auto-diagnostic Monkey Management : même portée que l'auto-évaluation
    managériale — le CODIR voit celui de tous les managers de son
    entreprise, chacun n'édite que le sien."""

    queryset = MonkeyManagementAssessment.objects.select_related("user", "campaign")
    serializer_class = MonkeyManagementAssessmentSerializer
    company_lookup = "user__company_id"
    filterset_fields = ["campaign", "user"]

    def get_permissions(self):
        # Chacun ne remplit que sa propre fiche (le serializer force `user` et
        # `get_queryset` borne la modification à ses lignes) : tout rôle peut
        # donc écrire, un collaborateur comme un manager.
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.action in ("list", "retrieve") and user.role == user.Role.COMPANY_ADMIN:
            return qs
        return qs.filter(user=user)

    def perform_create(self, serializer):
        assessment = serializer.save()
        log_event(
            self.request.user,
            "monkey_management_assessment.saved",
            f"a enregistré son auto-diagnostic Monkey Management ({assessment.campaign.name}).",
            company=self.request.user.company,
        )

    def perform_update(self, serializer):
        assessment = serializer.save()
        log_event(
            self.request.user,
            "monkey_management_assessment.saved",
            f"a mis à jour son auto-diagnostic Monkey Management ({assessment.campaign.name}).",
            company=self.request.user.company,
        )


class PerformanceObjectiveViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Lignes de la fiche annuelle — d'un employé ou d'une équipe.

    La portée suit celle des évaluations : un manager ne voit que son périmètre,
    un membre que sa propre fiche. Les lignes d'équipe se filtrent, elles, sur
    les départements qu'il encadre.
    """

    queryset = PerformanceObjective.objects.select_related("evaluation__user", "team", "campaign")
    serializer_class = PerformanceObjectiveSerializer
    company_lookup = "campaign__company_id"
    filterset_fields = ["evaluation", "team", "campaign", "category"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        # `company_lookup` ne couvre pas les lignes d'un employé, dont la
        # campagne est portée par l'évaluation : on borne donc à la main.
        qs = PerformanceObjective.objects.select_related("evaluation__user", "team", "campaign")
        user = self.request.user
        if user.role == user.Role.SUPER_ADMIN:
            return qs
        qs = qs.filter(
            Q(evaluation__user__company_id=user.company_id) | Q(team__company_id=user.company_id)
        )
        if user.role == user.Role.MANAGER:
            scope = readable_department_ids(self.request, ("ID3A", "EVALUATIONS"))
            cond = Q(evaluation__user__department_id__in=scope) | Q(team_id__in=scope)
            if not viewing_peer(self.request, ("ID3A", "EVALUATIONS")):
                cond |= Q(evaluation__user=user)
            qs = qs.filter(cond)
        elif user.role == user.Role.MEMBER:
            # Sa fiche, plus celle de sa direction (lecture seule) : la vue
            # « Objectifs équipe » a un sens pour lui aussi.
            own = Q(evaluation__user=user)
            # Sans direction, `team_id=None` filtrerait « équipe IS NULL », soit
            # toutes les lignes d'employés : on n'ajoute l'équipe que si elle existe.
            if user.department_id:
                own |= Q(team_id=user.department_id)
            qs = qs.filter(own)
        return qs.distinct()

    def perform_destroy(self, instance):
        """Retirer une ligne change la moyenne : le report vaut aussi à la
        suppression, sans quoi l'Altitude garderait la trace d'un objectif
        effacé."""
        evaluation = instance.evaluation
        super().perform_destroy(instance)
        if evaluation is not None:
            recompute_evaluation_scores(evaluation)


class Feedback360ViewSet(viewsets.ModelViewSet):
    """Avis 360° : chacun ne lit, ne modifie et ne supprime que ceux qu'il a
    donnés. Ce que l'on reçoit ne se lit que via `received`, agrégé par
    relation et sans jamais nommer l'auteur."""

    serializer_class = Feedback360Serializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["campaign", "kind", "subject"]
    MIN_GROUP = 2  # pairs et collaborateurs directs : publiés à partir de deux avis

    def get_queryset(self):
        return Feedback360.objects.filter(author=self.request.user).select_related("subject").order_by("-updated_at")

    @staticmethod
    def _relation(author, subject):
        if author.id == subject.id:
            return Feedback360.Relation.SELF
        if subject.manager_id == author.id or (
            subject.department_id and subject.department.manager_id == author.id
        ):
            return Feedback360.Relation.MANAGER
        if author.manager_id == subject.id:
            return Feedback360.Relation.REPORT
        return Feedback360.Relation.PEER

    def perform_create(self, serializer):
        user = self.request.user
        subject = serializer.validated_data["subject"]
        serializer.save(author=user, company=user.company, relation=self._relation(user, subject))

    def perform_update(self, serializer):
        user = self.request.user
        subject = serializer.validated_data.get("subject", serializer.instance.subject)
        serializer.save(relation=self._relation(user, subject))

    @action(detail=False, methods=["get"], url_path="received")
    def received(self, request):
        """Avis reçus par une personne (soi par défaut) sur une campagne, par
        relation. Les groupes de pairs et de collaborateurs directs ne sont
        publiés qu'à partir de MIN_GROUP avis : en dessous, on ne dit que leur
        effectif, pour que personne ne soit reconnaissable."""
        user = request.user
        campaign = EvaluationCampaign.objects.filter(
            pk=request.query_params.get("campaign"), company_id=user.company_id
        ).first()
        if campaign is None:
            raise ValidationError({"campaign": "Choisissez une campagne."})
        kind = request.query_params.get("kind")
        if kind not in Feedback360.Kind.values:
            raise ValidationError({"kind": "Type d'avis inconnu."})
        subject_id = request.query_params.get("subject") or user.id
        subject = User.objects.filter(pk=subject_id, company_id=user.company_id).select_related("department").first()
        if subject is None:
            raise ValidationError({"subject": "Personne introuvable."})
        if subject.id != user.id:
            allowed = user.role == user.Role.COMPANY_ADMIN or (
                user.role == user.Role.MANAGER
                and (subject.manager_id == user.id or subject.department_id in managed_department_ids(user))
            )
            if not allowed:
                raise PermissionDenied("Vous ne pouvez consulter que vos propres avis reçus.")
        rows = list(Feedback360.objects.filter(subject=subject, campaign=campaign, kind=kind))
        groups = []
        for rel in Feedback360.Relation.values:
            rs = [r for r in rows if r.relation == rel]
            if not rs:
                continue
            published = rel in (Feedback360.Relation.SELF, Feedback360.Relation.MANAGER) or len(rs) >= self.MIN_GROUP
            group = {"relation": rel, "count": len(rs), "published": published}
            if published:
                if kind == Feedback360.Kind.FEEDBACK:
                    n = len(rs[0].scores) or 6
                    group["averages"] = [round(sum(r.scores[i] for r in rs) / len(rs), 2) for i in range(n)]
                group["comments"] = [
                    {"text_a": r.text_a, "text_b": r.text_b, "text_c": r.text_c}
                    for r in rs
                    if r.text_a or r.text_b or r.text_c
                ]
            groups.append(group)
        return Response({"subject": subject.id, "subject_name": subject.get_full_name(), "groups": groups})
