from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .constants import DEFAULT_DEPARTMENTS, PLAN_FEATURES, DEFAULT_PASSWORD
from .models import AuditLog, Company, Department, PasswordResetRequest, PerformanceProfile, User
from .text_utils import make_login, slugify_company


def _unique_company_slug(name: str) -> str:
    base = slugify_company(name)
    slug = base
    suffix = 2
    while Company.objects.filter(slug=slug).exists():
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def unique_login_email(login: str, domain: str) -> tuple[str, str]:
    """Retourne (login, email) en garantissant l'unicité du login généré ET
    de l'email technique — le login sert désormais directement d'identifiant
    de connexion, il doit donc être unique globalement (pas seulement au
    sein d'une entreprise, contrairement à l'email qui inclut déjà le slug)."""
    base_login = login
    candidate = login
    suffix = 2
    while (
        User.objects.filter(generated_login=candidate).exists()
        or User.objects.filter(email=f"{candidate}@{domain}").exists()
    ):
        candidate = f"{base_login}{suffix}"
        suffix += 1
    return candidate, f"{candidate}@{domain}"


class CompanySerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(source="users.count", read_only=True)
    department_count = serializers.IntegerField(source="departments.count", read_only=True)
    plan_features = serializers.SerializerMethodField()
    is_compliant = serializers.SerializerMethodField()
    admin_email = serializers.CharField(source="admin_user.email", read_only=True, default=None)
    admin_login = serializers.CharField(
        source="admin_user.generated_login", read_only=True, default=None
    )
    admin_is_active = serializers.BooleanField(
        source="admin_user.is_active", read_only=True, default=None
    )
    admin_must_change_password = serializers.BooleanField(
        source="admin_user.must_change_password", read_only=True, default=None
    )

    class Meta:
        model = Company
        fields = [
            "id", "name", "slug", "sector", "employee_count", "plan", "plan_features",
            "is_active", "is_compliant", "admin_first_name", "admin_last_name", "admin_user",
            "admin_email", "admin_login", "admin_is_active", "admin_must_change_password",
            "user_count", "department_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "admin_user", "created_at", "updated_at"]

    def get_plan_features(self, obj):
        return PLAN_FEATURES.get(obj.plan, {})

    def get_is_compliant(self, obj):
        """Vrai si l'entreprise est active et respecte les limites de sa
        formule (nombre d'utilisateurs / de départements). Sert à colorer
        le bouton de blocage côté Super Admin (vert = en règle, rouge =
        bloquée ou hors-limites, à faire upgrader)."""
        if not obj.is_active:
            return False
        features = PLAN_FEATURES.get(obj.plan, {})
        max_users = features.get("max_users")
        max_departments = features.get("max_departments")
        if max_users is not None and obj.users.count() > max_users:
            return False
        if max_departments is not None and obj.departments.count() > max_departments:
            return False
        return True

    def create(self, validated_data):
        admin_first_name = validated_data.pop("admin_first_name", "")
        admin_last_name = validated_data.pop("admin_last_name", "")

        company = Company.objects.create(
            slug=_unique_company_slug(validated_data["name"]), **validated_data
        )

        for order, (code, name) in enumerate(DEFAULT_DEPARTMENTS):
            Department.objects.create(company=company, code=code, name=name)

        if admin_first_name or admin_last_name:
            login, email = unique_login_email(
                make_login(admin_first_name, admin_last_name), f"{company.slug}.pmc.local"
            )
            ceo = User(
                email=email,
                first_name=admin_first_name,
                last_name=admin_last_name,
                role=User.Role.COMPANY_ADMIN,
                position="CEO / Administrateur",
                company=company,
                generated_login=login,
                must_change_password=True,
            )
            ceo.set_password(DEFAULT_PASSWORD)
            ceo.save()
            company.admin_user = ceo
            company.admin_first_name = admin_first_name
            company.admin_last_name = admin_last_name
            company.save(update_fields=["admin_user", "admin_first_name", "admin_last_name"])

            dg = company.departments.filter(code="DG").first()
            if dg:
                dg.manager = ceo
                dg.save(update_fields=["manager"])
                ceo.department = dg
                ceo.save(update_fields=["department"])

        return company


class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(
        source="manager.get_full_name", read_only=True, default=None
    )
    member_count = serializers.IntegerField(source="members.count", read_only=True)

    class Meta:
        model = Department
        fields = [
            "id", "company", "name", "code", "manager", "manager_name",
            "member_count", "created_at",
        ]
        # `company` est toujours injecté par DepartmentViewSet.perform_create
        # (jamais par le payload client, sauf pour le Super Admin qui le lit
        # directement dans request.data en contournant le serializer) — sans
        # ce read_only, le champ FK requis fait échouer toute création.
        read_only_fields = ["id", "company", "created_at"]

    def validate_code(self, value):
        return value.strip().upper()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    department_name = serializers.CharField(
        source="department.name", read_only=True, default=None
    )
    avatar = serializers.SerializerMethodField()
    avatar_full_body = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        # URL relative volontairement (jamais construite via
        # request.build_absolute_uri) : en dev, le frontend accède à l'API
        # via le proxy Vite qui réécrit le Host vers le nom interne Docker
        # du backend ("backend:8000"), injoignable depuis le navigateur. Une
        # URL relative (/media/...) est résolue par le navigateur sur son
        # propre origin et re-proxyée correctement par Vite.
        return obj.avatar.url if obj.avatar else None

    def get_avatar_full_body(self, obj):
        return obj.avatar_full_body.url if obj.avatar_full_body else None

    age = serializers.IntegerField(read_only=True)
    total_experience_years = serializers.IntegerField(read_only=True)
    years_in_company = serializers.IntegerField(read_only=True)
    years_in_current_role = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "role", "role_display", "position", "company", "department",
            "department_name", "manager", "is_active", "generated_login",
            "must_change_password", "avatar", "avatar_full_body", "phone",
            "birth_date", "age", "career_start_date", "total_experience_years",
            "hire_date", "years_in_company", "role_start_date", "years_in_current_role",
            "theme_preference", "language", "date_joined",
        ]
        read_only_fields = ["id", "date_joined", "company", "generated_login"]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            "id", "email", "password", "first_name", "last_name",
            "role", "position", "department", "manager",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class MeSerializer(UserSerializer):
    company_name = serializers.CharField(
        source="company.name", read_only=True, default=None
    )

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["company_name"]


class MeUpdateSerializer(serializers.ModelSerializer):
    """Permet à n'importe quel utilisateur de modifier son propre profil
    (informations personnelles, photo, préférences d'environnement) — jamais
    son rôle, son entreprise ou son statut, qui restent du ressort d'un
    administrateur."""

    avatar = serializers.ImageField(required=False, allow_null=True)
    avatar_full_body = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "first_name", "last_name", "position", "phone",
            "theme_preference", "language", "avatar", "avatar_full_body",
        ]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        return user


class PasswordResetRequestSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_role = serializers.CharField(source="user.role", read_only=True)
    user_role_display = serializers.CharField(source="user.get_role_display", read_only=True)
    company_name = serializers.CharField(
        source="user.company.name", read_only=True, default=None
    )
    resolved_by_name = serializers.CharField(
        source="resolved_by.get_full_name", read_only=True, default=None
    )

    class Meta:
        model = PasswordResetRequest
        fields = [
            "id", "user", "user_name", "user_email", "user_role", "user_role_display",
            "company_name", "requested_at", "resolved", "resolved_at", "resolved_by",
            "resolved_by_name",
        ]
        read_only_fields = fields


class ForgotPasswordSerializer(serializers.Serializer):
    # CharField (pas EmailField) : accepte aussi bien l'email que l'identifiant
    # court généré (ex. "ebadji"), cohérent avec le formulaire de connexion.
    email = serializers.CharField()


class PMCTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Ajoute le rôle et l'entreprise dans le payload du JWT pour un routage
    frontend immédiat, sans appel API supplémentaire. Refuse également la
    connexion si l'entreprise de l'utilisateur a été bloquée par le Super
    Admin."""

    def validate(self, attrs):
        data = super().validate(attrs)
        company = self.user.company
        if company is not None and not company.is_active:
            raise serializers.ValidationError(
                "Votre entreprise a été suspendue par l'administrateur de la plateforme."
            )
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["company_id"] = user.company_id
        token["full_name"] = user.get_full_name()
        return token


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "created_at", "actor", "actor_name", "actor_role",
            "company_name", "action", "description",
        ]


class PerformanceProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerformanceProfile
        fields = [
            "id", "user", "gender", "contract_type",
            "qualifications", "previous_positions", "professional_achievements",
            "personal_achievements", "vision_aspirations", "personal_projects",
            "professional_role_models", "role_models_in_life", "dislikes",
            "motivates", "personality_traits", "hobbies", "bono_hat",
            "brings_to_team", "brings_to_manager", "expects_from_team",
            "expects_from_manager", "dev_priorities",
            "dev_professional_perspectives", "dev_actions_support",
            "dev_risks_obstacles", "updated_at",
        ]
        read_only_fields = ["id", "user", "updated_at"]
