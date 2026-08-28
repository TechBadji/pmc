import { Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PerformanceRating } from "@/api/types";

/* ---------------------------------------------------------------------------
 * TPD-VISIO — le plateau ID-TPD.
 *
 * Configuration retenue, et pourquoi.
 *
 * 1. Un damier plutôt qu'un fond quadrillé. Le plateau se lit comme une table
 *    de jeu : 12 × 8 cases carrées alternées, posées sur un socle. C'est
 *    l'alternance des cases qui donne l'échelle, sans qu'aucun artifice de
 *    volume n'ait à s'en mêler.
 *
 * 2. Un rectangle droit. Le plateau a été successivement mis en perspective,
 *    où les côtés convergeaient, puis en projection oblique, où il partait en
 *    biais ; il est maintenant vu de face. Les côtés sont verticaux, les bords
 *    horizontaux, les cases carrées, et rien ne se déforme.
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
/** Marge libre de part et d'autre du plateau, où se posent les repères. */
const SIDE_MARGIN = 200;
/** Air au-dessus du fond du plateau. */
const TOP_ROOM = 90;
/** Air sous la tranche basse. */
const BOTTOM_ROOM = 70;

// --- Échelles --------------------------------------------------------------
/**
 * Fenêtre de performance, centrée sur l'objectif.
 *
 * Elle allait de 50 à 120 %, soit huit colonnes sous les 90 % et six au-dessus
 * — c'est de là que venait la différence de taille entre les compartiments de
 * gauche et ceux de droite, et aucun réglage de perspective ne pouvait la
 * corriger. Une fenêtre symétrique, 50-130, place l'origine au milieu exact du
 * plateau : les quatre compartiments couvrent alors les mêmes 40 points de
 * performance et les mêmes 20 points d'écart. Ils sont identiques par
 * construction, pas par réglage.
 */
const PERF_MIN = 60;
const PERF_MAX = 120;
const PERF_ORIGIN = 90; // objectifs atteints, au centre
const EVO_MIN = -20;
const EVO_MAX = 20;
/**
 * Pas des graduations : 5 % sur les deux axes, soit 12 colonnes pour 8 rangées.
 *
 * Le plateau incliné avait dû se contenter d'un pas de 10 % en performance :
 * le décalage oblique mangeait tant de largeur qu'il fallait de grosses cases
 * pour garder des compartiments capables d'accueillir une silhouette. Redressé,
 * le plateau récupère cette largeur et retrouve la lecture de 5 en 5.
 */
const PERF_STEP = 5;
const EVO_STEP = 5;
const COLS = (PERF_MAX - PERF_MIN) / PERF_STEP; // 12 colonnes
const ROWS = (EVO_MAX - EVO_MIN) / EVO_STEP; // 8 rangées

// --- Emprise du plateau ----------------------------------------------------
/**
 * Plateau droit, vu de face.
 *
 * Il a été successivement mis en perspective, où les côtés convergeaient et le
 * fond s'écrasait, puis en projection oblique, où il gardait sa forme mais
 * partait en biais. Il est maintenant simplement droit : les axes sont
 * horizontal et vertical, les côtés d'équerre, et rien ne se déforme. Ce que
 * l'inclinaison prenait en largeur est rendu aux compartiments.
 *
 * La largeur remplit le cadre moins les marges ; la profondeur en découle,
 * puisqu'une case doit rester carrée : autant de hauteur par rangée que de
 * largeur par colonne.
 */
const FRONT_WIDTH = W - 2 * SIDE_MARGIN;
/** Côté d'une case du damier. */
const FRONT_CELL = FRONT_WIDTH / COLS;
const DEPTH = ROWS * FRONT_CELL;
const CENTER_X = W / 2;
const FLOOR_FRONT_Y = TOP_ROOM + DEPTH;
const H = FLOOR_FRONT_Y + BOTTOM_ROOM;
const SLAB = 26; // socle sous la tranche basse

// --- Palette ---------------------------------------------------------------
const NAVY = "#31527f";
const NAVY_DEEP = "#1f3760";
const CELL_LIGHT = "#f2f7fd";
const CELL_DARK = "#dbe6f4"; // contraste assumé : le damier doit se voir
const CELL_EDGE = "#b7c8de";
const COMPARTMENT = "#cfe1f7";
const COMPARTMENT_EDGE = "#4a6fa5";
const POSTIT = "#f5e050";
const GREEN = "#7cb342";
const TEXT = "#1a2744";

function ratio(value: number, min: number, max: number) {
  return (Math.min(max, Math.max(min, value)) - min) / (max - min);
}

/**
 * Point du plateau : `u` le long des performances, `v` le long des écarts.
 *
 * Le plateau étant droit, les deux axes sont indépendants et rien ne se
 * déforme. Les silhouettes gardent donc toutes la même taille : les faire
 * varier n'avait de sens que pour dire une profondeur, et il n'y en a plus.
 */
function plan(u: number, v: number) {
  return {
    x: CENTER_X + (u - 0.5) * FRONT_WIDTH,
    y: FLOOR_FRONT_Y - DEPTH * v,
    scale: 1,
  };
}

const U_ORIGIN = ratio(PERF_ORIGIN, PERF_MIN, PERF_MAX);
const V_ORIGIN = ratio(0, EVO_MIN, EVO_MAX);
/**
 * Gouttière le long des axes, où se logent les graduations — mesurée en pixels
 * plutôt qu'en cases, puisque c'est un encombrement de texte qu'elle doit
 * loger, et non une fraction du plateau.
 *
 * Elle est plus large le long de l'axe vertical : les écarts s'y écrivent à
 * côté de la ligne (« +15 % »), tandis que les pourcentages de performance se
 * glissent sous elle et ne coûtent que leur hauteur. Une gouttière au plus
 * juste rapproche d'autant les compartiments des axes.
 */
const GUTTER_X = 84;
const GUTTER_Y = 46;
const GUTTER_U = GUTTER_X / FRONT_WIDTH;
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
const MARGIN_X = 32;
const MARGIN_Y = 32;
const MARGIN_U = MARGIN_X / FRONT_WIDTH;
const MARGIN_V = MARGIN_Y / DEPTH;

/** Les quatre compartiments, en coordonnées du plateau. */
const COMPARTMENTS = [
  { key: "tl", above: false, rising: true, u0: MARGIN_U, u1: U_ORIGIN - GUTTER_U, v0: V_ORIGIN + GUTTER_V, v1: 1 - MARGIN_V },
  { key: "tr", above: true, rising: true, u0: U_ORIGIN + GUTTER_U, u1: 1 - MARGIN_U, v0: V_ORIGIN + GUTTER_V, v1: 1 - MARGIN_V },
  { key: "bl", above: false, rising: false, u0: MARGIN_U, u1: U_ORIGIN - GUTTER_U, v0: MARGIN_V, v1: V_ORIGIN - GUTTER_V },
  { key: "br", above: true, rising: false, u0: U_ORIGIN + GUTTER_U, u1: 1 - MARGIN_U, v0: MARGIN_V, v1: V_ORIGIN - GUTTER_V },
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
const PHOTO_H = 360;
/** Ce que la silhouette occupe au-dessus des pieds, en plus du portrait :
 *  le pourcentage de performance et l'écart. */
const LABEL_ABOVE = 70;
/** Et en dessous : le prénom, plus l'ombre portée. */
const LABEL_BELOW = 44;

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
 * Place une personne à l'intérieur du compartiment qui la décrit — non pas
 * ses pieds seulement, mais toute sa silhouette, portrait et libellés compris.
 *
 * Poser les pieds dans le compartiment ne suffisait pas : le portrait s'élève
 * de près de 400 px au-dessus, si bien qu'une personne assise en haut de son
 * compartiment dépassait par le toit. On réserve donc, au-dessus des pieds, la
 * hauteur qu'occupera réellement la silhouette, et en dessous celle du prénom.
 *
 * Les bords du compartiment étant d'équerre, il suffit de retrancher de part
 * et d'autre l'encombrement de la silhouette : sa demi-largeur sur les côtés,
 * sa hauteur au-dessus, celle du prénom en dessous.
 */
function seat(perf: number, evo: number, hasPhoto: boolean) {
  const zone =
    COMPARTMENTS.find((c) => c.above === perf >= PERF_ORIGIN && c.rising === (evo >= 0)) ?? COMPARTMENTS[0];
  const { height, width } = figureSize(hasPhoto, plan(0, zone.v0).scale);
  const halfU = width / (2 * FRONT_WIDTH);

  const v = confine(
    ratio(evo, EVO_MIN, EVO_MAX),
    zone.v0 + LABEL_BELOW / DEPTH,
    zone.v1 - (height + LABEL_ABOVE) / DEPTH
  );
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
  const positioned = spread(people);
  const EDGE = 24;

  const frontLeft = plan(0, 0);
  // Les deux flèches débordent légèrement du plateau : leur pointe est le
  // point d'ancrage des étiquettes.
  const axisTop = plan(U_ORIGIN, 1 + 54 / DEPTH);
  const axisRight = plan(1 + 62 / FRONT_WIDTH, V_ORIGIN);
  // Le repère des 90 % revient au croisement des deux axes, cœur du plateau :
  // la gouttière y ménage exactement la place de sa pastille.
  const axisCross = plan(U_ORIGIN, V_ORIGIN);

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", bgcolor: "#fff" }}>
      <Stack spacing={0.25} sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 22, textAlign: "center", color: TEXT }}>
          {t("talents.visioTitle").toUpperCase()}
        </Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 16, textAlign: "center", color: TEXT }}>{periodLabel}</Typography>
      </Stack>

      <svg
        viewBox={`0 0 ${W} ${H}`}
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
        </defs>

        {/* ---- Socle : une tranche sous le bord bas -------------------------
            Le plateau étant droit, il n'a plus de flanc à présenter. Reste ce
            liseré, qui l'assied sans prétendre au volume. */}
        <rect x={frontLeft.x} y={frontLeft.y} width={FRONT_WIDTH} height={SLAB} fill="url(#tpd-slab-front)" />

        {/* ---- Damier : une case par pas de 5 % sur les deux axes ---------- */}
        <g id="board">
          {Array.from({ length: COLS }).map((_, col) =>
            Array.from({ length: ROWS }).map((_, row) => (
              <polygon
                key={`c-${col}-${row}`}
                points={polygon(col / COLS, (col + 1) / COLS, row / ROWS, (row + 1) / ROWS)}
                fill={(col + row) % 2 === 0 ? CELL_LIGHT : CELL_DARK}
                stroke={CELL_EDGE}
                strokeWidth={1.4}
              />
            ))
          )}
          <polygon points={polygon(0, 1, 0, 1)} fill="none" stroke={NAVY_DEEP} strokeWidth={4} />
        </g>

        {/* ---- Les quatre compartiments, pleins ---------------------------- */}
        <g id="compartments">
          {COMPARTMENTS.map((c) => (
            <path
              key={c.key}
              d={roundedQuad(c.u0, c.u1, c.v0, c.v1, 54)}
              fill={COMPARTMENT}
              fillOpacity={0.62}
              stroke={COMPARTMENT_EDGE}
              strokeWidth={5}
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
            const top = Math.max(EDGE, y - height);
            const progression = person.progression;
            const progressionColor = progression === null ? "#7a7a7a" : progression >= 0 ? "#2e7d32" : "#c62828";
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
                  ry={Math.max(width * 0.18, 12)}
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
                    <circle cx={x} cy={top + height / 2} r={height / 2} fill="#e9edf4" stroke={NAVY} strokeWidth={4} />
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
          {[
            // Les bords étant maintenant verticaux, les repères se posent à
            // une distance fixe du plateau, dans la marge du cadre : `dx`
            // compte depuis le bord gauche s'il est négatif, depuis le droit
            // s'il est positif.
            { dx: -148, v: 0.86, text: "−", fill: "#c62828" },
            { dx: -62, v: 0.86, text: "+", fill: GREEN },
            { dx: 68, v: 0.86, text: "++", fill: GREEN },
            { dx: -148, v: 0.12, text: "−", fill: "#c62828" },
            { dx: -62, v: 0.12, text: "−", fill: "#c62828" },
            { dx: 62, v: 0.12, text: "+", fill: GREEN },
            { dx: 148, v: 0.12, text: "−", fill: "#c62828" },
          ].map((mark, i) => {
            const edge = plan(mark.dx < 0 ? 0 : 1, mark.v);
            return (
              <text key={i} x={edge.x + mark.dx} y={edge.y} textAnchor="middle" fill={mark.fill}>
                {mark.text}
              </text>
            );
          })}
        </g>
      </svg>
    </Paper>
  );
}
