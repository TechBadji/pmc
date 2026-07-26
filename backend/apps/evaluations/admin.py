from django.contrib import admin

from .models import Evaluation, EvaluationCampaign, EvaluationSkillScore


class EvaluationSkillScoreInline(admin.TabularInline):
    model = EvaluationSkillScore
    extra = 1


@admin.register(Evaluation)
class EvaluationAdmin(admin.ModelAdmin):
    list_display = ("user", "campaign", "hsi", "ssi", "altitude_percentage", "performance_rating")
    list_filter = ("campaign",)
    search_fields = ("user__email", "user__first_name", "user__last_name")
    inlines = [EvaluationSkillScoreInline]


@admin.register(EvaluationCampaign)
class EvaluationCampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "start_date", "end_date", "is_closed")
    list_filter = ("company", "is_closed")
    search_fields = ("name", "company__name")
