"""URL principal de l'API ID-PMC."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.actionplans.views import ActionPlanViewSet
from apps.core.views import (
    ChangePasswordView,
    CompanyViewSet,
    DepartmentViewSet,
    ForgotPasswordView,
    MeView,
    PasswordResetRequestViewSet,
    PMCTokenObtainPairView,
    UserViewSet,
)
from apps.evaluations.views import EvaluationCampaignViewSet, EvaluationViewSet
from apps.skills.views import SkillItemViewSet, SkillMatrixViewSet
from apps.teams.views import TeamCohesionAnalysisViewSet, TeamRelationshipViewSet

router = DefaultRouter()
router.register("companies", CompanyViewSet, basename="company")
router.register("departments", DepartmentViewSet, basename="department")
router.register("users", UserViewSet, basename="user")
router.register("skill-matrices", SkillMatrixViewSet, basename="skill-matrix")
router.register("skill-items", SkillItemViewSet, basename="skill-item")
router.register("evaluation-campaigns", EvaluationCampaignViewSet, basename="evaluation-campaign")
router.register("evaluations", EvaluationViewSet, basename="evaluation")
router.register("cohesion-analyses", TeamCohesionAnalysisViewSet, basename="cohesion-analysis")
router.register("team-relationships", TeamRelationshipViewSet, basename="team-relationship")
router.register("action-plans", ActionPlanViewSet, basename="action-plan")
router.register("password-reset-requests", PasswordResetRequestViewSet, basename="password-reset-request")

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

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
