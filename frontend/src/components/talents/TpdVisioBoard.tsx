import { Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PerformanceRating } from "@/api/types";
import { QUADRANT_EDGE, QUADRANT_TINTS } from "@/theme";

/* ---------------------------------------------------------------------------
 * TPD-VISIO — le plateau ID-TPD.
 *
 * Configuration retenue, et pourquoi.
 *
 * 1. Un damier plutôt qu'un fond quadrillé. Le plateau se lit comme une table
 *    de jeu : 12 × 8 cases alternées, une dalle épaisse, une ombre diffuse.
 *    Les cases sont carrées dans le plan du plateau et se voient à peine
 *    écrasées, du facteur sin(60°) — c'est l'alternance du damier qui donne à
 *    lire l'inclinaison.
 *
 * 2. Un repère orthonormé vu de dessus, légèrement basculé vers l'avant. Le basculement est une simple
 *    rotation autour de l'horizontale : les côtés restent verticaux, les bords
 *    horizontaux, les angles droits. La perspective conique a été essayée puis
 *    écartée — elle faisait converger les côtés et rétrécissait les
 *    compartiments du fond. Ici le relief vient de l'épaisseur et de l'ombre,
 *    non d'une déformation du plateau.
 *
 * 3. Quatre compartiments identiques. Ce sont eux qui portent la lecture, pas
 *    la grille : bleu clair, bordés de marine, en retrait des axes. L'origine
 *    étant au centre du plateau, ils couvrent les mêmes 40 points de
 *    performance et les mêmes 20 points d'écart, et se valent donc au pixel
 *    près. Toute personne y est contenue entièrement — portrait et libellés
 *    compris, pas seulement les pieds — quelles que soient ses valeurs.
 *
 * 4. Les graduations bordent les axes, à l'intérieur du plateau : les
 *    pourcentages de performance sous la ligne horizontale, les écarts à
 *    gauche de la verticale, dans la gouttière laissée libre entre les axes et
 *    les compartiments.
 *
 * Toute la géométrie passe par `plan(u, v)` : l'emprise du plateau, et le cas
 * échéant son inclinaison, se règlent en un seul endroit.
 * ------------------------------------------------------------------------- */

export interface VisioPerson {
  userId: number;
  name: string;
  position: string;
  department: string | null;
  /** Portrait en pied si le compte en possède un, sinon la vignette ronde. */
  photo: string | null;
  avatar: string | null;
  performance: number;
  progression: number | null;
  rating: PerformanceRating;
}

// --- Cadre -----------------------------------------------------------------
const W = 2900;
/** Marge devant, au plus près du cadre : c'est la convergence qui dégage,
 *  vers le fond, la place où se posent les repères de quadrant. */
const SIDE_MARGIN = 30;
/** Air au-dessus du fond de la table : les silhouettes qui s'y tiennent
 *  dépassent du plateau, puisqu'elles sont debout dessus. Recadrée si
 *  personne ne l'occupe. */
const TOP_ROOM = 344;
/** Air sous la tranche basse, pour l'épaisseur de la dalle et son ombre. */
const BOTTOM_ROOM = 120;

// --- Échelles --------------------------------------------------------------
/**
 * Fenêtre de performance : 50 à 120 %, comme sur la planche de référence.
 *
 * L'origine des 90 % ne tombe donc pas au milieu — huit colonnes en dessous,
 * six au-dessus — et les compartiments de gauche sont plus larges que ceux de
 * droite. C'est ainsi sur la planche, et c'est fidèle au propos : l'échelle
 * descend bas sous l'objectif et le dépasse peu.
 */
const PERF_MIN = 50;
const PERF_MAX = 120;
const PERF_ORIGIN = 90; // objectifs atteints, au centre
const EVO_MIN = -20;
const EVO_MAX = 20;
/**
 * Pas des graduations : 5 % sur les deux axes, soit 12 colonnes pour 8 rangées.
 *
 * L'inclinaison avait un temps commandé ce pas : tant qu'une silhouette devait
 * tenir tout entière dans son compartiment, un plateau couché exigeait de
 * grosses cases pour lui rendre de la hauteur. Les silhouettes se tenant
 * maintenant debout sur la table, seuls leurs pieds ont à y tenir, et le pas
 * fin redevient libre.
 */
const PERF_STEP = 5;
const EVO_STEP = 5;
const COLS = (PERF_MAX - PERF_MIN) / PERF_STEP; // 12 colonnes
const ROWS = (EVO_MAX - EVO_MIN) / EVO_STEP; // 8 rangées

// --- Emprise du plateau ----------------------------------------------------
/**
 * Perspective de la planche de référence : un trapèze qui se resserre au fond.
 *
 * Les côtés convergent — le bord du fond ne mesure que trois quarts du bord
 * avant — tandis que les rangées restent également espacées en hauteur. C'est
 * la perspective simple d'un plateau posé devant soi, celle du modèle.
 *
 * J'avais écarté cette convergence deux fois, pour garder des côtés parallèles
 * et quatre compartiments égaux ; la planche de référence, elle, l'assume, et
 * c'est elle qui fait loi. Le resserrement dégage au passage, sur les côtés du
 * fond, la place où se posent les repères de quadrant.
 */
const FRONT_WIDTH = W - 2 * SIDE_MARGIN;
/** Le fond ne fait plus que ces trois quarts : toute la fuite est là. */
const BACK_RATIO = 0.753;
const BACK_WIDTH = FRONT_WIDTH * BACK_RATIO;
/**
 * Profondeur vue, rapportée à la largeur. Le modèle la donne à 0,325 ; elle
 * est portée à 0,37 pour que les compartiments respirent — c'est elle, et non
 * les marges déjà au plus juste, qui commande leur hauteur.
 */
const DEPTH = FRONT_WIDTH * 0.37;
const CENTER_X = W / 2;
const FLOOR_FRONT_Y = TOP_ROOM + DEPTH;
const H = FLOOR_FRONT_Y + BOTTOM_ROOM;

// --- Palette ---------------------------------------------------------------
const NAVY = "#31527f";
const NAVY_DEEP = "#1f3760";
const CELL_LIGHT = "#fbfdff";
const CELL_EDGE = "#b3c6dd";
/** Contour et aplats des compartiments, partagés avec l'ID-TPD : les deux
 *  planches croisent les mêmes axes et doivent se lire de la même couleur. */
const COMPARTMENT_EDGE = QUADRANT_EDGE;
const COMPARTMENT_STROKE = 7;
const POSTIT = "#f5e050";
const GREEN = "#7cb342";
const TEXT = "#1a2744";
const RED = "#c62828";

function ratio(value: number, min: number, max: number) {
  return (Math.min(max, Math.max(min, value)) - min) / (max - min);
}

/**
 * Point du plateau : `u` le long des performances, `v` le long des écarts.
 *
 * Les deux axes restent indépendants : `u` ne joue que sur l'abscisse, `v` que
 * sur l'ordonnée, où l'inclinaison a déjà été prise en compte dans DEPTH.
 *
 * `scale` est la taille d'une silhouette posée là. Elle ne suit pas le
 * raccourci du sol — quelqu'un debout sur une table reste vertical — mais
 * décroît doucement avec l'éloignement, comme le veut la distance. Sans ce
 * dégradé, les personnes du fond paraîtraient aussi proches que celles du
 * bord, et la table redeviendrait un dessin plat.
 */
function plan(u: number, v: number) {
  return {
    x: CENTER_X + (u - 0.5) * halfSpan(v) * 2,
    y: FLOOR_FRONT_Y - DEPTH * v,
    scale: 1.06 - 0.22 * v,
  };
}

/** Demi-largeur du plateau à la profondeur `v` : c'est elle qui porte la
 *  fuite, la hauteur des rangées restant régulière. */
function halfSpan(v: number) {
  return (FRONT_WIDTH + (BACK_WIDTH - FRONT_WIDTH) * v) / 2;
}

const U_ORIGIN = ratio(PERF_ORIGIN, PERF_MIN, PERF_MAX);
const V_ORIGIN = ratio(0, EVO_MIN, EVO_MAX);
/**
 * Gouttière le long des axes, où se logent les graduations — mesurée en pixels
 * plutôt qu'en cases, puisque c'est un encombrement de texte qu'elle doit
 * loger, et non une fraction du plateau.
 *
 * Elle est dissymétrique de part et d'autre de l'axe vertical, et c'est
 * volontaire : les écarts s'écrivent à sa droite (« +15 % ») et réclament 84 px,
 * tandis qu'à sa gauche rien n'est écrit — 34 px y suffisent à ne pas coller la
 * bordure du compartiment contre l'axe. Les compartiments de gauche gagnent
 * ainsi 50 px de largeur que rien ne justifiait de leur prendre.
 *
 * Sous l'axe horizontal, les pourcentages de performance ne coûtent que leur
 * hauteur.
 */
const GUTTER_X_RIGHT = 84;
const GUTTER_X_LEFT = 34;
const GUTTER_Y = 36;
const GUTTER_U_RIGHT = GUTTER_X_RIGHT / FRONT_WIDTH;
const GUTTER_U_LEFT = GUTTER_X_LEFT / FRONT_WIDTH;
const GUTTER_V = GUTTER_Y / DEPTH;
/**
 * Marge entre un compartiment et le bord du plateau. Identique pour les quatre
 * compartiments, comme la gouttière — c'est ce qui les garde de même taille.
 *
 * Elle est réduite au minimum des quatre côtés : les compartiments poussent
 * jusqu'aux bords du plateau — ceux du haut vers le haut, ceux du bas vers le
 * bas, ceux de gauche vers la gauche, ceux de droite vers la droite — et il ne
 * reste que de quoi distinguer leur bordure de celle du plateau. Au-delà
 * commence la marge du cadre, qu'occupent les repères de quadrant, lesquels
 * doivent rester dehors pour se voir.
 */
const MARGIN_X = 12;
const MARGIN_Y = 22;
const MARGIN_U = MARGIN_X / FRONT_WIDTH;
const MARGIN_V = MARGIN_Y / DEPTH;
/** Débord du liseré clair autour de la grille. */
const MAT_U = 30 / FRONT_WIDTH;
const MAT_V = 24 / DEPTH;

/**
 * Repères de lecture, du plus proche du compartiment au plus éloigné. Ils
 * qualifient chaque quart d'un coup d'œil, posés en marge : à l'intérieur, ils
 * se perdaient derrière les silhouettes.
 */
const QUADRANT_MARKS: Record<string, { text: string; fill: string }[]> = {
  tl: [{ text: "+", fill: GREEN }, { text: "−", fill: RED }],
  tr: [{ text: "++", fill: GREEN }],
  bl: [{ text: "−", fill: RED }, { text: "−", fill: RED }],
  br: [{ text: "+", fill: GREEN }, { text: "−", fill: RED }],
};

/** Les quatre compartiments, en coordonnées du plateau. */
const COMPARTMENTS = [
  { key: "tl", above: false, rising: true, u0: MARGIN_U, u1: U_ORIGIN - GUTTER_U_LEFT, v0: V_ORIGIN + GUTTER_V, v1: 1 - MARGIN_V },
  { key: "tr", above: true, rising: true, u0: U_ORIGIN + GUTTER_U_RIGHT, u1: 1 - MARGIN_U, v0: V_ORIGIN + GUTTER_V, v1: 1 - MARGIN_V },
  { key: "bl", above: false, rising: false, u0: MARGIN_U, u1: U_ORIGIN - GUTTER_U_LEFT, v0: MARGIN_V, v1: V_ORIGIN - GUTTER_V },
  { key: "br", above: true, rising: false, u0: U_ORIGIN + GUTTER_U_RIGHT, u1: 1 - MARGIN_U, v0: MARGIN_V, v1: V_ORIGIN - GUTTER_V },
];

/** Contour arrondi d'un quadrilatère en perspective : chaque angle est repris
 * à `radius` sur ses deux côtés puis raccordé par une courbe passant par le
 * sommet. Les côtés restent ceux du plateau, seuls les angles s'adoucissent. */
function roundedQuad(u0: number, u1: number, v0: number, v1: number, radius: number) {
  const corners = [plan(u0, v1), plan(u1, v1), plan(u1, v0), plan(u0, v0)];
  const towards = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const step = Math.min(radius, length / 2);
    return { x: from.x + (dx / length) * step, y: from.y + (dy / length) * step };
  };
  let d = "";
  for (let i = 0; i < 4; i += 1) {
    const previous = corners[(i + 3) % 4];
    const corner = corners[i];
    const next = corners[(i + 1) % 4];
    const entry = towards(corner, previous);
    const exit = towards(corner, next);
    d += i === 0 ? `M ${entry.x} ${entry.y}` : ` L ${entry.x} ${entry.y}`;
    d += ` Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  return `${d} Z`;
}

function polygon(u0: number, u1: number, v0: number, v1: number) {
  const a = plan(u0, v1);
  const b = plan(u1, v1);
  const c = plan(u1, v0);
  const d = plan(u0, v0);
  return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
}

/** Hauteur d'un portrait en pied, avant mise à l'échelle par la profondeur. */
const PHOTO_H = 380;
/** Ce que la silhouette occupe au-dessus des pieds, en plus du portrait :
 *  le pourcentage de performance et l'écart. Sert à ménager la place au-dessus
 *  de la table, non plus à contraindre l'assise. */
const LABEL_ABOVE = 70;

/** Encombrement d'une silhouette posée à une profondeur donnée. */
function figureSize(hasPhoto: boolean, scale: number) {
  const height = hasPhoto ? PHOTO_H * scale : PHOTO_H * scale * 0.44;
  return { height, width: hasPhoto ? height * 0.34 : height };
}

/** Ramène une valeur entre deux bornes, en se plaçant au milieu si l'intervalle
 *  s'est refermé — mieux vaut le centre du compartiment qu'un bord dépassé. */
function confine(value: number, low: number, high: number) {
  return high < low ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}

/**
 * Pose une personne sur la table, à l'endroit que disent ses deux valeurs.
 *
 * Ce sont ses pieds qui sont placés, et eux seuls qui doivent tomber dans le
 * compartiment. La silhouette s'élève ensuite librement au-dessus : c'est ce
 * qui la fait tenir debout *sur* la table plutôt qu'enfermée *dans* une case.
 * On a longtemps réservé au-dessus des pieds la hauteur du portrait pour qu'il
 * ne dépasse jamais du compartiment ; c'était nier qu'une personne debout sur
 * un plan horizontal se dresse forcément au-dessus de lui.
 *
 * Reste à ce que les pieds ne chevauchent pas la bordure : d'où le retrait
 * d'une demi-largeur sur les côtés et d'une petite garde en profondeur.
 */
function seat(perf: number, evo: number, hasPhoto: boolean) {
  const zone =
    COMPARTMENTS.find((c) => c.above === perf >= PERF_ORIGIN && c.rising === (evo >= 0)) ?? COMPARTMENTS[0];
  const targetV = ratio(evo, EVO_MIN, EVO_MAX);
  const guard = 24 / DEPTH;
  const v = confine(targetV, zone.v0 + guard, zone.v1 - guard);

  const { width } = figureSize(hasPhoto, plan(0, v).scale);
  const halfU = width / (4 * halfSpan(v));
  const lowU = zone.u0 + halfU;
  const highU = zone.u1 - halfU;
  const u = confine(ratio(perf, PERF_MIN, PERF_MAX), lowU, highU);

  return { ...plan(u, v), minX: plan(lowU, v).x, maxX: plan(highU, v).x };
}

/** Écarte les silhouettes qui se poseraient l'une sur l'autre — sans jamais
 *  pousser personne hors de son compartiment : l'écartement se replie sur les
 *  bornes que l'assise a calculées. */
function spread(people: VisioPerson[]) {
  const placed: { person: VisioPerson; x: number; y: number; scale: number }[] = [];
  people.forEach((person) => {
    const point = seat(person.performance, person.progression ?? 0, Boolean(person.photo));
    let x = point.x;
    let guard = 0;
    while (placed.some((p) => Math.abs(p.x - x) < 150 && Math.abs(p.y - point.y) < 200) && guard < 12) {
      const step = 160 * Math.ceil((guard + 1) / 2);
      x = confine(point.x + (guard % 2 === 0 ? step : -step), point.minX, point.maxX);
      guard += 1;
    }
    placed.push({ person, x, y: point.y, scale: point.scale });
  });
  return placed;
}

export default function TpdVisioBoard({ people, periodLabel }: { people: VisioPerson[]; periodLabel: string }) {
  const { t } = useTranslation();
  // Du fond vers le bord : c'est l'ordre du peintre. Sans lui, une silhouette
  // lointaine pourrait recouvrir une silhouette proche, et la table
  // s'aplatirait aussitôt.
  const positioned = spread(people).sort((a, b) => a.y - b.y);
  const EDGE = 24;

  // Les deux flèches débordent légèrement du plateau : leur pointe est le
  // point d'ancrage des étiquettes.
  const axisTop = plan(U_ORIGIN, 1 + 54 / DEPTH);
  const axisRight = plan(1 + 62 / FRONT_WIDTH, V_ORIGIN);
  // Le repère des 90 % revient au croisement des deux axes, cœur du plateau :
  // la gouttière y ménage exactement la place de sa pastille.
  const axisCross = plan(U_ORIGIN, V_ORIGIN);

  // Le cadre ne garde au-dessus de la table que la place réclamée par ceux qui
  // s'y tiennent au fond — mais jamais moins que la pointe de la flèche.
  const highest = positioned.reduce(
    (top, { person, y, scale }) => Math.min(top, y - figureSize(Boolean(person.photo), scale).height - LABEL_ABOVE),
    axisTop.y
  );
  const viewTop = Math.max(0, Math.min(axisTop.y - EDGE, highest - EDGE));

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", bgcolor: "#fff" }}>
      <Stack spacing={0.25} sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 22, textAlign: "center", color: TEXT }}>
          {t("talents.visioTitle").toUpperCase()}
        </Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 16, textAlign: "center", color: TEXT }}>{periodLabel}</Typography>
      </Stack>

      <svg
        viewBox={`0 ${viewTop} ${W} ${H - viewTop}`}
        width="100%"
        style={{ display: "block", height: "auto", fontFamily: "Arial, Helvetica, sans-serif" }}
        role="img"
        aria-label={t("talents.visioTitle")}
      >
        <defs>
          <linearGradient id="tpd-slab-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#93a0b6" />
            <stop offset="100%" stopColor="#5b6980" />
          </linearGradient>
          <radialGradient id="tpd-shadow">
            <stop offset="0%" stopColor="#22304a" stopOpacity="0.42" />
            <stop offset="70%" stopColor="#22304a" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#22304a" stopOpacity="0" />
          </radialGradient>
          <marker id="tpd-arrow" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 16 8 L 0 16 z" fill={NAVY_DEEP} />
          </marker>
          {/* Ombre légère tout autour de la plateforme : à peine décalée vers
              le bas, largement diffusée, faible en intensité — elle pose le
              plateau sans le charger. Elle ne s'applique qu'à la dalle, si
              bien que le flou n'entame aucun bord du dessin. */}
          <filter id="tpd-plate-shadow" x="-15%" y="-15%" width="130%" height="140%">
            <feDropShadow dx="0" dy="14" stdDeviation="24" floodColor="#1c2a44" floodOpacity="0.17" />
          </filter>
        </defs>

        {/* ---- Le plateau : liseré, quadrillage, ombre ----------------------
            Le liseré est un trapèze un peu plus grand que la grille : c'est la
            bordure claire du modèle, qui donne au plateau son épaisseur de
            planche. Il porte l'ombre pour le groupe entier, dont la silhouette
            est ainsi calculée d'un bloc plutôt que case par case. */}
        <g id="plate" filter="url(#tpd-plate-shadow)">
          <polygon points={polygon(-MAT_U, 1 + MAT_U, -MAT_V, 1 + MAT_V)} fill="#fdfdfe" stroke="#d7dde6" strokeWidth={3} />

          {/* Quadrillage uni, non alterné : sur le modèle, ce sont les
              compartiments qui portent la lecture, la grille reste discrète. */}
          {Array.from({ length: COLS }).map((_, col) =>
            Array.from({ length: ROWS }).map((_, row) => (
              <polygon
                key={`c-${col}-${row}`}
                points={polygon(col / COLS, (col + 1) / COLS, row / ROWS, (row + 1) / ROWS)}
                fill={CELL_LIGHT}
                stroke={CELL_EDGE}
                strokeWidth={1.6}
              />
            ))
          )}
          <polygon points={polygon(0, 1, 0, 1)} fill="none" stroke="#9fb2c8" strokeWidth={2.5} />
        </g>

        {/* ---- Les quatre compartiments ------------------------------------
            Cernés d'un trait épais, sur l'aplat qui dit leur sens : vert en
            haut à droite pour les performants qui progressent, rouge en bas à
            gauche pour ceux qui reculent. Ce sont les teintes de l'ID-TPD, et
            elles viennent de la même source — les deux planches croisent les
            mêmes axes, elles ne peuvent pas se contredire en couleur. */}
        <g id="compartments">
          {COMPARTMENTS.map((c) => (
            <path
              key={c.key}
              d={roundedQuad(c.u0, c.u1, c.v0, c.v1, 62)}
              fill={QUADRANT_TINTS[c.key as keyof typeof QUADRANT_TINTS]}
              stroke={COMPARTMENT_EDGE}
              strokeWidth={COMPARTMENT_STROKE}
              // Pointillés ronds, comme sur l'ID-TPD. Les valeurs diffèrent des
              // siennes (1 et 6) parce que le trait est plus épais ici : ce
              // sont les proportions qui sont reprises, un point large comme le
              // trait et un intervalle du double — pas les nombres eux-mêmes,
              // qui donneraient un pointillé deux fois plus serré.
              strokeDasharray={`${COMPARTMENT_STROKE * 0.3} ${COMPARTMENT_STROKE * 2}`}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* ---- Axes, tous deux fléchés ------------------------------------- */}
        <g id="axes" stroke={NAVY_DEEP} fill="none" strokeWidth={5}>
          <line
            x1={plan(0, V_ORIGIN).x}
            y1={plan(0, V_ORIGIN).y}
            x2={axisRight.x}
            y2={axisRight.y}
            markerEnd="url(#tpd-arrow)"
          />
          <line
            x1={plan(U_ORIGIN, 0).x}
            y1={plan(U_ORIGIN, 0).y}
            x2={axisTop.x}
            y2={axisTop.y}
            markerEnd="url(#tpd-arrow)"
          />
        </g>

        {/* ---- Graduations, serrées contre leur ligne ----------------------
            Elles longent l'axe d'aussi près que leur hauteur le permet : les
            pourcentages de performance juste sous l'horizontale, les écarts
            juste à droite de la verticale. Tout ce qu'elles ne prennent pas,
            les compartiments le gagnent. */}
        <g id="ticks" fill={TEXT} fontWeight={700}>
          {Array.from({ length: COLS + 1 }).map((_, i) => {
            const perf = PERF_MIN + i * PERF_STEP;
            if (perf === PERF_ORIGIN) return null;
            const p = plan(i / COLS, V_ORIGIN);
            return (
              <text key={`tx-${perf}`} x={p.x} y={p.y + 34} textAnchor="middle" fontSize={26}>
                {perf}%
              </text>
            );
          })}
          {Array.from({ length: ROWS + 1 }).map((_, i) => {
            const evo = EVO_MIN + i * EVO_STEP;
            if (evo === 0) return null;
            // À droite de l'axe : à gauche, elles se perdaient sur la bordure
            // du compartiment voisin.
            const p = plan(U_ORIGIN, i / ROWS);
            return (
              <text key={`ty-${evo}`} x={p.x + 16} y={p.y + 9} textAnchor="start" fontSize={26}>
                {evo > 0 ? `+${evo}%` : `${evo}%`}
              </text>
            );
          })}
        </g>

        {/* ---- Étiquettes d'axes et repère des 90 % ------------------------
            Chacune se pose au bout de sa flèche, jamais au milieu du plateau :
            l'étiquette des performances contre la pointe de l'horizontale,
            celle des écarts contre la pointe de la verticale. Le repère des
            90 %, lui, marque le croisement des deux axes : c'est le centre du
            plateau, la place que la graduation manquante lui laisse. */}
        <g id="labels">
          <g transform={`translate(${axisRight.x - 404} ${axisRight.y - 62}) skewY(-3)`}>
            <rect width="404" height="54" rx="6" fill={POSTIT} stroke="#d9c53f" strokeWidth={2} />
            <text x="16" y="36" fontSize="25" fontWeight="800" fill={TEXT}>
              % {t("talents.performanceAxisShort")}
            </text>
          </g>
          <g transform={`translate(${axisTop.x - 98} ${axisTop.y + 10})`}>
            <rect width="56" height="200" rx="6" fill={POSTIT} stroke="#d9c53f" strokeWidth={2} />
            <text x="28" y="100" fontSize="25" fontWeight="800" fill={TEXT} textAnchor="middle" transform="rotate(90 28 100)">
              {t("talents.progressionAxisShort")}
            </text>
          </g>
          <g transform={`translate(${axisCross.x - 53} ${axisCross.y - 28})`}>
            <rect x="6" y="8" width="106" height="56" rx="4" fill="#5e8f31" />
            <rect width="106" height="56" rx="4" fill={GREEN} />
            <text x="53" y="39" textAnchor="middle" fontSize="29" fontWeight="800" fill="#fff">
              {PERF_ORIGIN}%
            </text>
          </g>
        </g>

        {/* ---- Collaborateurs, chacun dans son compartiment ---------------- */}
        <g id="people">
          {positioned.map(({ person, x: rawX, y, scale }) => {
            const hasPhoto = Boolean(person.photo);
            const { height, width } = figureSize(hasPhoto, scale);
            const halfSpan = Math.max(width / 2, 90);
            const x = Math.min(W - EDGE - halfSpan, Math.max(EDGE + halfSpan, rawX));
            const top = Math.max(viewTop + EDGE, y - height);
            const progression = person.progression;
            const progressionColor = progression === null ? "#7a7a7a" : progression >= 0 ? "#2e7d32" : RED;
            return (
              <g
                key={person.userId}
                className="tpd-person"
                data-user-id={person.userId}
                data-performance={person.performance}
                data-progression={progression ?? ""}
              >
                <title>
                  {`${person.name} — ${person.position}${person.department ? ` (${person.department})` : ""}\n`}
                  {`${t("talents.performance")} ${person.performance}%`}
                  {progression !== null ? ` · ${progression > 0 ? "+" : ""}${progression}%` : ""}
                </title>
                <ellipse
                  cx={x}
                  cy={y + 3}
                  rx={Math.max(width * 0.6, 40)}
                  ry={Math.max(width * 0.18, 12) * 0.5}
                  fill="url(#tpd-shadow)"
                />
                {hasPhoto ? (
                  <image
                    href={person.photo as string}
                    x={x - width / 2}
                    y={top}
                    width={width}
                    height={height}
                    preserveAspectRatio="xMidYMax meet"
                    style={{ mixBlendMode: "multiply" }}
                  />
                ) : (
                  <g>
                    {person.avatar && (
                      <clipPath id={`tpd-clip-${person.userId}`}>
                        <circle cx={x} cy={top + height / 2} r={height / 2} />
                      </clipPath>
                    )}
                    {/* Pas de fond : la vignette se pose sur la planche comme
                        les portraits, sans pastille qui masque le quadrillage.
                        Seul le cercle de contour situe la personne. */}
                    <circle cx={x} cy={top + height / 2} r={height / 2} fill="none" stroke={NAVY} strokeWidth={4} />
                    {person.avatar ? (
                      <image
                        href={person.avatar}
                        x={x - height / 2}
                        y={top}
                        width={height}
                        height={height}
                        clipPath={`url(#tpd-clip-${person.userId})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    ) : (
                      <text
                        x={x}
                        y={top + height * 0.66}
                        textAnchor="middle"
                        fontSize={height * 0.5}
                        fontWeight="800"
                        fill={NAVY}
                      >
                        {person.name.charAt(0).toUpperCase()}
                      </text>
                    )}
                  </g>
                )}
                <text x={x} y={top - 32} textAnchor="middle" fontSize={26} fontWeight="800" fill="#6d6d6d">
                  {person.performance}%
                </text>
                {progression !== null && (
                  <text x={x} y={top - 4} textAnchor="middle" fontSize={26} fontWeight="800" fill={progressionColor}>
                    {progression > 0 ? `+${progression}` : progression}
                  </text>
                )}
                <text x={x} y={y + 34} textAnchor="middle" fontSize={22} fontWeight="700" fill={TEXT}>
                  {person.name.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </g>

        {/* ---- Repères de lecture, posés hors du plateau ------------------
            Dans les compartiments, ils se perdaient derrière les silhouettes ;
            en marge, ils qualifient chaque quart d'un coup d'œil. */}
        <g id="quadrant-marks" fontWeight="800" fontSize={58}>
          {COMPARTMENTS.flatMap((c) => {
            // Calés sur le compartiment qu'ils qualifient, et non sur le bord
            // du plateau : celui-ci se rapproche du cadre à mesure qu'on
            // avance, et les repères du premier plan en sortaient.
            const edge = plan(c.above ? c.u1 : c.u0, (c.v0 + c.v1) / 2);
            const away = c.above ? 1 : -1;
            return QUADRANT_MARKS[c.key].map((mark, i) => (
              <text
                key={`${c.key}-${i}`}
                x={edge.x + away * (48 + 56 * i)}
                y={edge.y}
                textAnchor="middle"
                fill={mark.fill}
              >
                {mark.text}
              </text>
            ));
          })}
        </g>
      </svg>
    </Paper>
  );
}
