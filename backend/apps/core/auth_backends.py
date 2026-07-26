"""Backend d'authentification acceptant soit l'email, soit l'identifiant
généré (`generated_login`, ex. "ebadji") — les comptes créés automatiquement
(admin d'entreprise, chargement CSV) reçoivent un email technique interne
(`<login>@<slug>.pmc.local`) jamais communiqué à l'utilisateur ; seul le
login court est censé être saisi pour se connecter."""
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

from .models import User


class EmailOrLoginBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = username or kwargs.get(User.USERNAME_FIELD)
        if identifier is None or password is None:
            return None
        try:
            user = User.objects.get(
                Q(email__iexact=identifier) | Q(generated_login__iexact=identifier)
            )
        except (User.DoesNotExist, User.MultipleObjectsReturned):
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
