"""
Purge les entrées du journal d'audit (AuditLog) plus anciennes que la
période de rétention — sans quoi la table grossit indéfiniment.

Avant suppression, les lignes concernées sont archivées en CSV (même
format que l'export manuel de la page Logs) sous MEDIA_ROOT/audit_archives/,
sur le volume Docker déjà monté et persistant entre les déploiements — la
purge dégage la table active sans perdre l'historique.

Usage:
    python manage.py purge_audit_logs                  # rétention 12 mois, exécute
    python manage.py purge_audit_logs --dry-run         # affiche ce qui serait purgé
    python manage.py purge_audit_logs --months 6        # rétention personnalisée
    python manage.py purge_audit_logs --no-archive      # supprime sans archiver (déconseillé)

Prévu pour tourner une fois par mois via une tâche planifiée (cron côté
serveur, en dehors de ce dépôt — le nom du conteneur change à chaque
déploiement, la commande cron résout donc le conteneur courant à chaque
exécution plutôt que de le coder en dur).
"""
import csv
import os
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.models import AuditLog


class Command(BaseCommand):
    help = "Purge les entrées du journal d'audit plus anciennes que la période de rétention (archivage CSV par défaut)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--months", type=int, default=12,
            help="Rétention en mois (défaut : 12) — les entrées plus anciennes sont purgées.",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="N'écrit ni ne supprime rien : affiche seulement ce qui serait purgé.",
        )
        parser.add_argument(
            "--no-archive", action="store_true",
            help="Supprime sans écrire d'archive CSV au préalable (déconseillé).",
        )

    def handle(self, *args, **options):
        months = options["months"]
        if months < 1:
            self.stderr.write(self.style.ERROR("La rétention doit être d'au moins 1 mois."))
            return

        cutoff = timezone.now() - timedelta(days=30 * months)
        queryset = AuditLog.objects.filter(created_at__lt=cutoff).order_by("created_at")
        count = queryset.count()

        if count == 0:
            self.stdout.write(f"Rien à purger (aucune entrée avant le {cutoff:%Y-%m-%d}).")
            return

        if options["dry_run"]:
            self.stdout.write(
                f"[dry-run] {count} entrée(s) seraient purgées (antérieures au {cutoff:%Y-%m-%d})."
            )
            return

        archive_path = None
        if not options["no_archive"]:
            archive_path = self._write_archive(queryset, cutoff)

        deleted, _ = queryset.delete()
        message = f"{deleted} entrée(s) purgée(s) (antérieures au {cutoff:%Y-%m-%d})."
        if archive_path:
            message += f" Archivées dans {archive_path}."
        self.stdout.write(self.style.SUCCESS(message))

    @staticmethod
    def _write_archive(queryset, cutoff):
        archive_dir = os.path.join(settings.MEDIA_ROOT, "audit_archives")
        os.makedirs(archive_dir, exist_ok=True)
        filename = f"audit-log-purge-{timezone.now():%Y%m%d-%H%M%S}.csv"
        path = os.path.join(archive_dir, filename)
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Date", "Auteur", "Rôle", "Entreprise", "Type d'événement", "Description"])
            for log in queryset.iterator():
                writer.writerow([
                    timezone.localtime(log.created_at).strftime("%Y-%m-%d %H:%M:%S"),
                    log.actor_name,
                    log.actor_role,
                    log.company_name,
                    log.action,
                    log.description,
                ])
        return path
