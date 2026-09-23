"""Pays d'origine d'une adresse IP, lu dans la base MaxMind GeoLite2
embarquée dans l'image (`GEOIP_COUNTRY_DB`).

La base est facultative : si elle est absente (développement local, build
sans clé de licence MaxMind), la résolution renvoie simplement un pays vide
— l'adresse IP, elle, est journalisée dans tous les cas."""
import ipaddress
import logging
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _reader():
    path = getattr(settings, "GEOIP_COUNTRY_DB", "")
    if not path:
        return None
    try:
        import geoip2.database

        return geoip2.database.Reader(path)
    except Exception:  # base absente ou illisible : on s'en passe
        logger.info("Base GeoLite2 indisponible (%s) : pays non résolu.", path)
        return None


@lru_cache(maxsize=2048)
def country_for_ip(ip):
    """(code ISO, nom) du pays, ou ("", "") si inconnu. Le cache évite de
    relire la base pour une même IP à chaque événement journalisé."""
    if not ip:
        return "", ""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return "", ""
    # Une IP privée (proxy interne, réseau Docker) n'a pas de pays : le dire
    # explicitement vaut mieux qu'un blanc qu'on prendrait pour une panne.
    if address.is_private or address.is_loopback:
        return "", "Réseau local"
    reader = _reader()
    if reader is None:
        return "", ""
    try:
        country = reader.country(ip).country
        return country.iso_code or "", country.name or ""
    except Exception:
        return "", ""
