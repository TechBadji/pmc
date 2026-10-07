"""
Fin de démo « SUNU Bank Sénégal » : bloque tous les comptes de l'entreprise
(CEO CEOSBS, DIR1…DIR10 et EMP1…EMP70), dont les identifiants et le mot de passe sont
devinables. Un compte bloqué (`is_active=False`) ne peut plus se connecter ;
ses données sont conservées.

`--unblock` rouvre les comptes pour une nouvelle démo.

Idempotent : un compte déjà dans l'état voulu est laissé tel quel.

Usage:
    python manage.py block_sunu_bank_senegal_accounts
    python manage.py block_sunu_bank_senegal_accounts --unblock
    python manage.py block_sunu_bank_senegal_accounts --dry-run
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company

COMPANY_NAME = "SUNU Bank Sénégal"


class Command(BaseCommand):
    help = "Bloque (ou rouvre avec --unblock) tous les comptes de SUNU Bank Sénégal."

    def add_arguments(self, parser):
        parser.add_argument("--unblock", action="store_true", help="Rouvre les comptes au lieu de les bloquer.")
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait fait, sans rien écrire.")

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options["dry_run"]
        active = options["unblock"]
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")

        users = company.users.filter(is_active=not active)
        count = users.count()
        if not dry:
            users.update(is_active=active)
        if dry:
            action = "à rouvrir" if active else "à bloquer"
        else:
            action = "rouvert(s)" if active else "bloqué(s)"
        self.stdout.write(self.style.SUCCESS(
            f"{count} compte(s) {action} sur {company.users.count()} — {company.name}."
        ))
