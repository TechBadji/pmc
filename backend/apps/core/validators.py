"""Garde-fous multi-tenant réutilisables pour les serializers d'écriture.

Les querysets de lecture sont bornés au tenant via `CompanyScopedQuerySetMixin`,
mais les champs FK saisissables (user, campaign, team, ...) utilisent par
défaut un queryset non borné : rien n'empêche un Company Admin/Manager de
référencer un objet appartenant à une AUTRE entreprise par un id deviné/énuméré
(IDOR cross-tenant). `require_same_company` centralise la vérification.
"""
from rest_framework import serializers


def require_same_company(actor, **named_objects):
    """Vérifie que chaque objet fourni (exposant `company_id`) appartient à
    l'entreprise de `actor`. Le Super Admin n'est borné à aucune entreprise.
    Lève une ValidationError DRF (une clé par champ fautif) sinon."""
    if actor.role == actor.Role.SUPER_ADMIN:
        return
    errors = {}
    for field_name, obj in named_objects.items():
        if obj is not None and obj.company_id != actor.company_id:
            errors[field_name] = "Introuvable."
    if errors:
        raise serializers.ValidationError(errors)
