import csv
import io

import django_filters
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from django_filters.rest_framework import DjangoFilterBackend

from .audit import log_event
from .constants import DEFAULT_PASSWORD
from .exceptions import AccountBlocked
from .models import AuditLog, Company, Department, GuessSheet, PasswordResetRequest, PeerAccess, PerformanceProfile, User
from .permissions import (
    CompanyScopedQuerySetMixin,
    IsCompanyAdminOrManager,
    IsSuperAdmin,
    IsSuperAdminOrCompanyAdminOrManager,
)
from apps.core.scoping import managed_department_ids, manages_user, peer_directions, readable_department_ids, viewing_peer

from .serializers import (
    AuditLogSerializer,
    ChangePasswordSerializer,
    CompanySerializer,
    DepartmentSerializer,
    ForgotPasswordSerializer,
    GuessSheetSerializer,
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

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except APIException as exc:
            # Identifiants invalides, compte bloqué, entreprise suspendue…
            # tout échec d'authentification est visible ici — utile pour
            # repérer un bourrage de tentatives malgré le throttling.
            identifier = str(request.data.get("email") or "")[:255]
            if isinstance(exc, AccountBlocked):
                message = f"Connexion refusée : le compte « {identifier} » est bloqué."
            elif identifier:
                message = f"Échec de connexion pour « {identifier} »."
            else:
                message = "Échec de connexion (identifiant manquant)."
            log_event(None, "auth.login_failed", message)
            raise


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
        previous_scope = serializer.instance.display_scope
        company = serializer.save()
        if company.display_scope != previous_scope:
            log_event(
                self.request.user,
                "company.display_scope_changed",
                f"a modifié les rubriques affichées pour « {company.name} ».",
                company=company,
            )
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

    @staticmethod
    def _account_targets(company, include_admin):
        """Comptes visés par les actions groupées du Super Admin : Managers et
        Membres, plus le CEO (Admin Entreprise) quand c'est demandé."""
        roles = [User.Role.MANAGER, User.Role.MEMBER]
        if include_admin:
            roles.append(User.Role.COMPANY_ADMIN)
        return User.objects.filter(company=company, role__in=roles)

    @staticmethod
    def _include_admin(request):
        value = request.data.get("include_admin", False)
        if not isinstance(value, bool):
            raise ValidationError({"include_admin": "Indiquez true ou false."})
        return value

    @action(detail=True, methods=["get"], url_path="accounts-summary")
    def accounts_summary(self, request, pk=None):
        """Décompte des comptes de l'entreprise, pour l'écran des actions
        groupées (réinitialisation des mots de passe, blocage)."""
        company = self.get_object()
        users = User.objects.filter(company=company)
        admins = users.filter(role=User.Role.COMPANY_ADMIN)
        return Response(
            {
                "total": users.count(),
                "active": users.filter(is_active=True).count(),
                "blocked": users.filter(is_active=False).count(),
                "admins": admins.count(),
                "admins_blocked": admins.filter(is_active=False).count(),
            }
        )

    @action(detail=True, methods=["post"], url_path="reset-passwords")
    def reset_passwords(self, request, pk=None):
        """Remet d'un seul geste le même mot de passe à tous les comptes de
        l'entreprise — typiquement avant ou après une démo. Mot de passe par
        défaut (123456) si aucun n'est fourni ; les règles de complexité
        Django ne s'appliquent pas ici, puisqu'il s'agit d'un mot de passe
        provisoire communiqué par le cabinet."""
        company = self.get_object()
        include_admin = self._include_admin(request)
        password = request.data.get("password") or DEFAULT_PASSWORD
        if not isinstance(password, str):
            raise ValidationError({"password": "Le mot de passe doit être un texte."})
        if len(password) < 6:
            raise ValidationError({"password": "Le mot de passe doit contenir au moins 6 caractères."})
        if len(password) > 128:
            raise ValidationError({"password": "Le mot de passe ne doit pas dépasser 128 caractères."})
        if password != password.strip() or any(ch.isspace() for ch in password):
            raise ValidationError({"password": "Le mot de passe ne doit pas contenir d'espace."})
        must_change = request.data.get("must_change_password", True)
        if not isinstance(must_change, bool):
            raise ValidationError({"must_change_password": "Indiquez true ou false."})

        targets = list(self._account_targets(company, include_admin))
        if not targets:
            raise ValidationError({"detail": "Aucun compte à réinitialiser dans cette entreprise."})
        # Un seul hachage pour tous : le hacher par compte coûterait plusieurs
        # secondes sur une entreprise de démo de 100 comptes.
        user = targets[0]
        user.set_password(password)
        hashed = user.password
        User.objects.filter(id__in=[u.id for u in targets]).update(
            password=hashed, must_change_password=must_change
        )
        PasswordResetRequest.objects.filter(
            user_id__in=[u.id for u in targets], resolved=False
        ).update(resolved=True, resolved_at=timezone.now(), resolved_by=request.user)
        log_event(
            request.user,
            "user.password_reset",
            f"a réinitialisé le mot de passe de {len(targets)} compte(s) de « {company.name} »"
            f"{' (CEO compris)' if include_admin else ''}.",
            company=company,
        )
        return Response(
            {
                "updated": len(targets),
                "password": password,
                "must_change_password": must_change,
                "include_admin": include_admin,
            }
        )

    @action(detail=True, methods=["post"], url_path="set-users-active")
    def set_users_active(self, request, pk=None):
        """Bloque (ou débloque) tous les comptes de l'entreprise sans toucher
        à l'entreprise elle-même : à la fin d'une démo, les comptes sont
        fermés, et on les rouvre tels quels pour la suivante."""
        company = self.get_object()
        include_admin = self._include_admin(request)
        active = request.data.get("is_active")
        if not isinstance(active, bool):
            raise ValidationError(
                {"is_active": "Indiquez true pour débloquer ou false pour bloquer."}
            )
        targets = self._account_targets(company, include_admin).exclude(is_active=active)
        count = targets.count()
        if count:
            targets.update(is_active=active)
            log_event(
                request.user,
                "user.unblocked" if active else "user.blocked",
                f"a {'débloqué' if active else 'bloqué'} {count} compte(s) de « {company.name} »"
                f"{' (CEO compris)' if include_admin else ''}.",
                company=company,
            )
        return Response({"updated": count, "is_active": active, "include_admin": include_admin})

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
        colonnes attendues -> prenom,nom,email,login,poste,departement_code,service_code,role
        `email`, `login`, `service_code` et `role` sont optionnels (role par
        défaut: MEMBER). `login` impose l'identifiant de connexion au lieu de
        le dériver du nom, pour un import où ils sont décidés à l'avance. `service_code` rattache la personne à un service : il doit
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

            # Colonne `login` facultative : elle permet d'imposer l'identifiant
            # de connexion au lieu de le dériver du nom. Utile pour un import
            # où les identifiants sont décidés à l'avance (EMP1, EMP2…) et
            # communiqués tels quels aux intéressés.
            wanted_login = (row.get("login") or "").strip()
            if wanted_login:
                if User.objects.filter(generated_login__iexact=wanted_login).exists():
                    errors.append({"row": row_number, "error": f"Login déjà utilisé: {wanted_login}"})
                    continue

            email = row.get("email") or ""
            if email:
                if User.objects.filter(email=email).exists():
                    errors.append({"row": row_number, "error": f"Email déjà utilisé: {email}"})
                    continue
                # Le login sert d'identifiant de connexion : unique
                # globalement, même quand un email réel est fourni.
                existing_logins = set(User.objects.values_list("generated_login", flat=True))
                login = wanted_login or unique_login(
                    make_login(first_name, last_name), existing_logins
                )
            elif wanted_login:
                login = wanted_login
                email = f"{wanted_login.lower()}@{company.slug}.pmc.local"
                if User.objects.filter(email=email).exists():
                    errors.append({"row": row_number, "error": f"Email déjà utilisé: {email}"})
                    continue
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
            qs = qs.filter(id__in=readable_department_ids(self.request))
        return qs

    @action(detail=False, methods=["get"], url_path="peers")
    def peers(self, request):
        """Autres directions que le CEO autorise ce directeur à consulter en
        lecture seule, avec les rubriques accordées (sélecteur « Voir les autres
        directions »). Vide pour les autres rôles."""
        user = request.user
        if user.role != User.Role.MANAGER:
            return Response([])
        rubrics = {a.department_id: a.rubrics for a in PeerAccess.objects.filter(viewer=user)}
        return Response(
            [
                {
                    "id": d.id,
                    "name": d.name,
                    "manager_name": d.manager.get_full_name() if d.manager else "",
                    "manager_position": d.manager.position if d.manager else "",
                    "rubrics": rubrics.get(d.id, []),
                }
                for d in peer_directions(user).order_by("name")
            ]
        )

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == User.Role.SUPER_ADMIN:
            company_id = self.request.data.get("company")
            if not company_id:
                raise ValidationError({"company": "Champ requis pour le Super Admin."})
            department = serializer.save(company_id=company_id)
        else:
            department = serializer.save(company=user.company)
        log_event(
            user,
            "department.created",
            f"a créé le département « {department.name} » ({department.code}).",
            company=department.company,
        )

    def perform_update(self, serializer):
        before = {"name": serializer.instance.name, "code": serializer.instance.code, "manager_id": serializer.instance.manager_id}
        department = serializer.save()
        changed = [field for field, old in before.items() if old != getattr(department, field)]
        if changed:
            log_event(
                self.request.user,
                "department.updated",
                f"a modifié le département « {department.name} » ({', '.join(changed)}).",
                company=department.company,
            )

    def perform_destroy(self, instance):
        if instance.members.exists():
            raise ValidationError(
                {"detail": "Impossible de supprimer un département qui a des membres."}
            )
        name, code, company = instance.name, instance.code, instance.company
        instance.delete()
        log_event(
            self.request.user,
            "department.deleted",
            f"a supprimé le département « {name} » ({code}).",
            company=company,
        )


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
            visible = qs.filter(department_id__in=readable_department_ids(self.request))
            if not viewing_peer(self.request):
                visible = visible | qs.filter(id=user.id)
            # Les directeurs se voient entre eux : sur demande explicite
            # (?leadership=1), la liste s'étend à l'équipe dirigeante de
            # l'entreprise. Le défaut reste borné à l'équipe — les écrans qui
            # listent « mes collaborateurs » ne doivent pas y trouver un pair.
            if self.request.query_params.get("leadership"):
                visible = visible | qs.filter(role__in=[User.Role.MANAGER, User.Role.COMPANY_ADMIN])
            qs = visible
        return qs.distinct()

    @action(detail=False, methods=["get"], url_path="colleagues")
    def colleagues(self, request):
        """Annuaire de l'entreprise, pour désigner un collègue (le destinataire
        d'un 360° Feedforward) : tous les comptes actifs, par ordre alphabétique,
        réduits à ce qu'il faut pour les reconnaître. Ouvert à tous les rôles —
        un manager y trouve aussi ceux qu'il n'encadre pas, que la liste des
        utilisateurs lui masque."""
        people = User.objects.filter(company_id=request.user.company_id, is_active=True).exclude(company__isnull=True)
        rows = [
            {"id": u.id, "full_name": u.get_full_name() or u.email, "position": u.position, "avatar": u.avatar.url if u.avatar else None}
            for u in people
        ]
        rows.sort(key=lambda r: r["full_name"].casefold())
        return Response(rows)

    # Chiffres de l'aperçu de l'équipe dirigeante : libellé pour les messages, bornes admises.
    LEADERSHIP_STATS = {
        "age": ("l'âge", 18, 80),
        "years_in_role": ("l'expérience dans le poste", 0, 60),
        "years_in_company": ("l'ancienneté dans l'entreprise", 0, 60),
        "total_experience": ("l'expérience totale", 0, 60),
        "team_managers": ("le nombre de managers dans l'équipe", 0, 500),
    }

    @action(detail=False, methods=["post"], url_path="leadership-stats")
    def leadership_stats(self, request):
        """Saisie rapide, par le dirigeant, des chiffres affichés sous chaque
        membre de son équipe dirigeante. Tout est contrôlé avant d'écrire : une
        seule ligne en erreur et rien n'est enregistré. Une case vidée rend la
        main à la valeur calculée."""
        actor = request.user
        if actor.role != User.Role.COMPANY_ADMIN:
            raise PermissionDenied("Cette saisie est réservée au dirigeant de l'entreprise.")
        rows = request.data.get("rows")
        if not isinstance(rows, list) or not rows:
            raise ValidationError({"rows": "Aucune ligne à enregistrer."})
        people = {u.id: u for u in User.objects.filter(company_id=actor.company_id)}
        errors, updates = [], []
        for row in rows:
            person = people.get(row.get("user")) if isinstance(row, dict) else None
            if person is None:
                errors.append("Une ligne désigne une personne qui n'appartient pas à votre entreprise : rechargez la page.")
                continue
            name, stats = person.get_full_name(), {}
            for key, (label, low, high) in self.LEADERSHIP_STATS.items():
                value = row.get(key)
                if value is None or value == "":
                    continue
                if isinstance(value, bool) or not isinstance(value, int) or not (low <= value <= high):
                    errors.append(f"{name} : {label} doit être un nombre entier entre {low} et {high} (vous avez saisi {value!r}).")
                    continue
                stats[key] = value
            role, company, total, age = (stats.get(k) for k in ("years_in_role", "years_in_company", "total_experience", "age"))
            if role is not None and company is not None and role > company:
                errors.append(f"{name} : l'expérience dans le poste ({role}) ne peut pas dépasser l'ancienneté dans l'entreprise ({company}).")
            if company is not None and total is not None and company > total:
                errors.append(f"{name} : l'ancienneté dans l'entreprise ({company}) ne peut pas dépasser l'expérience totale ({total}).")
            if total is not None and age is not None and total > age - 15:
                errors.append(f"{name} : une expérience totale de {total} ans n'est pas compatible avec un âge de {age} ans.")
            updates.append((person, stats))
        if errors:
            raise ValidationError({"rows": errors})
        for person, stats in updates:
            person.leadership_stats = stats
            person.save(update_fields=["leadership_stats"])
        log_event(actor, "leadership.stats_updated", f"a mis à jour les chiffres de l'équipe dirigeante ({len(updates)} personne(s)).", company=actor.company)
        return Response({"updated": len(updates)})

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

    @action(detail=False, methods=["post"], url_path="bulk-toggle-active")
    def bulk_toggle_active(self, request):
        """Bloque (ou débloque) d'un seul geste tous les comptes de l'entreprise.
        Réservé à l'Admin Entreprise (le « CEO ») : il agit sur ses Managers et
        Membres, jamais sur son propre compte ni sur une autre entreprise."""
        user = request.user
        if user.role != User.Role.COMPANY_ADMIN or user.company_id is None:
            raise PermissionDenied("Seul l'Admin Entreprise peut bloquer tous les comptes.")
        active = request.data.get("is_active")
        if not isinstance(active, bool):
            raise ValidationError(
                {"is_active": "Indiquez true pour débloquer ou false pour bloquer."}
            )
        targets = User.objects.filter(
            company_id=user.company_id,
            role__in=(User.Role.MANAGER, User.Role.MEMBER),
        ).exclude(id=user.id).exclude(is_active=active)
        count = targets.count()
        if count:
            targets.update(is_active=active)
            log_event(
                user,
                "user.unblocked" if active else "user.blocked",
                f"a {'débloqué' if active else 'bloqué'} {count} compte(s) de l'entreprise.",
                company=user.company,
            )
        return Response({"updated": count, "is_active": active})


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


class AuditLogFilter(django_filters.FilterSet):
    # `created_at__date` plutôt que `created_at` directement : bornes
    # inclusives sur le jour choisi, sans que l'appelant ait à composer un
    # horodatage complet pour "jusqu'au 31 inclus".
    date_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    # `company_name`/`actor_name` sont des instantanés texte figés à
    # l'écriture (voir AuditLog.__doc__) — pas de relation à joindre,
    # une simple recherche insensible à la casse suffit.
    company_name = django_filters.CharFilter(field_name="company_name", lookup_expr="icontains")

    class Meta:
        model = AuditLog
        fields = ["action", "date_from", "date_to", "company_name"]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Journal d'activité de la plateforme — réservé au Super Admin."""

    # Aucun préchargement n'est utile ici : le journal fige le nom de
    # l'auteur et celui de l'entreprise à l'écriture (`actor_name`,
    # `company_name`), et n'expose de la relation que l'identifiant. Une
    # jointure n'apporterait rien — et « company » n'est même pas une
    # relation de ce modèle.
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = AuditLogFilter
    # Une seule zone de recherche libre côté écran, qui couvre à la fois
    # "qui" (auteur) et "quoi" (description) — le filtre entreprise reste
    # séparé puisqu'il a son propre champ dédié dans l'UI.
    search_fields = ["description", "actor_name", "ip_address", "country_name"]

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """Export CSV du journal filtré — mêmes filtres que la liste
        affichée à l'écran (période, entreprise, recherche, type
        d'événement), jamais l'intégralité du journal en un clic."""
        queryset = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="journal-activite.csv"'
        writer = csv.writer(response)
        writer.writerow(
            ["Date", "Auteur", "Rôle", "Entreprise", "Type d'événement", "Description", "Adresse IP", "Pays"]
        )
        for log in queryset.iterator():
            writer.writerow([
                timezone.localtime(log.created_at).strftime("%Y-%m-%d %H:%M:%S"),
                log.actor_name,
                log.actor_role,
                log.company_name,
                log.action,
                log.description,
                log.ip_address or "",
                log.country_name or log.country_code,
            ])
        return response


class PerformanceProfileViewSet(CompanyScopedQuerySetMixin, viewsets.ModelViewSet):
    """Fiche "Performances" 360° — même règles de visibilité que les autres
    fiches individuelles (évaluations, forces & faiblesses) : un manager ne
    voit/édite que sa propre équipe (+ lui-même), un membre ne voit que la
    sienne."""

    queryset = PerformanceProfile.objects.select_related("user")
    serializer_class = PerformanceProfileSerializer
    company_lookup = "user__company_id"
    filterset_fields = ["user"]

    # Ce que l'évaluation ou le manager attribue : un collaborateur ne le fixe pas
    # lui-même en remplissant sa propre fiche.
    ASSESSED_FIELDS = ("performance_pct", "performer_category")

    def get_permissions(self):
        # Chacun peut renseigner sa propre fiche (l'écran de saisie de l'employé) ;
        # les autres écritures restent réservées au CEO et aux managers.
        if self.action == "save_for_user":
            return [permissions.IsAuthenticated()]
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsCompanyAdminOrManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == user.Role.MANAGER:
            own = qs.filter(user=user)
            qs = qs.filter(user__department_id__in=readable_department_ids(self.request))
            if not viewing_peer(self.request):
                qs = qs | own
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
        if actor.role == actor.Role.SUPER_ADMIN:
            raise PermissionDenied("Le Super Admin n'est rattaché à aucune entreprise : il ne renseigne pas de fiche.")
        data = request.data
        if actor.role == actor.Role.MEMBER:
            if target_user.id != actor.id:
                raise PermissionDenied("Vous ne pouvez renseigner que votre propre fiche.")
            data = {k: v for k, v in request.data.items() if k not in self.ASSESSED_FIELDS}
        if actor.role == actor.Role.MANAGER and target_user.id != actor.id:
            is_own_team_member = manages_user(actor, target_user)
            if not is_own_team_member:
                raise ValidationError({"user": "Ce collaborateur ne fait pas partie de votre équipe."})

        profile, _ = PerformanceProfile.objects.get_or_create(user=target_user)
        serializer = PerformanceProfileSerializer(profile, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_event(
            actor,
            "performanceprofile.updated",
            f"a mis à jour la fiche Performances de {target_user.get_full_name()}.",
            company=target_user.company,
        )
        return Response(serializer.data)


class GuessSheetViewSet(viewsets.ModelViewSet):
    """Fiches du jeu « Ma fiche ID-PMC » : chacun ne voit, ne modifie et ne
    supprime que les siennes, quel que soit son rôle."""

    serializer_class = GuessSheetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return GuessSheet.objects.filter(author=self.request.user)

    def perform_create(self, serializer):
        serializer.save(author=self.request.user, company=self.request.user.company)
