"""Double authentification par e-mail : après un mot de passe correct, un code
à 6 chiffres est envoyé à l'adresse du compte ; la connexion n'est accordée
qu'à la saisie de ce code."""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import LoginChallenge, has_real_email

logger = logging.getLogger(__name__)


def two_factor_applies(user) -> bool:
    company = getattr(user, "company", None)
    return company is not None and company.two_factor_enabled


def email_sending_ready() -> bool:
    """Il faut un serveur SMTP configuré, sinon personne ne recevrait son code.
    En local seulement, TWO_FACTOR_CONSOLE_EMAIL=1 accepte l'affichage des
    e-mails dans les logs (jamais déduit de DEBUG, qui vaut 1 par défaut)."""
    return bool(settings.EMAIL_HOST) or settings.TWO_FACTOR_CONSOLE_EMAIL


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    visible = local[:2] if len(local) > 3 else local[:1]
    return f"{visible}{'•' * max(3, len(local) - len(visible))}@{domain}"


def _hash(code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def _send(user, code: str) -> None:
    minutes = LoginChallenge.LIFETIME_MINUTES
    name = user.first_name or user.get_full_name() or ""
    send_mail(
        subject=f"Votre code de connexion : {code}",
        message=(
            f"Bonjour {name},\n\n"
            f"Voici votre code de connexion à la plateforme ID-PMC : {code}\n\n"
            f"Il est valable {minutes} minutes et ne peut servir qu'une fois.\n"
            "Si vous n'êtes pas à l'origine de cette connexion, ignorez ce message "
            "et prévenez votre administrateur : quelqu'un connaît votre mot de passe.\n"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def _new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def start_challenge(user) -> LoginChallenge:
    """Crée un code, l'envoie, et invalide les codes précédents du compte.
    Lève une exception si l'envoi échoue (l'appelant explique l'échec)."""
    now = timezone.now()
    LoginChallenge.objects.filter(user=user, used=False).update(used=True)
    code = _new_code()
    challenge = LoginChallenge.objects.create(
        user=user,
        token=secrets.token_urlsafe(32),
        code_hash=_hash(code),
        expires_at=now + timedelta(minutes=LoginChallenge.LIFETIME_MINUTES),
        sent_at=now,
    )
    _send(user, code)
    return challenge


def resend(challenge: LoginChallenge) -> None:
    now = timezone.now()
    code = _new_code()
    challenge.code_hash = _hash(code)
    challenge.attempts = 0
    challenge.sent_at = now
    challenge.expires_at = now + timedelta(minutes=LoginChallenge.LIFETIME_MINUTES)
    challenge.save(update_fields=["code_hash", "attempts", "sent_at", "expires_at"])
    _send(challenge.user, code)


def dev_code() -> str:
    """Code de développement accepté pour tous (vide hors phase de développement)."""
    code = getattr(settings, "TWO_FACTOR_DEV_CODE", "")
    return code if len(code) == 6 and code.isdigit() else ""


def code_matches(challenge: LoginChallenge, code: str) -> bool:
    dev = dev_code()
    if dev and hmac.compare_digest(dev, code):
        return True
    return hmac.compare_digest(challenge.code_hash, _hash(code))


def pending_response(challenge: LoginChallenge) -> dict:
    return {
        "two_factor_required": True,
        "challenge": challenge.token,
        "email_hint": mask_email(challenge.user.email),
        "expires_in": LoginChallenge.LIFETIME_MINUTES * 60,
        "resend_after": LoginChallenge.RESEND_COOLDOWN_SECONDS,
        # Affiché dans la fenêtre de saisie tant que la phase de développement dure.
        "dev_code": dev_code() or None,
    }


def user_has_deliverable_email(user) -> bool:
    return has_real_email(user)
