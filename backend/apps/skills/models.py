"""
Référentiels de compétences (Hard Skills / Soft Skills) par entreprise et par poste.
Skill competency models (Hard/Soft) — customizable per company and per position.
"""
from django.db import models


class SkillMatrix(models.Model):
    """Un référentiel de compétences pour un type de poste (ex: 'Dir Finances & Administration')."""

    class SkillType(models.TextChoices):
        HARD = "HARD", "Hard Skills (Aptitudes)"
        SOFT = "SOFT", "Soft Skills (Attitudes)"

    company = models.ForeignKey(
        "core.Company",
        verbose_name="Entreprise",
        on_delete=models.CASCADE,
        related_name="skill_matrices",
    )
    department = models.ForeignKey(
        "core.Department",
        verbose_name="Département",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="skill_matrices",
        help_text="Département dont les membres utilisent ce référentiel par défaut "
        "si aucun référentiel ne correspond exactement à leur poste.",
    )
    name = models.CharField("Nom du référentiel", max_length=255)
    type = models.CharField("Type", max_length=10, choices=SkillType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Référentiel de compétences"
        verbose_name_plural = "Référentiels de compétences"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


class SkillItem(models.Model):
    """Une compétence évaluable (1 des 10 lignes d'un référentiel), notée de 1 à 5."""

    matrix = models.ForeignKey(
        "skills.SkillMatrix",
        verbose_name="Référentiel",
        on_delete=models.CASCADE,
        related_name="items",
    )
    name = models.CharField("Compétence", max_length=255)
    description = models.TextField("Description", blank=True)
    weight = models.DecimalField("Pondération", max_digits=4, decimal_places=2, default=1)
    order = models.PositiveSmallIntegerField("Ordre", default=0)

    class Meta:
        verbose_name = "Item de compétence"
        verbose_name_plural = "Items de compétence"
        ordering = ["matrix", "order"]

    def __str__(self):
        return self.name
