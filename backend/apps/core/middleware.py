"""Rend la requête HTTP en cours accessible au journal d'activité.

`log_event` est appelé depuis des dizaines d'endroits (vues, serializers,
signaux) qui n'ont pas tous la requête sous la main : plutôt que de la faire
circuler partout, on la dépose ici pour la durée du traitement."""
from threading import local

_state = local()


def current_request():
    return getattr(_state, "request", None)


def client_ip(request):
    """IP réelle de l'appelant : nginx est devant l'application, donc
    `REMOTE_ADDR` est celle du proxy. On prend la première adresse de
    `X-Forwarded-For`, celle du client d'origine."""
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR") or None


class CurrentRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _state.request = request
        try:
            return self.get_response(request)
        finally:
            _state.request = None
