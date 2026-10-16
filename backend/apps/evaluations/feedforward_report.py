"""
Rapports PDF du 360° Feedforward, réservés au dirigeant de l'entreprise :

  - le rapport global (« synthèse de l'organisation ») : participation et
    couverture, forces reconnues, leviers d'impact, potentiel, engagements,
    appropriation au Round 2, recommandations et annexes ;
  - le rapport individuel du Round 1 : ce que les collègues d'une personne
    voient en elle et pour elle, leurs engagements, et les prochaines étapes.

Mise en page de cabinet de conseil : couverture, informations sur le
document, sommaire paginé, synthèse exécutive en tête, titres de section qui
énoncent le constat, figures et tableaux numérotés avec leur source,
recommandations assorties d'un porteur, d'un horizon et d'une priorité,
annexes. En-tête et pied de page (classification, pagination « x / y »),
signets PDF pour la navigation.

Les réponses libres sont rapprochées d'une grille de thèmes par mots-clés
(« codage thématique assisté ») : les fréquences indiquent la part des
contributions qui évoquent un thème, jamais une note. La grille est publiée
en annexe du rapport global.
"""
import io
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

from apps.core.models import Department, User

from .models import Feedback360

# ---------------------------------------------------------------------------
# Charte
# ---------------------------------------------------------------------------
NAVY = colors.HexColor("#14213D")
BLUE = colors.HexColor("#2E7FC1")
TEAL = colors.HexColor("#17A89E")
ORANGE = colors.HexColor("#F28C28")
TEXT = colors.HexColor("#2D3748")
GREY = colors.HexColor("#6B7280")
RULE = colors.HexColor("#D9DEE5")
LIGHT = colors.HexColor("#F3F6F9")
TINT_BLUE = colors.HexColor("#EAF2FA")
TINT_TEAL = colors.HexColor("#E7F6F4")
TINT_ORANGE = colors.HexColor("#FDF1E5")
RED = colors.HexColor("#B23F3F")

PAGE_W, PAGE_H = A4
MARGIN_X = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_X
FONT_DIR = Path(__file__).resolve().parent / "report_assets" / "fonts"
F_REG, F_BOLD, F_SEMI, F_IT, F_BOLD_IT = "OpenSans", "OpenSans-Bold", "OpenSans-SemiBold", "OpenSans-Italic", "OpenSans-BoldItalic"
NBSP = " "


def _register_fonts():
    if F_REG in pdfmetrics.getRegisteredFontNames():
        return
    for name, file in ((F_REG, "Regular"), (F_BOLD, "Bold"), (F_SEMI, "SemiBold"), (F_IT, "Italic"), (F_BOLD_IT, "BoldItalic")):
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / f"OpenSans-{file}.ttf")))
    pdfmetrics.registerFontFamily(F_REG, normal=F_REG, bold=F_BOLD, italic=F_IT, boldItalic=F_BOLD_IT)


def _styles():
    s = {}
    s["body"] = ParagraphStyle("body", fontName=F_REG, fontSize=9.5, leading=14, textColor=TEXT, spaceAfter=6)
    s["body_tight"] = ParagraphStyle("body_tight", parent=s["body"], spaceAfter=2)
    s["small"] = ParagraphStyle("small", fontName=F_REG, fontSize=8, leading=11, textColor=TEXT)
    s["small_grey"] = ParagraphStyle("small_grey", parent=s["small"], textColor=GREY)
    s["bullet"] = ParagraphStyle("bullet", parent=s["body"], leftIndent=12, bulletIndent=0, spaceAfter=4)
    s["h1"] = ParagraphStyle("h1", fontName=F_BOLD, fontSize=17, leading=21, textColor=NAVY, spaceBefore=2, spaceAfter=4)
    s["action"] = ParagraphStyle("action", fontName=F_SEMI, fontSize=11.5, leading=15.5, textColor=BLUE, spaceAfter=10)
    s["h2"] = ParagraphStyle("h2", fontName=F_BOLD, fontSize=11.5, leading=15, textColor=NAVY, spaceBefore=10, spaceAfter=5)
    s["h3"] = ParagraphStyle("h3", fontName=F_SEMI, fontSize=9.5, leading=13, textColor=NAVY, spaceBefore=6, spaceAfter=3)
    s["caption"] = ParagraphStyle("caption", fontName=F_SEMI, fontSize=8.5, leading=11, textColor=NAVY, spaceBefore=4, spaceAfter=3)
    s["source"] = ParagraphStyle("source", fontName=F_IT, fontSize=7, leading=9, textColor=GREY, spaceBefore=2, spaceAfter=10)
    s["quote"] = ParagraphStyle("quote", fontName=F_IT, fontSize=9, leading=13, textColor=TEXT)
    s["attribution"] = ParagraphStyle("attribution", fontName=F_REG, fontSize=7.5, leading=10, textColor=GREY)
    s["cell"] = ParagraphStyle("cell", fontName=F_REG, fontSize=8, leading=10.5, textColor=TEXT)
    s["cell_bold"] = ParagraphStyle("cell_bold", parent=s["cell"], fontName=F_SEMI)
    s["cell_right"] = ParagraphStyle("cell_right", parent=s["cell"], alignment=TA_RIGHT)
    s["cell_center"] = ParagraphStyle("cell_center", parent=s["cell"], alignment=TA_CENTER)
    s["head"] = ParagraphStyle("head", fontName=F_SEMI, fontSize=7.8, leading=10, textColor=colors.white)
    s["head_center"] = ParagraphStyle("head_center", parent=s["head"], alignment=TA_CENTER)
    s["kpi_value"] = ParagraphStyle("kpi_value", fontName=F_BOLD, fontSize=19, leading=22, textColor=NAVY)
    s["kpi_label"] = ParagraphStyle("kpi_label", fontName=F_REG, fontSize=7.5, leading=9.5, textColor=GREY)
    s["box_title"] = ParagraphStyle("box_title", fontName=F_BOLD, fontSize=8.5, leading=11, textColor=BLUE, spaceAfter=3)
    s["box_body"] = ParagraphStyle("box_body", fontName=F_REG, fontSize=9, leading=13, textColor=TEXT)
    s["cover_label"] = ParagraphStyle("cover_label", fontName=F_SEMI, fontSize=9, leading=12, textColor=BLUE)
    s["cover_title"] = ParagraphStyle("cover_title", fontName=F_BOLD, fontSize=28, leading=33, textColor=NAVY, spaceBefore=6, spaceAfter=6)
    s["cover_sub"] = ParagraphStyle("cover_sub", fontName=F_REG, fontSize=14, leading=19, textColor=TEXT, spaceAfter=18)
    s["cover_meta"] = ParagraphStyle("cover_meta", fontName=F_REG, fontSize=9, leading=13, textColor=TEXT)
    s["toc0"] = ParagraphStyle("toc0", fontName=F_SEMI, fontSize=10, leading=17, textColor=NAVY)
    s["toc1"] = ParagraphStyle("toc1", fontName=F_REG, fontSize=9, leading=14, textColor=TEXT, leftIndent=14)
    return s


# ---------------------------------------------------------------------------
# Grilles de codage thématique
# ---------------------------------------------------------------------------
def _norm(text):
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return text.replace("’", "'").replace("‘", "'")


@dataclass(frozen=True)
class Theme:
    key: str
    label: str
    stems: tuple
    reading: str = ""   # ce que dit le thème quand il est une force, à l'échelle de l'organisation
    action: str = ""    # la réponse collective quand il est un levier
    you: str = ""       # la force, adressée à la personne
    lever_you: str = "" # le levier, adressé à la personne

    @property
    def pattern(self):
        return re.compile(r"\b(?:" + "|".join(re.escape(_norm(s)) for s in self.stems) + ")")


BEHAVIOUR = [
    Theme("ecoute", "Écoute et disponibilité",
          ("écoute", "disponib", "attentif", "attentive", "accessible", "sans rendez-vous", "prendre le temps", "temps d'écoute"),
          "une culture de proximité, où chacun se rend disponible pour les autres",
          "généraliser des temps d'échange individuels réguliers entre managers et collaborateurs",
          "votre écoute et votre disponibilité", "prendre davantage de temps d'écoute individuelle"),
    Theme("respect", "Bienveillance et respect",
          ("bienveill", "respect", "humil", "modest", "empath", "gentil", "courtois", "considéra", "sans jamais blesser"),
          "un climat relationnel respectueux, propice à la franchise",
          "ancrer des règles de fonctionnement explicites sur le respect et le désaccord constructif",
          "votre bienveillance et votre respect des autres", "exprimer davantage de reconnaissance au quotidien"),
    Theme("fiabilite", "Fiabilité et sens de l'engagement",
          ("fiab", "tient ses engagements", "tenir ses engagements", "fait ce qu", "tiens les dates", "loyaut", "constan", "parole donnée", "compter sur", "confiance"),
          "une culture de la parole donnée, où l'on peut compter les uns sur les autres",
          "rendre visibles les engagements pris, au moyen de points d'étape et de tableaux de suivi partagés",
          "votre fiabilité : vos collègues savent pouvoir compter sur vous", "rendre vos engagements plus visibles et les tenir dans la durée"),
    Theme("rigueur", "Rigueur et qualité du travail",
          ("rigueur", "rigoureu", "qualité", "travail bien fini", "bien fait", "précis", "minuti", "exigen", "soin"),
          "un haut niveau d'exigence sur la qualité des livrables",
          "formaliser des standards de qualité partagés et des revues entre pairs",
          "votre rigueur et la qualité de votre travail", "renforcer la rigueur et la qualité de vos livrables"),
    Theme("cooperation", "Esprit d'équipe et coopération",
          ("esprit d'équipe", "entraide", "collabor", "coopér", "solidar", "aider", "travail en équipe", "autres équipes", "autres directions"),
          "un fort esprit collectif et une entraide spontanée",
          "multiplier les occasions de coopération entre équipes, par des projets transverses et des binômes inter-équipes",
          "votre esprit d'équipe et votre sens de la coopération", "aller davantage vers les autres équipes et coopérer au-delà de votre périmètre"),
    Theme("leadership", "Leadership et capacité à mobiliser",
          ("leadership", "mobilis", "fédère", "fédérer", "inspir", "entraîn", "donner envie", "embarquer", "montrer l'exemple", "manag", "décision", "trancher", "affirm", "prendre plus de place", "prendre sa place"),
          "des leaders capables de fédérer et d'entraîner",
          "développer le leadership des managers de proximité par un parcours de développement managérial",
          "votre capacité à fédérer et à entraîner", "affirmer davantage votre leadership"),
    Theme("communication", "Communication et prise de parole",
          ("communic", "prise de parole", "prendre la parole", "parole en", "expliqu", "clarté", "clair", "message", "compte rendu", "comptes rendus", "exprimer", "échange", "partag", "transparen"),
          "une communication claire et accessible",
          "structurer les rituels de communication et donner à chacun un temps de parole en réunion",
          "votre communication et votre clarté", "prendre davantage la parole et structurer votre communication"),
    Theme("client", "Sens du client et du service",
          ("client", "sens du service", "service rendu", "satisfaction", "utilisateur"),
          "une forte orientation client",
          "faire circuler la voix du client dans toutes les équipes, y compris celles qui ne sont pas à son contact",
          "votre sens du client et du service", "renforcer votre proximité avec les clients"),
    Theme("expertise", "Expertise et maîtrise technique",
          ("expertise", "expert", "technique", "maîtrise", "compétence", "savoir-faire", "outils"),
          "une expertise reconnue, atout de crédibilité auprès des clients",
          "organiser le partage d'expertise : référents, communautés de pratique, formation interne",
          "votre expertise et votre maîtrise technique", "approfondir votre expertise et vos outils"),
    Theme("initiative", "Initiative et autonomie",
          ("initiative", "autonom", "proactiv", "force de proposition", "oser", "ose ", "prendre les devants"),
          "des collaborateurs autonomes, qui prennent des initiatives",
          "clarifier les marges de manœuvre de chacun et valoriser les initiatives",
          "votre esprit d'initiative et votre autonomie", "oser davantage prendre des initiatives"),
    Theme("calme", "Calme et maîtrise de soi",
          ("calme", "serein", "sang-froid", "sang froid", "patien", "moments tendus", "sous pression"),
          "une capacité à garder son calme dans les moments de tension",
          "outiller la gestion des situations de tension et de la charge de travail",
          "votre calme et votre maîtrise de vous-même", "mieux gérer les situations de tension et de charge"),
    Theme("organisation", "Organisation et gestion des priorités",
          ("organis", "priorit", "planif", "gestion du temps", "délais", "échéance", "charge", "process", "suivi", "structur", "méthod", "formalis", "documen", "focus", "concentr"),
          "une bonne maîtrise de l'organisation et des délais",
          "travailler collectivement la priorisation et la gestion de la charge, avec des méthodes et des outils de planification communs",
          "votre organisation et votre sens des priorités", "mieux organiser vos priorités et votre temps"),
    Theme("delegation", "Délégation et développement des autres",
          ("délég", "faire grandir", "confier", "former", "transmettre", "accompagn", "coach", "mentor", "lâcher prise", "faire confiance"),
          "un souci réel de faire grandir les autres",
          "proposer aux managers un parcours « déléguer pour développer »",
          "votre souci de faire grandir les autres", "déléguer davantage et faire grandir votre entourage"),
    Theme("analyse", "Analyse et résolution de problèmes",
          ("analys", "résolution", "résoudre", "problème", "synthès", "raisonn", "diagnostic", "solution"),
          "une solide capacité d'analyse et de résolution de problèmes",
          "diffuser des méthodes communes de résolution de problèmes",
          "votre capacité d'analyse et de résolution de problèmes", "structurer davantage votre analyse des problèmes"),
    Theme("vision", "Vision stratégique et innovation",
          ("stratég", "innov", "curios", "nouvelles idées", "créativ", "transformation", "numérique", "digital", "vision", "anticip", "recul", "hauteur"),
          "une capacité à se projeter et à innover",
          "associer davantage de collaborateurs aux réflexions stratégiques et d'innovation",
          "votre vision et votre goût de l'innovation", "prendre davantage de recul stratégique"),
    Theme("resultats", "Pilotage de la performance et des résultats",
          ("résultat", "pilotage", "piloter", "budget", "objectif", "indicateur", "chiffre d'affaires", "marge", "performance", "rentab", "business"),
          "une forte orientation résultats",
          "partager des indicateurs de performance lisibles par tous et suivis en équipe",
          "votre orientation résultats", "renforcer le pilotage de vos résultats et de vos budgets"),
    Theme("energie", "Énergie positive et convivialité",
          ("drôle", "humour", "bonne humeur", "humeur", "souri", "positif", "positive", "positivit", "enthousias", "attachant", "sympa", "convivia", "joyeu", "énergie", "dynamis"),
          "une ambiance de travail chaleureuse, portée par l'énergie et la bonne humeur",
          "préserver les moments de convivialité et la reconnaissance dans le rythme de croissance",
          "votre énergie positive et votre bonne humeur", "canaliser votre énergie vers les sujets prioritaires"),
    Theme("engagement", "Engagement et professionnalisme",
          ("engagé", "engagement", "investi", "investissement", "bosseur", "travailleu", "sérieu", "professionnalisme", "dévou", "implication", "impliqué"),
          "un engagement fort et un professionnalisme reconnu",
          "veiller à la soutenabilité de l'engagement : charge, équilibre, reconnaissance",
          "votre engagement et votre professionnalisme", "préserver votre énergie dans la durée"),
    Theme("ouverture", "Ouverture d'esprit et vivacité intellectuelle",
          ("ouverture", "ouvert", "smart", "intelligen", "vif", "vivacité", "brillant", "esprit d'analyse", "apprend vite", "comprend vite"),
          "des profils ouverts et vifs, qui comprennent et apprennent vite",
          "nourrir cette vivacité par des défis, des rotations et des formations exigeantes",
          "votre ouverture d'esprit et votre vivacité intellectuelle", "élargir encore votre champ de vision"),
    Theme("reactivite", "Réactivité et rapidité d'exécution",
          ("rapid", "réactiv", "efficac", "vite", "agil"),
          "une grande réactivité dans l'exécution",
          "concilier vitesse d'exécution et qualité, par des points de contrôle légers",
          "votre réactivité et votre efficacité", "gagner en rapidité d'exécution"),
]

POTENTIAL = [
    Theme("management", "Encadrement et management d'équipe",
          ("encadr", "manag", "chef d'équipe", "responsable d'équipe", "poste de responsable", "petite équipe", "diriger une équipe", "gérer des équipes", "gérer une équipe", "faire grandir"),
          you="un rôle d'encadrement et de management d'équipe"),
    Theme("referent", "Expertise et rôle de référent",
          ("référent", "expert", "former les nouveaux", "spécialiste", "référence", "technique", "domaine"),
          you="un rôle de référent dans votre domaine d'expertise"),
    Theme("projets", "Pilotage de projets et missions transverses",
          ("projet", "transverse", "mission", "programme"),
          you="le pilotage de projets et de missions transverses"),
    Theme("business", "Développement commercial et clients",
          ("client", "portefeuille", "commercial", "vente", "partenari", "marché", "sous-région", "business", "croissance", "afrique", "international", "expansion", "pays"),
          you="des responsabilités élargies sur le développement commercial et les clients"),
    Theme("direction", "Rôle de direction et responsabilités élargies",
          ("direction", "directeur", "dirigeant", "générale", "responsabilit", "rôle élargi", "décisions stratégiques", "conseil", "c-level", "codir", "comité de direction", "diriger", "head of", "chief", "associé", "porter"),
          you="des responsabilités de direction élargies"),
    Theme("transformation", "Innovation, produit et transformation",
          ("transformation", "innovation", "numérique", "digital", "diversification", "nouvelles offres", "construire", "créer", "licorne", "produit", "vision"),
          you="un rôle moteur dans l'innovation, le produit et la transformation"),
]

COMMITMENT = [
    Theme("feedback", "Feedback régulier et franc", ("retour", "feedback", "franc", "en face", "dire les choses")),
    Theme("disponibilite", "Disponibilité et réactivité", ("disponib", "sans rendez-vous", "répond", "dans la journée", "sous 48", "appeler", "joindre")),
    Theme("information", "Partage d'information, de méthodes et de réseau", ("partag", "contacts", "notes", "modèles", "informer", "prévenir", "transmettre", "réseau")),
    Theme("accompagnement", "Accompagnement et points réguliers", ("relire", "accompagn", "coach", "point", "mensuel", "tête-à-tête", "régulier", "toutes les deux semaines")),
    Theme("association", "Association aux décisions et aux réunions", ("associ", "comité", "réunion", "arbitrage", "décision", "inviter", "conseil")),
    Theme("visibilite", "Visibilité, confiance et délégation", ("visibilité", "confier", "délég", "présidence", "présenter", "mettre en avant", "confiance")),
]

ROUND1_LABELS = {
    "human_qualities": "Qualités humaines appréciées",
    "professional_contribution": "Contribution professionnelle",
    "achievements": "Réalisations reconnues",
    "impact_leadership": "Leadership, attitudes et comportements",
    "impact_skills": "Compétences et pratiques professionnelles",
    "potential": "Potentiel perçu",
    "commitment": "Engagement",
    "commitment_first_action": "Première action concrète",
    "commitment_from": "À partir de quand",
    "commitment_how": "Comment compter sur moi",
}
ROUND2_QUESTIONS = [
    ("Ce qui m'a particulièrement touché ou surpris positivement", "Qu'ai-je entendu qui m'a fait prendre conscience d'une force, d'une qualité ou d'une contribution que je ne mesurais pas pleinement ?"),
    ("Les forces sur lesquelles je veux davantage capitaliser", "Quelles forces vais-je volontairement utiliser davantage dans mon rôle et dans ma contribution au collectif ?"),
    ("Mes 1 à 2 priorités de développement", "Parmi les suggestions reçues, quels axes je choisis personnellement de travailler en priorité ?"),
    ("Mon engagement à 90 jours", "Quel changement concret et observable vais-je mettre en œuvre dans les 90 prochains jours ?"),
    ("Le soutien que j'attends de mes collègues", "De quel soutien, feedback, coopération ou rappel ai-je besoin pour réussir cet engagement ?"),
]
RELATION_SHORT = {"MANAGER": "Responsable", "PEER": "Pair", "REPORT": "Collaborateur direct", "SELF": "Soi-même"}
RELATION_GLOBAL = {"MANAGER": "Regard d'un responsable", "PEER": "Regard d'un pair", "REPORT": "Regard d'un collaborateur", "SELF": ""}
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def themes_in(text, grid):
    normalized = _norm(text)
    return {t.key for t in grid if t.pattern.search(normalized)}


def by_key(grid):
    return {t.key: t for t in grid}


# ---------------------------------------------------------------------------
# Données
# ---------------------------------------------------------------------------
class ReportError(Exception):
    """Rapport impossible à produire : le message est montré tel quel."""


@dataclass
class Contribution:
    author: User
    subject: User
    relation: str
    answers: dict


@dataclass
class Dataset:
    company: object
    campaign: object
    people: list
    round1: list = field(default_factory=list)
    round2: dict = field(default_factory=dict)

    @classmethod
    def load(cls, company, campaign):
        people = list(
            User.objects.filter(company=company, is_active=True)
            .select_related("department__parent")
            .order_by("last_name", "first_name")
        )
        rows = (
            Feedback360.objects.filter(company=company, campaign=campaign, kind=Feedback360.Kind.FORWARD)
            .exclude(answers={})
            .select_related("author", "subject__department__parent")
        )
        data = cls(company=company, campaign=campaign, people=people)
        for row in rows:
            if row.author_id == row.subject_id:
                data.round2[row.subject_id] = row.answers
            else:
                data.round1.append(Contribution(row.author, row.subject, row.relation, row.answers))
        return data

    def received(self, user_id):
        return [c for c in self.round1 if c.subject.id == user_id]

    def given(self, user_id):
        return [c for c in self.round1 if c.author.id == user_id]


# ---------------------------------------------------------------------------
# Mise en forme
# ---------------------------------------------------------------------------
def fr_date(d):
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def pct(part, whole):
    return round(100 * part / whole) if whole else 0


def fmt_pct(value):
    return f"{value}{NBSP}%"


def fmt_num(value, decimals=1):
    return f"{value:.{decimals}f}".replace(".", ",")


_FRENCH_SPACING = (("« ", "«&nbsp;"), (" »", "&nbsp;»"), (" :", "&nbsp;:"), (" ;", "&nbsp;;"), (" ?", "&nbsp;?"), (" !", "&nbsp;!"))


def para(text, style):
    """Paragraphe typographié à la française : espaces insécables dans les
    guillemets et devant les ponctuations hautes, pour qu'aucune ne parte
    seule à la ligne."""
    for plain, fixed in _FRENCH_SPACING:
        text = text.replace(plain, fixed)
    return Paragraph(text, style)


_GLYPHS = None


def _printable(text):
    """Retire les caractères que la police ne sait pas dessiner (émojis…) :
    ils s'afficheraient en carrés vides."""
    global _GLYPHS
    if _GLYPHS is None:
        _register_fonts()
        _GLYPHS = set(pdfmetrics.getFont(F_REG).face.charToGlyph)
    return "".join(ch for ch in text if ch == "\n" or ord(ch) in _GLYPHS)


def safe(text):
    """Réponse libre → texte de paragraphe : échappée, retours à la ligne gardés."""
    return escape(_printable((text or "").strip())).replace("\n", "<br/>")


def name_of(user):
    return user.get_full_name() or user.email


def slug(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    ascii_text = "".join(c for c in normalized if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9]+", "-", ascii_text).strip("-") or "rapport"


class Heading(Paragraph):
    """Titre repris au sommaire et dans les signets du PDF."""

    def __init__(self, text, style, level):
        super().__init__(text, style)
        self.toc_level = level


class BarList(Flowable):
    """Barres horizontales : libellé, barre proportionnelle, valeur."""

    ROW = 5.8 * mm

    def __init__(self, items, color=BLUE, label_width=70 * mm, width=CONTENT_W, max_value=None):
        super().__init__()
        self.items, self.color, self.label_width, self.width = items, color, label_width, width
        self.max_value = max_value or max([v for _l, v, _t in items] + [1])
        self.height = len(items) * self.ROW + 1 * mm

    def wrap(self, *_args):
        return self.width, self.height

    def draw(self):
        c = self.canv
        track = self.width - self.label_width - 16 * mm
        for i, (label, value, text) in enumerate(self.items):
            y = self.height - (i + 1) * self.ROW
            c.setFont(F_REG, 8)
            c.setFillColor(TEXT)
            shown = label
            while pdfmetrics.stringWidth(shown, F_REG, 8) > self.label_width - 3 * mm and len(shown) > 4:
                shown = shown[:-2]
            if shown != label:
                shown = shown.rstrip() + "…"
            c.drawString(0, y + 1.8 * mm, shown)
            c.setFillColor(LIGHT)
            c.rect(self.label_width, y + 1.0 * mm, track, 3.6 * mm, stroke=0, fill=1)
            c.setFillColor(self.color)
            c.rect(self.label_width, y + 1.0 * mm, max(0.6, track * value / self.max_value), 3.6 * mm, stroke=0, fill=1)
            c.setFillColor(NAVY)
            c.setFont(F_SEMI, 8)
            c.drawString(self.label_width + track + 2.5 * mm, y + 1.8 * mm, text)


class StackedBar(Flowable):
    """Une barre découpée en parts, avec sa légende."""

    def __init__(self, parts, width=CONTENT_W):
        super().__init__()
        self.parts, self.width, self.height = [p for p in parts if p[1] > 0], width, 15 * mm

    def wrap(self, *_args):
        return self.width, self.height

    def draw(self):
        c = self.canv
        total = sum(v for _l, v, _c in self.parts) or 1
        x = 0
        for label, value, color in self.parts:
            w = self.width * value / total
            c.setFillColor(color)
            c.rect(x, 8 * mm, w, 6 * mm, stroke=0, fill=1)
            if w > 14 * mm:
                c.setFillColor(colors.white)
                c.setFont(F_SEMI, 8)
                c.drawCentredString(x + w / 2, 10 * mm, fmt_pct(pct(value, total)))
            x += w
        x = 0
        for label, value, color in self.parts:
            c.setFillColor(color)
            c.rect(x, 2 * mm, 3 * mm, 3 * mm, stroke=0, fill=1)
            c.setFillColor(TEXT)
            c.setFont(F_REG, 7.5)
            text = f"{label} : {value} ({fmt_pct(pct(value, total))})"
            c.drawString(x + 4.5 * mm, 2.4 * mm, text)
            x += pdfmetrics.stringWidth(text, F_REG, 7.5) + 12 * mm


def _numbered_canvas(header_left, header_right, classification):
    class NumberedCanvas(rl_canvas.Canvas):
        """Pagination « x / y » : le total n'est connu qu'à la fin."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                if self._pageNumber > 1:
                    self._chrome(total)
                super().showPage()
            super().save()

        def _chrome(self, total):
            self.saveState()
            self.setStrokeColor(RULE)
            self.setLineWidth(0.6)
            top = PAGE_H - 13 * mm
            self.line(MARGIN_X, top - 2.5 * mm, PAGE_W - MARGIN_X, top - 2.5 * mm)
            self.setFont(F_SEMI, 7.5)
            self.setFillColor(NAVY)
            self.drawString(MARGIN_X, top, header_left)
            self.setFont(F_REG, 7.5)
            self.setFillColor(GREY)
            self.drawRightString(PAGE_W - MARGIN_X, top, header_right)
            bottom = 11 * mm
            self.line(MARGIN_X, bottom + 4 * mm, PAGE_W - MARGIN_X, bottom + 4 * mm)
            self.setFont(F_SEMI, 7)
            self.setFillColor(RED)
            self.drawString(MARGIN_X, bottom, classification)
            self.setFont(F_REG, 7)
            self.setFillColor(GREY)
            self.drawCentredString(PAGE_W / 2, bottom, "ID-PMC · People Management Canvas")
            self.drawRightString(PAGE_W - MARGIN_X, bottom, f"Page {self._pageNumber} / {total}")
            self.restoreState()

    return NumberedCanvas


class ReportDoc(BaseDocTemplate):
    def __init__(self, buffer, title, subject):
        super().__init__(
            buffer, pagesize=A4, leftMargin=MARGIN_X, rightMargin=MARGIN_X, topMargin=22 * mm, bottomMargin=20 * mm,
            title=title, subject=subject, author="ID-PMC", creator="ID-PMC · People Management Canvas",
        )
        body = Frame(MARGIN_X, 20 * mm, CONTENT_W, PAGE_H - 42 * mm, id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        cover = Frame(MARGIN_X, 30 * mm, CONTENT_W, PAGE_H * 0.58, id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover], onPage=self._draw_cover),
            PageTemplate(id="body", frames=[body]),
        ])
        self._heading_seq = 0

    @staticmethod
    def _draw_cover(c, _doc):
        c.saveState()
        c.setFillColor(NAVY)
        c.rect(0, PAGE_H - 92 * mm, PAGE_W, 92 * mm, stroke=0, fill=1)
        c.setFillColor(BLUE)
        c.rect(0, PAGE_H - 94.5 * mm, PAGE_W, 2.5 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(F_BOLD, 22)
        c.drawString(MARGIN_X, PAGE_H - 34 * mm, "ID-PMC")
        c.setFont(F_REG, 9)
        c.drawString(MARGIN_X, PAGE_H - 40 * mm, "People Management Canvas")
        c.setFont(F_SEMI, 8)
        c.drawString(MARGIN_X, PAGE_H - 80 * mm, "RECONNAISSANCE  ·  DÉVELOPPEMENT  ·  ENGAGEMENT  ·  COHÉSION")
        c.setStrokeColor(RULE)
        c.line(MARGIN_X, 22 * mm, PAGE_W - MARGIN_X, 22 * mm)
        c.setFillColor(GREY)
        c.setFont(F_REG, 7.5)
        c.drawString(MARGIN_X, 16 * mm, "Document généré par la plateforme ID-PMC à partir des contributions saisies par les collaborateurs.")
        c.restoreState()

    def beforeDocument(self):
        # Chaque passe de mise en page renumérote les titres à l'identique :
        # sans cela, le sommaire ne se stabilise jamais d'une passe à l'autre.
        self._heading_seq = 0

    def afterFlowable(self, flowable):
        if isinstance(flowable, Heading):
            text = flowable.getPlainText()
            key = f"h{self._heading_seq}"
            self._heading_seq += 1
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=flowable.toc_level, closed=False)
            if flowable.toc_level == 0:
                self.notify("TOCEntry", (0, text, self.page, key))


class Builder:
    """Briques de mise en page communes aux deux rapports."""

    def __init__(self, source):
        _register_fonts()
        self.s = _styles()
        self.story = []
        self.figure = 0
        self.table_no = 0
        self.section = 0
        self.source = source

    def add(self, *flowables):
        self.story.extend(flowables)

    def h1(self, title, action=None, new_page=True):
        if new_page:
            self.add(PageBreak())
        self.section += 1
        self.add(Heading(f"{self.section}. {escape(title)}", self.s["h1"], 0))
        if action:
            self.add(para(action, self.s["action"]))
        else:
            self.add(Spacer(1, 6))

    def h1_plain(self, title, new_page=True):
        if new_page:
            self.add(PageBreak())
        self.add(Heading(escape(title), self.s["h1"], 0), Spacer(1, 6))

    def h2(self, title, level=1, room=35 * mm):
        """`room` : place qu'il doit rester sous le titre, faute de quoi il passe à la page suivante."""
        self.add(CondPageBreak(room), Heading(escape(title), self.s["h2"], level))

    def p(self, text, style="body"):
        self.add(para(text, self.s[style]))

    def bullets(self, items, color=BLUE):
        hex_color = color.hexval()[2:]
        for item in items:
            self.add(Paragraph(f'<font color="#{hex_color}"><b>•</b></font>&nbsp;&nbsp;{item}', self.s["bullet"]))

    def kpis(self, tiles, color=BLUE):
        width = CONTENT_W / len(tiles)
        cells = [[[para(value, self.s["kpi_value"]), para(label, self.s["kpi_label"])] for value, label in tiles]]
        table = Table(cells, colWidths=[width] * len(tiles))
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
            ("LINEABOVE", (0, 0), (-1, 0), 2.2, color),
            ("LINEAFTER", (0, 0), (-2, 0), 5, colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        self.add(table, Spacer(1, 10))

    def box(self, title, body, tint=TINT_BLUE, color=BLUE, keep_with=None):
        """Encadré ; `keep_with` : flowables qui le précèdent et ne doivent pas en être séparés."""
        content = [para(escape(title).upper(), ParagraphStyle("bt", parent=self.s["box_title"], textColor=color))]
        content += [para(b, self.s["box_body"]) for b in (body if isinstance(body, list) else [body])]
        table = Table([[content]], colWidths=[CONTENT_W])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), tint),
            ("LINEBEFORE", (0, 0), (0, -1), 3, color),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        self.add(KeepTogether((keep_with or []) + [table]), Spacer(1, 10))

    def quote(self, text, attribution, color=TEAL):
        rows = [[para(f"« {safe(text)} »", self.s["quote"])]]
        if attribution:
            rows.append([para(f"— {escape(attribution)}", self.s["attribution"])])
        table = Table(rows, colWidths=[CONTENT_W - 6 * mm])
        table.setStyle(TableStyle([
            ("LINEBEFORE", (0, 0), (0, -1), 2, color),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        self.add(KeepTogether([table]), Spacer(1, 7))

    def figure_items(self, title, flowable, note=None):
        self.figure += 1
        return [para(f"Figure {self.figure} — {escape(title)}", self.s["caption"]), Spacer(1, 3), flowable,
                para(f"{('Note : ' + note + '. ') if note else ''}Source : {escape(self.source)}.", self.s["source"])]

    def figure_block(self, title, flowable, note=None):
        self.add(KeepTogether(self.figure_items(title, flowable, note)))

    def table(self, title, header, rows, widths, align=None, zebra=True, note=None, head_color=NAVY):
        self.table_no += 1
        align = align or ["left"] * len(header)
        head = [para(h, self.s["head_center"] if a == "center" else self.s["head"]) for h, a in zip(header, align)]
        body = []
        for row in rows:
            cells = []
            for value, a in zip(row, align):
                if isinstance(value, Flowable):
                    cells.append(value)
                else:
                    style = {"center": "cell_center", "right": "cell_right"}.get(a, "cell")
                    cells.append(para(str(value), self.s[style]))
            body.append(cells)
        table = Table([head] + body, colWidths=widths, repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), head_color),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
        if zebra:
            style += [("BACKGROUND", (0, i), (-1, i), LIGHT) for i in range(2, len(body) + 1, 2)]
        table.setStyle(TableStyle(style))
        self.add(CondPageBreak(30 * mm), para(f"Tableau {self.table_no} — {escape(title)}", self.s["caption"]), Spacer(1, 2), table,
                 para(f"{('Note : ' + note + '. ') if note else ''}Source : {escape(self.source)}.", self.s["source"]))

    def toc(self):
        self.add(Spacer(1, 6), para("Sommaire", self.s["h2"]))
        toc = TableOfContents()
        toc.levelStyles = [self.s["toc0"]]
        toc.dotsMinLevel = 0
        self.add(toc)

    def doc_info(self, rows):
        table = Table([[para(k, self.s["cell_bold"]), para(v, self.s["cell"])] for k, v in rows], colWidths=[45 * mm, CONTENT_W - 45 * mm])
        table.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ]))
        self.add(table, Spacer(1, 10))

    def render(self, title, subject, header_left, header_right, classification):
        buffer = io.BytesIO()
        doc = ReportDoc(buffer, title, subject)
        doc.multiBuild(self.story, canvasmaker=_numbered_canvas(header_left, header_right, classification))
        return buffer.getvalue()


def theme_counts(contributions, fields, grid):
    """Nombre de contributions qui évoquent chaque thème (une fois par contribution)."""
    counter = Counter()
    for c in contributions:
        text = " ".join(c.answers.get(f, "") for f in fields)
        counter.update(themes_in(text, grid))
    return counter


def uncoded_note(contributions, fields, grid):
    """Part des réponses qu'aucun thème de la grille ne couvre : dite sous la figure, par transparence."""
    answered = [c for c in contributions if any((c.answers.get(f) or "").strip() for f in fields)]
    missing = sum(1 for c in answered if not themes_in(" ".join(c.answers.get(f, "") for f in fields), grid))
    if not answered or not missing:
        return None
    return (f"{missing} réponse{'s' if missing > 1 else ''} sur {len(answered)} ({fmt_pct(pct(missing, len(answered)))}) "
            "n'évoque{0} aucun thème de la grille ; elles sont lues dans les verbatims").format("nt" if missing > 1 else "")


def pick_quotes(contributions, fields, theme, grid, limit, used):
    """Verbatims représentatifs d'un thème : de longueur lisible, sans doublon."""
    pattern = by_key(grid)[theme].pattern
    candidates = []
    for c in contributions:
        for f in fields:
            text = (c.answers.get(f) or "").strip()
            if text and pattern.search(_norm(text)) and _norm(text) not in used:
                candidates.append((abs(len(text) - 130), text, c))
    picked = []
    for _score, text, c in sorted(candidates, key=lambda t: (t[0], t[1])):
        if _norm(text) in used:
            continue
        used.add(_norm(text))
        picked.append((text, c))
        if len(picked) == limit:
            break
    return picked


def top(counter, grid, n):
    names = by_key(grid)
    return [(names[k], v) for k, v in sorted(counter.items(), key=lambda kv: (-kv[1], names[kv[0]].label))[:n]]


# ---------------------------------------------------------------------------
# Rapport global
# ---------------------------------------------------------------------------
@dataclass
class Recommendation:
    title: str
    detail: str
    finding: str
    owner: str
    horizon: str
    priority: str


def build_global_report(company, campaign, prepared_for):
    data = Dataset.load(company, campaign)
    if not data.round1:
        raise ReportError(
            f"Aucune contribution Round 1 n'a été déposée sur la campagne « {campaign.name} » : le rapport global n'aurait rien à présenter."
        )
    today = timezone.localdate()
    people = data.people
    n_people = len(people)
    contributions = data.round1
    received = Counter(c.subject.id for c in contributions)
    given = Counter(c.author.id for c in contributions)
    contributors = len({c.author.id for c in contributions})
    covered1 = sum(1 for u in people if received[u.id] >= 1)
    covered3 = sum(1 for u in people if received[u.id] >= 3)
    below3 = [u for u in people if received[u.id] < 3]
    avg = len(contributions) / n_people if n_people else 0
    round2_done = sum(1 for u in people if data.round2.get(u.id))
    relations = Counter(c.relation for c in contributions)
    commitments = [c for c in contributions if (c.answers.get("commitment") or "").strip()]
    with_action = sum(1 for c in commitments if (c.answers.get("commitment_first_action") or "").strip())
    dated = sum(1 for c in commitments if (c.answers.get("commitment_from") or "").strip())

    strengths = theme_counts(contributions, ("human_qualities", "professional_contribution"), BEHAVIOUR)
    human = theme_counts(contributions, ("human_qualities",), BEHAVIOUR)
    professional = theme_counts(contributions, ("professional_contribution",), BEHAVIOUR)
    levers = theme_counts(contributions, ("impact_leadership", "impact_skills"), BEHAVIOUR)
    levers_lead = theme_counts(contributions, ("impact_leadership",), BEHAVIOUR)
    levers_skill = theme_counts(contributions, ("impact_skills",), BEHAVIOUR)
    potential = theme_counts(contributions, ("potential",), POTENTIAL)
    commitment_types = theme_counts(commitments, ("commitment", "commitment_first_action", "commitment_how"), COMMITMENT)
    round2_rows = [Contribution(u, u, "SELF", data.round2[u.id]) for u in people if data.round2.get(u.id)]
    priorities = theme_counts(round2_rows, ("priorities", "commitment_90_days"), BEHAVIOUR)
    support = theme_counts(round2_rows, ("support",), COMMITMENT)
    total = len(contributions)
    top_strengths = top(strengths, BEHAVIOUR, 8)
    top_levers = top(levers, BEHAVIOUR, 8)
    top_potential = top(potential, POTENTIAL, 6)

    source = f"ID-PMC, 360° Feedforward, {company.name}, {campaign.name} — {total} contributions Round 1, édition du {fr_date(today)}"
    b = Builder(source)
    s = b.s

    # -- Couverture ----------------------------------------------------------
    b.add(Spacer(1, 4), para("RAPPORT D'ÉVALUATION · SYNTHÈSE DE L'ORGANISATION", s["cover_label"]))
    b.add(para("360° Feedforward", s["cover_title"]))
    b.add(para(f"{escape(company.name)} — {escape(campaign.name)}", s["cover_sub"]))
    b.doc_info([
        ("Préparé pour", escape(prepared_for)),
        ("Périmètre", f"{n_people} collaborateurs · {len({u.department_id for u in people if u.department_id})} équipes"),
        ("Période couverte", f"Du {fr_date(campaign.start_date)} au {fr_date(campaign.end_date)}"),
        ("Date d'édition", fr_date(today)),
        ("Classification", '<font color="#B23F3F"><b>Strictement confidentiel</b></font> — Direction Générale et fonction RH'),
    ])
    b.add(NextPageTemplate("body"))

    # -- À propos & sommaire -------------------------------------------------------
    b.h1_plain("À propos de ce rapport")
    b.p(f"Ce rapport présente la synthèse du 360° Feedforward conduit au sein de <b>{escape(company.name)}</b> sur la campagne "
        f"« {escape(campaign.name)} ». Il consolide l'ensemble des contributions déposées sur la plateforme ID-PMC au {fr_date(today)} : "
        "les regards croisés du Round 1 — ce que chacun reconnaît, suggère et s'engage à faire pour un collègue — et les décisions "
        "formalisées par chacun au Round 2.")
    b.p("Le Feedforward ne juge pas la performance passée : il éclaire les forces sur lesquelles s'appuyer et les leviers qui "
        "augmenteront l'impact de chacun. Les enseignements qui suivent doivent être lus dans cet esprit, comme une base de dialogue "
        "et de décision, et non comme une évaluation des personnes.")
    b.box("Confidentialité", [
        "Les contributions du Round 1 sont signées et adressées à la personne concernée. Dans ce rapport de synthèse, les verbatims "
        "sont cités sans le nom de leur auteur ; seule l'annexe A nomme les personnes, pour le suivi de la participation.",
        "Ce document est destiné à la Direction Générale et à la fonction RH. Il ne doit pas être diffusé au-delà.",
    ], tint=TINT_ORANGE, color=ORANGE)
    b.toc()

    # -- 1. Synthèse exécutive -------------------------------------------------------
    t1 = top_strengths[0] if top_strengths else None
    l1 = top_levers[0] if top_levers else None
    good_coverage = n_people and covered3 / n_people >= 0.8
    action = ("Un exercice largement partagé, qui fait émerger un socle de forces commun et des leviers de progrès collectifs"
              if good_coverage else
              "Un exercice engagé, dont la couverture doit être complétée avant d'en tirer toutes les conclusions")
    b.h1("Synthèse exécutive", action)
    b.kpis([
        (str(total), "contributions Round 1, toutes signées"),
        (fmt_num(avg), "regards reçus en moyenne par personne"),
        (fmt_pct(pct(covered3, n_people)), "des collaborateurs ont reçu au moins trois regards"),
        (str(len(commitments)), "engagements de soutien pris entre collègues"),
        (fmt_pct(pct(round2_done, n_people)), "ont formalisé leurs décisions au Round 2"),
    ])
    b.h2("Messages clés")
    messages = [
        f"<b>Participation.</b> {contributors} personnes sur {n_people} ({fmt_pct(pct(contributors, n_people))}) ont contribué au Round 1, "
        f"pour {total} contributions signées. {covered3} collaborateurs sur {n_people} bénéficient d'au moins trois regards, seuil à partir "
        "duquel une lecture croisée devient fiable.",
    ]
    if len(top_strengths) >= 3:
        messages.append(
            f"<b>Forces reconnues.</b> Les contributions mettent d'abord en avant « {top_strengths[0][0].label} » "
            f"({fmt_pct(pct(top_strengths[0][1], total))} des contributions), « {top_strengths[1][0].label} » "
            f"({fmt_pct(pct(top_strengths[1][1], total))}) et « {top_strengths[2][0].label} » ({fmt_pct(pct(top_strengths[2][1], total))}) : "
            "c'est le socle sur lequel capitaliser.")
    if len(top_levers) >= 2:
        messages.append(
            f"<b>Leviers d'impact.</b> Les suggestions convergent vers « {top_levers[0][0].label} » "
            f"({fmt_pct(pct(top_levers[0][1], total))}) et « {top_levers[1][0].label} » ({fmt_pct(pct(top_levers[1][1], total))}). "
            "Leur récurrence en fait des axes collectifs, à traiter au-delà des plans individuels.")
    messages.append(
        f"<b>Engagements.</b> {len(commitments)} engagements de soutien ont été pris entre collègues, dont "
        f"{fmt_pct(pct(with_action, len(commitments)))} assortis d'une première action concrète : un capital relationnel à faire vivre.")
    messages.append(
        f"<b>Appropriation.</b> {round2_done} personnes sur {n_people} ({fmt_pct(pct(round2_done, n_people))}) ont formalisé leurs priorités "
        "au Round 2" + (" ; l'appropriation reste à achever." if pct(round2_done, n_people) < 80 else ", signe d'une appropriation réelle de l'exercice."))
    b.bullets(messages)
    recommendations = _global_recommendations(data, total, n_people, below3, round2_done, top_strengths, top_levers, top_potential,
                                              commitments, with_action, dated)
    b.h2("Nos recommandations prioritaires")
    b.bullets([f"<b>{escape(r.title)}</b> — {escape(r.owner)}, {escape(r.horizon)}." for r in recommendations[:3]], color=ORANGE)

    # -- 2. Méthodologie -------------------------------------------------------------
    b.h1("Démarche et méthodologie", "Un dispositif en deux temps, des contributions signées, une analyse quantitative et thématique")
    b.h2("Le dispositif")
    b.p("Le 360° Feedforward suit le guide ID-PMC. Au <b>Round 1</b>, chaque collaborateur s'adresse à des collègues — son responsable, "
        "ses pairs, ses collaborateurs — et leur dit ce qu'il voit en eux et pour eux. Au <b>Round 2</b>, chacun reprend la parole : il ne "
        "répond pas point par point, il choisit ce qu'il retient et le transforme en décisions.")
    b.table("Les deux temps du guide ID-PMC Feedforward", ["Temps", "Qui s'exprime", "Rubriques"], [
        ["<b>Round 1</b>", "Chaque collègue, pour une personne donnée ; contribution signée",
         "1. Qualités humaines · 2. Contribution professionnelle · 3. Réalisations reconnues · 4. Leviers d'impact (4.1 leadership, "
         "4.2 compétences) · 5. Potentiel · 6. Engagement personnel"],
        ["<b>Round 2</b>", "La personne elle-même, après lecture du Round 1",
         "1. Ce qui m'a touché · 2. Forces à capitaliser · 3. Priorités de développement · 4. Engagement à 90 jours · 5. Soutien attendu"],
    ], [24 * mm, 52 * mm, CONTENT_W - 76 * mm])
    b.h2("Le périmètre")
    b.p(f"La campagne « {escape(campaign.name)} » couvre la période du {fr_date(campaign.start_date)} au {fr_date(campaign.end_date)}. "
        f"Le rapport porte sur les {n_people} comptes actifs de {escape(company.name)} et sur l'ensemble des contributions disponibles "
        f"au {fr_date(today)}.")
    b.h2("La méthode d'analyse")
    b.bullets([
        "<b>Analyse quantitative</b> : participation, couverture (nombre de regards reçus par personne), origine des regards, engagements "
        "et appropriation au Round 2.",
        f"<b>Analyse thématique</b> : chaque réponse libre est rapprochée d'une grille de {len(BEHAVIOUR)} thèmes comportementaux et managériaux, "
        f"de {len(POTENTIAL)} thèmes de potentiel et de {len(COMMITMENT)} types d'engagement (annexe B). Un thème compte une fois par contribution ; les pourcentages indiquent "
        "la part des contributions qui l'évoquent.",
        "<b>Verbatims</b> : choisis pour leur représentativité, cités sans le nom de leur auteur.",
    ])
    b.box("Limites", [
        "Les contributions sont déclaratives et signées, ce qui favorise la bienveillance et peut atténuer l'expression des axes de progrès. "
        "Le codage par mots-clés est indicatif : il se lit avec les verbatims. Certaines équipes comptent peu de personnes ; les écarts entre "
        "équipes sont à interpréter avec prudence.",
    ], tint=LIGHT, color=GREY)

    # -- 3. Participation ----------------------------------------------------------
    b.h1("Participation et couverture",
         f"{fmt_pct(pct(covered1, n_people))} des collaborateurs ont reçu au moins un regard, {fmt_pct(pct(covered3, n_people))} au moins trois")
    teams = _team_rows(company, people)
    rows, bars = [], []
    for dept, level, members in teams:
        if not members:
            continue
        got = sum(received[u.id] for u in members)
        rows.append([
            ("&nbsp;&nbsp;&nbsp;&nbsp;› " if level else "<b>") + escape(dept) + ("" if level else "</b>"),
            len(members),
            fmt_pct(pct(sum(1 for u in members if received[u.id] >= 1), len(members))),
            fmt_pct(pct(sum(1 for u in members if received[u.id] >= 3), len(members))),
            got,
            fmt_num(got / len(members)),
            fmt_pct(pct(sum(1 for u in members if data.round2.get(u.id)), len(members))),
        ])
        bars.append((dept, got / len(members), fmt_num(got / len(members))))
    b.table("Participation par équipe", ["Équipe", "Effectif", "≥ 1 regard", "≥ 3 regards", "Regards reçus", "Moy. / pers.", "Round 2"],
            rows, [56 * mm, 16 * mm, 19 * mm, 19 * mm, 21 * mm, 19 * mm, 20 * mm],
            ["left", "center", "center", "center", "center", "center", "center"],
            note="une direction ne compte ici que les personnes qui lui sont directement rattachées ; ses services figurent en dessous")
    b.figure_block("Regards reçus en moyenne par personne, par équipe",
                   BarList(sorted(bars, key=lambda t: -t[1]), color=BLUE, label_width=62 * mm))
    origin = b.figure_items("Origine des regards du Round 1", StackedBar([
        ("Responsable", relations.get("MANAGER", 0), NAVY), ("Pairs", relations.get("PEER", 0), BLUE), ("Collaborateurs", relations.get("REPORT", 0), TEAL),
    ]))
    weak = [name for name, value, _t in bars if value < avg * 0.75]
    reading = [f"En moyenne, chaque collaborateur a reçu {fmt_num(avg)} regards. "
               + (f"{len(below3)} personne(s) restent sous le seuil de trois regards (liste en annexe A)." if below3 else
                  "Tous les collaborateurs ont reçu au moins trois regards.")]
    if weak:
        reading.append(f"Les équipes les moins couvertes — {escape(', '.join(weak))} — appellent une relance ciblée.")
    if relations.get("REPORT", 0) < 0.1 * total:
        reading.append("Les regards ascendants (des collaborateurs vers leur responsable) restent rares : les encourager enrichirait la lecture du "
                       "leadership.")
    b.box("Lecture", reading, keep_with=origin)

    # -- 4. Forces --------------------------------------------------------------------
    action = (f"Un socle de forces partagé : {top_strengths[0][0].label.lower()}, {top_strengths[1][0].label.lower()} et "
              f"{top_strengths[2][0].label.lower()}" if len(top_strengths) >= 3 else "Les forces que l'organisation reconnaît en elle-même")
    b.h1("Les forces reconnues", action)
    b.p("Les rubriques « qualités humaines » et « contribution professionnelle » disent ce que les collaborateurs apprécient les uns chez "
        "les autres. Leur lecture d'ensemble dessine la culture vécue de l'organisation.")
    if top_strengths:
        b.figure_block("Forces les plus citées — part des contributions qui évoquent chaque thème",
                       BarList([(t.label, v, fmt_pct(pct(v, total))) for t, v in top_strengths], color=BLUE, max_value=total),
                       note=uncoded_note(contributions, ("human_qualities", "professional_contribution"), BEHAVIOUR))
    hq, pc = top(human, BEHAVIOUR, 5), top(professional, BEHAVIOUR, 5)
    rows = []
    for i in range(max(len(hq), len(pc))):
        rows.append([
            f"{i + 1}. {hq[i][0].label}" if i < len(hq) else "", fmt_pct(pct(hq[i][1], total)) if i < len(hq) else "",
            f"{i + 1}. {pc[i][0].label}" if i < len(pc) else "", fmt_pct(pct(pc[i][1], total)) if i < len(pc) else "",
        ])
    if rows:
        b.table("Les cinq thèmes dominants de chaque rubrique", ["Qualités humaines", "%", "Contribution professionnelle", "%"],
                rows, [62 * mm, 23 * mm, 62 * mm, 23 * mm], ["left", "center", "left", "center"])
    used = set()
    quotes = []
    for theme, _v in top_strengths[:3]:
        quotes += pick_quotes(contributions, ("human_qualities", "professional_contribution"), theme.key, BEHAVIOUR, 2, used)
    if quotes:
        b.h2("Ce qu'en disent les collaborateurs")
        for text, c in quotes[:5]:
            b.quote(text, RELATION_GLOBAL.get(c.relation, ""), TEAL)
    achievements = [c for c in contributions if (c.answers.get("achievements") or "").strip()]
    if achievements:
        b.h2("Les réalisations reconnues")
        b.p(f"{len(achievements)} contributions citent au moins une réalisation dont l'organisation est fière. En voici quelques-unes, "
            "représentatives de ce que les collaborateurs valorisent :")
        seen = set()
        for c in sorted(achievements, key=lambda c: (abs(len(c.answers["achievements"]) - 140), c.answers["achievements"])):
            if _norm(c.answers["achievements"]) in seen:
                continue
            seen.add(_norm(c.answers["achievements"]))
            b.quote(c.answers["achievements"], RELATION_GLOBAL.get(c.relation, ""), BLUE)
            if len(seen) == 3:
                break
    if len(top_strengths) >= 2:
        b.box("Lecture", f"Les contributions dessinent {top_strengths[0][0].reading}, et {top_strengths[1][0].reading}. Ce socle est un atout "
                         "à préserver : c'est sur lui que peuvent s'appuyer les plans de progrès, plutôt que de les construire contre lui.")

    # -- 5. Leviers --------------------------------------------------------------------
    action = (f"Deux leviers collectifs se dégagent : {top_levers[0][0].label.lower()} et {top_levers[1][0].label.lower()}"
              if len(top_levers) >= 2 else "Les leviers qui augmenteraient l'impact de chacun")
    b.h1("Les leviers d'impact", action)
    b.p("La rubrique « ce qui pourrait encore augmenter ton impact » recueille les suggestions des collègues, formulées comme des leviers "
        "d'avenir et non comme des jugements. Elle distingue le leadership et les comportements (4.1) des compétences et pratiques (4.2).")
    lead, skill = top(levers_lead, BEHAVIOUR, 6), top(levers_skill, BEHAVIOUR, 6)
    if lead:
        b.figure_block("Leviers de leadership, d'attitudes et de comportements (4.1)",
                       BarList([(t.label, v, fmt_pct(pct(v, total))) for t, v in lead], color=TEAL, max_value=total),
                       note=uncoded_note(contributions, ("impact_leadership",), BEHAVIOUR))
    if skill:
        b.figure_block("Leviers de compétences et de pratiques professionnelles (4.2)",
                       BarList([(t.label, v, fmt_pct(pct(v, total))) for t, v in skill], color=TEAL, max_value=total),
                       note=uncoded_note(contributions, ("impact_skills",), BEHAVIOUR))
    quotes = []
    for theme, _v in top_levers[:2]:
        quotes += pick_quotes(contributions, ("impact_leadership", "impact_skills"), theme.key, BEHAVIOUR, 2, used)
    if quotes:
        b.h2("Ce que suggèrent les collaborateurs")
        for text, c in quotes[:4]:
            b.quote(text, RELATION_GLOBAL.get(c.relation, ""), TEAL)
    if len(top_levers) >= 2:
        b.box("Lecture", f"Les suggestions convergent vers « {top_levers[0][0].label} » ({fmt_pct(pct(top_levers[0][1], total))} des "
                         f"contributions) puis « {top_levers[1][0].label} » ({fmt_pct(pct(top_levers[1][1], total))}). Ces axes dépassent les "
                         f"situations individuelles et appellent une réponse collective : {top_levers[0][0].action}, et "
                         f"{top_levers[1][0].action}.")

    # -- 6. Potentiel & engagements ---------------------------------------------------
    action = (f"Un potentiel perçu d'abord tourné vers {top_potential[0][0].label.lower()}, et {len(commitments)} engagements de soutien à faire vivre"
              if top_potential else f"{len(commitments)} engagements de soutien à faire vivre")
    b.h1("Potentiel perçu et engagements", action)
    if top_potential:
        b.figure_block("Potentiel perçu à trois à cinq ans — part des contributions",
                       BarList([(t.label, v, fmt_pct(pct(v, total))) for t, v in top_potential], color=NAVY, max_value=total),
                       note=uncoded_note(contributions, ("potential",), POTENTIAL))
    b.h2("Les engagements entre collègues")
    b.kpis([
        (str(len(commitments)), "engagements de soutien pris"),
        (fmt_pct(pct(with_action, len(commitments))), "assortis d'une première action concrète"),
        (fmt_pct(pct(dated, len(commitments))), "avec une date de démarrage"),
    ], color=ORANGE)
    kinds = top(commitment_types, COMMITMENT, 6)
    if kinds:
        b.figure_block("Nature des engagements — part des engagements",
                       BarList([(t.label, v, fmt_pct(pct(v, len(commitments)))) for t, v in kinds], color=ORANGE, max_value=len(commitments)))
    b.box("Lecture", "Chaque engagement est une promesse faite à un collègue nommé. Leur valeur tient à leur suivi : un engagement daté, "
                     "assorti d'une première action et revu à 30 puis 90 jours a toutes les chances d'être tenu ; un engagement laissé sans "
                     "suite affaiblit la confiance que l'exercice a créée.", tint=TINT_ORANGE, color=ORANGE)

    # -- 7. Round 2 -------------------------------------------------------------------------
    b.h1("Le Round 2 : appropriation et décisions",
         f"{round2_done} collaborateurs sur {n_people} ont formalisé ce qu'ils retiennent et décident ({fmt_pct(pct(round2_done, n_people))})")
    if round2_rows:
        prio = top(priorities, BEHAVIOUR, 6)
        if prio:
            b.figure_block("Priorités de développement retenues par les collaborateurs — part des Round 2 remplis",
                           BarList([(t.label, v, fmt_pct(pct(v, len(round2_rows)))) for t, v in prio], color=TEAL, max_value=len(round2_rows)))
        sup = top(support, COMMITMENT, 5)
        if sup:
            b.figure_block("Soutien attendu des collègues — part des Round 2 remplis",
                           BarList([(t.label, v, fmt_pct(pct(v, len(round2_rows)))) for t, v in sup], color=ORANGE, max_value=len(round2_rows)))
        common = {t.key for t, _v in prio[:3]} & {t.key for t, _v in top_levers[:3]}
        b.box("Lecture", ("Les priorités retenues rejoignent les leviers suggérés par les collègues, ce qui témoigne d'une écoute réelle du Round 1."
                          if common else
                          "Les priorités retenues s'écartent en partie des leviers suggérés par les collègues : la restitution individuelle "
                          "est l'occasion d'en discuter."))
    else:
        b.box("Lecture", "Aucun Round 2 n'a encore été rempli sur cette campagne : l'appropriation de l'exercice reste entièrement à engager.")

    # -- 8. Recommandations -----------------------------------------------------------
    b.h1("Recommandations", "Trois horizons : consolider l'exercice, agir sur les leviers collectifs, ancrer la pratique")
    colors_by_priority = {"Haute": "#B23F3F", "Moyenne": "#F28C28", "Normale": "#2E7FC1"}
    rows = [[
        f"<b>{i}</b>",
        f"<b>{escape(r.title)}</b><br/>{escape(r.detail)}",
        escape(r.finding),
        escape(r.owner),
        escape(r.horizon),
        f'<font color="{colors_by_priority[r.priority]}"><b>{r.priority}</b></font>',
    ] for i, r in enumerate(recommendations, start=1)]
    b.table("Plan de recommandations", ["#", "Recommandation", "Constat", "Porteur", "Horizon", "Priorité"], rows,
            [7 * mm, 62 * mm, 38 * mm, 27 * mm, 17 * mm, 19 * mm], ["center", "left", "left", "left", "center", "center"])

    # -- Annexes ---------------------------------------------------------------------------
    b.h1_plain("Annexe A — Participation par personne")
    rows = []
    for dept, level, members in teams:
        for u in members:
            got = data.received(u.id)
            rel = Counter(c.relation for c in got)
            rows.append([
                escape(name_of(u)), escape(dept), f"<b>{len(got)}</b>" if len(got) >= 3 else f'<font color="#B23F3F"><b>{len(got)}</b></font>',
                f"{rel.get('MANAGER', 0)} · {rel.get('PEER', 0)} · {rel.get('REPORT', 0)}", given[u.id], "Oui" if data.round2.get(u.id) else "—",
            ])
    b.table("Regards reçus et donnés, Round 2", ["Collaborateur", "Équipe", "Reçus", "Resp. · Pairs · Collab.", "Donnés", "Round 2"], rows,
            [48 * mm, 46 * mm, 14 * mm, 30 * mm, 15 * mm, 17 * mm], ["left", "left", "center", "center", "center", "center"],
            note="en rouge, les personnes ayant reçu moins de trois regards")
    b.h1_plain("Annexe B — Grille de codage thématique")
    b.p("Les réponses libres sont rapprochées des thèmes ci-dessous par la présence de mots-clés, accents et majuscules ignorés. "
        "Les mots-clés sont des racines : « disponib » couvre disponible et disponibilité. Une réponse peut relever de plusieurs thèmes.")
    b.table("Thèmes comportementaux et managériaux (forces, leviers, priorités)", ["Thème", "Mots-clés indicatifs"],
            [[f"<b>{t.label}</b>", escape(", ".join(t.stems[:7]))] for t in BEHAVIOUR], [62 * mm, CONTENT_W - 62 * mm])
    b.table("Thèmes de potentiel", ["Thème", "Mots-clés indicatifs"],
            [[f"<b>{t.label}</b>", escape(", ".join(t.stems[:7]))] for t in POTENTIAL], [62 * mm, CONTENT_W - 62 * mm])
    b.table("Types d'engagement et de soutien", ["Type", "Mots-clés indicatifs"],
            [[f"<b>{t.label}</b>", escape(", ".join(t.stems[:7]))] for t in COMMITMENT], [62 * mm, CONTENT_W - 62 * mm])
    b.h1_plain("Annexe C — Glossaire")
    b.table("Définitions", ["Terme", "Définition"], [
        ["<b>Feedforward</b>", "Démarche de retour tournée vers l'avenir : reconnaître les forces et suggérer des leviers de progrès, plutôt que juger la performance passée."],
        ["<b>Round 1</b>", "Contribution signée d'un collègue pour une personne : qualités, contribution, réalisations, leviers d'impact, potentiel, engagement."],
        ["<b>Round 2</b>", "Réponse de la personne elle-même : ce qu'elle retient, ses forces à capitaliser, une à deux priorités, un engagement à 90 jours, le soutien attendu."],
        ["<b>Regard</b>", "Une contribution Round 1 reçue par une personne."],
        ["<b>Couverture</b>", "Part des collaborateurs ayant reçu un nombre donné de regards ; trois regards constituent le seuil d'une lecture croisée fiable."],
        ["<b>Engagement de soutien</b>", "Promesse concrète d'un collègue pour aider la personne à réussir (rubrique 6 du Round 1)."],
    ], [42 * mm, CONTENT_W - 42 * mm])

    return b.render(
        title=f"360° Feedforward — Synthèse de l'organisation — {company.name}",
        subject=f"{company.name} · {campaign.name}",
        header_left="360° Feedforward — Synthèse de l'organisation",
        header_right=f"{company.name} · {campaign.name}",
        classification="STRICTEMENT CONFIDENTIEL",
    )


def _team_rows(company, people):
    """Équipes dans l'ordre de l'organigramme : chaque direction, puis ses services."""
    depts = list(Department.objects.filter(company=company).select_related("parent"))
    members = {}
    for u in people:
        members.setdefault(u.department_id, []).append(u)
    rows = []
    for direction in sorted([d for d in depts if d.parent_id is None], key=lambda d: d.name.casefold()):
        rows.append((direction.name, 0, members.get(direction.id, [])))
        for service in sorted([d for d in depts if d.parent_id == direction.id], key=lambda d: d.name.casefold()):
            rows.append((service.name, 1, members.get(service.id, [])))
    if members.get(None):
        rows.append(("Sans équipe", 0, members[None]))
    return rows


def _global_recommendations(data, total, n_people, below3, round2_done, top_strengths, top_levers, top_potential, commitments, with_action, dated):
    recs = [Recommendation(
        "Organiser la restitution individuelle de chaque rapport Round 1",
        "Un échange de 30 à 45 minutes entre chaque collaborateur et son responsable pour lire ensemble les contributions, repérer les "
        "convergences et arrêter une à deux priorités.",
        f"{round2_done} collaborateurs sur {n_people} ont formalisé leur Round 2.",
        "Managers, avec l'appui RH", "30 jours", "Haute",
    )]
    if below3:
        recs.append(Recommendation(
            "Compléter la couverture des regards",
            f"Solliciter deux à trois contributeurs supplémentaires pour les {len(below3)} personnes qui ont reçu moins de trois regards (annexe A).",
            f"{len(below3)} personne(s) sous le seuil de trois regards.", "Fonction RH", "30 jours", "Haute",
        ))
    if pct(round2_done, n_people) < 80:
        recs.append(Recommendation(
            "Relancer et accompagner le Round 2",
            "Fixer une échéance, rappeler l'enjeu — transformer les regards reçus en décisions — et proposer un appui RH à ceux qui le souhaitent.",
            f"Round 2 rempli par {fmt_pct(pct(round2_done, n_people))} des collaborateurs.", "Fonction RH", "30 jours", "Haute",
        ))
    for theme, value in top_levers[:2]:
        recs.append(Recommendation(
            f"Agir collectivement sur « {theme.label} »",
            theme.action[0].upper() + theme.action[1:] + ".",
            f"Levier cité dans {fmt_pct(pct(value, total))} des contributions.", "Direction Générale et RH", "90 jours", "Haute",
        ))
    if commitments:
        recs.append(Recommendation(
            "Faire vivre les engagements de soutien",
            f"Suivre les {len(commitments)} engagements pris entre collègues : point d'étape à 30 et 90 jours, intégré aux rituels d'équipe existants.",
            f"{fmt_pct(pct(with_action, len(commitments)))} des engagements ont une première action ; {fmt_pct(pct(dated, len(commitments)))} sont datés.",
            "Managers", "30 à 90 jours", "Moyenne",
        ))
    if top_strengths:
        theme = top_strengths[0][0]
        recs.append(Recommendation(
            f"Capitaliser sur « {theme.label} »",
            "En faire un repère explicite de la culture managériale : le nommer dans les rituels d'équipe, l'intégrer aux critères de "
            "recrutement et d'intégration, s'appuyer sur les collaborateurs qui l'incarnent.",
            f"Force citée dans {fmt_pct(pct(top_strengths[0][1], total))} des contributions.", "Direction Générale", "90 jours", "Moyenne",
        ))
    recs.append(Recommendation(
        "Intégrer le potentiel perçu à la revue des talents",
        "Croiser les potentiels identifiés par les pairs avec les évaluations ID-3A et la matrice 9 Box, pour alimenter les plans de "
        "succession et de mobilité.",
        f"Potentiel le plus cité : {top_potential[0][0].label.lower()}." if top_potential else "Potentiel peu renseigné.",
        "Direction Générale et RH", "6 mois", "Moyenne",
    ))
    recs.append(Recommendation(
        "Reconduire le 360° Feedforward à chaque campagne",
        "Mesurer l'évolution de la couverture et des leviers retenus, et faire du Feedforward un rituel managérial.",
        "Première base de comparaison constituée.", "Fonction RH", "6 mois", "Normale",
    ))
    order = {"Haute": 0, "Moyenne": 1, "Normale": 2}
    return sorted(recs, key=lambda r: order[r.priority])


# ---------------------------------------------------------------------------
# Rapport individuel — Round 1
# ---------------------------------------------------------------------------
def build_individual_report(company, campaign, subject, prepared_for):
    data = Dataset.load(company, campaign)
    got = sorted(data.received(subject.id), key=lambda c: ({"MANAGER": 0, "PEER": 1, "REPORT": 2}.get(c.relation, 3), name_of(c.author)))
    if not got:
        raise ReportError(
            f"{name_of(subject)} n'a reçu aucune contribution Round 1 sur la campagne « {campaign.name} » : le rapport individuel n'aurait rien à présenter."
        )
    today = timezone.localdate()
    n = len(got)
    person = escape(name_of(subject))
    team = subject.department.name if subject.department_id else ""
    rel = Counter(c.relation for c in got)
    strengths = top(theme_counts(got, ("human_qualities", "professional_contribution"), BEHAVIOUR), BEHAVIOUR, 5)
    levers = top(theme_counts(got, ("impact_leadership", "impact_skills"), BEHAVIOUR), BEHAVIOUR, 5)
    potential = top(theme_counts(got, ("potential",), POTENTIAL), POTENTIAL, 3)
    commitments = [c for c in got if (c.answers.get("commitment") or "").strip()]
    achievements = [c for c in got if (c.answers.get("achievements") or "").strip()]

    source = f"ID-PMC, 360° Feedforward — Round 1, {campaign.name} — {n} contribution(s) reçue(s), édition du {fr_date(today)}"
    b = Builder(source)
    s = b.s

    # -- Couverture ----------------------------------------------------------
    b.add(Spacer(1, 4), para("RAPPORT INDIVIDUEL · ROUND 1", s["cover_label"]))
    b.add(para("360° Feedforward", s["cover_title"]))
    b.add(para("Ce que mes collègues voient en moi et pour moi", s["cover_sub"]))
    b.doc_info([
        ("Bénéficiaire", f"<b>{person}</b>"),
        ("Fonction", escape(subject.position or "—") + (f" · {escape(team)}" if team else "")),
        ("Entreprise · campagne", f"{escape(company.name)} · {escape(campaign.name)}"),
        ("Préparé à la demande de", escape(prepared_for)),
        ("Date d'édition", fr_date(today)),
        ("Classification", '<font color="#B23F3F"><b>Confidentiel</b></font> — usage personnel et managérial'),
    ])
    b.add(NextPageTemplate("body"))

    # -- À propos ---------------------------------------------------------------------------
    b.h1_plain("À propos de ce rapport")
    b.p(f"Ce rapport rassemble les <b>{n} contribution{'s' if n > 1 else ''}</b> que vos collègues vous ont adressée{'s' if n > 1 else ''} au "
        f"Round 1 du 360° Feedforward (campagne « {escape(campaign.name)} »). Chacune est signée : vos collègues se sont exprimés en leur "
        "nom, avec l'intention de vous aider à réussir.")
    b.p("Le Feedforward regarde vers l'avenir. Il ne juge pas le passé : il éclaire les forces sur lesquelles vous appuyer et les leviers "
        "qui peuvent accroître votre impact. Ce n'est pas une évaluation de votre performance.")
    b.box("Comment tirer le meilleur de ce rapport", [
        "<b>1. Lisez l'ensemble</b> des contributions, sans chercher à les justifier ni à les discuter.",
        "<b>2. Repérez les convergences</b> : un point cité par plusieurs collègues mérite votre attention.",
        "<b>3. Choisissez une ou deux priorités</b>, pas davantage : c'est la condition d'un changement réel.",
        "<b>4. Formalisez vos décisions au Round 2</b> et partagez-les avec votre responsable.",
    ])
    if n < 3:
        b.box("À noter", f"Avec {n} contribution{'s' if n > 1 else ''}, ce rapport donne des pistes plutôt qu'une lecture consolidée. "
                         "Solliciter un ou deux regards supplémentaires renforcerait sa portée.", tint=TINT_ORANGE, color=ORANGE)
    b.toc()

    # -- 1. Synthèse ------------------------------------------------------------------
    distinct = [t for t, _v in levers if not strengths or t.key != strengths[0][0].key]
    if strengths and distinct:
        action = f"Un point d'appui : {strengths[0][0].label.lower()} — un levier : {distinct[0].label.lower()}"
    elif strengths and levers:
        action = f"Un point d'appui à prolonger : {strengths[0][0].label.lower()}"
    elif strengths:
        action = f"Un point d'appui reconnu : {strengths[0][0].label.lower()}"
    else:
        action = "Ce que vos collègues voient en vous, en un coup d'œil"
    b.h1("Synthèse", action)
    b.kpis([
        (str(n), "contributions reçues, toutes signées"),
        (f"{rel.get('MANAGER', 0)} · {rel.get('PEER', 0)} · {rel.get('REPORT', 0)}", "regards de votre responsable · de pairs · de collaborateurs"),
        (str(len(commitments)), "engagements de soutien reçus"),
        (str(len(achievements)), "contributions citant une réalisation"),
    ])

    def cited(value):
        return f"cité par {value} collègue{'s' if value > 1 else ''} sur {n}"

    rows = [
        ["<b>Points d'appui</b>", "<br/>".join(f"{t.label} — <font color='#6B7280'>{cited(v)}</font>" for t, v in strengths[:3]) or "—"],
        ["<b>Leviers d'impact</b>", "<br/>".join(f"{t.label} — <font color='#6B7280'>{cited(v)}</font>" for t, v in levers[:3]) or "—"],
        ["<b>Potentiel perçu</b>", "<br/>".join(f"{t.label} — <font color='#6B7280'>{cited(v)}</font>" for t, v in potential[:2]) or "—"],
    ]
    b.table("Vue d'ensemble des regards reçus", ["Dimension", "Thèmes les plus cités"], rows, [40 * mm, CONTENT_W - 40 * mm], zebra=False,
            note="un thème est compté une fois par contribution ; la grille de lecture est celle du rapport de synthèse de l'organisation")
    reading = []
    if strengths:
        first = f"Vos collègues mettent d'abord en avant {strengths[0][0].you} ({cited(strengths[0][1])})"
        if len(strengths) > 1:
            first += f", ainsi que {strengths[1][0].you} ({cited(strengths[1][1])})"
        reading.append(first + ".")
    if levers:
        second = f"Pour accroître votre impact, ils vous invitent surtout à {levers[0][0].lever_you}"
        if any(levers[0][0].key == t.key for t, _v in strengths[:2]):
            second += " — un prolongement de ce qu'ils apprécient déjà chez vous"
        if len(levers) > 1:
            second += f", et à {levers[1][0].lever_you}"
        reading.append(second + ".")
    if potential:
        reading.append(f"Ils vous voient évoluer vers {potential[0][0].you}.")
    if reading:
        b.box("Lecture d'ensemble", " ".join(reading))

    # -- 2. Forces --------------------------------------------------------------------
    b.h1("Ce que vos collègues apprécient chez vous", "Les qualités humaines et la contribution professionnelle qu'ils reconnaissent")
    for key, title in (("human_qualities", "En tant que personne"), ("professional_contribution", "Dans votre contribution professionnelle")):
        answered = [c for c in got if (c.answers.get(key) or "").strip()]
        if answered:
            b.h2(title)
            for c in answered:
                b.quote(c.answers[key], _signature(c), BLUE)

    # -- 3. Réalisations -----------------------------------------------------------
    if achievements:
        b.h1("Vos réalisations reconnues", f"{len(achievements)} collègue{'s' if len(achievements) > 1 else ''} citent des réalisations dont l'organisation est fière")
        for c in achievements:
            b.quote(c.answers["achievements"], _signature(c), BLUE)

    # -- 4. Leviers ---------------------------------------------------------------------
    action = f"Le levier le plus cité : {levers[0][0].label.lower()}" if levers else "Les suggestions de vos collègues pour accroître votre impact"
    b.h1("Les leviers pour accroître votre impact", action)
    b.p("Ces suggestions sont formulées comme des leviers d'avenir, non comme des jugements. Vos collègues ont été invités à privilégier une "
        "ou deux recommandations réellement importantes.")
    for key, title in (("impact_leadership", "Leadership, attitudes et comportements"), ("impact_skills", "Compétences et pratiques professionnelles")):
        answered = [c for c in got if (c.answers.get(key) or "").strip()]
        if answered:
            b.h2(title)
            for c in answered:
                b.quote(c.answers[key], _signature(c), TEAL)

    # -- 5. Potentiel ----------------------------------------------------------------------
    answered = [c for c in got if (c.answers.get("potential") or "").strip()]
    if answered:
        b.h1("Le potentiel que vos collègues voient en vous", "La contribution supplémentaire qu'ils vous voient apporter dans les trois à cinq ans")
        for c in answered:
            b.quote(c.answers["potential"], _signature(c), NAVY)

    # -- 6. Engagements -----------------------------------------------------------------
    if commitments:
        b.h1("Les engagements de vos collègues à vos côtés",
             f"{len(commitments)} collègue{'s' if len(commitments) > 1 else ''} s'engage{'nt' if len(commitments) > 1 else ''} concrètement pour vous aider à réussir")
        rows = [[
            f"<b>{escape(name_of(c.author))}</b><br/><font color='#6B7280'>{escape(RELATION_SHORT.get(c.relation, ''))}</font>",
            safe(c.answers.get("commitment")), safe(c.answers.get("commitment_first_action")) or "—",
            safe(c.answers.get("commitment_from")) or "—", safe(c.answers.get("commitment_how")) or "—",
        ] for c in commitments]
        b.table("Engagements de soutien", ["Collègue", "Je m'engage à…", "Première action", "À partir de", "Comment compter sur moi"], rows,
                [33 * mm, 42 * mm, 36 * mm, 22 * mm, CONTENT_W - 133 * mm], head_color=ORANGE)
        b.box("Conseil", "Remerciez chacun de ces collègues et convenez d'un premier rendez-vous : un engagement suivi à 30 jours a toutes les "
                         "chances d'être tenu.", tint=TINT_ORANGE, color=ORANGE)

    # -- 7. Prochaines étapes -------------------------------------------------------------
    b.h1("Prochaines étapes", "Transformer ces regards en décisions : le Round 2")
    b.table("Feuille de route proposée", ["Étape", "Quand", "Ce qu'il s'agit de faire"], [
        ["<b>1. Prendre connaissance</b>", "J", "Lire l'ensemble du rapport, au calme, en notant ce qui vous touche et ce qui vous surprend."],
        ["<b>2. Échanger avec votre responsable</b>", "J + 7", "Un échange de 30 à 45 minutes pour repérer les convergences et clarifier les suggestions."],
        ["<b>3. Remplir le Round 2</b>", "J + 15", "Formaliser sur la plateforme ce que vous retenez, une à deux priorités et un engagement à 90 jours."],
        ["<b>4. Remercier et activer les engagements</b>", "J + 15", "Revenir vers les collègues qui se sont engagés et convenir des premières actions."],
        ["<b>5. Faire le point</b>", "J + 30 · J + 90", "Mesurer vos progrès avec votre responsable et ajuster ; demander un nouveau regard à quelques collègues."],
    ], [48 * mm, 24 * mm, CONTENT_W - 72 * mm], ["left", "center", "left"])
    b.h2("Les cinq questions du Round 2")
    for i, (title, question) in enumerate(ROUND2_QUESTIONS, start=1):
        b.p(f"<b>{i}. {escape(title)}</b><br/><font color='#6B7280'>{escape(question)}</font>", "body_tight")
        b.add(Spacer(1, 4))
    b.h2("Mes priorités — à préparer avant le Round 2", room=125 * mm)
    worksheet = []
    for i in (1, 2):
        worksheet.append([para(f"<b>Priorité {i}</b>", s["cell_bold"]), ""])
        for label in ("Ce que je ferai concrètement", "Comment je saurai que j'ai progressé", "Le soutien que je demande"):
            worksheet.append([para(label, s["cell"]), ""])
    table = Table(worksheet, colWidths=[52 * mm, CONTENT_W - 52 * mm], rowHeights=[7 * mm if r % 4 == 0 else 13 * mm for r in range(len(worksheet))])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, RULE),
        ("BACKGROUND", (0, 0), (-1, 0), TINT_TEAL),
        ("BACKGROUND", (0, 4), (-1, 4), TINT_TEAL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("SPAN", (0, 0), (-1, 0)),
        ("SPAN", (0, 4), (-1, 4)),
    ]))
    b.add(KeepTogether([table]))

    return b.render(
        title=f"360° Feedforward — Round 1 — {name_of(subject)}",
        subject=f"{company.name} · {campaign.name}",
        header_left=f"360° Feedforward — Round 1 · {name_of(subject)}",
        header_right=f"{company.name} · {campaign.name}",
        classification="CONFIDENTIEL",
    )


def _signature(c):
    position = f", {c.author.position}" if c.author.position else ""
    return f"{name_of(c.author)}{position} · {RELATION_SHORT.get(c.relation, '')}"


def report_filename(company, campaign, subject=None):
    parts = [slug(company.name), "360-Feedforward", "Rapport-global" if subject is None else f"Round-1_{slug(name_of(subject))}", slug(campaign.name)]
    return "_".join(parts) + ".pdf"
