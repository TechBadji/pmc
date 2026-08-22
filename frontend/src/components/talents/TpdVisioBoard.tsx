import { Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PerformanceRating } from "@/api/types";

/* ---------------------------------------------------------------------------
 * TPD-VISIO — plateau ID-TPD en perspective.
 *
 * La planche reproduit le support ID-PMC : un sol en perspective isométrique,
 * l'axe des performances en abscisse (50 % → 120 %), l'écart avec la période
 * précédente en ordonnée (-20 % → +20 %), et chaque collaborateur posé sur le
 * plateau à l'endroit exact de ses deux valeurs.
 *
 * Tout passe par `project()` : une seule fonction convertit un couple
 * (performance, écart) en pixels du dessin. Repositionner quelqu'un, changer
 * les bornes des axes ou la profondeur du plateau se fait donc en un seul
 * endroit, sans toucher au reste du tracé.
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

// --- Repère du dessin ------------------------------------------------------
const W = 2400;
const H = 1260;

const PERF_MIN = 50;
const PERF_MAX = 120;
const EVO_MIN = -20;
const EVO_MAX = 20;

/** Origine du repère : la performance de référence, objectifs atteints. */
const PERF_ORIGIN = 90;

// Trapèze du sol : le fond est plus étroit et plus haut que le devant.
// Le plateau occupe la plus grande partie du cadre : la grille doit rester
// lisible en réunion, sur un écran partagé. La marge du haut est celle dont
// les silhouettes du fond ont besoin pour leurs étiquettes.
const FLOOR_FRONT_Y = 1150;
const FLOOR_BACK_Y = 540;
const FLOOR_FRONT_HALF = 1150; // demi-largeur au premier plan
const FLOOR_BACK_HALF = 1010; // demi-largeur au fond
const CENTER_X = W / 2;

// --- Palette ---------------------------------------------------------------
const NAVY = "#1a2744";
const GRID = "#d0d0d0";
const POSTIT = "#f5e050";
const GREEN = "#7cb342";
const TEXT_DARK = "#1a2744";

/** Fraction 0→1 d'une valeur sur son axe. */
function ratio(value: number, min: number, max: number) {
  return (Math.min(max, Math.max(min, value)) - min) / (max - min);
}

/**
 * Conversion (performance %, écart %) → pixels du dessin.
 * `v` est la profondeur : 0 au premier plan (-20 %), 1 au fond (+20 %).
 */
function project(perf: number, evo: number) {
  const u = ratio(perf, PERF_MIN, PERF_MAX);
  const v = ratio(evo, EVO_MIN, EVO_MAX);
  const half = FLOOR_FRONT_HALF + (FLOOR_BACK_HALF - FLOOR_FRONT_HALF) * v;
  return {
    x: CENTER_X + (u - 0.5) * 2 * half,
    y: FLOOR_FRONT_Y - (FLOOR_FRONT_Y - FLOOR_BACK_Y) * v,
    /** Échelle des silhouettes : plus petites au fond, comme en perspective. */
    scale: 1.06 - 0.22 * v,
  };
}

const PERF_TICKS = Array.from({ length: (PERF_MAX - PERF_MIN) / 5 + 1 }, (_, i) => PERF_MIN + i * 5);
const EVO_TICKS = [-20, -15, -10, -5, 5, 10, 15, 20];

/** Contour arrondi d'un couloir, tracé dans le repère des axes. */
function lanePath(perfFrom: number, perfTo: number, evoFrom: number, evoTo: number, radius = 46) {
  const a = project(perfFrom, evoTo); // haut gauche
  const b = project(perfTo, evoTo); // haut droit
  const c = project(perfTo, evoFrom); // bas droit
  const d = project(perfFrom, evoFrom); // bas gauche
  return `M ${a.x + radius} ${a.y}
          L ${b.x - radius} ${b.y} Q ${b.x} ${b.y} ${b.x} ${b.y + radius}
          L ${c.x} ${c.y - radius} Q ${c.x} ${c.y} ${c.x - radius} ${c.y}
          L ${d.x + radius} ${d.y} Q ${d.x} ${d.y} ${d.x} ${d.y - radius}
          L ${a.x} ${a.y + radius} Q ${a.x} ${a.y} ${a.x + radius} ${a.y} Z`;
}

/**
 * Écarte les silhouettes qui tomberaient l'une sur l'autre. Deux personnes au
 * même score se superposeraient sinon, et la planche perdrait justement ce
 * qu'elle apporte : voir tout le monde d'un coup d'œil.
 */
function spread(people: VisioPerson[]) {
  const placed: { person: VisioPerson; x: number; y: number; scale: number }[] = [];
  people.forEach((person) => {
    const point = project(person.performance, person.progression ?? 0);
    let x = point.x;
    let guard = 0;
    while (placed.some((p) => Math.abs(p.x - x) < 190 && Math.abs(p.y - point.y) < 260) && guard < 12) {
      // On décale alternativement à droite puis à gauche, de plus en plus loin.
      const step = 200 * Math.ceil((guard + 1) / 2);
      x = point.x + (guard % 2 === 0 ? step : -step);
      guard += 1;
    }
    placed.push({ person, x, y: point.y, scale: point.scale });
  });
  return placed;
}

export default function TpdVisioBoard({ people, periodLabel }: { people: VisioPerson[]; periodLabel: string }) {
  const { t } = useTranslation();
  const origin = project(PERF_ORIGIN, 0);
  const axisTop = project(PERF_ORIGIN, EVO_MAX);
  const floorFrontLeft = project(PERF_MIN, EVO_MIN);
  const floorFrontRight = project(PERF_MAX, EVO_MIN);
  const floorBackLeft = project(PERF_MIN, EVO_MAX);
  const floorBackRight = project(PERF_MAX, EVO_MAX);
  const positioned = spread(people);
  const PHOTO_H = 420;

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", bgcolor: "#fff" }}>
      <Stack spacing={0.25} sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 22, textAlign: "center", color: TEXT_DARK }}>
          {t("talents.visioTitle").toUpperCase()}
        </Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 16, textAlign: "center", color: TEXT_DARK }}>
          {periodLabel}
        </Typography>
      </Stack>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", height: "auto", fontFamily: "Arial, Helvetica, sans-serif" }}
        role="img"
        aria-label={t("talents.visioTitle")}
      >
        {/* ---- Sol en perspective -------------------------------------- */}
        <g id="floor">
          <polygon
            points={`${floorBackLeft.x - 60},${floorBackLeft.y - 40} ${floorBackRight.x + 60},${floorBackRight.y - 40} ${floorFrontRight.x + 80},${floorFrontRight.y + 60} ${floorFrontLeft.x - 80},${floorFrontLeft.y + 60}`}
            fill="#fdfdfd"
            stroke="#e8e8e8"
            strokeWidth={3}
          />
        </g>

        {/* ---- Grille : un trait par graduation ------------------------ */}
        <g id="grid" stroke={GRID} strokeWidth={1.6} fill="none">
          {PERF_TICKS.map((perf) => {
            const a = project(perf, EVO_MIN);
            const b = project(perf, EVO_MAX);
            return <line key={`v-${perf}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {[...EVO_TICKS, 0].map((evo) => {
            const a = project(PERF_MIN, evo);
            const b = project(PERF_MAX, evo);
            return <line key={`h-${evo}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        {/* ---- Quatre couloirs arrondis, deux par moitié --------------- */}
        <g id="lanes" fill="none" stroke={NAVY} strokeWidth={7}>
          <path d={lanePath(PERF_MIN, PERF_ORIGIN - 2, 1, EVO_MAX)} />
          <path d={lanePath(PERF_ORIGIN + 2, PERF_MAX, 1, EVO_MAX)} />
          <path d={lanePath(PERF_MIN, PERF_ORIGIN - 2, EVO_MIN, -1)} />
          <path d={lanePath(PERF_ORIGIN + 2, PERF_MAX, EVO_MIN, -1)} />
        </g>

        {/* ---- Axes ---------------------------------------------------- */}
        <g id="axes" stroke={NAVY} strokeWidth={6} fill="none">
          {/* Abscisse : la ligne des 0 % d'écart, sur toute la largeur. */}
          <line
            x1={project(PERF_MIN, 0).x - 70}
            y1={project(PERF_MIN, 0).y}
            x2={project(PERF_MAX, 0).x + 70}
            y2={project(PERF_MAX, 0).y}
          />
          {/* Ordonnée : flèche verticale au droit des 90 %. */}
          <line x1={origin.x} y1={FLOOR_FRONT_Y + 40} x2={axisTop.x} y2={axisTop.y - 60} markerEnd="url(#tpd-arrow)" />
        </g>
        <defs>
          <marker id="tpd-arrow" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 12 6 L 0 12 z" fill={NAVY} />
          </marker>
        </defs>

        {/* ---- Graduations ---------------------------------------------- */}
        <g id="tick-labels" fill={TEXT_DARK} fontSize={26} fontWeight={700}>
          {PERF_TICKS.map((perf) => {
            const p = project(perf, 0);
            // La graduation des 90 % est portée par le bloc vert de l'origine.
            if (perf === PERF_ORIGIN) return null;
            return (
              <text key={`xt-${perf}`} x={p.x} y={p.y + 40} textAnchor="middle">
                {perf}%
              </text>
            );
          })}
          {EVO_TICKS.map((evo) => {
            const p = project(PERF_ORIGIN, evo);
            return (
              <text key={`yt-${evo}`} x={p.x + 26} y={p.y + 9} textAnchor="start">
                {evo > 0 ? `+${evo}%` : `${evo}%`}
              </text>
            );
          })}
        </g>

        {/* ---- Étiquettes post-it --------------------------------------- */}
        <g id="postits">
          <g transform={`translate(${project(PERF_MAX, 0).x - 250} ${project(PERF_MAX, 0).y - 60}) skewY(-4)`}>
            <rect width="360" height="86" rx="6" fill={POSTIT} stroke="#d9c53f" strokeWidth={2} />
            <text x="18" y="36" fontSize="24" fontWeight="800" fill={TEXT_DARK}>
              %
            </text>
            <text x="18" y="66" fontSize="24" fontWeight="800" fill={TEXT_DARK}>
              {t("talents.performanceAxisShort")}
            </text>
          </g>
          <g transform={`translate(${axisTop.x - 78} ${axisTop.y - 30})`}>
            <rect width="52" height="190" rx="6" fill={POSTIT} stroke="#d9c53f" strokeWidth={2} />
            <text
              x="26"
              y="95"
              fontSize="24"
              fontWeight="800"
              fill={TEXT_DARK}
              textAnchor="middle"
              transform={`rotate(90 26 95)`}
            >
              {t("talents.progressionAxisShort")}
            </text>
          </g>
        </g>

        {/* ---- Bloc d'origine : 90 %, en relief -------------------------- */}
        <g id="origin-block" transform={`translate(${origin.x - 54} ${origin.y - 44})`}>
          <rect x="6" y="8" width="104" height="76" rx="4" fill="#5e8f31" />
          <rect width="104" height="76" rx="4" fill={GREEN} />
          <text x="52" y="48" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff">
            {PERF_ORIGIN}%
          </text>
        </g>

        {/* ---- Collaborateurs -------------------------------------------
            Un groupe par personne, nommé et portant ses valeurs : la planche
            se met à jour en changeant les données, sans retoucher le dessin. */}
        <g id="people">
          {positioned.map(({ person, x, y, scale }) => {
            const height = PHOTO_H * scale;
            const width = height * 0.34;
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
                {person.photo ? (
                  // `multiply` laisse la grille traverser le fond clair d'un
                  // portrait : les photos détourées gardent leur transparence,
                  // et celles restées sur fond blanc se fondent pareillement.
                  <image
                    href={person.photo}
                    x={x - width / 2}
                    y={y - height}
                    width={width}
                    height={height}
                    preserveAspectRatio="xMidYMax meet"
                    style={{ mixBlendMode: "multiply" }}
                  />
                ) : (
                  <>
                    <circle cx={x} cy={y - height * 0.72} r={height * 0.17} fill="#dbe4ee" fillOpacity={0.75} stroke={NAVY} strokeWidth={3} />
                    <text
                      x={x}
                      y={y - height * 0.66}
                      textAnchor="middle"
                      fontSize={height * 0.18}
                      fontWeight="800"
                      fill={NAVY}
                    >
                      {person.name.charAt(0).toUpperCase()}
                    </text>
                    <rect
                      x={x - width * 0.34}
                      y={y - height * 0.5}
                      width={width * 0.68}
                      height={height * 0.5}
                      rx={8}
                      fill="#dbe4ee"
                      fillOpacity={0.75}
                      stroke={NAVY}
                      strokeWidth={3}
                    />
                  </>
                )}
                {/* Valeurs au-dessus de la tête, comme sur la planche. */}
                <text x={x} y={y - height - 46} textAnchor="middle" fontSize={26} fontWeight="800" fill="#6d6d6d">
                  {person.performance}%
                </text>
                {progression !== null && (
                  <text x={x} y={y - height - 16} textAnchor="middle" fontSize={26} fontWeight="800" fill={progressionColor}>
                    {progression > 0 ? `+${progression}` : progression}
                  </text>
                )}
                <text x={x} y={y + 30} textAnchor="middle" fontSize={22} fontWeight="700" fill={TEXT_DARK}>
                  {person.name.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </g>

        {/* ---- Repères de lecture des quatre couloirs -------------------- */}
        <g id="quadrant-marks" fontSize={44} fontWeight="800">
          <text x={project(PERF_MIN, EVO_MAX).x - 120} y={project(PERF_MIN, EVO_MAX).y + 120} fill="#c62828">
            −
          </text>
          <text x={project(PERF_MIN, EVO_MAX).x - 60} y={project(PERF_MIN, EVO_MAX).y + 120} fill={GREEN}>
            +
          </text>
          <text x={project(PERF_MAX, EVO_MAX).x + 40} y={project(PERF_MAX, EVO_MAX).y + 120} fill={GREEN}>
            ++
          </text>
          <text x={project(PERF_MIN, EVO_MIN).x - 120} y={project(PERF_MIN, EVO_MIN).y - 200} fill="#c62828">
            −−
          </text>
          <text x={project(PERF_MAX, EVO_MIN).x + 40} y={project(PERF_MAX, EVO_MIN).y - 200} fill={GREEN}>
            +
          </text>
          <text x={project(PERF_MAX, EVO_MIN).x + 96} y={project(PERF_MAX, EVO_MIN).y - 200} fill="#c62828">
            −
          </text>
        </g>
      </svg>
    </Paper>
  );
}
