"""
Génère une photo de profil (cercle coloré + initiales) pour tout utilisateur
qui n'en a pas encore — utile pour les comptes créés avant l'ajout de la
génération automatique d'avatars, ou créés manuellement sans photo.

Usage: python manage.py backfill_avatars
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.avatar_utils import make_avatar_file
from apps.core.models import User


class Command(BaseCommand):
    help = "Génère une photo de profil pour les utilisateurs qui n'en ont pas."

    @transaction.atomic
    def handle(self, *args, **options):
        users = User.objects.filter(avatar="") | User.objects.filter(avatar__isnull=True)
        count = 0
        for user in users.distinct():
            first = user.first_name or user.email[:1]
            last = user.last_name or ""
            initials = f"{first[0]}{last[0] if last else ''}".upper() or "?"
            seed = user.generated_login or user.email.split("@")[0]
            user.avatar.save(f"{seed}.png", make_avatar_file(seed, initials), save=True)
            count += 1
            self.stdout.write(f"  → {user.email}: photo générée ({initials}).")

        self.stdout.write(self.style.SUCCESS(f"Terminé. {count} photo(s) générée(s)."))
