"""Petit utilitaire pour journaliser les événements administratifs
importants (entreprises, comptes, campagnes) dans AuditLog, consultés par
le Super Admin depuis la rubrique Logs."""
from .models import AuditLog


def log_event(actor, action, description, company=None, company_name=None):
    if company_name is None:
        company_name = company.name if company else (actor.company.name if actor and actor.company_id else "")
    AuditLog.objects.create(
        actor=actor,
        actor_name=actor.get_full_name() if actor else "Système",
        actor_role=actor.role if actor else "",
        company_name=company_name,
        action=action,
        description=description,
    )
