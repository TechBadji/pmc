from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Company, Department, PasswordResetRequest, User


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "plan", "sector", "employee_count", "is_active", "admin_user", "created_at")
    list_filter = ("is_active", "plan", "sector")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "company", "manager")
    list_filter = ("company",)
    search_fields = ("name", "code")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ("email",)
    list_display = ("email", "first_name", "last_name", "role", "company", "is_active")
    list_filter = ("role", "company", "is_active")
    search_fields = ("email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Informations", {"fields": ("first_name", "last_name", "position", "phone", "avatar")}),
        ("Préférences", {"fields": ("theme_preference",)}),
        ("Rôle & rattachement", {"fields": ("role", "company", "department", "manager")}),
        ("Accès", {"fields": ("generated_login", "must_change_password")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "password1", "password2", "role", "company"),
        }),
    )


@admin.register(PasswordResetRequest)
class PasswordResetRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "requested_at", "resolved", "resolved_by", "resolved_at")
    list_filter = ("resolved",)
    search_fields = ("user__email",)
