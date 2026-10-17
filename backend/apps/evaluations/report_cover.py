"""
Page de garde des rapports PDF : logo du cabinet, illustration vectorielle
d'un environnement de travail (une équipe en réunion dans un bureau ouvert
sur la ville, un écran qui affiche un anneau à 360°) et bloc de titre.

Tout est dessiné en vectoriel avec ReportLab, aux couleurs du logo : rien à
télécharger, une netteté parfaite à l'impression et un fichier léger.
"""
import math
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader

ASSETS = Path(__file__).resolve().parent / "report_assets"
LOGO = ASSETS / "logo-pmc.png"

# Couleurs du logo (relevées sur le fichier fourni) et tons d'accompagnement.
ORANGE = colors.HexColor("#D1843F")
BLUE = colors.HexColor("#4997D0")
MAGENTA = colors.HexColor("#B433B6")
PURPLE = colors.HexColor("#8E2A90")
TEAL = colors.HexColor("#17A89E")
NAVY = colors.HexColor("#14213D")
INK = colors.HexColor("#1F2A44")
GREY = colors.HexColor("#6B7280")
WHITE = colors.white

SKIN = [colors.HexColor(c) for c in ("#8D5524", "#6B3E26", "#A86B3C", "#5A3420", "#C08A5B")]
HAIR = colors.HexColor("#1E140F")


def logo_size(width):
    """Hauteur du logo pour une largeur donnée, proportions du fichier conservées."""
    image = ImageReader(str(LOGO))
    w, h = image.getSize()
    return width * h / w


def draw_logo(c, x, y, width):
    """Logo posé par son coin inférieur gauche ; son fond est blanc, il se pose sur du blanc."""
    c.drawImage(str(LOGO), x, y, width=width, height=logo_size(width), mask="auto")


# ---------------------------------------------------------------------------
# Petits outils de dessin
# ---------------------------------------------------------------------------
def _fill(c, color, alpha=1.0):
    c.setFillColor(color)
    c.setFillAlpha(alpha)


def _round_rect(c, x, y, w, h, r, color, alpha=1.0):
    _fill(c, color, alpha)
    c.roundRect(x, y, w, h, r, stroke=0, fill=1)


def _circle(c, x, y, r, color, alpha=1.0):
    _fill(c, color, alpha)
    c.circle(x, y, r, stroke=0, fill=1)


def _ellipse(c, cx, cy, rx, ry, color, alpha=1.0, angle=0):
    c.saveState()
    c.translate(cx, cy)
    c.rotate(angle)
    _fill(c, color, alpha)
    c.ellipse(-rx, -ry, rx, ry, stroke=0, fill=1)
    c.restoreState()


def _polygon(c, points, color, alpha=1.0):
    _fill(c, color, alpha)
    path = c.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    path.close()
    c.drawPath(path, stroke=0, fill=1)


def _gradient_rect(c, x, y, w, h, top, bottom, radius=0):
    c.saveState()
    path = c.beginPath()
    if radius:
        path.roundRect(x, y, w, h, radius)
    else:
        path.rect(x, y, w, h)
    c.clipPath(path, stroke=0, fill=0)
    c.linearGradient(x, y + h, x, y, (top, bottom), extend=False)
    c.restoreState()


def _shade(color, factor):
    """Assombrit (factor < 1) ou éclaircit (factor > 1) une couleur."""
    r, g, b = color.red, color.green, color.blue
    if factor < 1:
        return colors.Color(r * factor, g * factor, b * factor)
    k = factor - 1
    return colors.Color(r + (1 - r) * k, g + (1 - g) * k, b + (1 - b) * k)


# ---------------------------------------------------------------------------
# Personnages
# ---------------------------------------------------------------------------
def _cap(c, cx, cy, r, color, top=0.78, depth=0.6):
    """Chevelure sur le dessus du crâne, découpée à la forme de la tête."""
    c.saveState()
    path = c.beginPath()
    path.circle(cx, cy, r * 1.04)
    c.clipPath(path, stroke=0, fill=0)
    _ellipse(c, cx, cy + r * top, r * 1.12, r * depth, color)
    c.restoreState()


def _hair(c, cx, cy, r, style, color):
    if style == "short":
        _cap(c, cx, cy, r, color, top=0.8, depth=0.55)
    elif style == "curly":
        _cap(c, cx, cy, r, color, top=0.75, depth=0.55)
        for angle in range(15, 170, 25):
            a = math.radians(angle)
            _circle(c, cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 0.92, r * 0.34, color)
    elif style == "bun":
        _circle(c, cx, cy + r * 1.22, r * 0.44, color)
        _cap(c, cx, cy, r, color, top=0.82, depth=0.55)
    elif style == "wrap":  # foulard noué, très porté en Afrique de l'Ouest
        _ellipse(c, cx, cy + r * 0.86, r * 1.16, r * 0.6, ORANGE)
        _ellipse(c, cx, cy + r * 1.22, r * 0.86, r * 0.42, _shade(ORANGE, 1.15))
        _ellipse(c, cx + r * 0.95, cy + r * 1.15, r * 0.4, r * 0.26, _shade(ORANGE, 0.85), angle=30)
    elif style == "long":
        _cap(c, cx, cy, r, color, top=0.78, depth=0.58)


def _head(c, cx, cy, r, skin, hair_style):
    if hair_style == "long":  # cheveux longs : derrière la tête, jusqu'aux épaules
        _round_rect(c, cx - r * 1.12, cy - r * 1.55, r * 2.24, r * 2.3, r * 0.95, HAIR)
    _round_rect(c, cx - r * 0.32, cy - r * 1.5, r * 0.64, r * 0.8, r * 0.2, _shade(skin, 0.9))  # cou
    _circle(c, cx, cy, r, skin)
    _ellipse(c, cx - r * 0.98, cy - r * 0.05, r * 0.16, r * 0.24, _shade(skin, 0.92))  # oreilles
    _ellipse(c, cx + r * 0.98, cy - r * 0.05, r * 0.16, r * 0.24, _shade(skin, 0.92))
    _hair(c, cx, cy, r, hair_style, HAIR)


def _torso(c, cx, base, width, height, color, collar=WHITE):
    """Buste aux épaules arrondies, posé sur `base` (bord de la table)."""
    half = width / 2
    path = c.beginPath()
    path.moveTo(cx - half * 0.86, base)
    path.lineTo(cx - half, base + height * 0.62)
    path.curveTo(cx - half, base + height * 0.98, cx - half * 0.72, base + height, cx - half * 0.42, base + height)
    path.lineTo(cx + half * 0.42, base + height)
    path.curveTo(cx + half * 0.72, base + height, cx + half, base + height * 0.98, cx + half, base + height * 0.62)
    path.lineTo(cx + half * 0.86, base)
    path.close()
    _fill(c, color)
    c.drawPath(path, stroke=0, fill=1)
    # col en V, qui laisse voir la chemise
    _polygon(c, [(cx - half * 0.2, base + height), (cx + half * 0.2, base + height), (cx, base + height * 0.62)], collar)
    _polygon(c, [(cx - half * 0.2, base + height), (cx - half * 0.05, base + height), (cx, base + height * 0.62)], _shade(color, 0.82), 0.9)
    _polygon(c, [(cx + half * 0.2, base + height), (cx + half * 0.05, base + height), (cx, base + height * 0.62)], _shade(color, 0.82), 0.9)


def seated_person(c, cx, table_y, scale, shirt, skin, hair_style, chair=colors.HexColor("#3A4766")):
    """Une personne assise derrière la table, vue de face : dossier, buste, tête.
    Les bras et l'ordinateur se dessinent après le plateau (voir `seated_arms`)."""
    s = scale
    _round_rect(c, cx - 11.5 * s, table_y - 2 * s, 23 * s, 31 * s, 5 * s, chair)
    _torso(c, cx, table_y - 4 * s, 27 * s, 22 * s, shirt)
    _head(c, cx, table_y + 25.5 * s, 6.4 * s, skin, hair_style)


def seated_arms(c, cx, table_y, scale, shirt, skin, laptop=True):
    s = scale
    for side in (-1, 1):
        _round_rect(c, cx + side * 6.5 * s - 6 * s, table_y - 0.5 * s, 12 * s, 4.6 * s, 2.3 * s, _shade(shirt, 0.9))
        _circle(c, cx + side * 1.2 * s, table_y + 1.8 * s, 2.3 * s, skin)
    if laptop:
        # dos de l'écran de l'ordinateur, tourné vers nous
        _polygon(c, [(cx - 6.5 * s, table_y), (cx + 6.5 * s, table_y), (cx + 5.8 * s, table_y + 8 * s), (cx - 5.8 * s, table_y + 8 * s)], colors.HexColor("#D9E1EA"))
        _polygon(c, [(cx - 6.5 * s, table_y), (cx + 6.5 * s, table_y), (cx + 6.2 * s, table_y + 1 * s), (cx - 6.2 * s, table_y + 1 * s)], colors.HexColor("#B8C4D2"))
        _circle(c, cx, table_y + 4.6 * s, 0.9 * s, WHITE, 0.9)


def standing_person(c, cx, floor_y, scale, jacket, skin, hair_style, pointing_to=None):
    """Une personne debout qui présente, le bras tendu vers `pointing_to` (x, y)."""
    s = scale
    trousers = colors.HexColor("#26324F")
    _round_rect(c, cx - 6.2 * s, floor_y, 5.6 * s, 34 * s, 2.4 * s, trousers)  # jambes
    _round_rect(c, cx + 0.6 * s, floor_y, 5.6 * s, 34 * s, 2.4 * s, trousers)
    _round_rect(c, cx - 7.6 * s, floor_y - 1 * s, 7.6 * s, 3 * s, 1.4 * s, INK)  # chaussures
    _round_rect(c, cx + 0.2 * s, floor_y - 1 * s, 7.6 * s, 3 * s, 1.4 * s, INK)
    _torso(c, cx, floor_y + 31 * s, 24 * s, 26 * s, jacket)
    _head(c, cx, floor_y + 64 * s, 6.4 * s, skin, hair_style)
    # bras gauche le long du corps
    _round_rect(c, cx - 14 * s, floor_y + 33 * s, 4.6 * s, 22 * s, 2.3 * s, _shade(jacket, 0.88))
    _circle(c, cx - 11.7 * s, floor_y + 32.5 * s, 2.4 * s, skin)
    if pointing_to:
        shoulder = (cx + 10 * s, floor_y + 53 * s)
        angle = math.degrees(math.atan2(pointing_to[1] - shoulder[1], pointing_to[0] - shoulder[0]))
        c.saveState()
        c.translate(*shoulder)
        c.rotate(angle)
        _round_rect(c, -2 * s, -2.3 * s, 24 * s, 4.6 * s, 2.3 * s, _shade(jacket, 0.88))
        _circle(c, 23.5 * s, 0, 2.5 * s, skin)
        c.restoreState()


# ---------------------------------------------------------------------------
# Décor
# ---------------------------------------------------------------------------
def _skyline(c, x, y, w, h):
    """Silhouettes d'immeubles de bureaux, en tons pâles, vues par la baie vitrée."""
    buildings = [  # x relatif, largeur, hauteur (fractions), teinte
        (0.00, 0.10, 0.42, "#C7DCEE"), (0.08, 0.07, 0.62, "#B3CFE8"), (0.15, 0.12, 0.48, "#D3E4F2"),
        (0.26, 0.06, 0.80, "#A9C8E4"), (0.32, 0.10, 0.55, "#C2D8EC"), (0.42, 0.08, 0.70, "#B6D1E9"),
        (0.50, 0.13, 0.40, "#D0E2F1"), (0.62, 0.07, 0.88, "#A3C3E1"), (0.69, 0.10, 0.58, "#C0D7EC"),
        (0.79, 0.08, 0.74, "#B2CEE7"), (0.87, 0.13, 0.46, "#CFE1F1"),
    ]
    for bx, bw, bh, tone in buildings:
        left, width, height = x + bx * w, bw * w, bh * h
        _round_rect(c, left, y, width, height, 0.6 * mm, colors.HexColor(tone))
        cols, rows = max(2, int(width / (3.2 * mm))), max(3, int(height / (4.2 * mm)))
        for i in range(cols):
            for j in range(rows - 1):
                wx = left + (i + 0.5) * width / cols - 0.6 * mm
                wy = y + (j + 0.6) * height / rows
                _round_rect(c, wx, wy, 1.2 * mm, 1.7 * mm, 0.2 * mm, WHITE, 0.55)
    # une grue au loin : la ville qui se construit
    c.setStrokeColor(colors.HexColor("#9DBBD8"))
    c.setStrokeAlpha(0.9)
    c.setLineWidth(0.9)
    cx = x + w * 0.565
    c.line(cx, y, cx, y + h * 0.95)
    c.line(cx - w * 0.04, y + h * 0.95, cx + w * 0.09, y + h * 0.95)
    c.line(cx + w * 0.07, y + h * 0.95, cx + w * 0.07, y + h * 0.82)
    c.setStrokeAlpha(1)


def _plant(c, x, floor_y, scale):
    s = scale
    greens = [colors.HexColor("#2E8B6A"), colors.HexColor("#3FAE84"), colors.HexColor("#257A5C"), colors.HexColor("#52BF93")]
    leaves = ((-11, 26, 52), (11, 27, -52), (-8, 33, 30), (8, 34, -30), (-3, 39, 10), (4, 40, -12), (0, 31, 0), (-13, 20, 70), (13, 21, -70))
    for i, (dx, dy, ang) in enumerate(leaves):
        _ellipse(c, x + dx * s, floor_y + dy * s, 2.6 * s, 7.6 * s, greens[i % 4], angle=ang)
    _polygon(c, [(x - 7.5 * s, floor_y + 17 * s), (x + 7.5 * s, floor_y + 17 * s), (x + 5.6 * s, floor_y), (x - 5.6 * s, floor_y)], ORANGE)
    _round_rect(c, x - 8.5 * s, floor_y + 15.5 * s, 17 * s, 3 * s, 1.2 * s, _shade(ORANGE, 0.85))


def _lamp(c, x, top, length, scale):
    s = scale
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(x, top, x, top - length)
    _fill(c, NAVY)
    path = c.beginPath()
    path.moveTo(x - 7 * s, top - length - 6 * s)
    path.curveTo(x - 7 * s, top - length + 1 * s, x + 7 * s, top - length + 1 * s, x + 7 * s, top - length - 6 * s)
    path.close()
    c.drawPath(path, stroke=0, fill=1)
    _ellipse(c, x, top - length - 6.4 * s, 5 * s, 1.4 * s, colors.HexColor("#FFE7B3"))


def _screen(c, x, y, w, h):
    """Écran mural : un anneau à 360° aux couleurs du logo, des barres, des lignes de texte."""
    _round_rect(c, x - 1.2 * mm, y - 1.2 * mm, w + 2.4 * mm, h + 2.4 * mm, 2.2 * mm, INK)
    _round_rect(c, x, y, w, h, 1.6 * mm, colors.HexColor("#22305A"))
    cx, cy, r = x + w * 0.3, y + h * 0.52, h * 0.32
    start = 90
    for color, share in ((BLUE, 0.34), (ORANGE, 0.26), (MAGENTA, 0.22), (TEAL, 0.18)):
        _fill(c, color)
        c.wedge(cx - r, cy - r, cx + r, cy + r, start, -360 * share + 4, stroke=0, fill=1)
        start -= 360 * share
    _circle(c, cx, cy, r * 0.58, colors.HexColor("#22305A"))
    c.setFillColor(WHITE)
    c.setFillAlpha(1)
    c.setFont("OpenSans-Bold", r * 0.62)
    c.drawCentredString(cx, cy - r * 0.2, "360°")
    for i, (value, color) in enumerate(((0.55, BLUE), (0.85, ORANGE), (0.68, MAGENTA), (0.95, TEAL))):
        bx = x + w * (0.6 + i * 0.09)
        _round_rect(c, bx, y + h * 0.18, w * 0.055, h * 0.62 * value, 0.5 * mm, color)
    for i in range(3):
        _round_rect(c, x + w * 0.6, y + h * (0.86 - i * 0.0), w * (0.32 - i * 0.08), 0.9 * mm, 0.4 * mm, WHITE, 0.0 if i else 0.55)


def _cup(c, x, y, scale, color):
    s = scale
    _polygon(c, [(x - 2.4 * s, y + 5 * s), (x + 2.4 * s, y + 5 * s), (x + 1.9 * s, y), (x - 1.9 * s, y)], color)
    c.setStrokeColor(color)
    c.setLineWidth(0.7 * s)
    c.circle(x + 3 * s, y + 2.8 * s, 1.3 * s, stroke=1, fill=0)


def office_scene(c, x, y, w, h):
    """Une équipe en réunion dans un bureau vitré sur la ville : quatre personnes
    autour de la table, une cinquième qui présente un anneau à 360° à l'écran."""
    c.saveState()
    frame = c.beginPath()
    frame.roundRect(x, y, w, h, 7 * mm)
    c.clipPath(frame, stroke=0, fill=0)

    # mur, baie vitrée, ville
    _gradient_rect(c, x, y, w, h, colors.HexColor("#EAF3FB"), colors.HexColor("#F7FAFD"))
    floor_h = h * 0.2
    win_x, win_y, win_w, win_h = x + w * 0.06, y + floor_h + h * 0.05, w * 0.62, h * 0.62
    _gradient_rect(c, win_x, win_y, win_w, win_h, colors.HexColor("#D2E7F8"), colors.HexColor("#F4F9FD"), radius=2 * mm)
    _circle(c, win_x + win_w * 0.82, win_y + win_h * 0.78, 5.5 * mm, colors.HexColor("#FFE7B3"), 0.85)
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(win_x, win_y, win_w, win_h, 2 * mm)
    c.clipPath(clip, stroke=0, fill=0)
    _skyline(c, win_x, win_y, win_w, win_h * 0.8)
    c.restoreState()
    c.setStrokeColor(WHITE)
    c.setStrokeAlpha(1)
    c.setLineWidth(2.2)
    for k in (1, 2, 3):
        c.line(win_x + win_w * k / 4, win_y, win_x + win_w * k / 4, win_y + win_h)
    c.line(win_x, win_y + win_h * 0.66, win_x + win_w, win_y + win_h * 0.66)
    c.setLineWidth(3)
    c.roundRect(win_x, win_y, win_w, win_h, 2 * mm, stroke=1, fill=0)

    # sol
    _gradient_rect(c, x, y, w, floor_h, colors.HexColor("#ECE4DA"), colors.HexColor("#E2D6C8"))
    _round_rect(c, x, y + floor_h - 0.8 * mm, w, 1.6 * mm, 0, colors.HexColor("#D9CCBC"))

    # lampes suspendues
    top = y + h
    for lx, length in ((0.22, 14 * mm), (0.42, 20 * mm), (0.6, 14 * mm)):
        _lamp(c, x + w * lx, top, length, 0.9 * mm)

    # écran mural
    scr_w, scr_h = w * 0.24, h * 0.3
    scr_x, scr_y = x + w * 0.735, y + floor_h + h * 0.36
    _screen(c, scr_x, scr_y, scr_w, scr_h)

    # plante
    _plant(c, x + w * 0.06, y + floor_h * 0.35, 0.85 * mm)

    # table et équipe
    s = 0.92 * mm
    table_y = y + floor_h + h * 0.13
    table_x0, table_x1 = x + w * 0.1, x + w * 0.66
    people = [
        (0.19, BLUE, SKIN[0], "short"),
        (0.315, MAGENTA, SKIN[2], "wrap"),
        (0.44, TEAL, SKIN[1], "curly"),
        (0.565, ORANGE, SKIN[4], "bun"),
    ]
    for px, shirt, skin, hair in people:
        seated_person(c, x + w * px, table_y, s, shirt, skin, hair)
    # plateau
    _round_rect(c, table_x0, table_y - 3 * mm, table_x1 - table_x0, 5 * mm, 1.6 * mm, colors.HexColor("#C9A27E"))
    _round_rect(c, table_x0 + 1 * mm, table_y + 0.6 * mm, table_x1 - table_x0 - 2 * mm, 1.6 * mm, 0.8 * mm, colors.HexColor("#DDBE9C"))
    for leg_x in (table_x0 + 6 * mm, table_x1 - 8 * mm):
        _round_rect(c, leg_x, y + floor_h * 0.25, 2.4 * mm, table_y - 3 * mm - (y + floor_h * 0.25), 0.6 * mm, colors.HexColor("#A9825F"))
    for px, shirt, skin, hair in people:
        seated_arms(c, x + w * px, table_y + 2 * mm, s, shirt, skin)
    _cup(c, x + w * 0.255, table_y + 2.2 * mm, 0.9 * mm, WHITE)
    _cup(c, x + w * 0.505, table_y + 2.2 * mm, 0.9 * mm, WHITE)
    _round_rect(c, x + w * 0.37, table_y + 2.1 * mm, 7 * mm, 0.9 * mm, 0.3 * mm, WHITE, 0.95)

    # présentatrice devant l'écran
    standing_person(c, x + w * 0.69, y + floor_h * 0.42, 0.95 * mm, PURPLE, SKIN[3], "long",
                    pointing_to=(scr_x + scr_w * 0.06, scr_y + scr_h * 0.3))

    # liens discrets : les regards croisés du 360°
    c.setStrokeColor(BLUE)
    c.setStrokeAlpha(0.35)
    c.setLineWidth(0.8)
    c.setDash(1.2, 2.2)
    heads = [(x + w * px, table_y + 25.5 * s + 9 * mm) for px, *_ in people]
    for (ax, ay), (bx, by) in zip(heads, heads[1:]):
        path = c.beginPath()
        path.moveTo(ax, ay)
        path.curveTo(ax + 6 * mm, ay + 10 * mm, bx - 6 * mm, by + 10 * mm, bx, by)
        c.drawPath(path, stroke=1, fill=0)
    c.setDash()
    c.setStrokeAlpha(1)
    for (hx, hy), color in zip(heads, (BLUE, MAGENTA, TEAL, ORANGE)):
        _circle(c, hx, hy, 1.1 * mm, color, 0.9)

    # touches décoratives
    for dx, dy, r, color, alpha in ((0.95, 0.9, 2.2, ORANGE, 0.35), (0.975, 0.8, 1.3, MAGENTA, 0.35), (0.9, 0.95, 1.0, BLUE, 0.4)):
        _circle(c, x + w * dx, y + h * dy, r * mm, color, alpha)
    c.restoreState()
    c.setFillAlpha(1)
    c.setStrokeAlpha(1)


# ---------------------------------------------------------------------------
# Page de garde
# ---------------------------------------------------------------------------
def _spaced(c, x, y, text, font, size, color, spacing=1.2, align="left"):
    """Texte en capitales espacées (sur-titres)."""
    width = sum(c.stringWidth(ch, font, size) for ch in text) + spacing * (len(text) - 1)
    if align == "right":
        x -= width
    c.setFont(font, size)
    c.setFillColor(color)
    c.setFillAlpha(1)
    for ch in text:
        c.drawString(x, y, ch)
        x += c.stringWidth(ch, font, size) + spacing


def _fit(c, text, font, size, width, minimum=12):
    while size > minimum and c.stringWidth(text, font, size) > width:
        size -= 0.5
    return size


def draw_cover(c, page_w, page_h, info):
    """Page de garde complète : logo, sur-titre, illustration, titre, sous-titre,
    informations du document, pied de page. `info` : label, kicker, title,
    subtitle, emphasis (facultatif), meta [(libellé, valeur)], classification."""
    margin = 20 * mm
    c.saveState()
    # en-tête : logo à gauche, sur-titre à droite
    logo_w = 54 * mm
    draw_logo(c, margin - 1.5 * mm, page_h - 15 * mm - logo_size(logo_w), logo_w)
    _spaced(c, page_w - margin, page_h - 24 * mm, info["label"], "OpenSans-SemiBold", 8, BLUE, 1.1, align="right")
    _spaced(c, page_w - margin, page_h - 29 * mm, info["kicker"], "OpenSans", 7.2, GREY, 0.9, align="right")

    # illustration
    card_x, card_w, card_h = 14 * mm, page_w - 28 * mm, 122 * mm
    card_y = page_h - 47 * mm - card_h
    office_scene(c, card_x, card_y, card_w, card_h)

    # bloc de titre, centré dans l'espace entre l'illustration et le pied de page
    col_w = (page_w - 2 * margin) / 2
    rows = (len(info["meta"]) + 1) // 2
    block = (rows - 1) * 11.5 * mm + 4.6 * mm + 11 * mm + 7.5 * mm + (8.5 * mm if info.get("emphasis") else 0) + 11.5 * mm + 14 * mm + 3 * mm
    bottom = 22 * mm
    base = bottom + max(0, (card_y - bottom - block) * 0.5)
    y = base + 4.6 * mm + (rows - 1) * 11.5 * mm  # première ligne d'informations
    for i, (label, value) in enumerate(info["meta"]):
        cx = margin + (i % 2) * col_w
        cy = y - (i // 2) * 11.5 * mm
        _spaced(c, cx, cy, label.upper(), "OpenSans-SemiBold", 6.6, GREY, 0.6)
        c.setFont("OpenSans", 9.2)
        c.setFillColor(INK)
        text = value
        while c.stringWidth(text, "OpenSans", 9.2) > col_w - 6 * mm and len(text) > 4:
            text = text[:-2]
        if text != value:
            text = text.rstrip() + "…"
        c.drawString(cx, cy - 4.6 * mm, text)
    y += 11 * mm
    c.setStrokeColor(MAGENTA)
    c.setLineWidth(1.8)
    c.line(margin, y, margin + 30 * mm, y)
    y += 7.5 * mm
    c.setFont("OpenSans", 12)
    c.setFillColor(INK)
    c.drawString(margin, y, info["subtitle"])
    if info.get("emphasis"):
        y += 8.5 * mm
        size = _fit(c, info["emphasis"], "OpenSans-SemiBold", 18, page_w - 2 * margin)
        c.setFont("OpenSans-SemiBold", size)
        c.setFillColor(BLUE)
        c.drawString(margin, y, info["emphasis"])
    y += 11.5 * mm
    size = _fit(c, info["title"], "OpenSans-Bold", 34, page_w - 2 * margin)
    c.setFont("OpenSans-Bold", size)
    c.setFillColor(NAVY)
    c.drawString(margin, y, info["title"])
    y += 14 * mm
    _spaced(c, margin, y, info["eyebrow"], "OpenSans-SemiBold", 8.5, MAGENTA, 1.2)

    # pied de page
    c.setStrokeColor(colors.HexColor("#D9DEE5"))
    c.setLineWidth(0.6)
    c.line(margin, 18 * mm, page_w - margin, 18 * mm)
    _spaced(c, margin, 12.5 * mm, "RECONNAISSANCE · DÉVELOPPEMENT · ENGAGEMENT · COHÉSION", "OpenSans-SemiBold", 6.6, GREY, 0.7)
    _spaced(c, page_w - margin, 12.5 * mm, info["classification"], "OpenSans-Bold", 6.8, colors.HexColor("#B23F3F"), 0.8, align="right")
    c.restoreState()

