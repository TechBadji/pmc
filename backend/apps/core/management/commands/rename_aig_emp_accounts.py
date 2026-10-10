"""
Libère la plage de logins EMP1…EMPX détenue par Africa Insurance Group, au
profit d'un autre jeu de démo (`seed_sunu_bank_senegal`) : `generated_login`
est unique sur toute la plateforme, pas par entreprise.

Chaque compte EMP<n> d'Africa Insurance Group devient AIG<n>, login et email
technique (`aig<n>@africa-insurance-group.pmc.local`). Rien d'autre ne
change : nom, poste, mot de passe, rattachement, évaluations et état
actif/bloqué sont conservés.

Même besoin pour les directeurs : `--old-prefix DIR --new-prefix AIGDIR
--up-to 5` libère DIR1…DIR5 (AIGDIR1…AIGDIR5) sans toucher à DIR6 et suivants.

`--company` vise une autre entreprise de démo : `--company "SUNU Bank Sénégal"
--new-prefix SBS` libère EMP1…EMP70 (SBS1…SBS70) au profit de `seed_socium`.

Idempotent : un compte déjà renommé n'est plus trouvé, donc plus touché.

Usage:
    python manage.py rename_aig_emp_accounts
    python manage.py rename_aig_emp_accounts --dry-run
    python manage.py rename_aig_emp_accounts --old-prefix DIR --new-prefix AIGDIR --up-to 5
    python manage.py rename_aig_emp_accounts --company "SUNU Bank Sénégal" --new-prefix SBS
"""
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Company, User

COMPANY_NAME = "Africa Insurance Group"
OLD_PREFIX, NEW_PREFIX = "EMP", "AIG"


class Command(BaseCommand):
    help = "Renomme les logins EMP1…EMPX d'Africa Insurance Group en AIG1…AIGX (préfixes réglables)."

    def add_arguments(self, parser):
        parser.add_argument("--company", default=COMPANY_NAME, help=f"Entreprise dont les logins sont renommés (défaut : {COMPANY_NAME}).")
        parser.add_argument("--old-prefix", default=OLD_PREFIX, help="Préfixe des logins à libérer (défaut : EMP).")
        parser.add_argument("--new-prefix", default=NEW_PREFIX, help="Préfixe de remplacement (défaut : AIG).")
        parser.add_argument("--up-to", type=int, help="Ne renomme que les numéros 1 à N ; tous par défaut.")
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait fait, sans rien écrire.")

    @transaction.atomic
    def handle(self, *args, **options):
        dry = options["dry_run"]
        old_prefix, new_prefix, up_to = options["old_prefix"], options["new_prefix"], options["up_to"]
        if not old_prefix.isalpha() or not new_prefix.isalpha():
            raise CommandError("Les préfixes ne doivent contenir que des lettres.")
        if up_to is not None and up_to < 1:
            raise CommandError("--up-to attend un nombre supérieur ou égal à 1.")
        pattern = re.compile(rf"^{old_prefix}(\d+)$", re.IGNORECASE)
        try:
            company = Company.objects.get(name=options["company"])
        except Company.DoesNotExist:
            raise CommandError(f"Entreprise « {options['company']} » introuvable.")

        changed = 0
        users = User.objects.filter(company=company, generated_login__istartswith=old_prefix).order_by("id")
        for user in users:
            match = pattern.match(user.generated_login)
            if not match or (up_to is not None and int(match.group(1)) > up_to):
                continue
            login = f"{new_prefix}{match.group(1)}"
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
