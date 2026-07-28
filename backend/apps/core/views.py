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
from .models import AuditLog, Company, Department, PasswordResetRequest, User
from .permissions import (
    CompanyScopedQuerySetMixin,
    IsCompanyAdminOrManager,
    IsSuperAdmin,
    IsSuperAdminOrCompanyAdminOrManager,
)
from .serializers import (
    AuditLogSerializer,
    ChangePasswordSerializer,
    CompanySerializer,
    DepartmentSerializer,
    ForgotPasswordSerializer,
    MeSerializer,
    MeUpdateSerializer,
    PasswordResetRequestSerializer,
    PMCTokenObtainPairSerializer,
    UserCreateSerializer,
    UserSerializer,
    unique_login_email,
)
from .text_utils import make_login, unique_login


class PMCTokenObtainPairView(TokenObtainPairView):
    serializer_class = PMCTokenObtainPairSerializer


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

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["email"]

        user = User.objects.filter(
            Q(email__iexact=identifier) | Q(generated_login__iexact=identifier)
        ).first()
        generic_message = (
            "Si un compte existe avec cet identifiant, une demande de réinitialisation "
            "a été transmise à votre administrateur."
        )
        if not user:
            return Response({"detail": generic_message})

        if user.role == User.Role.SUPER_ADMIN:
            return Response(
                {
                    "detail": "Un compte Super Admin ne peut pas être réinitialisé "
                    "automatiquement. Merci de contacter le support technique."
                }
            )

        PasswordResetRequest.objects.get_or_create(user=user, resolved=False)
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
        colonnes attendues -> prenom,nom,email,poste,departement_code,role
        `email` et `role` sont optionnels (role par défaut: MEMBER).
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
                {"file": "Colonnes attendues: prenom,nom,email,poste,departement_code,role"}
            )

        departments_by_code = {d.code: d for d in company.departments.all()}
        created, errors = [], []

        for row_number, raw_row in enumerate(reader, start=2):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw_row.items()}
            first_name, last_name = row.get("prenom", ""), row.get("nom", "")
            dept_code = row.get("departement_code", "").upper()
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
                department=departments_by_code[dept_code],
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
                    "department": departments_by_code[dept_code].name,
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
    queryset = Department.objects.select_related("manager", "company")
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
            # Un manager ne voit que son/ses propre(s) département(s).
            qs = qs.filter(manager=user)
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
            # Un manager ne voit que les membres de son/ses équipe(s).
            qs = qs.filter(department__manager=user) | qs.filter(id=user.id)
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
            return target.role == User.Role.MEMBER and target.department_id and (
                target.department.manager_id == actor.id
            )
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
            "user.password_reset",
            f"a traité la demande de réinitialisation de {target.get_full_name()}.",
            company=target.company,
        )
        return Response(PasswordResetRequestSerializer(reset_request).data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Journal d'activité de la plateforme — réservé au Super Admin."""

    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperAdmin]
    filterset_fields = ["action"]
