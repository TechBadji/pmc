"""
Modèles fondamentaux : Entreprise (tenant), Utilisateur, Département.
Core models: Company (tenant), User, Department.
"""
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from .constants import SubscriptionPlan
from .managers import UserManager


class Company(models.Model):
    """Une entreprise cliente (tenant). Isole les données de chaque client."""

    name = models.CharField("Nom", max_length=255)
    slug = models.SlugField("Identifiant technique", max_length=100, unique=True)
    sector = models.CharField("Secteur d'activité", max_length=255, blank=True)
    employee_count = models.PositiveIntegerField("Nombre d'employés", default=0)
    plan = models.CharField(
        "Formule d'abonnement",
        max_length=20,
        choices=SubscriptionPlan.CHOICES,
        default=SubscriptionPlan.DEMO,
    )
    is_active = models.BooleanField("Actif", default=True)
    admin_first_name = models.CharField("Prénom du CEO", max_length=150, blank=True)
    admin_last_name = models.CharField("Nom du CEO", max_length=150, blank=True)
    admin_user = models.OneToOneField(
        "core.User",
        verbose_name="Administrateur principal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="administered_company",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Entreprise"
        verbose_name_plural = "Entreprises"
        ordering = ["name"]

    def __str__(self):
        return self.name


class User(AbstractUser):
    """Utilisateur de la plateforme. `username` est désactivé au profit de `email`."""

    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        COMPANY_ADMIN = "COMPANY_ADMIN", "Admin Entreprise"
        MANAGER = "MANAGER", "Manager"
        MEMBER = "MEMBER", "Membre d'équipe"

    username = None
    email = models.EmailField("Adresse email", unique=True)
    role = models.CharField(
        "Rôle", max_length=20, choices=Role.choices, default=Role.MEMBER
    )
    position = models.CharField("Poste", max_length=255, blank=True)
    company = models.ForeignKey(
        "core.Company",
        verbose_name="Entreprise",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="users",
    )
    department = models.ForeignKey(
        "core.Department",
        verbose_name="Département",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    manager = models.ForeignKey(
        "self",
        verbose_name="Manager",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="direct_reports",
    )
    generated_login = models.CharField(
        "Login généré",
        max_length=150,
        blank=True,
        help_text="Identifiant communiqué au collaborateur (ex: ebadji).",
    )
    must_change_password = models.BooleanField(
        "Doit changer son mot de passe",
        default=False,
        help_text="Vrai après une création en masse ou une réinitialisation par un administrateur.",
    )
    avatar = models.ImageField(
        "Photo de profil", upload_to="avatars/", null=True, blank=True
    )
    phone = models.CharField("Téléphone", max_length=30, blank=True)
    birth_date = models.DateField("Date de naissance", null=True, blank=True)

    class ThemePreference(models.TextChoices):
        LIGHT = "LIGHT", "Clair"
        DARK = "DARK", "Sombre"
        SYSTEM = "SYSTEM", "Système"

    theme_preference = models.CharField(
        "Thème",
        max_length=10,
        choices=ThemePreference.choices,
        default=ThemePreference.SYSTEM,
    )

    class Language(models.TextChoices):
        FR = "fr", "Français"
        EN = "en", "English"

    language = models.CharField(
        "Langue", max_length=5, choices=Language.choices, default=Language.FR
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        verbose_name = "Utilisateur"
        verbose_name_plural = "Utilisateurs"
        ordering = ["last_name", "first_name"]
        constraints = [
            # `generated_login` sert d'identifiant de connexion (voir
            # EmailOrLoginBackend) : deux comptes avec le même login rendent
            # les deux injoignables (MultipleObjectsReturned silencieusement
            # avalé à l'authentification). La génération applicative
            # (unique_login/unique_login_email) n'est qu'un check-then-insert
            # non atomique — ce constraint est le vrai garde-fou. Exclut les
            # chaînes vides (comptes sans login généré, ex. créés par un
            # manager avec un email saisi à la main).
            models.UniqueConstraint(
                Lower("generated_login"),
                condition=~Q(generated_login=""),
                name="unique_generated_login_ci",
            ),
        ]

    def __str__(self):
        return f"{self.get_full_name() or self.email} ({self.get_role_display()})"

    @property
    def is_super_admin(self):
        return self.role == self.Role.SUPER_ADMIN

    @property
    def age(self):
        if not self.birth_date:
            return None
        from datetime import date

        today = date.today()
        years = today.year - self.birth_date.year
        if (today.month, today.day) < (self.birth_date.month, self.birth_date.day):
            years -= 1
        return years


class Department(models.Model):
    """Un département / une équipe au sein d'une entreprise (ex: Direction Finances)."""

    company = models.ForeignKey(
        "core.Company",
        verbose_name="Entreprise",
        on_delete=models.CASCADE,
        related_name="departments",
    )
    name = models.CharField("Nom", max_length=255)
    code = models.CharField(
        "Code", max_length=4, help_text="Code court, ex: DSI, DAF, DRH."
    )
    manager = models.ForeignKey(
        "core.User",
        verbose_name="Manager",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_departments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Département"
        verbose_name_plural = "Départements"
        ordering = ["name"]
        unique_together = [("company", "name"), ("company", "code")]

    def __str__(self):
        return f"{self.code} — {self.name} ({self.company.name})"


class PasswordResetRequest(models.Model):
    """Demande de réinitialisation ('mot de passe oublié') déclenchée depuis
    l'écran de connexion. Adressée à l'Admin Entreprise (pour un Manager/
    Membre) ou au Super Admin (pour un Admin Entreprise), qui la traite en
    réinitialisant le mot de passe à la valeur par défaut (123456)."""

    user = models.ForeignKey(
        "core.User",
        verbose_name="Utilisateur concerné",
        on_delete=models.CASCADE,
        related_name="reset_requests",
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField("Traitée", default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        "core.User",
        verbose_name="Traitée par",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_reset_requests",
    )

    class Meta:
        verbose_name = "Demande de réinitialisation"
        verbose_name_plural = "Demandes de réinitialisation"
        ordering = ["resolved", "-requested_at"]

    def __str__(self):
        return f"Réinitialisation pour {self.user} ({'traitée' if self.resolved else 'en attente'})"


class AuditLog(models.Model):
    """Journal des événements administratifs importants de la plateforme
    (entreprises, comptes, campagnes) — consulté par le Super Admin.
    `actor`/`company` restent en SET_NULL/CASCADE→snapshot texte : un
    utilisateur ou une entreprise supprimée ne doit jamais faire disparaître
    la trace de ce qu'il/elle a fait."""

    created_at = models.DateTimeField(auto_now_add=True)
    actor = models.ForeignKey(
        "core.User",
        verbose_name="Auteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    actor_name = models.CharField("Nom de l'auteur", max_length=255)
    actor_role = models.CharField("Rôle de l'auteur", max_length=20, blank=True)
    company_name = models.CharField("Entreprise concernée", max_length=255, blank=True)
    action = models.CharField("Type d'événement", max_length=50)
    description = models.TextField("Description")

    class Meta:
        verbose_name = "Événement du journal"
        verbose_name_plural = "Journal d'activité"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {self.actor_name}: {self.description}"
