from django.contrib import admin

from .models import CohesionCriterionScore, TeamCohesionAnalysis, TeamRelationship


class CohesionCriterionScoreInline(admin.TabularInline):
    model = CohesionCriterionScore
    extra = 1


@admin.register(TeamCohesionAnalysis)
class TeamCohesionAnalysisAdmin(admin.ModelAdmin):
    list_display = ("team", "date", "ice_score", "oce_score")
    list_filter = ("team__company",)
    inlines = [CohesionCriterionScoreInline]


@admin.register(TeamRelationship)
class TeamRelationshipAdmin(admin.ModelAdmin):
    list_display = ("team", "from_user", "to_user", "quality")
    list_filter = ("quality", "team__company")
