"""
Libère la plage de logins EMP1…EMPX détenue par Africa Insurance Group, au
profit d'un autre jeu de démo (`seed_sunu_bank_senegal`) : `generated_login`
est unique sur toute la plateforme, pas par entreprise.

Chaque compte EMP<n> d'Africa Insurance Group devient AIG<n>, login et email
technique (`aig<n>@africa-insurance-group.pmc.local`). Rien d'autre ne
change : nom, poste, mot de passe, rattachement, évaluations et état
actif/bloqué sont conservés.

Idempotent : un compte déjà renommé n'est plus trouvé, donc plus touché.

Usage:
    python manage.py rename_aig_emp_accounts
    python manage.py rename_aig_emp_accounts --dry-run
"""
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User

COMPANY_NAME = "Africa Insurance Group"
OLD_PREFIX, NEW_PREFIX = "EMP", "AIG"
LOGIN = re.compile(rf"^{OLD_PREFIX}(\d+)$", re.IGNORECASE)


class Command(BaseCommand):
    help = "Renomme les logins EMP1…EMPX d'Africa Insurance Group en AIG1…AIGX."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait fait, sans rien écrire.")

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options["dry_run"]
        try:
            company = Company.objects.get(name=COMPANY_NAME)
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {COMPANY_NAME} » introuvable.")

        changed = 0
        users = User.objects.filter(company=company, generated_login__istartswith=OLD_PREFIX).order_by("id")
        for user in users:
            match = LOGIN.match(user.generated_login)
            if not match:
                continue
            login = f"{NEW_PREFIX}{match.group(1)}"
            email = f"{login.lower()}@{company.slug}.pmc.local"
            # Contrôle avant d'écrire : la contrainte d'unicité répondrait par
            # une erreur d'intégrité qui ne dit pas quel compte gêne.
            taken = User.objects.exclude(pk=user.pk).filter(generated_login__iexact=login).first()
            if taken is None:
                taken = User.objects.exclude(pk=user.pk).filter(email__iexact=email).first()
            if taken is not None:
                raise CommandError(f"{user.generated_login} ne peut pas devenir {login} : déjà pris par {taken.email}.")
            self.stdout.write(f"  {user.generated_login} → {login}  ({user.get_full_name()})")
            changed += 1
            if dry:
                continue
            user.generated_login = login
            user.email = email
            user.save(update_fields=["generated_login", "email"])

        self.stdout.write(self.style.SUCCESS(f"{changed} compte(s) {'à renommer' if dry else 'renommé(s)'}."))
