"""Gestionnaire d'erreurs de l'API : chaque échec parle à l'utilisateur.

Les erreurs de validation (400) gardent la forme DRF `{champ: [messages]}` que
le front sait déjà lire ; ce module s'occupe de celles qui n'avaient pas de
message exploitable : ressource introuvable (le texte de Django est en anglais),
conflit d'unicité (jusqu'ici une erreur 500 en HTML), trop de tentatives, et
plantage inattendu (désormais un JSON avec une référence à communiquer au
support, retrouvable dans les journaux).
"""
import logging
import uuid

from django.db import IntegrityError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import NotFound, Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("apps.errors")

NOT_FOUND = "Élément introuvable : il a peut-être été supprimé ou modifié par un autre utilisateur, ou il n'appartient pas à votre entreprise. Actualisez la page puis réessayez."
CONFLICT = "Cet enregistrement existe déjà ou entre en conflit avec une donnée existante. Vérifiez qu'il n'a pas déjà été saisi, puis modifiez-le au lieu d'en créer un second."
SERVER_ERROR = "Une erreur inattendue est survenue de notre côté. Ce que vous avez saisi n'a pas été enregistré : réessayez dans un instant."


def _wait(seconds):
    if seconds is None:
        return "quelques instants"
    seconds = int(seconds)
    if seconds < 90:
        return f"{seconds} seconde{'s' if seconds > 1 else ''}"
    minutes = -(-seconds // 60)
    return f"{minutes} minutes"


def custom_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = NotFound(NOT_FOUND)
    elif isinstance(exc, NotFound):
        exc = NotFound(NOT_FOUND)

    if isinstance(exc, Throttled):
        wait = _wait(exc.wait)
        response = drf_exception_handler(exc, context)
        if response is not None:
            response.data = {
                "detail": f"Trop de tentatives en peu de temps. Patientez {wait} avant de réessayer.",
                "code": "throttled",
                "retry_after": int(exc.wait) if exc.wait is not None else None,
            }
        return response

    response = drf_exception_handler(exc, context)
    if response is not None:
        if isinstance(response.data, dict) and "detail" in response.data and "code" not in response.data:
            code = getattr(getattr(exc, "detail", None), "code", None) or getattr(exc, "default_code", None)
            if code:
                response.data["code"] = code
        return response

    if isinstance(exc, IntegrityError):
        logger.warning("Conflit d'intégrité : %s", exc, exc_info=exc)
        return Response({"detail": CONFLICT, "code": "conflict"}, status=status.HTTP_400_BAD_REQUEST)

    reference = uuid.uuid4().hex[:8].upper()
    request = context.get("request")
    logger.error(
        "Erreur inattendue [%s] %s %s",
        reference,
        getattr(request, "method", "?"),
        getattr(request, "path", "?"),
        exc_info=exc,
    )
    return Response(
        {"detail": SERVER_ERROR, "code": "server_error", "reference": reference},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
