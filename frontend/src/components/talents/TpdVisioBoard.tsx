import { Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PerformanceRating } from "@/api/types";

/* ---------------------------------------------------------------------------
 * TPD-VISIO — le plateau ID-TPD.
 *
 * Configuration retenue, et pourquoi.
 *
 * 1. Un damier plutôt qu'un fond quadrillé. Le plateau se lit comme une table
 *    de jeu : cases carrées alternées, dalle épaisse, tranche et flancs
 *    visibles. La profondeur ne se devine plus d'un simple trapèze, elle se
 *    voit à l'épaisseur et à l'alternance des cases.
 *
 * 2. Des cases réellement carrées. Le pas est de 5 % sur les deux axes, soit
 *    14 colonnes de performance pour 8 rangées d'écart. L'emprise du plateau
 *    suit ce rapport 14/8 : il est donc franchement rectangulaire — bien plus
 *    large que profond — et une case reste carrée vue de dessus.
 *
 * 3. Quatre compartiments pleins. Ce sont eux qui portent la lecture, pas la
 *    grille : bleu clair, bordés de marine, en retrait des axes. Toute
 *    personne est ramenée à l'intérieur du compartiment qui la décrit — jamais
 *    sur une ligne d'axe, jamais dehors, quelles que soient ses valeurs.
 *
 * 4. Les graduations bordent les axes, à l'intérieur du plateau : les
 *    pourcentages de performance sous la ligne horizontale, les écarts à
 *    gauche de la verticale, dans la gouttière laissée libre entre les axes et
 *    les compartiments.
 *
 * Toute la géométrie passe par `plan(u, v)` : changer l'inclinaison, la
 * rotation ou l'emprise se fait en un seul endroit.
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
const W = 3000;
const H = 1760;

// --- Échelles --------------------------------------------------------------
const PERF_MIN = 50;
const PERF_MAX = 120;
const EVO_MIN = -20;
const EVO_MAX = 20;
const STEP = 5;
const PERF_ORIGIN = 90; // objectifs atteints
const COLS = (PERF_MAX - PERF_MIN) / STEP; // 14 colonnes
const ROWS = (EVO_MAX - EVO_MIN) / STEP; // 8 rangées

// --- Emprise du plateau ----------------------------------------------------
const FRONT_HALF = 1400;
const BACK_HALF = 940; // forte convergence : le regard est rasant
const FLOOR_FRONT_Y = 1570;
const CENTER_X = 1440;
const RIGHT_SHIFT = 240; // le fond glisse à droite : le plateau paraît tourné
/**
 * Inclinaison. C'est elle qui décide de la taille des compartiments du fond :
 * plus elle est forte, plus les rangées lointaines s'écrasent. À 1,5 le haut
 * tombait à 149 px contre 351 px pour le bas ; à 0,3 il remontait à 383 contre
 * 492. À 0,12, les compartiments du haut atteignent 471 px pour 525 en bas —
 * neuf dixièmes de ceux du premier plan. La profondeur reste lisible, la
 * perspective se voit encore, et aucun compartiment n'est sacrifié.
 */
const TILT = 0.12;
const SLAB = 34; // épaisseur de la dalle

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

/**
 * Profondeur du plateau, déduite plutôt que réglée : on veut que la case du
 * premier plan soit carrée à l'écran. Sa largeur y vaut 2 × FRONT_HALF / 14 ;
 * la première rangée doit donc occuper autant en hauteur. Comme la perspective
 * raccourcit les rangées à mesure qu'elles s'éloignent, la profondeur totale
 * s'obtient en divisant cette hauteur par la part de profondeur que la
 * première rangée occupe réellement.
 */
const FRONT_CELL = (FRONT_HALF * 2) / COLS;

function ratio(value: number, min: number, max: number) {
  return (Math.min(max, Math.max(min, value)) - min) / (max - min);
}

/** Profondeur perçue : 0 devant, 1 au fond, resserrée vers le fond. */
function perspective(v: number) {
  return (v * (1 + TILT)) / (1 + TILT * v);
}

/** Point du plateau : `u` le long des performances, `v` en profondeur. */
function plan(u: number, v: number) {
  const d = perspective(v);
  const half = FRONT_HALF + (BACK_HALF - FRONT_HALF) * d;
  return {
    x: CENTER_X + RIGHT_SHIFT * d + (u - 0.5) * 2 * half,
    y: FLOOR_FRONT_Y - (FLOOR_FRONT_Y - FLOOR_BACK_Y) * d,
    scale: 1.16 - 0.54 * d, // raccourci franc : le fond paraît loin
  };
}

const DEPTH = FRONT_CELL / perspective(1 / ROWS);
const FLOOR_BACK_Y = FLOOR_FRONT_Y - DEPTH;

function project(perf: number, evo: number) {
  return plan(ratio(perf, PERF_MIN, PERF_MAX), ratio(evo, EVO_MIN, EVO_MAX));
}

const U_ORIGIN = ratio(PERF_ORIGIN, PERF_MIN, PERF_MAX);
const V_ORIGIN = ratio(0, EVO_MIN, EVO_MAX);
/** Gouttière le long des axes, où se logent les graduations. */
const GUTTER_U = 0.55 / COLS;
const GUTTER_V = 0.55 / ROWS;
/**
 * Marge entre un compartiment et le bord du plateau, comptée en rangées et en
 * colonnes — donc identique pour les quatre compartiments.
 *
 * Elle avait d'abord été élargie au fond pour compenser l'écrasement de la
 * perspective ; c'était une erreur : trois rangées de marge sur une moitié qui
 * n'en compte que quatre réduisaient les compartiments du haut à une bande.
 * Une marge égale donne quatre compartiments de même taille sur le plateau ;
 * qu'ils paraissent plus petits au fond est précisément ce que la perspective
 * doit montrer.
 */
const MARGIN_U = 0.7 / COLS;
const MARGIN_V = 0.55 / ROWS;

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

/**
 * Place une personne à l'intérieur du compartiment qui la décrit.
 *
 * Sa position reste celle de ses deux valeurs, mais ramenée dans les bornes du
 * compartiment : quelqu'un pile sur la barre des 90 % ou des 0 % tomberait
 * sinon sur un axe, et une valeur extrême sur le bord du plateau.
 */
function seat(perf: number, evo: number) {
  const zone =
    COMPARTMENTS.find((c) => c.above === perf >= PERF_ORIGIN && c.rising === (evo >= 0)) ?? COMPARTMENTS[0];
  const padU = 0.04;
  const padV = 0.1;
  const u = Math.min(zone.u1 - padU, Math.max(zone.u0 + padU, ratio(perf, PERF_MIN, PERF_MAX)));
  const v = Math.min(zone.v1 - padV, Math.max(zone.v0 + padV, ratio(evo, EVO_MIN, EVO_MAX)));
  return plan(u, v);
}

/** Écarte les silhouettes qui se poseraient l'une sur l'autre. */
function spread(people: VisioPerson[]) {
  const placed: { person: VisioPerson; x: number; y: number; scale: number }[] = [];
  people.forEach((person) => {
    const point = seat(person.performance, person.progression ?? 0);
    let x = point.x;
    let guard = 0;
    while (placed.some((p) => Math.abs(p.x - x) < 165 && Math.abs(p.y - point.y) < 220) && guard < 12) {
      const step = 175 * Math.ceil((guard + 1) / 2);
      x = point.x + (guard % 2 === 0 ? step : -step);
      guard += 1;
    }
    placed.push({ person, x, y: point.y, scale: point.scale });
  });
  return placed;
}

export default function TpdVisioBoard({ people, periodLabel }: { people: VisioPerson[]; periodLabel: string }) {
  const { t } = useTranslation();
  const positioned = spread(people);
  const PHOTO_H = 350;
  const EDGE = 24;

  const frontLeft = plan(0, 0);
  const frontRight = plan(1, 0);
  const backLeft = plan(0, 1);
  const backRight = plan(1, 1);
  const origin = project(PERF_ORIGIN, 0);
  const axisTop = plan(U_ORIGIN, 1.03);

  // Le cadre ne garde en haut que la place réclamée par les silhouettes.
  const highest = positioned.reduce((top, { person, y, scale }) => {
    const height = person.photo ? PHOTO_H * scale : PHOTO_H * scale * 0.44;
    return Math.min(top, y - height - 40);
  }, FLOOR_BACK_Y);
  const viewTop = Math.max(0, Math.min(FLOOR_BACK_Y - 24, highest - EDGE));

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
        </defs>

        {/* ---- Dalle : tranche avant et flancs, d'où vient l'épaisseur ----- */}
        <g id="slab">
          <polygon
            points={`${frontLeft.x},${frontLeft.y} ${frontRight.x},${frontRight.y} ${frontRight.x},${frontRight.y + SLAB} ${frontLeft.x},${frontLeft.y + SLAB}`}
            fill="url(#tpd-slab-front)"
          />
          <polygon
            points={`${frontLeft.x},${frontLeft.y} ${frontLeft.x},${frontLeft.y + SLAB} ${backLeft.x},${backLeft.y + SLAB * 0.45} ${backLeft.x},${backLeft.y}`}
            fill="#74829a"
          />
          <polygon
            points={`${frontRight.x},${frontRight.y} ${frontRight.x},${frontRight.y + SLAB} ${backRight.x},${backRight.y + SLAB * 0.45} ${backRight.x},${backRight.y}`}
            fill="#74829a"
          />
        </g>

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

        {/* ---- Axes -------------------------------------------------------- */}
        <g id="axes" stroke={NAVY_DEEP} fill="none" strokeWidth={5}>
          <line x1={plan(0, V_ORIGIN).x} y1={plan(0, V_ORIGIN).y} x2={plan(1, V_ORIGIN).x} y2={plan(1, V_ORIGIN).y} />
          <line
            x1={plan(U_ORIGIN, 0).x}
            y1={plan(U_ORIGIN, 0).y}
            x2={axisTop.x}
            y2={axisTop.y}
            markerEnd="url(#tpd-arrow)"
          />
        </g>

        {/* ---- Graduations, dans la gouttière longeant les axes ------------ */}
        <g id="ticks" fill={TEXT} fontWeight={700}>
          {Array.from({ length: COLS + 1 }).map((_, i) => {
            const perf = PERF_MIN + i * STEP;
            if (perf === PERF_ORIGIN) return null;
            const p = plan(i / COLS, V_ORIGIN - GUTTER_V * 0.22);
            return (
              <text key={`tx-${perf}`} x={p.x} y={p.y + 26} textAnchor="middle" fontSize={26}>
                {perf}%
              </text>
            );
          })}
          {Array.from({ length: ROWS + 1 }).map((_, i) => {
            const evo = EVO_MIN + i * STEP;
            if (evo === 0) return null;
            // À droite de l'axe : à gauche, elles se perdaient sur la bordure
            // du compartiment voisin.
            const p = plan(U_ORIGIN + GUTTER_U * 0.25, i / ROWS);
            return (
              <text key={`ty-${evo}`} x={p.x + 10} y={p.y + 9} textAnchor="start" fontSize={26}>
                {evo > 0 ? `+${evo}%` : `${evo}%`}
              </text>
            );
          })}
        </g>

        {/* ---- Étiquettes d'axes et repère des 90 % ------------------------ */}
        <g id="labels">
          <g
            transform={`translate(${plan(0.86, V_ORIGIN + GUTTER_V * 1.4).x} ${plan(0.86, V_ORIGIN + GUTTER_V * 1.4).y}) skewY(-3)`}
          >
            <rect width="404" height="54" rx="6" fill={POSTIT} stroke="#d9c53f" strokeWidth={2} />
            <text x="16" y="36" fontSize="25" fontWeight="800" fill={TEXT}>
              % {t("talents.performanceAxisShort")}
            </text>
          </g>
          <g transform={`translate(${axisTop.x - 96} ${axisTop.y + 16})`}>
            <rect width="56" height="200" rx="6" fill={POSTIT} stroke="#d9c53f" strokeWidth={2} />
            <text x="28" y="100" fontSize="25" fontWeight="800" fill={TEXT} textAnchor="middle" transform="rotate(90 28 100)">
              {t("talents.progressionAxisShort")}
            </text>
          </g>
          <g transform={`translate(${origin.x - 56} ${origin.y - 29})`}>
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
            const height = hasPhoto ? PHOTO_H * scale : PHOTO_H * scale * 0.44;
            const width = hasPhoto ? height * 0.34 : height;
            const halfSpan = Math.max(width / 2, 90);
            const x = Math.min(W - EDGE - halfSpan, Math.max(EDGE + halfSpan, rawX));
            const top = Math.max(viewTop + EDGE + 34, y - height);
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
            // Les marges gauche et droite se resserrent avec la profondeur :
            // les repères du fond peuvent s'écarter davantage que ceux du
            // premier plan, qui longeraient sinon le bord du cadre.
            { u: -0.075, v: 0.86, text: "−", fill: "#c62828" },
            { u: -0.032, v: 0.86, text: "+", fill: GREEN },
            { u: 1.05, v: 0.86, text: "++", fill: GREEN },
            { u: -0.05, v: 0.12, text: "−", fill: "#c62828" },
            { u: -0.022, v: 0.12, text: "−", fill: "#c62828" },
            { u: 1.018, v: 0.12, text: "+", fill: GREEN },
            { u: 1.046, v: 0.12, text: "−", fill: "#c62828" },
          ].map((mark, i) => {
            const p = plan(mark.u, mark.v);
            return (
              <text key={i} x={p.x} y={p.y} textAnchor="middle" fill={mark.fill}>
                {mark.text}
              </text>
            );
          })}
        </g>
      </svg>
    </Paper>
  );
}
