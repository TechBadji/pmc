from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import User


class PMCJWTAuthentication(JWTAuthentication):
    """Identique à JWTAuthentication, mais rejette aussi un jeton par
    ailleurs valide si l'entreprise de son titulaire a été suspendue par le
    Super Admin entre-temps. Sans cette vérification, un JWT déjà émis
    resterait utilisable jusqu'à son expiration malgré le blocage."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result
        if user.company_id and user.role != User.Role.SUPER_ADMIN:
            if not user.company.is_active:
                raise AuthenticationFailed(
                    "Votre entreprise a été suspendue par l'administrateur de la plateforme."
                )
        return user, token
