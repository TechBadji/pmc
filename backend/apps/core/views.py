import csv
import io

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .audit import log_event
from .constants import DEFAULT_PASSWORD
from .models import AuditLog, Company, Department, PasswordResetRequest, PerformanceProfile, User
from .permissions import (
    CompanyScopedQuerySetMixin,
    IsCompanyAdminOrManager,
    IsSuperAdmin,
    IsSuperAdminOrCompanyAdminOrManager,
)
from apps.core.scoping import managed_department_ids, manages_user

from .serializers import (
    AuditLogSerializer,
    ChangePasswordSerializer,
    CompanySerializer,
    DepartmentSerializer,
    ForgotPasswordSerializer,
    MeSerializer,
    MeUpdateSerializer,
    PasswordResetRequestSerializer,
    PerformanceProfileSerializer,
    PMCTokenObtainPairSerializer,
    UserCreateSerializer,
    UserSerializer,
    unique_login_email,
)
from .text_utils import make_login, unique_login
from .validators import require_same_company


class PMCTokenObtainPairView(TokenObtainPairView):
    serializer_class = PMCTokenObtainPairSerializer
    throttle_scope = "login"


class MeView(APIView):
    """Profil du compte connecté : consultation et auto-modification
    (informations personnelles, photo, préférences d'environnement)."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        return Response(MeSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MeSerializer(request.user, context={"request": request}).data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Mot de passe mis à jour."})


class ForgotPasswordView(APIView):
    """Déclenchée depuis l'écran de connexion ('mot de passe oublié'). Ne
    réinitialise rien elle-même : elle crée une demande à traiter par
    l'Admin Entreprise (pour un Manager/Membre) ou par le Super Admin
    (pour un Admin Entreprise), qui réinitialisera ensuite au mot de passe
    par défaut (123456)."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "forgot_password"

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["email"]

        # Réponse strictement identique dans tous les cas (compte inexistant,
        # Super Admin, ou compte normal) : révéler qu'un identifiant existe —
        # ou pire, qu'il appartient à un Super Admin — permettrait de
        # fingerprinter des comptes à haute valeur pour du credential
        # stuffing/phishing ciblé.
        generic_message = (
            "Si un compte existe avec cet identifiant, une demande de réinitialisation "
            "a été transmise à votre administrateur."
        )

        user = User.objects.filter(
            Q(email__iexact=identifier) | Q(generated_login__iexact=identifier)
        ).first()

        if user and user.role != User.Role.SUPER_ADMIN:
            PasswordResetRequest.objects.get_or_create(user=user, resolved=False)
        # Un compte Super Admin n'a personne à notifier (pas d'Admin
        # Entreprise au-dessus) : aucune demande n'est créée, mais la réponse
        # reste identique — le traitement passe par le support technique.

        return Response(
            {
                "detail": "Une demande de réinitialisation a été envoyée à "
                "l'administrateur de votre entreprise. Il/elle réinitialisera votre "
                "mot de passe au mot de passe par défaut (123456)."
            }
        )


class CompanyViewSet(viewsets.ModelViewSet):
    """Réservé au Super Admin : CRUD complet sur les entreprises clientes."""

    queryset = Company.objects.select_related("admin_user").all()
    serializer_class = CompanySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [IsSuperAdmin()]

    def get_queryset(self):
        user = self.request.user
        if user.role == User.Role.SUPER_ADMIN:
            return Company.objects.select_related("admin_user").all()
        return Company.objects.select_related("admin_user").filter(id=user.company_id)

    def perform_create(self, serializer):
        company = serializer.save()
        log_event(
            self.request.user,
            "company.created",
            f"a créé l'entreprise « {company.name} » (formule {company.plan}).",
            company=company,
        )

    def perform_update(self, serializer):
        previous_plan = serializer.instance.plan
        company = serializer.save()
        if company.plan != previous_plan:
            log_event(
                self.request.user,
                "company.plan_changed",
                f"a changé la formule de « {company.name} » : {previous_plan} → {company.plan}.",
                company=company,
            )

    @action(detail=True, methods=["post"], url_path="toggle-active")
    def toggle_active(self, request, pk=None):
        """Bloque/débloque l'ENTREPRISE entière (tous ses utilisateurs
        perdent/retrouvent l'accès), par opposition au blocage individuel du
        CEO déjà possible via /users/{id}/toggle-active/."""
        company = self.get_object()
        company.is_active = not company.is_active
        company.save(update_fields=["is_active"])
        log_event(
            request.user,
            "company.blocked" if not company.is_active else "company.unblocked",
            f"a {'bloqué' if not company.is_active else 'débloqué'} l'entreprise « {company.name} ».",
            company=company,
        )
        return Response(CompanySerializer(company).data)

    def perform_destroy(self, instance):
        """Suppression d'une entreprise = suppression en cascade de toutes
        ses données (utilisateurs, départements, évaluations, référentiels de
        compétences, etc.), réservée au Super Admin.

        Evaluation.campaign est volontairement en PROTECT pour empêcher la
        suppression accidentelle d'UNE SEULE campagne encore utilisée (depuis
        l'écran Campagnes d'évaluation) — mais ce garde-fou bloquerait aussi
        la cascade automatique de Django lors de la suppression de
        l'entreprise entière (les évaluations ne sont pas supprimées avant
        leurs campagnes dans l'ordre de collecte de Django). On supprime donc
        explicitement les évaluations de l'entreprise en premier, avant de
        laisser la cascade standard s'occuper du reste.
        """
        from apps.evaluations.models import Evaluation

        company_name = instance.name
        Evaluation.objects.filter(user__company=instance).delete()
        instance.delete()
        log_event(
            self.request.user,
            "company.deleted",
            f"a supprimé l'entreprise « {company_name} » et toutes ses données.",
            company_name=company_name,
        )

    @action(detail=True, methods=["post"], url_path="bulk-upload-users", parser_classes=[MultiPartParser])
    def bulk_upload_users(self, request, pk=None):
        """Charge des utilisateurs en masse depuis un CSV :
        colonnes attendues -> prenom,nom,email,poste,departement_code,service_code,role
        `email`, `service_code` et `role` sont optionnels (role par défaut:
        MEMBER). `service_code` rattache la personne à un service : il doit
        désigner un service de la direction indiquée par `departement_code` —
        un décalage entre les deux colonnes est refusé ligne à ligne plutôt
        que d'affecter silencieusement la personne au mauvais endroit.
        Génère un login/mot de passe par défaut (123456, à changer à la
        première connexion) quand l'email n'est pas fourni.
        """
        company = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Fichier CSV requis."})

        try:
            decoded = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValidationError({"file": "Encodage invalide, utilisez de l'UTF-8."}) from exc

        reader = csv.DictReader(io.StringIO(decoded))
        required_columns = {"prenom", "nom", "departement_code"}
        if not reader.fieldnames or not required_columns.issubset(
            {f.strip().lower() for f in reader.fieldnames}
        ):
            raise ValidationError(
                {"file": "Colonnes attendues: prenom,nom,email,poste,departement_code,service_code,role"}
            )

        departments_by_code = {d.code: d for d in company.departments.all()}
        created, errors = [], []

        for row_number, raw_row in enumerate(reader, start=2):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw_row.items()}
            first_name, last_name = row.get("prenom", ""), row.get("nom", "")
            dept_code = row.get("departement_code", "").upper()
            service_code = row.get("service_code", "").upper()
            role = (row.get("role") or User.Role.MEMBER).upper()

            if not first_name or not last_name:
                errors.append({"row": row_number, "error": "Prénom et nom requis."})
                continue
            if dept_code not in departments_by_code:
                errors.append({"row": row_number, "error": f"Département inconnu: {dept_code}"})
                continue
            if role not in (User.Role.MEMBER, User.Role.MANAGER):
                errors.append({"row": row_number, "error": f"Rôle invalide: {role}"})
                continue

            target_department = departments_by_code[dept_code]
            if service_code:
                service = departments_by_code.get(service_code)
                if service is None:
                    errors.append({"row": row_number, "error": f"Service inconnu: {service_code}"})
                    continue
                if service.parent_id != target_department.id:
                    errors.append(
                        {
                            "row": row_number,
                            "error": (
                                f"Le service {service_code} ne dépend pas de la direction {dept_code}."
                            ),
                        }
                    )
                    continue
                target_department = service

            email = row.get("email") or ""
            if email:
                if User.objects.filter(email=email).exists():
                    errors.append({"row": row_number, "error": f"Email déjà utilisé: {email}"})
                    continue
                # Le login sert d'identifiant de connexion : unique
                # globalement, même quand un email réel est fourni.
                existing_logins = set(User.objects.values_list("generated_login", flat=True))
                login = unique_login(make_login(first_name, last_name), existing_logins)
            else:
                login, email = unique_login_email(
                    make_login(first_name, last_name), f"{company.slug}.pmc.local"
                )

            user = User(
                email=email,
                first_name=first_name,
                last_name=last_name,
                position=row.get("poste", ""),
                role=role,
                company=company,
                department=target_department,
                generated_login=login,
                must_change_password=True,
            )
            user.set_password(DEFAULT_PASSWORD)
            user.save()
            created.append(
                {
                    "row": row_number,
                    "full_name": f"{first_name} {last_name}",
                    "email": email,
                    "login": login,
                    "department": target_department.name,
                    "role": role,
                    "password": DEFAULT_PASSWORD,
                }
            )

        if created:
            log_event(
                self.request.user,
                "user.bulk_created",
                f"a chargé {len(created)} collaborateur(s) par CSV dans « {company.name} ».",
                company=company,
            )

        return Response({"created": created, "errors": errors, "created_count": len(created)})


class DepartmentViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    # `members` préchargé : le serializer expose l'effectif, et `count()` sur un
    # manager préchargé lit le cache au lieu de refaire un COUNT par département.
    queryset = Department.objects.select_related("manager", "company").prefetch_related("members")
    serializer_class = DepartmentSerializer
    company_lookup = "company_id"
    filterset_fields = ["company"]
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsSuperAdminOrCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.MANAGER:
            # Un manager voit son/ses département(s) — et, s'il dirige une
            # direction, les services qui en dépendent.
            qs = qs.filter(id__in=managed_department_ids(user))
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == User.Role.SUPER_ADMIN:
            company_id = self.request.data.get("company")
            if not company_id:
                raise ValidationError({"company": "Champ requis pour le Super Admin."})
            serializer.save(company_id=company_id)
        else:
            serializer.save(company=user.company)

    def perform_destroy(self, instance):
        if instance.members.exists():
            raise ValidationError(
                {"detail": "Impossible de supprimer un département qui a des membres."}
            )
        instance.delete()


class UserViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = User.objects.select_related("company", "department", "manager")
    company_lookup = "company_id"
    filterset_fields = ["company", "role", "department"]
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # La lecture reste bornée par get_queryset() (tenant + équipe pour un
        # manager) ; l'écriture (création/modification/suppression de comptes)
        # est réservée aux rôles d'administration — jamais à un simple membre,
        # y compris sur son propre compte (l'auto-édition passe par /auth/me/).
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsSuperAdminOrCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.MANAGER:
            # Un encadrant ne voit que les membres qu'il encadre : sa ou ses
            # équipes, services compris pour un directeur.
            qs = qs.filter(department_id__in=managed_department_ids(user)) | qs.filter(id=user.id)
        return qs.distinct()

    @staticmethod
    def _assignable_roles(actor):
        """Rôles qu'un acteur a le droit d'attribuer à un compte (création ou
        changement de rôle) — jamais un rôle égal ou supérieur au sien, sauf
        pour le Super Admin."""
        if actor.role == User.Role.SUPER_ADMIN:
            return {User.Role.SUPER_ADMIN, User.Role.COMPANY_ADMIN, User.Role.MANAGER, User.Role.MEMBER}
        if actor.role == User.Role.COMPANY_ADMIN:
            return {User.Role.MANAGER, User.Role.MEMBER}
        if actor.role == User.Role.MANAGER:
            return {User.Role.MEMBER}
        return set()

    def perform_create(self, serializer):
        actor = self.request.user
        requested_role = serializer.validated_data.get("role")
        if requested_role not in self._assignable_roles(actor):
            raise PermissionDenied("Vous ne pouvez pas attribuer ce rôle.")
        if actor.role == User.Role.MANAGER:
            department = serializer.validated_data.get("department")
            if not department or department.manager_id != actor.id:
                raise PermissionDenied(
                    "Un manager ne peut créer des membres que dans son propre département."
                )
        new_user = serializer.save(company=actor.company)
        log_event(
            actor,
            "user.created",
            f"a créé le compte {new_user.get_full_name()} ({new_user.get_role_display()}).",
            company=new_user.company,
        )

    def perform_update(self, serializer):
        actor = self.request.user
        target = serializer.instance
        if not self._can_manage(actor, target):
            raise PermissionDenied("Vous ne pouvez pas modifier ce compte.")
        previous_role = target.role
        new_role = serializer.validated_data.get("role", target.role)
        if new_role != target.role and new_role not in self._assignable_roles(actor):
            raise PermissionDenied("Vous ne pouvez pas attribuer ce rôle.")
        # Un manager peut retirer un membre de son équipe (department=None),
        # jamais le transférer dans une autre équipe : seul un Company Admin
        # réaffecte. Sans ce garde-fou, "retirer de l'équipe" côté UI ouvrirait
        # aussi la porte à un déplacement vers n'importe quel département.
        if actor.role == User.Role.MANAGER and "department" in serializer.validated_data:
            new_department = serializer.validated_data["department"]
            if new_department is not None and new_department.manager_id != actor.id:
                raise PermissionDenied(
                    "Un manager ne peut affecter un membre qu'à son propre département."
                )
        updated = serializer.save()
        if updated.role != previous_role:
            log_event(
                actor,
                "user.role_changed",
                f"a changé le rôle de {updated.get_full_name()} : {previous_role} → {updated.role}.",
                company=updated.company,
            )

    def perform_destroy(self, instance):
        if not self._can_manage(self.request.user, instance):
            raise PermissionDenied("Vous ne pouvez pas supprimer ce compte.")
        full_name, company = instance.get_full_name(), instance.company
        instance.delete()
        log_event(
            self.request.user,
            "user.deleted",
            f"a supprimé le compte {full_name}.",
            company=company,
        )

    @staticmethod
    def _can_manage(actor, target):
        if actor.id == target.id:
            return False
        if actor.role == User.Role.SUPER_ADMIN:
            return True
        if actor.company_id != target.company_id:
            return False
        if actor.role == User.Role.COMPANY_ADMIN:
            return target.role in (User.Role.MANAGER, User.Role.MEMBER)
        if actor.role == User.Role.MANAGER:
            return target.role == User.Role.MEMBER and manages_user(actor, target)
        return False

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        target = self.get_object()
        if not self._can_manage(request.user, target):
            raise PermissionDenied("Vous ne pouvez pas réinitialiser ce compte.")
        target.set_password(DEFAULT_PASSWORD)
        target.must_change_password = True
        target.save(update_fields=["password", "must_change_password"])
        log_event(
            request.user,
            "user.password_reset",
            f"a réinitialisé le mot de passe de {target.get_full_name()}.",
            company=target.company,
        )
        return Response({"detail": "Mot de passe réinitialisé.", "password": DEFAULT_PASSWORD})

    @action(detail=True, methods=["post"], url_path="toggle-active")
    def toggle_active(self, request, pk=None):
        target = self.get_object()
        if not self._can_manage(request.user, target):
            raise PermissionDenied("Vous ne pouvez pas bloquer/débloquer ce compte.")
        target.is_active = not target.is_active
        target.save(update_fields=["is_active"])
        log_event(
            request.user,
            "user.blocked" if not target.is_active else "user.unblocked",
            f"a {'bloqué' if not target.is_active else 'débloqué'} le compte {target.get_full_name()}.",
            company=target.company,
        )
        return Response(UserSerializer(target).data)


class PasswordResetRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """Demandes 'mot de passe oublié' à traiter. Un Admin Entreprise voit les
    demandes de ses Managers/Membres ; le Super Admin voit celles des Admin
    Entreprise (toutes entreprises confondues)."""

    serializer_class = PasswordResetRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["resolved"]
    queryset = PasswordResetRequest.objects.select_related(
        "user", "user__company", "resolved_by"
    )

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role == User.Role.SUPER_ADMIN:
            return qs.filter(user__role=User.Role.COMPANY_ADMIN)
        if user.role == User.Role.COMPANY_ADMIN:
            return qs.filter(
                user__company_id=user.company_id,
                user__role__in=(User.Role.MANAGER, User.Role.MEMBER),
            )
        return qs.none()

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        reset_request = self.get_object()
        target = reset_request.user
        if not UserViewSet._can_manage(request.user, target):
            raise PermissionDenied("Vous ne pouvez pas traiter cette demande.")
        target.set_password(DEFAULT_PASSWORD)
        target.must_change_password = True
        target.save(update_fields=["password", "must_change_password"])
        reset_request.resolved = True
        reset_request.resolved_at = timezone.now()
        reset_request.resolved_by = request.user
        reset_request.save(update_fields=["resolved", "resolved_at", "resolved_by"])
        log_event(
            request.user,
            "user.password_reset_request_resolved",
            f"a traité la demande de réinitialisation de {target.get_full_name()}.",
            company=target.company,
        )
        return Response(PasswordResetRequestSerializer(reset_request).data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Journal d'activité de la plateforme — réservé au Super Admin."""

    # L'acteur et l'entreprise sont affichés sur chaque ligne : sans
    # préchargement, une page de 50 entrées déclenchait 100 requêtes de plus.
    queryset = AuditLog.objects.select_related("actor", "company")
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperAdmin]
    filterset_fields = ["action"]


class PerformanceProfileViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Fiche "Performances" 360° — même règles de visibilité que les autres
    fiches individuelles (évaluations, forces & faiblesses) : un manager ne
    voit/édite que sa propre équipe (+ lui-même), un membre ne voit que la
    sienne."""

    queryset = PerformanceProfile.objects.select_related("user")
    serializer_class = PerformanceProfileSerializer
    company_lookup = "user__company_id"
    filterset_fields = ["user"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "save_for_user"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            qs = qs.filter(user__department_id__in=managed_department_ids(user)) | qs.filter(user=user)
        elif user.role == user.Role.MEMBER:
            qs = qs.filter(user=user)
        return qs.distinct()

    @action(detail=False, methods=["put"], url_path="save-for-user")
    def save_for_user(self, request):
        target_user_id = request.data.get("user")
        try:
            target_user = User.objects.select_related("company", "department").get(pk=target_user_id)
        except (User.DoesNotExist, TypeError, ValueError):
            raise ValidationError({"user": "Collaborateur introuvable."})
        require_same_company(request.user, target_user=target_user)

        actor = request.user
        if actor.role == actor.Role.MANAGER and target_user.id != actor.id:
            is_own_team_member = manages_user(actor, target_user)
            if not is_own_team_member:
                raise ValidationError({"user": "Ce collaborateur ne fait pas partie de votre équipe."})

        profile, _ = PerformanceProfile.objects.get_or_create(user=target_user)
        serializer = PerformanceProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
