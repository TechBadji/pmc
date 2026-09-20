"""URL principal de l'API ID-PMC."""
from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path, re_path
from django.views.static import serve as serve_static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.actionplans.views import ActionPlanViewSet
from apps.core.views import (
    AuditLogViewSet,
    ChangePasswordView,
    CompanyViewSet,
    DepartmentViewSet,
    ForgotPasswordView,
    MeView,
    PasswordResetRequestViewSet,
    GuessSheetViewSet,
    PerformanceProfileViewSet,
    PMCTokenObtainPairView,
    UserViewSet,
)
from apps.core.settings_views import (
    CompanySettingsView,
    DataResetCatalogueView,
    DataResetPreviewView,
    DataResetView,
    PeerAccessView,
)
from apps.evaluations.views import (
    EvaluationCampaignViewSet,
    EvaluationViewSet,
    ManagerialSelfAssessmentViewSet,
    ManagerialSynthesisViewSet,
    Feedback360ViewSet,
    MonkeyManagementAssessmentViewSet,
    PerformanceObjectiveViewSet,
    SkillNoteViewSet,
)
from apps.skills.views import SkillItemViewSet, SkillMatrixViewSet
from apps.teams.views import (
    CohesionResponseViewSet,
    PsychologicalSafetyResponseViewSet,
    TeamBoardViewSet,
    TeamCohesionAnalysisViewSet,
    TeamRelationshipViewSet,
)

router = DefaultRouter()
router.register("companies", CompanyViewSet, basename="company")
router.register("departments", DepartmentViewSet, basename="department")
router.register("users", UserViewSet, basename="user")
router.register("skill-matrices", SkillMatrixViewSet, basename="skill-matrix")
router.register("skill-items", SkillItemViewSet, basename="skill-item")
router.register("evaluation-campaigns", EvaluationCampaignViewSet, basename="evaluation-campaign")
router.register("evaluations", EvaluationViewSet, basename="evaluation")
router.register("skill-notes", SkillNoteViewSet, basename="skill-note")
router.register("managerial-self-assessments", ManagerialSelfAssessmentViewSet, basename="managerial-self-assessment")
router.register("managerial-syntheses", ManagerialSynthesisViewSet, basename="managerial-synthesis")
router.register("feedback-360", Feedback360ViewSet, basename="feedback-360")
router.register("monkey-management-assessments", MonkeyManagementAssessmentViewSet, basename="monkey-management-assessment")
router.register("performance-objectives", PerformanceObjectiveViewSet, basename="performance-objective")
router.register("cohesion-analyses", TeamCohesionAnalysisViewSet, basename="cohesion-analysis")
router.register("psychological-safety-responses", PsychologicalSafetyResponseViewSet, basename="psi-response")
router.register("cohesion-responses", CohesionResponseViewSet, basename="cohesion-response")
router.register("team-relationships", TeamRelationshipViewSet, basename="team-relationship")
router.register("team-boards", TeamBoardViewSet, basename="team-board")
router.register("action-plans", ActionPlanViewSet, basename="action-plan")
router.register("password-reset-requests", PasswordResetRequestViewSet, basename="password-reset-request")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
router.register("guess-sheets", GuessSheetViewSet, basename="guess-sheet")
router.register("performance-profiles", PerformanceProfileViewSet, basename="performance-profile")

urlpatterns = [
    path("health/", lambda request: HttpResponse("ok"), name="health"),
    path("admin/", admin.site.urls),
    path("api/auth/login/", PMCTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="change_password"),
    path("api/auth/forgot-password/", ForgotPasswordView.as_view(), name="forgot_password"),
    path("api/company-settings/", CompanySettingsView.as_view(), name="company-settings"),
    path("api/company-settings/peer-access/", PeerAccessView.as_view(), name="peer-access"),
    path("api/company-settings/data-reset/", DataResetCatalogueView.as_view(), name="data-reset-catalogue"),
    path("api/company-settings/data-reset/preview/", DataResetPreviewView.as_view(), name="data-reset-preview"),
    path("api/company-settings/data-reset/run/", DataResetView.as_view(), name="data-reset-run"),
    path("api/", include(router.urls)),
]

urlpatterns += [
    # `django.conf.urls.static.static()` no-op quand DEBUG=False (vérifié en
    # interne, indépendamment de tout `if settings.DEBUG` autour de l'appel)
    # — on enregistre donc la route manuellement pour qu'elle fonctionne
    # aussi en production (voir MEDIA_ROOT toujours servi dans settings.py).
    re_path(
        r"^media/(?P<path>.*)$",
        serve_static,
        {"document_root": settings.MEDIA_ROOT},
    ),
]
