"""
Désigne les participants de la séance du 360° Feedforward d'une campagne :
les rapports (global, individuels, archives) ne porteront alors que sur eux et
sur les contributions qu'ils ont échangées entre eux, et leurs pourcentages
seront calculés sur eux. `--clear` rend aux rapports toute l'entreprise.

Usage:
    python manage.py set_feedforward_participants --company "SOCIUM" --campaign "Semestre 1 2026" --logins CEOSOC EMP1 EMP2
    python manage.py set_feedforward_participants --company "SOCIUM" --campaign "Semestre 1 2026" --clear
"""
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Company, User
from apps.evaluations.models import EvaluationCampaign


class Command(BaseCommand):
    help = "Participants de la séance du 360° Feedforward d'une campagne (périmètre des rapports)."

    def add_arguments(self, parser):
        parser.add_argument("--company", required=True)
        parser.add_argument("--campaign", required=True)
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--logins", nargs="+", help="Identifiants des participants.")
        group.add_argument("--clear", action="store_true", help="Revenir à toute l'entreprise.")

    def handle(self, *args, **options):
        company = Company.objects.filter(name=options["company"]).first()
        if company is None:
            raise CommandError(f"Entreprise « {options['company']} » introuvable.")
        campaign = EvaluationCampaign.objects.filter(company=company, name=options["campaign"]).first()
        if campaign is None:
            raise CommandError(f"Campagne « {options['campaign']} » introuvable chez {company.name}.")
        if options["clear"]:
            campaign.feedforward_participants = []
            campaign.save(update_fields=["feedforward_participants"])
            self.stdout.write(self.style.SUCCESS(f"{company.name} · {campaign.name} : les rapports portent de nouveau sur toute l'entreprise."))
            return
        wanted = {login.upper() for login in options["logins"]}
        users = {u.generated_login.upper(): u for u in User.objects.filter(company=company) if u.generated_login.upper() in wanted}
        missing = sorted(wanted - set(users))
        if missing:
            raise CommandError(f"Identifiants introuvables chez {company.name} : {', '.join(missing)}.")
        campaign.feedforward_participants = sorted(u.id for u in users.values())
        campaign.save(update_fields=["feedforward_participants"])
        self.stdout.write(self.style.SUCCESS(f"{company.name} · {campaign.name} : {len(users)} participants à la séance."))
        for login in sorted(users, key=lambda k: users[k].get_full_name()):
            self.stdout.write(f"  {login} — {users[login].get_full_name()}")
