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
    avatar_full_body = models.ImageField(
        "Photo pleine hauteur",
        upload_to="avatars_full/",
        null=True,
        blank=True,
        help_text="Portrait debout, affiché sur la fiche d'évaluation des managers.",
    )
    phone = models.CharField("Téléphone", max_length=30, blank=True)
    birth_date = models.DateField("Date de naissance", null=True, blank=True)
    career_start_date = models.DateField(
        "Début de carrière", null=True, blank=True,
        help_text="Utilisé pour calculer l'expérience totale.",
    )
    hire_date = models.DateField(
        "Date d'entrée dans l'entreprise", null=True, blank=True,
        help_text="Utilisé pour calculer l'ancienneté dans l'entreprise.",
    )
    role_start_date = models.DateField(
        "Date de prise de poste actuel", null=True, blank=True,
        help_text="Utilisé pour calculer l'ancienneté dans le poste actuel.",
    )

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

    @staticmethod
    def _years_since(start_date):
        if not start_date:
            return None
        from datetime import date

        today = date.today()
        years = today.year - start_date.year
        if (today.month, today.day) < (start_date.month, start_date.day):
            years -= 1
        return years

    @property
    def age(self):
        return self._years_since(self.birth_date)

    @property
    def total_experience_years(self):
        return self._years_since(self.career_start_date)

    @property
    def years_in_company(self):
        return self._years_since(self.hire_date)

    @property
    def years_in_current_role(self):
        return self._years_since(self.role_start_date)


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
    # Une direction est composée de services : le service est un département à
    # part entière (son chef en est le manager, ses membres y sont rattachés),
    # relié à sa direction par ce champ. Nul pour une direction. La profondeur
    # s'arrête volontairement à un niveau — un service ne peut pas contenir de
    # sous-service — pour interdire les cycles et les portées imprévisibles.
    parent = models.ForeignKey(
        "self",
        verbose_name="Direction de rattachement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="services",
        help_text="Renseigné pour un service : la direction dont il dépend. Vide pour une direction.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Département"
        verbose_name_plural = "Départements"
        ordering = ["name"]
        unique_together = [("company", "name"), ("company", "code")]

    def __str__(self):
        return f"{self.code} — {self.name} ({self.company.name})"

    @property
    def is_service(self) -> bool:
        return self.parent_id is not None


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


class PerformanceProfile(models.Model):
    """Fiche "Performances" 360° d'un collaborateur — complète les données
    déjà calculées ailleurs (HSI/SSI/Altitude via Evaluation, Forces &
    Faiblesses via SkillNote) avec des informations qualitatives saisies
    librement (parcours, réalisations, dynamique d'équipe, plan de
    développement personnel). Une seule fiche vivante par utilisateur, mise
    à jour au fil de l'eau — pas d'historique par campagne, à la différence
    des fiches d'évaluation."""

    user = models.OneToOneField(
        "core.User",
        verbose_name="Collaborateur",
        on_delete=models.CASCADE,
        related_name="performance_profile",
    )
    class PerformerCategory(models.TextChoices):
        OUTSTANDING = "OUTSTANDING", "Outstanding performer"
        GOOD = "GOOD", "Good performer"
        AVERAGE = "AVERAGE", "Average performer"
        LOW = "LOW", "Low performer"
        VERY_LOW = "VERY_LOW", "Very low performer"

    gender = models.CharField("Genre", max_length=20, blank=True)
    contract_type = models.CharField("Type de contrat", max_length=50, blank=True)
    # % de performance et catégorie repris tels quels de la feuille ID-PMC :
    # saisis à la main, ils ne remplacent pas l'Altitude calculée par
    # l'évaluation (qui reste la seule source de la matrice et des tableaux de
    # bord) — l'interface pré-remplit d'ailleurs la valeur calculée.
    performance_pct = models.CharField("% de performance (saisi)", max_length=20, blank=True)
    performer_category = models.CharField(
        "Catégorie de performance (saisie)",
        max_length=20,
        choices=PerformerCategory.choices,
        blank=True,
    )
    qualifications = models.JSONField("Qualifications", default=list, blank=True)
    previous_positions = models.JSONField("Postes précédents", default=list, blank=True)
    # Dates de prise de fonction des postes précédents, alignées par index sur
    # `previous_positions` : une liste parallèle évite de changer le format des
    # postes déjà saisis (de simples chaînes) et reste vide tant qu'aucune date
    # n'est renseignée.
    previous_position_dates = models.JSONField("Dates de début des postes précédents", default=list, blank=True)
    professional_achievements = models.JSONField("Réalisations professionnelles", default=list, blank=True)
    personal_achievements = models.JSONField("Réalisations personnelles", default=list, blank=True)
    vision_aspirations = models.TextField("Vision / Aspirations", blank=True)
    personal_projects = models.TextField("Projets personnels", blank=True)
    professional_role_models = models.JSONField("Modèles professionnels", default=list, blank=True)
    role_models_in_life = models.JSONField("Modèles dans la vie", default=list, blank=True)
    dislikes = models.JSONField("Ce qu'il/elle n'aime pas", default=list, blank=True)
    motivates = models.JSONField("Ce qui le/la motive", default=list, blank=True)
    personality_traits = models.JSONField("Traits de personnalité", default=list, blank=True)
    hobbies = models.JSONField("Loisirs", default=list, blank=True)
    bono_hat = models.CharField("Chapeau de Bono", max_length=100, blank=True)
    brings_to_team = models.JSONField("Apporte à l'équipe", default=list, blank=True)
    brings_to_manager = models.JSONField("Apporte au manager", default=list, blank=True)
    expects_from_team = models.JSONField("Attend de l'équipe", default=list, blank=True)
    expects_from_manager = models.JSONField("Attend du manager", default=list, blank=True)
    dev_priorities = models.JSONField("Priorités de développement", default=list, blank=True)
    dev_professional_perspectives = models.JSONField("Perspectives professionnelles", default=list, blank=True)
    dev_actions_support = models.JSONField("Actions de soutien à la performance", default=list, blank=True)
    dev_risks_obstacles = models.JSONField("Risques / Obstacles / Incertitudes", default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Fiche de performance 360°"
        verbose_name_plural = "Fiches de performance 360°"
        ordering = ["id"]

    def __str__(self):
        return f"Fiche performance — {self.user}"
