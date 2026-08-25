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
    # Entête de la fiche annuelle : les trois dates du cycle et le visa. Elles
    # appartiennent à l'évaluation et non à la campagne — deux collaborateurs
    # d'une même campagne ne sont pas reçus le même jour.
    objectives_set_on = models.DateField("Date de fixation des objectifs", null=True, blank=True)
    evaluated_on = models.DateField("Date de l'évaluation", null=True, blank=True)
    next_evaluation_on = models.DateField("Date de la prochaine évaluation", null=True, blank=True)
    manager_visa = models.CharField("Visa manager", max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Évaluation"
        verbose_name_plural = "Évaluations"
        ordering = ["-campaign__start_date"]
        unique_together = ("user", "campaign")

    def __str__(self):
        return f"{self.user} — {self.campaign.name}"

    def _weighted_index(self, skill_type, field):
        """Moyenne pondérée des notes d'un référentiel (HARD ou SOFT).

        Le tri se fait EN PYTHON sur `skill_scores.all()`, jamais par un
        `.filter()` : un filtre sur un manager lié rejoue une requête et ignore
        le `prefetch_related` de la vue, ce qui coûtait une trentaine de
        requêtes SQL par évaluation — 4 500 pour une page de liste.
        """
        scores = [
            s
            for s in self.skill_scores.all()
            if s.skill_item.matrix.type == skill_type and getattr(s, field) is not None
        ]
        if not scores:
            return Decimal("0.0")
        total_weight = sum((s.skill_item.weight for s in scores), Decimal("0"))
        if total_weight == 0:
            return Decimal("0.0")
        weighted_sum = sum((getattr(s, field) * s.skill_item.weight for s in scores), Decimal("0"))
        return round(weighted_sum / total_weight, 2)

    def _skill_index(self, skill_type):
        return self._weighted_index(skill_type, "score")

    @property
    def hsi(self):
        """Hard Skills Index (Aptitudes) — moyenne pondérée 1-5."""
        return self._skill_index("HARD")

    @property
    def ssi(self):
        """Soft Skills Index (Attitudes) — moyenne pondérée 1-5."""
        return self._skill_index("SOFT")

    def _objective_index(self, skill_type):
        """Même moyenne pondérée que `_skill_index`, mais sur les objectifs
        fixés pour la période — les lignes sans objectif sont ignorées."""
        return self._weighted_index(skill_type, "objective_score")

    @property
    def hso(self):
        """Hard Skills Objective — cible d'Aptitudes de la période."""
        return self._objective_index("HARD")

    @property
    def ssio(self):
        """Soft Skills Index Objective — cible d'Attitudes de la période."""
        return self._objective_index("SOFT")

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
    d'un collaborateur — rattachée à une évaluation précise (donc à sa
    campagne), comme EvaluationSkillScore, pour un historique par période
    plutôt qu'un état unique écrasé à chaque saisie."""

    class Category(models.TextChoices):
        SOFT_STRENGTH = "SOFT_STRENGTH", "Force — Soft Skills"
        SOFT_WEAKNESS = "SOFT_WEAKNESS", "Faiblesse — Soft Skills"
        HARD_STRENGTH = "HARD_STRENGTH", "Force — Hard Skills"
        HARD_WEAKNESS = "HARD_WEAKNESS", "Faiblesse — Hard Skills"

    evaluation = models.ForeignKey(
        "evaluations.Evaluation",
        verbose_name="Évaluation",
        on_delete=models.CASCADE,
        related_name="skill_notes",
    )
    category = models.CharField("Catégorie", max_length=20, choices=Category.choices)
    order = models.PositiveSmallIntegerField("Position (1-5)")
    text = models.CharField("Texte", max_length=255, blank=True)
    score = models.DecimalField(
        "Indice (1-5)",
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    class Meta:
        verbose_name = "Note Forces & Faiblesses"
        verbose_name_plural = "Notes Forces & Faiblesses"
        unique_together = ("evaluation", "category", "order")
        ordering = ["category", "order"]

    def __str__(self):
        return f"{self.evaluation} — {self.get_category_display()} #{self.order}"


class PerformanceObjective(models.Model):
    """Une ligne de la « Fiche de fixation d'objectifs / d'évaluation annuelle ».

    La même ligne sert la fiche d'un employé et celle d'une équipe : dans le
    premier cas elle se rattache à une évaluation, dans le second au couple
    (équipe, campagne). Deux tables auraient dupliqué le calcul du taux
    d'atteinte et de la moyenne pondérée, qui est identique de part et d'autre.

    Le pourcentage d'atteinte n'est pas stocké : il se déduit du réalisé et de
    la cible, et une valeur figée finirait par contredire les chiffres saisis.
    """

    class Category(models.TextChoices):
        BUSINESS = "BUSINESS", "Objectifs business"
        MANAGERIAL = "MANAGERIAL", "Objectifs leadership et managériaux"

    evaluation = models.ForeignKey(
        "evaluations.Evaluation",
        verbose_name="Évaluation",
        on_delete=models.CASCADE,
        related_name="objectives",
        null=True,
        blank=True,
    )
    team = models.ForeignKey(
        "core.Department",
        verbose_name="Équipe",
        on_delete=models.CASCADE,
        related_name="objectives",
        null=True,
        blank=True,
    )
    campaign = models.ForeignKey(
        "evaluations.EvaluationCampaign",
        verbose_name="Campagne",
        on_delete=models.CASCADE,
        related_name="team_objectives",
        null=True,
        blank=True,
    )
    category = models.CharField("Catégorie", max_length=12, choices=Category.choices)
    order = models.PositiveSmallIntegerField("Rang", default=1)
    label = models.CharField("Objectif", max_length=500, blank=True)
    indicator = models.CharField("Indicateur de performance", max_length=255, blank=True)
    reference_value = models.DecimalField(
        "Valeur de référence", max_digits=14, decimal_places=2, null=True, blank=True
    )
    target_value = models.DecimalField(
        "Valeur cible", max_digits=14, decimal_places=2, null=True, blank=True
    )
    actual_value = models.DecimalField(
        "Réalisé", max_digits=14, decimal_places=2, null=True, blank=True
    )
    weight = models.DecimalField(
        "Coefficient de pondération", max_digits=5, decimal_places=2, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Objectif de performance"
        verbose_name_plural = "Objectifs de performance"
        ordering = ["category", "order", "id"]

    def __str__(self):
        return f"{self.get_category_display()} #{self.order} — {self.label[:40]}"

    @property
    def achievement_percent(self):
        """Taux d'atteinte, cible ramenée à 100 %.

        Une cible nulle ne permet aucun rapport ; une cible négative — un
        résultat net à redresser, par exemple — inverse le sens du progrès, on
        rapporte donc l'écart au signe de la cible.
        """
        if self.target_value in (None, 0) or self.actual_value is None:
            return None
        ratio = float(self.actual_value) / float(self.target_value)
        return round(ratio * 100, 1)


def recompute_evaluation_scores(evaluation):
    """Reporte la fiche d'objectifs dans les deux scores de l'évaluation.

    Choix d'architecture. L'Altitude est lue partout — matrice ID-3A, 9 Box,
    ID-TPD, tableaux de bord, fiche Performance ID — souvent par listes de
    plusieurs centaines de lignes. La calculer à la lecture obligerait à
    agréger les objectifs de chaque évaluation à chaque affichage : c'est
    exactement le motif qui avait déjà coûté 4 565 requêtes sur la liste des
    évaluations. On garde donc les deux scores stockés comme chemin de lecture,
    et on les recalcule à l'écriture d'une ligne d'objectif — une poignée de
    lignes relues, un seul UPDATE, à un rythme dicté par la saisie humaine.

    Tant qu'aucune ligne n'existe, les valeurs saisies à la main sont laissées
    telles quelles : les évaluations antérieures à la fiche gardent leur sens.
    """
    lines = list(evaluation.objectives.all())
    if not lines:
        return False

    def block(category):
        scored = [
            (line.achievement_percent, float(line.weight) if line.weight else 1.0)
            for line in lines
            if line.category == category and line.achievement_percent is not None
        ]
        if not scored:
            return None
        total_weight = sum(weight for _, weight in scored)
        if total_weight == 0:
            return None
        return round(sum(pct * weight for pct, weight in scored) / total_weight, 1)

    business = block(PerformanceObjective.Category.BUSINESS)
    managerial = block(PerformanceObjective.Category.MANAGERIAL)
    changed = []
    if business is not None:
        evaluation.business_objectives_score = business
        changed.append("business_objectives_score")
    if managerial is not None:
        evaluation.people_objectives_score = managerial
        changed.append("people_objectives_score")
    if changed:
        evaluation.save(update_fields=changed + ["updated_at"])
    return bool(changed)
