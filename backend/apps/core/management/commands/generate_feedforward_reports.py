"""
Produit l'archive des rapports 360° Feedforward d'une campagne — le rapport
global et un rapport Round 1 par personne ayant reçu au moins une
contribution — et la range parmi les archives que le super administrateur
télécharge depuis la page Rapports. Rien d'autre n'est écrit.

Usage:
    python manage.py generate_feedforward_reports --company "SOCIUM" --campaign "Semestre 1 2026"
"""
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Company
from apps.evaluations.feedforward_report import generate_archive
from apps.evaluations.models import EvaluationCampaign, ReportArchive


class Command(BaseCommand):
    help = "Archive des rapports 360° Feedforward (global + individuels) d'une campagne, pour le super administrateur."

    def add_arguments(self, parser):
        parser.add_argument("--company", required=True, help="Nom de l'entreprise.")
        parser.add_argument("--campaign", required=True, help="Nom de la campagne.")

    def handle(self, *args, **options):
        company = Company.objects.filter(name=options["company"]).first()
        if company is None:
            raise CommandError(f"Entreprise « {options['company']} » introuvable.")
        campaign = EvaluationCampaign.objects.filter(company=company, name=options["campaign"]).first()
        if campaign is None:
            names = ", ".join(EvaluationCampaign.objects.filter(company=company).values_list("name", flat=True))
            raise CommandError(f"Campagne « {options['campaign']} » introuvable chez {company.name}. Campagnes : {names}.")
        record = ReportArchive.objects.create(company=company, campaign=campaign)
        generate_archive(record.id)
        record.refresh_from_db()
        if record.status != ReportArchive.Status.READY:
            raise CommandError(f"Échec : {record.error}")
        self.stdout.write(self.style.SUCCESS(
            f"Archive n°{record.id} prête : {record.filename} — 1 rapport global + {record.individual_count} rapport(s) "
            f"individuel(s), {record.size // 1024} Ko. Sans rapport individuel : {len(record.skipped)} personne(s)."
        ))
