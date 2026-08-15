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
    # L'échéance d'une action se saisit sur deux dates (début / fin) dans la
    # grille ID-PMC. `due_date` reste la date de fin — c'est elle qui sert de
    # tri et d'échéance affichée, d'où le nom conservé tel quel.
    start_date = models.DateField("Date de début", null=True, blank=True)
    due_date = models.DateField("Date de fin", null=True, blank=True)
    responsible = models.CharField("Responsable", max_length=150, blank=True)
    eval_note = models.CharField("Éval.", max_length=150, blank=True)
    priority_order = models.PositiveSmallIntegerField(
        "Priorité (1-3)",
        null=True,
        blank=True,
        help_text="Numéro de la priorité de développement dans la grille du plan de développement (3 par catégorie).",
    )
    order = models.PositiveSmallIntegerField(
        "Position de l'action dans la priorité",
        null=True,
        blank=True,
        help_text="Renseigné uniquement pour la grille du plan de développement d'un manager : une priorité porte autant d'actions que nécessaire, numérotées à partir de 1.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Plan d'action"
        verbose_name_plural = "Plans d'action"
        ordering = ["due_date", "-created_at"]
        # NULL n'est jamais considéré égal à NULL par Postgres : cette
        # contrainte ne s'applique donc qu'aux lignes de la grille du plan de
        # développement (target_user + priority_order + order renseignés), pas
        # aux plans d'équipe libres existants (order=NULL) créés depuis la page
        # Plans d'action. Une priorité peut porter plusieurs actions, d'où
        # `order` numéroté à l'intérieur de `priority_order`.
        unique_together = ("target_user", "category", "priority_order", "order")

    def __str__(self):
        return f"{self.priority} — {self.team.name}"
