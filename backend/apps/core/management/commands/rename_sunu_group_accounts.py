"""
Remplace le nom et le prénom générés des comptes de la direction SUNU Group
(logins SUNU1…SUNUX) par leur login : le collaborateur SUNU7 s'affiche « SUNU7 ».

Idempotent : un compte déjà nommé comme son login est laissé tel quel.
Ne touche ni au login, ni au mot de passe, ni à l'avatar.
"""
import re

from django.core.management.base import BaseCommand

from apps.core.models import User

LOGIN = re.compile(r"^SUNU\d+$", re.IGNORECASE)


class Command(BaseCommand):
    help = "Nomme les comptes SUNU1…SUNUX de la direction SUNU Group d'après leur login."

    def handle(self, *args, **options):
        changed = 0
        users = User.objects.filter(department__name__iexact="SUNU Group").exclude(generated_login="")
        for user in users:
            login = user.generated_login
            if not LOGIN.match(login):
                continue
            name = login.upper()
            if user.first_name == name and user.last_name == "":
                continue
            user.first_name = name
            user.last_name = ""
            user.save(update_fields=["first_name", "last_name"])
            changed += 1
        self.stdout.write(self.style.SUCCESS(f"{changed} compte(s) renommé(s)."))
