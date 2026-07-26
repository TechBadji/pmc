"""Utilitaires de normalisation : slugs d'entreprise et logins générés."""
import re
import unicodedata


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(c for c in normalized if not unicodedata.combining(c))


def slugify_company(name: str) -> str:
    slug = strip_accents(name).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug or "entreprise"


def make_login(first_name: str, last_name: str) -> str:
    """Ex: Elias Badji -> ebadji (première lettre du prénom + nom)."""
    first = strip_accents(first_name or "").strip()
    last = strip_accents(last_name or "").strip()
    login = f"{first[:1]}{last}".lower()
    login = re.sub(r"[^a-z0-9]", "", login)
    return login or "user"


def unique_login(base_login: str, existing_logins: set[str]) -> str:
    """Ajoute un suffixe numérique si le login existe déjà (ebadji, ebadji2, …)."""
    if base_login not in existing_logins:
        return base_login
    suffix = 2
    while f"{base_login}{suffix}" in existing_logins:
        suffix += 1
    return f"{base_login}{suffix}"
