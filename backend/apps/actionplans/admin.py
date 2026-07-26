from django.contrib import admin

from .models import ActionPlan


@admin.register(ActionPlan)
class ActionPlanAdmin(admin.ModelAdmin):
    list_display = ("priority", "team", "manager", "category", "status", "due_date")
    list_filter = ("category", "status", "team__company")
    search_fields = ("priority", "objective")
