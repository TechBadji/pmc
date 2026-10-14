"""Qui est connecté à l'application, et sur combien d'instances.

Chaque onglet ouvert porte un identifiant d'instance tiré au hasard et
signale sa présence toutes les minutes (`POST /api/presence/`), puis la
retire à la déconnexion (`DELETE`). Une instance silencieuse depuis
`ONLINE_WINDOW` est tenue pour fermée : onglet fermé, ordinateur en veille,
réseau coupé. La lecture (`GET`) est réservée au super administrateur.
"""
import re
from datetime import timedelta

from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .geoip import country_for_ip
from .middleware import client_ip
from .models import Presence
from .permissions import IsSuperAdmin

ONLINE_WINDOW = timedelta(minutes=3)
# Les signaux plus anciens ne servent plus à rien : purgés au passage.
FORGET_AFTER = timedelta(days=2)
INSTANCE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def browser_label(agent):
    """Navigateur et système en clair, sans dépendance : assez pour
    distinguer « Chrome sur Windows » d'un téléphone."""
    agent = agent or ""
    browser = next((name for key, name in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"),
                                          ("Chrome/", "Chrome"), ("Safari/", "Safari")) if key in agent), "Navigateur")
    system = next((name for key, name in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"),
                                         ("Windows", "Windows"), ("Mac OS X", "macOS"), ("Linux", "Linux")) if key in agent), "")
    return f"{browser} sur {system}" if system else browser


class PresenceView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsSuperAdmin()]
        return [permissions.IsAuthenticated()]

    def _instance(self, request):
        instance = str(request.data.get("instance") or "")
        if not INSTANCE.match(instance):
            raise ValidationError({"instance": "Identifiant d'instance invalide."})
        return instance

    def post(self, request):
        now = timezone.now()
        Presence.objects.update_or_create(
            user=request.user,
            instance=self._instance(request),
            defaults={
                "last_seen": now,
                "ip_address": client_ip(request) or "",
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:300],
            },
        )
        Presence.objects.filter(last_seen__lt=now - FORGET_AFTER).delete()
        return Response(status=204)

    def delete(self, request):
        Presence.objects.filter(user=request.user, instance=self._instance(request)).delete()
        return Response(status=204)

    def get(self, request):
        since = timezone.now() - ONLINE_WINDOW
        rows = Presence.objects.filter(last_seen__gte=since, user__is_active=True).select_related("user__company").order_by("-last_seen")
        accounts = {}
        for p in rows:
            user = p.user
            entry = accounts.setdefault(user.id, {
                "user": user.id,
                "login": user.generated_login or user.email,
                "name": user.get_full_name() or user.email,
                "role": user.role,
                "company": user.company.name if user.company_id else "",
                "avatar": user.avatar.url if user.avatar else None,
                "last_seen": p.last_seen,
                "instances": [],
            })
            country = country_for_ip(p.ip_address)[1] if p.ip_address else ""
            entry["instances"].append({
                "browser": browser_label(p.user_agent),
                "ip": p.ip_address,
                "country": country,
                "since": p.started_at,
                "last_seen": p.last_seen,
                "mine": user.id == request.user.id and p.instance == request.query_params.get("instance"),
            })
        people = sorted(accounts.values(), key=lambda e: (e["company"].casefold(), e["name"].casefold()))
        return Response({
            "window_minutes": int(ONLINE_WINDOW.total_seconds() // 60),
            "people": len(people),
            "instances": sum(len(e["instances"]) for e in people),
            "companies": len({e["company"] for e in people}),
            "accounts": people,
        })
