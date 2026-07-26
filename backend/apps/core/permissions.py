"""
Permissions multi-tenant : chaque requête est bornée à l'entreprise (tenant)
de l'utilisateur connecté, sauf pour le Super Admin qui voit tout.
Multi-tenant permissions: every request is scoped to the caller's company,
except for the Super Admin who has global visibility.
"""
from rest_framework import permissions

from .models import User


class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.role == User.Role.SUPER_ADMIN)


class IsCompanyAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.role == User.Role.COMPANY_ADMIN)


class IsManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.role == User.Role.MANAGER)


class IsSuperAdminOrCompanyAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.role in (User.Role.SUPER_ADMIN, User.Role.COMPANY_ADMIN)
        )


class IsCompanyAdminOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.role in (User.Role.COMPANY_ADMIN, User.Role.MANAGER)
        )


class IsSuperAdminOrCompanyAdminOrManager(permissions.BasePermission):
    """Le Super Admin gère tous les tenants ; l'Admin Entreprise et le Manager
    gèrent uniquement les ressources de leur propre entreprise (filtrage
    additionnel assuré par `CompanyScopedQuerySetMixin`)."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.role
            in (User.Role.SUPER_ADMIN, User.Role.COMPANY_ADMIN, User.Role.MANAGER)
        )


class CompanyScopedQuerySetMixin:
    """À ajouter à un ViewSet pour restreindre automatiquement le queryset
    à l'entreprise de l'utilisateur connecté (isolation multi-tenant).

    `company_lookup` est le chemin ORM vers la Company depuis le modèle du
    ViewSet (ex: "company_id" pour Department, "matrix__company_id" pour
    SkillItem, "team__company_id" pour ActionPlan).
    """

    company_lookup = "company_id"

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.SUPER_ADMIN:
            return qs
        if not user.company_id:
            return qs.none()
        return qs.filter(**{self.company_lookup: user.company_id})
