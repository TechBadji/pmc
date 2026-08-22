"""
Module 1 : Analyse de Cohésion d'Équipe (ICE / OCE) et dynamique relationnelle.
Team Cohesion Analysis (ICE score) & Relationship Dynamic (Nourishers/Toxins,
Catalysts/Inhibitors).
"""
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class TeamCohesionAnalysis(models.Model):
    """Une campagne d'analyse de cohésion pour un département, à une date donnée."""

    team = models.ForeignKey(
        "core.Department",
        verbose_name="Équipe",
        on_delete=models.CASCADE,
        related_name="cohesion_analyses",
    )
    date = models.DateField("Date de l'analyse")
    ice_score = models.DecimalField(
        "ICE — Indice de Cohésion d'Équipe", max_digits=3, decimal_places=1, default=0
    )
    oce_score = models.DecimalField(
        "OCE — Objectif de Cohésion d'Équipe (moyenne)",
        max_digits=3,
        decimal_places=1,
        default=0,
        help_text="Moyenne des objectifs par critère — recalculée automatiquement.",
    )
    notes = models.TextField("Notes", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Analyse de cohésion d'équipe"
        verbose_name_plural = "Analyses de cohésion d'équipe"
        ordering = ["-date"]

    def __str__(self):
        return f"Cohésion {self.team.name} — {self.date}"


class CohesionCriterionScore(models.Model):
    """Une des 10 questions de la fiche de cohésion, notée de 1 (très faible) à 5 (très élevé)."""

    analysis = models.ForeignKey(
        "teams.TeamCohesionAnalysis",
        on_delete=models.CASCADE,
        related_name="criterion_scores",
    )
    criterion = models.CharField("Critère", max_length=500)
    score = models.PositiveSmallIntegerField(
        "Note (1-5)", validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    objective_score = models.DecimalField(
        "OCE — Objectif pour ce critère (1-5)",
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    achieved_score = models.DecimalField(
        "Réalisé pour ce critère (1-5)",
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    class Meta:
        verbose_name = "Note de critère de cohésion"
        verbose_name_plural = "Notes de critères de cohésion"

    def __str__(self):
        return f"{self.criterion[:40]}: {self.score}"


class TeamRelationship(models.Model):
    """Une relation entre deux membres d'une équipe, utilisée pour la cartographie
    Catalysts/Inhibitors et Nourishers/Toxins (ID-PMC Relationship Dynamic)."""

    class Quality(models.TextChoices):
        EXCELLENT = "EXCELLENT", "Excellente"
        CORRECT = "CORRECT", "Correcte"
        DIFFICULT = "DIFFICULT", "Difficile"
        TOXIC = "TOXIC", "Toxique"

    team = models.ForeignKey(
        "core.Department",
        verbose_name="Équipe",
        on_delete=models.CASCADE,
        related_name="relationships",
    )
    from_user = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="relationships_from"
    )
    to_user = models.ForeignKey(
        "core.User", on_delete=models.CASCADE, related_name="relationships_to"
    )
    quality = models.CharField("Qualité", max_length=10, choices=Quality.choices)

    class Meta:
        verbose_name = "Relation d'équipe"
        verbose_name_plural = "Relations d'équipe"
        unique_together = ("from_user", "to_user")
        # Sans ordre par défaut, la pagination DRF avertit — et surtout, deux
        # appels sur la même page peuvent renvoyer des lignes différentes, le
        # SGBD étant libre de changer l'ordre de restitution.
        ordering = ["id"]

    def __str__(self):
        return f"{self.from_user} → {self.to_user}: {self.get_quality_display()}"


class TeamBoard(models.Model):
    """Carte d'identité d'une équipe à une date donnée — le pendant collectif de
    `PerformanceProfile`.

    Une seule table pour les trois planches ID-PMC qui décrivent l'équipe et non
    ses membres : « Team Performance ID », « Team Strengths & Weaknesses » et
    « Relationship Dynamic ». Elles partagent le même couple (équipe, période),
    se remplissent au même moment et se lisent ensemble : les séparer aurait
    imposé trois saisies de période et trois jointures pour une seule photo de
    l'équipe.

    Chaque saisie est datée : l'historique se conserve, comme pour les analyses
    de cohésion, et une nouvelle entrée se crée quand l'équipe refait le point.
    """

    team = models.ForeignKey(
        "core.Department",
        verbose_name="Équipe",
        on_delete=models.CASCADE,
        related_name="boards",
    )
    date = models.DateField("Date de la saisie")

    # --- Forces & faiblesses de l'équipe (People / Business) ---
    people_strengths = models.JSONField("Forces — People", default=list, blank=True)
    people_weaknesses = models.JSONField("Faiblesses — People", default=list, blank=True)
    business_strengths = models.JSONField("Forces — Business", default=list, blank=True)
    business_weaknesses = models.JSONField("Faiblesses — Business", default=list, blank=True)

    # --- Relationship Dynamic : ce qui nourrit ou abîme la relation ---
    catalysts = models.JSONField("Catalyseurs", default=list, blank=True)
    nourishers = models.JSONField("Nourrisseurs", default=list, blank=True)
    inhibitors = models.JSONField("Inhibiteurs", default=list, blank=True)
    toxins = models.JSONField("Toxines", default=list, blank=True)

    # --- Team Performance ID ---
    vision_missions = models.TextField("Vision / Missions de l'équipe", blank=True)
    values = models.JSONField("Valeurs", default=list, blank=True)
    counter_values = models.JSONField("Contre-valeurs", default=list, blank=True)
    achievements = models.JSONField("Grandes réalisations", default=list, blank=True)
    failures_lessons = models.JSONField("Échecs / leçons", default=list, blank=True)
    objectives = models.JSONField("Objectifs", default=list, blank=True)
    priorities_cohesion = models.JSONField("Priorités — cohésion", default=list, blank=True)
    priorities_business = models.JSONField("Priorités — business", default=list, blank=True)
    # Réalisations vs objectifs : une ligne par année {"year", "target", "actual"}.
    targets_vs_actuals = models.JSONField("Réalisations vs objectifs", default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Carte d'équipe"
        verbose_name_plural = "Cartes d'équipe"
        ordering = ["-date"]
        unique_together = ("team", "date")

    def __str__(self):
        return f"Carte {self.team.name} — {self.date}"
