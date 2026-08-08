"""
Évaluations ID-3A (Aptitudes / Attitudes / Altitude).
ID-3A evaluations: Hard Skills (Aptitudes), Soft Skills (Attitudes),
and overall Performance (Altitude) against Business & People objectives.
"""
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class EvaluationCampaign(models.Model):
    """Campagne d'évaluation ID-3A : période définie par le Company Admin,
    valable pour tous les départements de l'entreprise. Remplace l'ancien
    champ `period` en texte libre — les évaluations se rattachent désormais
    à un identifiant fiable plutôt qu'à une chaîne de caractères, ce qui
    fiabilise le tri chronologique et garantit que toute l'entreprise
    partage bien les mêmes bornes de dates pour une période donnée (utile
    pour comparer des collaborateurs de départements différents sur la
    Matrice ID-3A)."""

    company = models.ForeignKey(
        "core.Company",
        verbose_name="Entreprise",
        on_delete=models.CASCADE,
        related_name="evaluation_campaigns",
    )
    name = models.CharField("Nom", max_length=100, help_text="Ex: Semestre 1 2026")
    start_date = models.DateField("Date de début")
    end_date = models.DateField("Date de fin")
    is_closed = models.BooleanField(
        "Clôturée", default=False,
        help_text="Une campagne clôturée n'accepte plus de nouvelles évaluations.",
    )
    created_by = models.ForeignKey(
        "core.User",
        verbose_name="Créée par",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Campagne d'évaluation"
        verbose_name_plural = "Campagnes d'évaluation"
        ordering = ["-start_date"]
        unique_together = ("company", "name")

    def __str__(self):
        return f"{self.company.name} — {self.name}"


class Evaluation(models.Model):
    """Une évaluation ID-3A d'un collaborateur pour une campagne donnée."""

    user = models.ForeignKey(
        "core.User",
        verbose_name="Collaborateur évalué",
        on_delete=models.CASCADE,
        related_name="evaluations",
    )
    evaluator = models.ForeignKey(
        "core.User",
        verbose_name="Évaluateur (Manager)",
        on_delete=models.SET_NULL,
        null=True,
        related_name="evaluations_given",
    )
    campaign = models.ForeignKey(
        "evaluations.EvaluationCampaign",
        verbose_name="Campagne",
        on_delete=models.PROTECT,
        related_name="evaluations",
    )
    business_objectives_score = models.DecimalField(
        "Score objectifs business (%)",
        max_digits=5,
        decimal_places=1,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(200)],
    )
    people_objectives_score = models.DecimalField(
        "Score objectifs people (%)",
        max_digits=5,
        decimal_places=1,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(200)],
    )
    notes = models.TextField("Notes", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Évaluation"
        verbose_name_plural = "Évaluations"
        ordering = ["-campaign__start_date"]
        unique_together = ("user", "campaign")

    def __str__(self):
        return f"{self.user} — {self.campaign.name}"

    def _skill_index(self, skill_type):
        scores = self.skill_scores.filter(skill_item__matrix__type=skill_type)
        if not scores.exists():
            return Decimal("0.0")
        total_weight = sum((s.skill_item.weight for s in scores), Decimal("0"))
        if total_weight == 0:
            return Decimal("0.0")
        weighted_sum = sum((s.score * s.skill_item.weight for s in scores), Decimal("0"))
        return round(weighted_sum / total_weight, 2)

    @property
    def hsi(self):
        """Hard Skills Index (Aptitudes) — moyenne pondérée 1-5."""
        return self._skill_index("HARD")

    @property
    def ssi(self):
        """Soft Skills Index (Attitudes) — moyenne pondérée 1-5."""
        return self._skill_index("SOFT")

    @property
    def altitude_percentage(self):
        """Performance globale (Altitude) = moyenne des objectifs business & people."""
        return round(
            (self.business_objectives_score + self.people_objectives_score) / 2, 1
        )

    @property
    def performance_rating(self):
        """Palier de performance ID-PMC (5 niveaux)."""
        pct = self.altitude_percentage
        if pct < 50:
            return "VERY_LOW"
        if pct < 75:
            return "LOW"
        if pct < 90:
            return "AVERAGE"
        if pct <= 100:
            return "GOOD"
        return "OUTSTANDING"


class EvaluationSkillScore(models.Model):
    """Note (1 à 5) attribuée à un item de compétence dans le cadre d'une évaluation."""

    evaluation = models.ForeignKey(
        "evaluations.Evaluation",
        on_delete=models.CASCADE,
        related_name="skill_scores",
    )
    skill_item = models.ForeignKey(
        "skills.SkillItem",
        verbose_name="Compétence",
        on_delete=models.CASCADE,
        related_name="scores",
    )
    score = models.DecimalField(
        "Note (1-5)",
        max_digits=3,
        decimal_places=1,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    objective_score = models.DecimalField(
        "Objectif (1-5)",
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    achievement_rate = models.DecimalField(
        "Réalisé par rapport à l'objectif précédent (1-5)",
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    class Meta:
        verbose_name = "Note de compétence"
        verbose_name_plural = "Notes de compétence"
        unique_together = ("evaluation", "skill_item")

    def __str__(self):
        return f"{self.skill_item.name}: {self.score}"


class SkillNote(models.Model):
    """Une ligne libre de la fiche "Forces & Faiblesses" (Hard/Soft Skills)
    d'un collaborateur — remplie par son manager, indépendamment d'une
    campagne d'évaluation donnée (photo instantanée, pas un historique)."""

    class Category(models.TextChoices):
        SOFT_STRENGTH = "SOFT_STRENGTH", "Force — Soft Skills"
        SOFT_WEAKNESS = "SOFT_WEAKNESS", "Faiblesse — Soft Skills"
        HARD_STRENGTH = "HARD_STRENGTH", "Force — Hard Skills"
        HARD_WEAKNESS = "HARD_WEAKNESS", "Faiblesse — Hard Skills"

    user = models.ForeignKey(
        "core.User",
        verbose_name="Collaborateur concerné",
        on_delete=models.CASCADE,
        related_name="skill_notes",
    )
    category = models.CharField("Catégorie", max_length=20, choices=Category.choices)
    order = models.PositiveSmallIntegerField("Position (1-5)")
    text = models.CharField("Texte", max_length=255, blank=True)

    class Meta:
        verbose_name = "Note Forces & Faiblesses"
        verbose_name_plural = "Notes Forces & Faiblesses"
        unique_together = ("user", "category", "order")
        ordering = ["category", "order"]

    def __str__(self):
        return f"{self.user} — {self.get_category_display()} #{self.order}"
