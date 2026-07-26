"""Génération de photos de profil simples (cercle coloré + initiales) pour
les comptes qui n'ont pas encore de vraie photo — utilisé par les scripts de
seed et par le backfill des comptes créés avant l'ajout de cette fonctionnalité."""
import hashlib
import io

from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

AVATAR_COLORS = [
    "#2E8FCB", "#B23FA0", "#E08A34", "#4caf50", "#d03b3b", "#7b5ea7",
    "#00897b", "#c2185b", "#5d4037", "#455a64",
]


def make_avatar_file(seed_name: str, initials: str) -> ContentFile:
    """Génère une photo de profil simple (cercle coloré + initiales)."""
    color_index = int(hashlib.md5(seed_name.encode()).hexdigest(), 16) % len(AVATAR_COLORS)
    bg_color = AVATAR_COLORS[color_index]

    size = 320
    img = Image.new("RGB", (size, size), bg_color)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, size=int(size * 0.4))
    bbox = draw.textbbox((0, 0), initials, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((size - text_w) / 2 - bbox[0], (size - text_h) / 2 - bbox[1]),
        initials,
        font=font,
        fill="white",
    )
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return ContentFile(buffer.getvalue(), name=f"{seed_name}.png")
