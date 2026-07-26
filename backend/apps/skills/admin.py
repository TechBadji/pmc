from django.contrib import admin

from .models import SkillItem, SkillMatrix


class SkillItemInline(admin.TabularInline):
    model = SkillItem
    extra = 1


@admin.register(SkillMatrix)
class SkillMatrixAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "company")
    list_filter = ("type", "company")
    inlines = [SkillItemInline]
