from rest_framework import status
from rest_framework.exceptions import APIException


class AccountBlocked(APIException):
    """Connexion refusée parce que le compte a été bloqué par un
    administrateur — distinct d'un mot de passe erroné, pour que l'écran de
    connexion puisse le dire au lieu d'inviter à réinitialiser le mot de passe."""

    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "Votre compte a été bloqué par votre administrateur."
    default_code = "account_blocked"
