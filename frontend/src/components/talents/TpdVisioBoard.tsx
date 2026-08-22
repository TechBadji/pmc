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
const H = 1680;

const PERF_MIN = 50;
const PERF_MAX = 120;
const EVO_MIN = -20;
const EVO_MAX = 20;

/** Origine du repère : la performance de référence, objectifs atteints. */
const PERF_ORIGIN = 90;

// Trapèze du sol : le fond est plus étroit et plus haut que le devant.
// Le plateau garde sa profondeur agrandie (915 px). Les silhouettes gardent
// toujours l'échelle de la perspective : c'est le cadre qui s'ouvre pour les
// contenir, jamais elles qui rapetissent.
// Le plateau occupe toute la largeur et les trois quarts de la hauteur : son
// bord supérieur EST la ligne des +20 %. Sa profondeur a encore été augmentée
// d'un tiers ; la bande laissée libre au-dessus est celle, réduite d'autant,
// où se dressent les silhouettes posées au fond des compartiments.
const FLOOR_FRONT_Y = 1600;
const FLOOR_BACK_Y = 330; // ligne des +20 %, sommet du plateau
const FLOOR_FRONT_HALF = 1180; // demi-largeur au premier plan
const FLOOR_BACK_HALF = 760; // demi-largeur au sommet — forte convergence
/**
 * Décalage du fond vers la droite : le point de fuite n'est pas au centre, si
 * bien que le plateau paraît tourné, vu depuis sa gauche. Une perspective
 * frontale donne une planche figée ; celle-ci a du relief.
 */
const RIGHT_SHIFT = 210;
/**
 * Inclinaison du plateau. Un plan vu de bas resserre ses rangées à mesure
 * qu'elles s'éloignent : la profondeur ne progresse donc pas linéairement.
 * Plus `TILT` est grand, plus le regard est rasant et le plateau incliné.
 */
const TILT = 1.9;
const CENTER_X = W / 2;

// --- Palette ---------------------------------------------------------------
// Bleu des compartiments et des axes : allégé, il laisse la grille et les
// silhouettes au premier plan de la lecture.
const NAVY = "#4a6fa5";
const GRID = "#d0d0d0";
const POSTIT = "#f5e050";
const GREEN = "#7cb342";
const TEXT_DARK = "#1a2744"; // texte : le bleu profond reste le plus lisible

/** Fraction 0→1 d'une valeur sur son axe. */
function ratio(value: number, min: number, max: number) {
  return (Math.min(max, Math.max(min, value)) - min) / (max - min);
}

/**
 * Conversion (performance %, écart %) → pixels du dessin.
 * `v` est la profondeur : 0 au premier plan (-20 %), 1 au fond (+20 %).
 */
/** Profondeur perçue : 0 au premier plan, 1 au fond, resserrée vers le fond. */
function perspective(v: number) {
  return (v * (1 + TILT)) / (1 + TILT * v);
}

function depthPoint(u: number, v: number) {
  const d = perspective(v);
  const half = FLOOR_FRONT_HALF + (FLOOR_BACK_HALF - FLOOR_FRONT_HALF) * d;
  return {
    x: CENTER_X + RIGHT_SHIFT * d + (u - 0.5) * 2 * half,
    y: FLOOR_FRONT_Y - (FLOOR_FRONT_Y - FLOOR_BACK_Y) * d,
    /** Échelle des silhouettes : plus petites au fond, comme en perspective. */
    scale: 1.06 - 0.3 * d,
  };
}

function project(perf: number, evo: number) {
  return depthPoint(ratio(perf, PERF_MIN, PERF_MAX), ratio(evo, EVO_MIN, EVO_MAX));
}

/** Point du plateau dessiné, `v` pouvant dépasser 1 dans la bande haute. */
function floorPoint(u: number, v: number) {
  return depthPoint(u, v);
}

/** Coordonnées des quatre compartiments sur le plateau. */
const U_ORIGIN = (PERF_ORIGIN - PERF_MIN) / (PERF_MAX - PERF_MIN);
const V_ORIGIN = (0 - EVO_MIN) / (EVO_MAX - EVO_MIN);
const LANE = {
  left0: 0,
  left1: U_ORIGIN - 0.03,
  right0: U_ORIGIN + 0.03,
  // Allongés d'un tiers : les compartiments de droite étaient plus courts que
  // ceux de gauche, la performance de référence n'étant pas au milieu de
  // l'échelle.
  right1: U_ORIGIN + 0.03 + (1 - U_ORIGIN - 0.03) * 1.3,
  topStart: V_ORIGIN + 0.02,
  topEnd: 1,
  bottomStart: V_ORIGIN - 0.02,
  // Raccourcis de 30 % : ils descendaient jusqu'au bord avant du plateau.
  bottomEnd: (V_ORIGIN - 0.02) * 0.3,
};

const PERF_TICKS = Array.from({ length: (PERF_MAX - PERF_MIN) / 5 + 1 }, (_, i) => PERF_MIN + i * 5);
const EVO_TICKS = [-20, -15, -10, -5, 5, 10, 15, 20];

/**
 * Contour d'un compartiment, décrit dans les coordonnées du plateau (`u` le
 * long des performances, `v` en profondeur). Les quatre coins passent par la
 * même projection que la grille : le compartiment épouse donc l'inclinaison du
 * plateau, et ses côtés restent parallèles à ses lignes. Un rectangle posé sur
 * un plan incliné se lit en trapèze — les angles restent vifs, sans arrondi.
 */
function lanePath(u0: number, u1: number, v0: number, v1: number) {
  const a = floorPoint(u0, v1); // haut gauche
  const b = floorPoint(u1, v1); // haut droit
  const c = floorPoint(u1, v0); // bas droit
  const d = floorPoint(u0, v0); // bas gauche
  return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} L ${d.x} ${d.y} Z`;
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
  // Dalle : la surface déborde légèrement de la grille, et son épaisseur se
  // voit au premier plan — c'est ce qui la fait lire comme un volume.
  const SLAB = 26;
  const slab = {
    backLeft: floorPoint(-0.03, 1),
    backRight: floorPoint(LANE.right1 + 0.03, 1),
    frontLeft: { x: floorPoint(0, 0).x - 46, y: floorPoint(0, 0).y + 52 },
    frontRight: { x: floorPoint(LANE.right1 + 0.03, 0).x + 46, y: floorPoint(1, 0).y + 52 },
  };
  const positioned = spread(people);
  // Hauteur de référence d'un portrait. Réduite en proportion de
  // l'agrandissement des compartiments : ce sont eux qui doivent porter la
  // lecture, les silhouettes s'y inscrivant sans les écraser.
  const PHOTO_H = 310;
  /** Marge intérieure du cadre : rien n'est dessiné au-delà. */
  const EDGE = 24;

  /**
   * Haut du cadre : le plateau remonte sous le sous-titre quand personne
   * n'occupe le fond. La bande au-dessus du plateau n'existe que pour les
   * silhouettes qui s'y dressent ; on ne garde donc que la hauteur qu'elles
   * réclament vraiment, au lieu de la réserver en toutes circonstances.
   */
  const highestDrawing = positioned.reduce((top, { person, y, scale }) => {
    const height = person.photo ? PHOTO_H * scale : PHOTO_H * scale * 0.42;
    return Math.min(top, y - height - 40);
  }, FLOOR_BACK_Y);
  const viewTop = Math.max(0, Math.min(FLOOR_BACK_Y - 20, highestDrawing - EDGE));


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
        viewBox={`0 ${viewTop} ${W} ${H - viewTop}`}
        width="100%"
        style={{ display: "block", height: "auto", fontFamily: "Arial, Helvetica, sans-serif" }}
        role="img"
        aria-label={t("talents.visioTitle")}
      >
        {/* ---- Sol en perspective, avec son épaisseur -------------------
            Le plateau est dessiné comme une dalle : face supérieure en léger
            dégradé (plus clair au fond, comme une surface qui fuit), puis la
            tranche avant et les deux côtés en teintes plus soutenues. C'est
            cette épaisseur, avec l'ombre portée sous chaque personne, qui
            donne l'impression qu'on se tient dessus. */}
        <g id="floor">
          <polygon
            points={`${slab.backLeft.x},${slab.backLeft.y} ${slab.backRight.x},${slab.backRight.y} ${slab.frontRight.x},${slab.frontRight.y} ${slab.frontLeft.x},${slab.frontLeft.y}`}
            fill="url(#tpd-floor)"
            stroke="#dcdcdc"
            strokeWidth={3}
          />
          {/* tranche avant */}
          <polygon
            points={`${slab.frontLeft.x},${slab.frontLeft.y} ${slab.frontRight.x},${slab.frontRight.y} ${slab.frontRight.x},${slab.frontRight.y + SLAB} ${slab.frontLeft.x},${slab.frontLeft.y + SLAB}`}
            fill="#e4e6ea"
            stroke="#cfd2d8"
            strokeWidth={2}
          />
          {/* côtés, qui filent vers le fond */}
          <polygon
            points={`${slab.frontLeft.x},${slab.frontLeft.y} ${slab.frontLeft.x},${slab.frontLeft.y + SLAB} ${slab.backLeft.x},${slab.backLeft.y + SLAB * 0.5} ${slab.backLeft.x},${slab.backLeft.y}`}
            fill="#eceef1"
            stroke="#dcdee2"
            strokeWidth={2}
          />
          <polygon
            points={`${slab.frontRight.x},${slab.frontRight.y} ${slab.frontRight.x},${slab.frontRight.y + SLAB} ${slab.backRight.x},${slab.backRight.y + SLAB * 0.5} ${slab.backRight.x},${slab.backRight.y}`}
            fill="#eceef1"
            stroke="#dcdee2"
            strokeWidth={2}
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

        {/* ---- Les quatre compartiments -------------------------------
            Décrits en coordonnées du plateau : ceux de droite sont allongés
            d'un tiers au-delà de la dernière graduation, ceux du bas raccourcis
            d'autant — le plateau est dessiné assez large pour les porter. */}
        <g id="lanes" fill="none" stroke={NAVY} strokeWidth={7}>
          <path d={lanePath(LANE.left0, LANE.left1, LANE.topStart, LANE.topEnd)} />
          <path d={lanePath(LANE.right0, LANE.right1, LANE.topStart, LANE.topEnd)} />
          <path d={lanePath(LANE.left0, LANE.left1, LANE.bottomEnd, LANE.bottomStart)} />
          <path d={lanePath(LANE.right0, LANE.right1, LANE.bottomEnd, LANE.bottomStart)} />
        </g>

        {/* ---- Axes ---------------------------------------------------- */}
        <g id="axes" stroke={NAVY} strokeWidth={6} fill="none">
          {/* Les deux axes sont tracés dans les coordonnées du plateau, et
            * prolongés dans ces mêmes coordonnées : ils restent donc parallèles
            * à ses lignes, au lieu de repartir à l'horizontale ou à la
            * verticale dès qu'ils dépassent la grille. */}
          <line
            x1={floorPoint(-0.05, V_ORIGIN).x}
            y1={floorPoint(-0.05, V_ORIGIN).y}
            x2={floorPoint(LANE.right1 + 0.05, V_ORIGIN).x}
            y2={floorPoint(LANE.right1 + 0.05, V_ORIGIN).y}
          />
          <line
            x1={floorPoint(U_ORIGIN, -0.05).x}
            y1={floorPoint(U_ORIGIN, -0.05).y}
            x2={floorPoint(U_ORIGIN, 1.06).x}
            y2={floorPoint(U_ORIGIN, 1.06).y}
            markerEnd="url(#tpd-arrow)"
          />
        </g>
        <defs>
          {/* Surface du plateau : la lumière vient du fond. */}
          <linearGradient id="tpd-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f2f3f5" />
          </linearGradient>
          {/* Ombre portée sous les pieds : franche au contact, diffuse ensuite. */}
          <radialGradient id="tpd-shadow">
            <stop offset="0%" stopColor="#2b3245" stopOpacity="0.42" />
            <stop offset="70%" stopColor="#2b3245" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2b3245" stopOpacity="0" />
          </radialGradient>
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
          {positioned.map(({ person, x: rawX, y, scale }) => {
            const hasPhoto = Boolean(person.photo);
            // Sans portrait en pied, on s'en tient à la vignette ronde : une
            // silhouette dessinée à la place laisserait croire à une photo.
            const height = hasPhoto ? PHOTO_H * scale : PHOTO_H * scale * 0.42;
            const width = hasPhoto ? height * 0.34 : height;
            // Rien ne sort du cadre : ni le portrait, ni la vignette, ni leurs
            // étiquettes. Le point de pose glisse le long de l'axe plutôt que
            // de laisser déborder le dessin.
            const halfSpan = Math.max(width / 2, 90);
            const x = Math.min(W - EDGE - halfSpan, Math.max(EDGE + halfSpan, rawX));
            const top = Math.max(EDGE + 34, y - height);
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
                {/* Ombre portée : le contact avec le sol, sans lequel une
                  * silhouette semble flotter au-dessus du plateau. */}
                <ellipse cx={x} cy={y + 4} rx={Math.max(width * 0.62, 42)} ry={Math.max(width * 0.19, 13)} fill="url(#tpd-shadow)" />
                {hasPhoto ? (
                  // `multiply` laisse la grille traverser le fond clair d'un
                  // portrait : les photos détourées gardent leur transparence,
                  // et celles restées sur fond blanc se fondent pareillement.
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
                    <circle
                      cx={x}
                      cy={top + height / 2}
                      r={height / 2}
                      fill="#e9edf4"
                      stroke={NAVY}
                      strokeWidth={4}
                    />
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
                {/* Valeurs au-dessus de la tête, comme sur la planche. */}
                <text x={x} y={top - 32} textAnchor="middle" fontSize={26} fontWeight="800" fill="#6d6d6d">
                  {person.performance}%
                </text>
                {progression !== null && (
                  <text x={x} y={top - 4} textAnchor="middle" fontSize={26} fontWeight="800" fill={progressionColor}>
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
