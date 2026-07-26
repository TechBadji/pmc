"""
Module 8 : Plans d'action (PMC Actions Plan) — développement du manager et de l'équipe.
Action Plan module: development actions for the manager and the team.
"""
from django.db import models


class ActionPlan(models.Model):
    class Category(models.TextChoices):
        HARD_SKILLS = "HARD_SKILLS", "Hard Skills"
        SOFT_SKILLS = "SOFT_SKILLS", "Soft Skills"

    class Status(models.TextChoices):
        TODO = "TODO", "À faire"
        IN_PROGRESS = "IN_PROGRESS", "En cours"
        DONE = "DONE", "Terminé"

    manager = models.ForeignKey(
        "core.User",
        verbose_name="Manager responsable",
        on_delete=models.CASCADE,
        related_name="action_plans",
    )
    team = models.ForeignKey(
        "core.Department",
        verbose_name="Équipe",
        on_delete=models.CASCADE,
        related_name="action_plans",
    )
    target_user = models.ForeignKey(
        "core.User",
        verbose_name="Collaborateur concerné",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="individual_action_plans",
        help_text="Laisser vide si le plan concerne toute l'équipe.",
    )
    category = models.CharField("Catégorie", max_length=20, choices=Category.choices)
    priority = models.CharField("Priorité de développement", max_length=255)
    objective = models.TextField("Action à mener")
    baseline = models.CharField("Score de départ", max_length=50, blank=True)
    target = models.CharField("Score cible", max_length=50, blank=True)
    cost = models.CharField("Coût", max_length=100, blank=True)
    status = models.CharField(
        "Statut", max_length=20, choices=Status.choices, default=Status.TODO
    )
    due_date = models.DateField("Échéance", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Plan d'action"
        verbose_name_plural = "Plans d'action"
        ordering = ["due_date", "-created_at"]

    def __str__(self):
        return f"{self.priority} — {self.team.name}"
