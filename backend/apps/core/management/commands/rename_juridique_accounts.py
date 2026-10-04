"""
Remplace le prénom et le nom des juristes de la Direction Juridique Groupe
d'Africa Insurance Group (logins JUR1…JURX) par leur login : le juriste JUR7
s'affiche « JUR7 JUR7 », comme les comptes génériques JUR11…JUR30.

Idempotent : un compte déjà nommé comme son login est laissé tel quel.
Ne touche ni au login, ni au mot de passe, ni au poste, ni à la photo, ni à la
directrice (DIR14). `seed_africa_insurance_group_juridique` remet les noms
d'origine de JUR1…JUR10 : relancer cette commande après lui.

Usage:
    python manage.py rename_juridique_accounts
    python manage.py rename_juridique_accounts --dry-run
"""
import re

from django.core.management.base import BaseCommand

from apps.core.models import User

COMPANY_NAME = "Africa Insurance Group"
DEPT_CODE = "DJG"
LOGIN = re.compile(r"^JUR(\d+)$", re.IGNORECASE)


class Command(BaseCommand):
    help = "Nomme les comptes JUR1…JURX de la Direction Juridique Groupe d'après leur login."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Annonce ce qui serait fait, sans rien écrire.")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        if dry:
            self.stdout.write(self.style.WARNING("Essai à blanc : rien n'est écrit."))
        users = User.objects.filter(company__name=COMPANY_NAME, department__code=DEPT_CODE)
        jurists = sorted(
            (u for u in users if LOGIN.match(u.generated_login)),
            key=lambda u: int(LOGIN.match(u.generated_login).group(1)),
        )
        changed = 0
        for user in jurists:
            name = user.generated_login.upper()
            if user.first_name == name and user.last_name == name:
                continue
            self.stdout.write(f"  {name} : {user.get_full_name()} → {name} {name}")
            changed += 1
            if dry:
                continue
            user.first_name = name
            user.last_name = name
            user.save(update_fields=["first_name", "last_name"])
        self.stdout.write(self.style.SUCCESS(
            f"{changed} compte(s) {'à renommer' if dry else 'renommé(s)'} sur {len(jurists)} juriste(s)."
        ))
