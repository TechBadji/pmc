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
    PerformanceProfileViewSet,
    PMCTokenObtainPairView,
    UserViewSet,
)
from apps.evaluations.views import EvaluationCampaignViewSet, EvaluationViewSet, SkillNoteViewSet
from apps.skills.views import SkillItemViewSet, SkillMatrixViewSet
from apps.teams.views import TeamBoardViewSet, TeamCohesionAnalysisViewSet, TeamRelationshipViewSet

router = DefaultRouter()
router.register("companies", CompanyViewSet, basename="company")
router.register("departments", DepartmentViewSet, basename="department")
router.register("users", UserViewSet, basename="user")
router.register("skill-matrices", SkillMatrixViewSet, basename="skill-matrix")
router.register("skill-items", SkillItemViewSet, basename="skill-item")
router.register("evaluation-campaigns", EvaluationCampaignViewSet, basename="evaluation-campaign")
router.register("evaluations", EvaluationViewSet, basename="evaluation")
router.register("skill-notes", SkillNoteViewSet, basename="skill-note")
router.register("cohesion-analyses", TeamCohesionAnalysisViewSet, basename="cohesion-analysis")
router.register("team-relationships", TeamRelationshipViewSet, basename="team-relationship")
router.register("team-boards", TeamBoardViewSet, basename="team-board")
router.register("action-plans", ActionPlanViewSet, basename="action-plan")
router.register("password-reset-requests", PasswordResetRequestViewSet, basename="password-reset-request")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
router.register("performance-profiles", PerformanceProfileViewSet, basename="performance-profile")

urlpatterns = [
    path("health/", lambda request: HttpResponse("ok"), name="health"),
    path("admin/", admin.site.urls),
    path("api/auth/login/", PMCTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="change_password"),
    path("api/auth/forgot-password/", ForgotPasswordView.as_view(), name="forgot_password"),
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
