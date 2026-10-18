"""
Rédaction stratégique des rapports PDF par Claude.

Chaque rapport calcule ses chiffres (scores, répartitions, évolutions), puis
demande ici une synthèse exécutive rédigée « comme un associé de cabinet » :
un titre-constat, des paragraphes par thématique, et des recommandations
stratégiques d'ensemble. Claude ne reçoit que les faits calculés par le
rapport — jamais les avis individuels des questionnaires anonymes — et ne
doit rien affirmer qui n'en découle pas.

Sans clé (`ANTHROPIC_API_KEY`), ou si l'API échoue, `strategic_summary`
renvoie `None` : le rapport garde alors sa rédaction automatique. Un
rapport ne doit jamais échouer à cause de la rédaction.
"""
import json
import logging
import os
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"
TIMEOUT_SECONDS = 240

SYSTEM = """Tu es associé dans un cabinet de conseil en management et en capital humain (niveau Big Four), \
spécialiste de la méthode ID-PMC (People Management Canvas). Tu rédiges la synthèse exécutive d'un rapport \
remis à un dirigeant d'entreprise africaine francophone.

Exigences :
- Français soutenu, clair et direct ; vouvoiement implicite (on s'adresse à la Direction Générale).
- Analyse, pas description : relie les chiffres entre eux, explique ce qu'ils signifient pour la performance, \
  les risques et les leviers de l'organisation, hiérarchise ce qui compte. Chaque affirmation s'appuie sur les \
  faits fournis ; cite les chiffres clés (avec la virgule décimale française) ; n'invente aucune donnée, aucun \
  nom, aucun contexte de marché.
- La synthèse tient sur environ une page : un titre-constat, puis 4 à 5 thématiques, chacune avec un titre court \
  et un ou deux paragraphes denses (60 à 120 mots par paragraphe). Pas de listes à puces dans les paragraphes.
- Termine par 4 à 6 recommandations stratégiques d'ensemble (pas des actions anecdotiques) : un intitulé \
  d'action, sa justification au regard des constats, un porteur (fonction, jamais un nom), un horizon, une \
  priorité et un indicateur de suivi mesurable.
- Respecte les grilles de lecture du cabinet fournies dans les faits (elles priment sur toute autre convention).
- Si les faits sont limités (petit effectif, une seule campagne), dis-le et nuance la portée des conclusions.
- N'utilise ni emoji ni caractères décoratifs (flèches, puces, symboles)."""

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "Titre-constat de la synthèse, une phrase de 20 mots au plus."},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string", "description": "Titre court de la thématique."},
                    "paragraphs": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["theme", "paragraphs"],
                "additionalProperties": False,
            },
        },
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "rationale": {"type": "string"},
                    "owner": {"type": "string"},
                    "horizon": {"type": "string"},
                    "priority": {"type": "string", "enum": ["Haute", "Moyenne", "Basse"]},
                    "kpi": {"type": "string"},
                },
                "required": ["title", "rationale", "owner", "horizon", "priority", "kpi"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "sections", "recommendations"],
    "additionalProperties": False,
}


@dataclass
class Recommendation:
    title: str
    rationale: str
    owner: str
    horizon: str
    priority: str
    kpi: str


@dataclass
class Strategic:
    headline: str
    sections: list = field(default_factory=list)  # [(thème, [paragraphes])]
    recommendations: list = field(default_factory=list)  # [Recommendation]


_state = threading.local()


def enabled():
    return (bool(os.environ.get("ANTHROPIC_API_KEY")) and os.environ.get("REPORTS_AI", "on") != "off"
            and not getattr(_state, "disabled", False))


@contextmanager
def disabled():
    """Production immédiate (dans une requête web) : pas de rédaction, trop longue pour le délai d'une requête."""
    previous = getattr(_state, "disabled", False)
    _state.disabled = True
    try:
        yield
    finally:
        _state.disabled = previous


def reset_usage():
    _state.used = False


def was_used():
    """Vrai si la dernière production de ce fil a reçu une synthèse rédigée par Claude."""
    return getattr(_state, "used", False)


def strategic_summary(report_title, scope_label, campaign_name, facts):
    """Synthèse rédigée par Claude à partir de `facts` (dict sérialisable), ou `None`."""
    if not enabled():
        return None
    try:
        import anthropic

        client = anthropic.Anthropic(timeout=TIMEOUT_SECONDS, max_retries=1)
        prompt = (
            f"Rapport : {report_title}\nPérimètre : {scope_label}\nCampagne : {campaign_name}\n\n"
            "Faits calculés par la plateforme (JSON) :\n"
            + json.dumps(facts, ensure_ascii=False, indent=1, default=str)
            + "\n\nRédige la synthèse exécutive et les recommandations stratégiques au format demandé."
        )
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            thinking={"type": "adaptive"},
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            message = stream.get_final_message()
        if message.stop_reason in ("refusal", "max_tokens"):
            logger.warning("Rédaction du rapport interrompue (%s)", message.stop_reason)
            return None
        text = next(b.text for b in message.content if b.type == "text")
        data = json.loads(text)
        sections = [(s["theme"].strip(), [p.strip() for p in s["paragraphs"] if p.strip()]) for s in data["sections"] if s["paragraphs"]]
        recs = [Recommendation(**{k: str(r[k]).strip() for k in ("title", "rationale", "owner", "horizon", "priority", "kpi")})
                for r in data["recommendations"]]
        if not sections or not recs:
            return None
        _state.used = True
        return Strategic(data["headline"].strip(), sections, recs)
    except Exception:  # noqa: BLE001 — la rédaction ne doit jamais faire échouer le rapport
        logger.exception("Rédaction stratégique indisponible : rédaction automatique conservée")
        return None


def render_executive(b, strategic, para, escape):
    """Paragraphes par thématique, sous les chiffres clés de la synthèse."""
    for theme, paragraphs in strategic.sections:
        b.h2(theme, room=30 * 2.83465)
        for paragraph in paragraphs:
            b.add(para(escape(paragraph), b.s["body"]))


def render_recommendations(b, strategic, escape, mm, CONTENT_W):
    rows = [[str(i), f"<b>{escape(r.title)}</b><br/>{escape(r.rationale)}", escape(r.owner), escape(r.horizon), r.priority, escape(r.kpi)]
            for i, r in enumerate(strategic.recommendations, 1)]
    b.table("Recommandations stratégiques", ["#", "Action et justification", "Porteur", "Horizon", "Priorité", "Indicateur de suivi"], rows,
            [7 * mm, 66 * mm, 25 * mm, 18 * mm, 15 * mm, 39 * mm], align=["center", "left", "left", "center", "center", "left"])
