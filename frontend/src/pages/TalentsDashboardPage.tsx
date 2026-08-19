import {
  Alert,
  Box,
  Checkbox,
  Button,
  CircularProgress,
  ListItemText,
  ListSubheader,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Customized,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Evaluation, Paginated, PerformanceRating } from "@/api/types";
import StatCard from "@/components/StatCard";
import { CHART_NEUTRALS, performanceColors } from "@/theme";

/**
 * Module 4 — Tableau de Bord des Talents (ID-TPD).
 *
 * Deux lectures des mêmes données, reprises du support ID-PMC :
 *  - la 9 Box "Performance Trajectory" : performance en abscisse (3 paliers),
 *    taux de progression en ordonnée (3 paliers), et la recommandation propre
 *    à chaque case ;
 *  - la trajectoire : nuage performance × progression, avec les séparateurs à
 *    90 % et 0 point.
 *
 * La performance est l'Altitude de la campagne choisie ; la progression est
 * l'écart en points avec la campagne précédente de la même personne — une
 * personne évaluée pour la première fois n'a donc pas de progression et est
 * signalée à part, plutôt que comptée à tort en "régression".
 */

interface TalentPoint {
  userId: number;
  name: string;
  position: string;
  department: string | null;
  avatar: string | null;
  performance: number;
  progression: number | null;
  rating: Evaluation["performance_rating"];
  previousPerformance: number | null;
  campaignName?: string;
}

/** Paliers de performance (abscisse) et de progression (ordonnée). */
const PERF_BANDS = [
  { key: "low", max: 74.999 },
  { key: "mid", max: 89.999 },
  { key: "high", max: Infinity },
] as const;

const ALL_RATINGS: PerformanceRating[] = ["VERY_LOW", "LOW", "AVERAGE", "GOOD", "OUTSTANDING"];

const CHART_HEIGHT = 520;
// Marges du repère : la marge gauche n'a besoin que de la place des pastilles
// chiffrées et des intitulés de paliers à la verticale — la réduire rapproche
// d'autant le bandeau bleu de l'axe des ordonnées.
const CHART_MARGIN = { top: 20, right: 40, bottom: 60, left: 92 };
const AXIS_BAND_HEIGHT = Math.round(CHART_HEIGHT * 0.7);
// Décalage des pastilles chiffrées sous l'axe des abscisses, et de celles de
// l'ordonnée par rapport au bord gauche du tracé — au plus près des axes.
const MARKER_ROW_OFFSET = 24;
// Transitions du survol des vignettes — mêmes durées que la matrice ID-3A.
const DOT_TRANSITION = "r 0.15s ease, width 0.15s ease, height 0.15s ease, x 0.15s ease, y 0.15s ease, font-size 0.15s ease";
const MARKER_SIDE_OFFSET = 22;
// Le bandeau "TAUX DE PROGRESSION" descend jusqu'à la rangée des pastilles :
// son bas s'aligne sur la pastille 1, point de départ des deux axes. Le centrer
// sur le bloc le laissait visuellement trop haut.
const AXIS_BAND_TOP = CHART_HEIGHT - CHART_MARGIN.bottom + MARKER_ROW_OFFSET - AXIS_BAND_HEIGHT;

const PROGRESS_BANDS = [
  { key: "regression", max: 0 },
  { key: "moderate", max: 5.999 },
  { key: "strong", max: Infinity },
] as const;


/** Position dans le repère : chaque palier occupe exactement UNE unité, si
 * bien que les trois colonnes (et les trois lignes) ont la même largeur — la
 * personne se place à l'intérieur de son palier au prorata de sa valeur.
 * Les bornes gardent la vignette entière dans le cadre : un point posé sur
 * l'arête déborderait de la moitié de sa photo. */
const X_INSET = 0.1; // ~30 px sur un tracé de 900 px de large
const Y_INSET = 0.2; // ~29 px sur un tracé de 440 px de haut

function clamp(value: number, inset: number) {
  return Math.min(3 - inset, Math.max(inset, value));
}

function xPos(performance: number) {
  const raw =
    performance < 75
      ? Math.max(0, performance) / 75 // 0 → 1
      : performance < 90
        ? 1 + (performance - 75) / 15 // 1 → 2
        : 2 + Math.min(1, (performance - 90) / 30); // 2 → 3 (90 % → 120 %)
  return clamp(raw, X_INSET);
}

function yPos(progression: number) {
  const raw =
    progression <= 0
      ? 1 + Math.max(-20, progression) / 20 // 0 → 1
      : progression < 6
        ? 1 + progression / 6 // 1 → 2
        : 2 + Math.min(1, (progression - 6) / 14); // 2 → 3
  return clamp(raw, Y_INSET);
}

/** Cadre de la 9 Box dessiné dans le repère : séparateurs pointillés, repères
 * chiffrés de l'échelle 1-5, intitulés des paliers et nom de chaque case. */
function NineBoxFrame({ xAxisMap, yAxisMap }: any) {
  const { t } = useTranslation();
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis) return null;
  const X = (v: number) => xAxis.scale(v);
  const Y = (v: number) => yAxis.scale(v);
  const cellLabel = { fontSize: 10, fontWeight: 700, fill: CHART_NEUTRALS.quadrantLabel } as const;
  const bandLabel = { fontSize: 11, fontWeight: 700, fill: "#5b8ac6" } as const;
  const edges = [0, 1, 2, 3];
  const xMarkers = [1, 3, 4, 5]; // numéros du support, aux arêtes des colonnes
  const yMarkers = [3, 4, 5]; // idem, aux arêtes des lignes (hors bas du repère)

  function marker(cx: number, cy: number, value: number) {
    return (
      <g key={`m-${value}-${cx}-${cy}`}>
        <circle cx={cx} cy={cy} r={14} fill="#4a7ebb" />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff">
          {value}
        </text>
      </g>
    );
  }

  return (
    <g>
      {/* Grille des 9 cases */}
      {edges.map((v) => (
        <line key={`vx-${v}`} x1={X(v)} y1={Y(3)} x2={X(v)} y2={Y(0)} stroke="#9fb3d1" strokeDasharray="3 3" />
      ))}
      {edges.map((v) => (
        <line key={`hy-${v}`} x1={X(0)} y1={Y(v)} x2={X(3)} y2={Y(v)} stroke="#9fb3d1" strokeDasharray="3 3" />
      ))}

      {/* Intitulé de chaque case, en filigrane */}
      {[0, 1, 2].map((col) =>
        [0, 1, 2].map((row) => (
          <text
            key={`c-${col}-${row}`}
            x={X(col) + 8}
            y={Y(row + 1) + 14}
            textAnchor="start"
            style={cellLabel}
          >
            {t(`talents.box.${col}${row}.title`).toUpperCase()}
          </text>
        ))
      )}

      {/* Repères chiffrés de l'échelle 1-5 */}
      {xMarkers.map((label, i) => marker(X(edges[i]), Y(0) + MARKER_ROW_OFFSET, label))}
      {yMarkers.map((label, i) => marker(X(0) - MARKER_SIDE_OFFSET, Y(i + 1), label))}

      {/* Paliers de performance sous l'axe, paliers de progression à gauche */}
      {[
        { at: 0.5, key: PERF_BANDS[0].key },
        { at: 1.5, key: PERF_BANDS[1].key },
        { at: 2.5, key: PERF_BANDS[2].key },
      ].map((b) => (
        <text key={b.key} x={X(b.at)} y={Y(0) + 30} textAnchor="middle" style={bandLabel}>
          {t(`talents.perfBand.${b.key}`)}
        </text>
      ))}
      {[
        { at: 0.5, key: PROGRESS_BANDS[0].key },
        { at: 1.5, key: PROGRESS_BANDS[1].key },
        { at: 2.5, key: PROGRESS_BANDS[2].key },
      ].map((b) => (
        <text
          key={b.key}
          x={X(0) - 50}
          y={Y(b.at)}
          textAnchor="middle"
          transform={`rotate(-90 ${X(0) - 50} ${Y(b.at)})`}
          style={bandLabel}
        >
          {t(`talents.progressBand.${b.key}`)}
        </text>
      ))}
    </g>
  );
}

/** Point d'une personne : photo cerclée de la couleur de son palier de
 * performance, écart relatif affiché à côté. La vignette grossit au survol,
 * comme sur la matrice ID-3A, pour mettre le visage en avant et faire passer
 * le point au-dessus de ses voisins. */
function TalentDot({ cx, cy, payload, flip }: any) {
  const [hovered, setHovered] = useState(false);
  const p: TalentPoint & { x: number } = payload;
  const delta = p.progression as number;
  const color = performanceColors[p.rating];
  const baseR = 17;
  const r = hovered ? baseR + 18 : baseR;
  // Anneau proportionnel au rayon : agrandi, il resterait sinon un filet.
  const ringWidth = r * 0.24;
  const photoR = r - ringWidth;
  const clipId = `talent-photo-${p.userId}`;
  const shadowId = `talent-shadow-${p.userId}`;
  // Près du bord droit, l'écart s'écrit à gauche du point : à droite il
  // sortirait du cadre.
  const labelLeft = flip ?? p.x > 2.5;
  return (
    <g
      style={{ cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tabIndex={0}
      role="img"
      aria-label={`${p.name} — ${p.performance}% — ${delta >= 0 ? "+" : ""}${delta}%`}
    >
      <defs>
        {/* Pas de transition sur le clip-path : animé, il peut faire
            apparaître la photo non découpée dans certains navigateurs. */}
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={photoR} />
        </clipPath>
        {/* Ombre douce : la vignette se détache du fond et du quadrillage. */}
        <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy={hovered ? 3 : 1.5} stdDeviation={hovered ? 3 : 1.5} floodColor="#1f3a63" floodOpacity="0.28" />
        </filter>
      </defs>
      {/* Halo dessiné à l'extérieur de l'anneau, pour détacher la vignette de
          la grille sans entamer la couleur du palier. */}
      <circle cx={cx} cy={cy} r={r + 1.5} fill={CHART_NEUTRALS.halo} filter={`url(#${shadowId})`} style={{ transition: DOT_TRANSITION }} />
      <circle cx={cx} cy={cy} r={r} fill={color} style={{ transition: DOT_TRANSITION }} />
      {p.avatar ? (
        <image
          href={p.avatar}
          x={cx - photoR}
          y={cy - photoR}
          width={photoR * 2}
          height={photoR * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
          style={{ transition: DOT_TRANSITION }}
        />
      ) : (
        <>
          <circle cx={cx} cy={cy} r={photoR} fill="#fff" style={{ transition: DOT_TRANSITION }} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={hovered ? 24 : 14}
            fontWeight={700}
            fill={color}
            style={{ transition: "font-size 0.15s ease" }}
          >
            {p.name.charAt(0).toUpperCase()}
          </text>
        </>
      )}
      {/* Performance au-dessus de la vignette au survol : l'infobulle donne le
          détail, mais le chiffre reste lisible sans attendre son ouverture. */}
      {hovered && (
        <text
          x={cx}
          y={cy - r - 6}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill={color}
          stroke={CHART_NEUTRALS.halo}
          strokeWidth={3}
          paintOrder="stroke"
        >
          {p.performance}%
        </text>
      )}
      <text
        x={labelLeft ? cx - r - 8 : cx + r + 8}
        y={cy + 4}
        textAnchor={labelLeft ? "end" : "start"}
        fontSize={hovered ? 14 : 12}
        fontWeight={800}
        fill={delta >= 0 ? "#2e7d32" : "#c62828"}
        stroke={CHART_NEUTRALS.halo}
        strokeWidth={3}
        paintOrder="stroke"
        style={{ transition: DOT_TRANSITION }}
      >
        {delta >= 0 ? "+" : ""}
        {delta}%
      </text>
    </g>
  );
}


// --- Vue "Trajectoire" ---------------------------------------------------
// Repère du support : performance de 50 à 120 % en abscisse, écart avec la
// période précédente de -20 à +20 % en ordonnée, les deux axes se croisant à
// 90 % / 0 % — et non dans un coin.
const TRAJECTORY_HEIGHT = Math.round(560 * 1.3);
const TRAJECTORY_MARGIN = { top: 30, right: 60, bottom: 30, left: 40 };
const TRAJECTORY_X: [number, number] = [50, 120];
const TRAJECTORY_Y: [number, number] = [-20, 20];
const TRAJECTORY_ORIGIN_X = 90;
// Marges de sécurité : une vignette posée sur la graduation extrême sortirait
// du repère de la moitié de sa photo. Exprimées dans l'unité de chaque axe.
const TRAJECTORY_X_INSET = 2; // ~2 points de performance
const TRAJECTORY_Y_INSET = 1.5; // ~1,5 point d'écart
const AXIS_BLUE = "#2E5AAC";

function TrajectoryFrame({ xAxisMap, yAxisMap }: any) {
  const { t } = useTranslation();
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis) return null;
  const X = (v: number) => xAxis.scale(v);
  const Y = (v: number) => yAxis.scale(v);
  const tickText = { fontSize: 10.5, fontWeight: 700, fill: "#5b7aa8", letterSpacing: 0.2 } as const;
  const xTicks = [50, 55, 60, 65, 70, 75, 80, 85, 95, 100, 105, 110, 115, 120];
  const yTicks = [20, 15, 10, 5, -5, -10, -15, -20];
  const inset = 10;

  /** Un quadrant : rectangle à coins arrondis, en pointillés, sur un aplat
   * très pâle qui dit son sens — vert en haut à droite (performants qui
   * progressent), rouge en bas à gauche (en difficulté et en recul). */
  function quadrant(x1: number, x2: number, y1: number, y2: number, key: string, tint: string) {
    const left = Math.min(X(x1), X(x2)) + inset;
    const right = Math.max(X(x1), X(x2)) - inset;
    const top = Math.min(Y(y1), Y(y2)) + inset;
    const bottom = Math.max(Y(y1), Y(y2)) - inset;
    return (
      <rect
        key={key}
        x={left}
        y={top}
        width={Math.max(0, right - left)}
        height={Math.max(0, bottom - top)}
        rx={26}
        ry={26}
        fill={tint}
        stroke="#3a5a8c"
        strokeWidth={3}
        strokeDasharray="1 6"
        strokeLinecap="round"
      />
    );
  }

  return (
    <g>
      {quadrant(TRAJECTORY_X[0], TRAJECTORY_ORIGIN_X, 0, TRAJECTORY_Y[1], "tl", "#eef4fd")}
      {quadrant(TRAJECTORY_ORIGIN_X, TRAJECTORY_X[1], 0, TRAJECTORY_Y[1], "tr", "#ecf8ee")}
      {quadrant(TRAJECTORY_X[0], TRAJECTORY_ORIGIN_X, TRAJECTORY_Y[0], 0, "bl", "#fdeeec")}
      {quadrant(TRAJECTORY_ORIGIN_X, TRAJECTORY_X[1], TRAJECTORY_Y[0], 0, "br", "#fdf6e9")}

      <defs>
        {/* markerUnits="userSpaceOnUse" : sinon la flèche est multipliée par
            l'épaisseur du trait (6) et déborde largement de l'axe. */}
        {/* markerWidth = longueur de la pointe le long de l'axe,
            markerHeight = son envergure : 18 px pour un trait de 6, la pointe
            se voit. refX place le sommet sur l'extrémité de la ligne, donc la
            flèche est dessinée EN DEÇÀ du point d'arrivée, jamais au-delà. */}
        <marker
          id="tpd-arrow"
          markerUnits="userSpaceOnUse"
          markerWidth="15"
          markerHeight="18"
          refX="15"
          refY="9"
          orient="auto"
        >
          <path d="M0,0 L15,9 L0,18 Z" fill={AXIS_BLUE} />
        </marker>
      </defs>
      {/* Axes épais fléchés, croisés sur l'origine du support (90 % / 0 %). */}
      <line
        x1={X(TRAJECTORY_X[0])}
        y1={Y(0)}
        x2={X(TRAJECTORY_X[1])}
        y2={Y(0)}
        stroke={AXIS_BLUE}
        strokeWidth={6}
        markerEnd="url(#tpd-arrow)"
      />
      <line
        x1={X(TRAJECTORY_ORIGIN_X)}
        y1={Y(TRAJECTORY_Y[0])}
        x2={X(TRAJECTORY_ORIGIN_X)}
        y2={Y(TRAJECTORY_Y[1])}
        stroke={AXIS_BLUE}
        strokeWidth={6}
        markerEnd="url(#tpd-arrow)"
      />

      {/* Graduations : sous l'axe horizontal, à droite de l'axe vertical. */}
      {xTicks.map((v) => (
        <text key={`xt-${v}`} x={X(v)} y={Y(0) + 22} textAnchor="middle" style={tickText}>
          {v}%
        </text>
      ))}
      {yTicks.map((v) => (
        <text key={`yt-${v}`} x={X(TRAJECTORY_ORIGIN_X) + 14} y={Y(v) + 4} textAnchor="start" style={tickText}>
          {v > 0 ? `+${v}%` : `- ${Math.abs(v)}%`}
        </text>
      ))}

      {/* Origine mise en avant, comme sur la planche : 90 % sur fond vert. */}
      <rect x={X(TRAJECTORY_ORIGIN_X) - 24} y={Y(0) + 10} width={48} height={18} rx={5} fill="#8fe8a8" />
      <text x={X(TRAJECTORY_ORIGIN_X)} y={Y(0) + 23} textAnchor="middle" style={tickText}>
        {TRAJECTORY_ORIGIN_X}%
      </text>

      {/* Intitulés des axes sur fond jaune, comme sur la planche. */}
      <g transform={`translate(${X(TRAJECTORY_ORIGIN_X) - 34}, ${Y(TRAJECTORY_Y[1]) + 6})`}>
        <rect x={0} y={0} width={18} height={92} rx={5} fill="#ffe86b" />
        <text x={9} y={46} textAnchor="middle" transform="rotate(-90 9 46)" style={tickText}>
          {t("talents.trajectoryYAxis")}
        </text>
      </g>
      <g transform={`translate(${X(TRAJECTORY_X[1]) - 4}, ${Y(0) - 40})`}>
        <rect x={0} y={0} width={150} height={30} rx={5} fill="#ffe86b" />
        <text x={6} y={13} style={{ ...tickText, fontSize: 10 }}>
          %
        </text>
        <text x={6} y={25} style={{ ...tickText, fontSize: 10 }}>
          {t("talents.trajectoryXAxis")}
        </text>
      </g>
    </g>
  );
}


/** Tracé de progression d'une personne : segments reliant ses positions
 * successives, colorés par le palier atteint à l'arrivée, avec une flèche de
 * sens et le nom de la période à chaque étape. Utilisé tel quel par les deux
 * vues, seules les coordonnées changent. */
function TrailLayer({ xAxisMap, yAxisMap, trail, toX, toY }: any) {
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis || !trail || trail.length === 0) return null;
  const X = (p: TalentPoint) => xAxis.scale(toX(p));
  const Y = (p: TalentPoint) => yAxis.scale(toY(p));

  return (
    <g>
      <defs>
        {trail.slice(1).map((p: TalentPoint, i: number) => (
          <marker
            key={`m-${i}`}
            id={`trail-arrow-${i}`}
            markerUnits="userSpaceOnUse"
            markerWidth="11"
            markerHeight="11"
            refX="10"
            refY="5.5"
            orient="auto"
          >
            <path d="M0,0 L11,5.5 L0,11 Z" fill={performanceColors[p.rating]} />
          </marker>
        ))}
      </defs>
      {trail.slice(1).map((p: TalentPoint, i: number) => {
        const from = trail[i];
        return (
          <line
            key={`s-${i}`}
            x1={X(from)}
            y1={Y(from)}
            x2={X(p)}
            y2={Y(p)}
            stroke={performanceColors[p.rating]}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            markerEnd={`url(#trail-arrow-${i})`}
            opacity={0.85}
          />
        );
      })}
      {trail.map((p: TalentPoint, i: number) => (
        <g key={`p-${i}`}>
          {/* Étapes précédentes en petits jalons ; la position courante est
              dessinée par la vignette photo, on ne la double pas. */}
          {i < trail.length - 1 && (
            <>
              <circle cx={X(p)} cy={Y(p)} r={7} fill="#fff" stroke={performanceColors[p.rating]} strokeWidth={3} />
              <text
                x={X(p)}
                y={Y(p) - 12}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill={performanceColors[p.rating]}
                stroke={CHART_NEUTRALS.halo}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {p.campaignName} · {p.performance}%
              </text>
            </>
          )}
        </g>
      ))}
    </g>
  );
}

/** Infobulle commune aux deux vues. */
function TalentTooltip({ active, payload }: any) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const p: TalentPoint = payload[0].payload;
  const delta = p.progression as number;
  return (
    <Paper elevation={0} sx={{ p: 1.25, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {p.name}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {p.position}
        {p.department ? ` · ${p.department}` : ""}
      </Typography>
      <Typography variant="body2" sx={{ color: performanceColors[p.rating] }}>
        {t("talents.performance")} : {p.performance}%
      </Typography>
      <Typography variant="body2" sx={{ color: delta >= 0 ? "success.main" : "error.main" }}>
        {t("talents.progression")} : {delta >= 0 ? "+" : ""}
        {delta}%
        {p.previousPerformance !== null && ` (${p.previousPerformance}% → ${p.performance}%)`}
      </Typography>
    </Paper>
  );
}

export default function TalentsDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  // Période de départ du tracé de progression, palier(s) retenus et personne
  // suivie individuellement.
  const [fromCampaignId, setFromCampaignId] = useState<number | "">("");
  const [ratingFilter, setRatingFilter] = useState<PerformanceRating[]>([]);
  const [personFilter, setPersonFilter] = useState<number | "">("");
  const [view, setView] = useState<"boxes" | "trajectory">("boxes");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function load() {
    setLoading(true);
    setLoadError(false);
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => {
        setEvaluations(r.data.results);
        const sorted = [...r.data.results].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
        // La période de comparaison reste vide tant qu'elle n'est pas choisie :
        // sans elle, la page montre la seule photographie de la période.
        if (sorted.length) setCampaignId(sorted[sorted.length - 1].campaign);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const campaigns = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; start_date: string }>();
    evaluations.forEach((e) => byId.set(e.campaign, { id: e.campaign, name: e.campaign_name, start_date: e.campaign_start_date }));
    return Array.from(byId.values()).sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [evaluations]);

  const departments = useMemo(
    () => Array.from(new Set(evaluations.map((e) => e.user_department).filter((d): d is string => !!d))).sort(),
    [evaluations]
  );

  /** Point par personne évaluée sur la campagne choisie, avec l'écart en
   * points par rapport à sa campagne précédente. */
  const points = useMemo<TalentPoint[]>(() => {
    if (campaignId === "") return [];
    const current = campaigns.find((c) => c.id === campaignId);
    if (!current) return [];
    const byUser = new Map<number, Evaluation[]>();
    evaluations.forEach((e) => {
      if (!byUser.has(e.user)) byUser.set(e.user, []);
      byUser.get(e.user)!.push(e);
    });
    const result: TalentPoint[] = [];
    byUser.forEach((list) => {
      const sorted = [...list].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
      const index = sorted.findIndex((e) => e.campaign === campaignId);
      if (index === -1) return;
      const evaluation = sorted[index];
      if (departmentFilter && evaluation.user_department !== departmentFilter) return;
      const previous = index > 0 ? Number(sorted[index - 1].altitude_percentage) : null;
      const performance = Number(evaluation.altitude_percentage);
      // Progression relative : écart rapporté à la performance précédente,
      // comme le prévoit le support (paliers exprimés en %). Une période
      // précédente à 0 % rendrait le rapport infini : pas de progression.
      const progression =
        previous === null || previous === 0 ? null : Math.round(((performance - previous) / previous) * 1000) / 10;
      result.push({
        userId: evaluation.user,
        name: evaluation.user_name,
        position: evaluation.user_position,
        department: evaluation.user_department,
        avatar: evaluation.user_avatar,
        performance,
        progression,
        rating: evaluation.performance_rating,
        previousPerformance: previous,
      });
    });
    return result
      .filter((p) => (ratingFilter.length === 0 || ratingFilter.includes(p.rating)) && (personFilter === "" || p.userId === personFilter))
      .sort((a, b) => b.performance - a.performance);
  }, [evaluations, campaigns, campaignId, departmentFilter, ratingFilter, personFilter]);

  const people = useMemo(() => {
    const byId = new Map<number, string>();
    evaluations.forEach((e) => byId.set(e.user, e.user_name));
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [evaluations]);

  /** Mêmes personnes, regroupées par département et triées par nom : dans une
   * liste de plusieurs dizaines de noms, le département sert de repère. */
  const peopleByDepartment = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; department: string }>();
    evaluations.forEach((e) => byId.set(e.user, { id: e.user, name: e.user_name, department: e.user_department ?? "" }));
    const groups = new Map<string, { id: number; name: string }[]>();
    Array.from(byId.values()).forEach((p) => {
      if (!groups.has(p.department)) groups.set(p.department, []);
      groups.get(p.department)!.push({ id: p.id, name: p.name });
    });
    return Array.from(groups.entries())
      .map(([department, members]) => ({ department, members: members.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.department.localeCompare(b.department));
  }, [evaluations]);

  /** Tracé de progression d'une personne : ses positions successives entre la
   * période de départ et la période affichée, dans l'ordre chronologique. Une
   * période sans progression calculable (première évaluation) est ignorée :
   * elle n'a pas d'ordonnée. */
  const trail = useMemo<TalentPoint[]>(() => {
    if (personFilter === "" || campaignId === "" || fromCampaignId === "") return [];
    const from = campaigns.find((c) => c.id === fromCampaignId);
    const to = campaigns.find((c) => c.id === campaignId);
    if (!from || !to) return [];
    const own = evaluations
      .filter((e) => e.user === personFilter)
      .sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
    const result: TalentPoint[] = [];
    own.forEach((e, index) => {
      if (e.campaign_start_date < from.start_date || e.campaign_start_date > to.start_date) return;
      const previous = index > 0 ? Number(own[index - 1].altitude_percentage) : null;
      const performance = Number(e.altitude_percentage);
      if (previous === null || previous === 0) return;
      result.push({
        userId: e.user,
        name: e.user_name,
        position: e.user_position,
        department: e.user_department,
        avatar: e.user_avatar,
        performance,
        progression: Math.round(((performance - previous) / previous) * 1000) / 10,
        rating: e.performance_rating,
        previousPerformance: previous,
        campaignName: e.campaign_name,
      });
    });
    return result;
  }, [evaluations, campaigns, personFilter, campaignId, fromCampaignId]);

  const placed = points.filter((p) => p.progression !== null);
  const unrated = points.filter((p) => p.progression === null);

  const kpis = useMemo(() => {
    if (!placed.length) return null;
    const improving = placed.filter((p) => (p.progression ?? 0) > 0).length;
    const atRisk = placed.filter((p) => p.performance < 90 && (p.progression ?? 0) <= 0).length;
    const leaders = placed.filter((p) => p.performance >= 90 && (p.progression ?? 0) >= 6).length;
    return { improving, atRisk, leaders, total: placed.length };
  }, [placed]);

  /** Combinaisons de filtres qui ne peuvent rien produire : plutôt qu'un
   * graphe vide sans explication, on dit ce qui cloche et la marche à suivre.
   * L'ordre compte : on signale la cause la plus en amont d'abord. */
  const guidance = useMemo<{ severity: "warning" | "info"; text: string } | null>(() => {
    const current = campaigns.find((c) => c.id === campaignId);
    const from = campaigns.find((c) => c.id === fromCampaignId);
    const personName = people.find((p) => p.id === personFilter)?.name ?? "";

    if (from && current && from.start_date >= current.start_date) {
      return { severity: "warning", text: t("talents.errorComparePeriod", { period: current.name }) };
    }
    if (from && personFilter === "") {
      return { severity: "info", text: t("talents.errorCompareNoPerson") };
    }
    if (personFilter !== "" && placed.length === 0) {
      return { severity: "warning", text: t("talents.errorPersonNoPoint", { name: personName, period: current?.name ?? "" }) };
    }
    if (personFilter !== "" && from && trail.length < 2) {
      return { severity: "info", text: t("talents.errorTrailTooShort", { name: personName }) };
    }
    if (ratingFilter.length > 0 && placed.length === 0) {
      return { severity: "warning", text: t("talents.errorRatingEmpty") };
    }
    if (departmentFilter && placed.length === 0) {
      return { severity: "warning", text: t("talents.errorDepartmentEmpty", { department: departmentFilter }) };
    }
    return null;
  }, [campaigns, campaignId, fromCampaignId, personFilter, people, placed.length, trail.length, ratingFilter, departmentFilter, t]);

  const scatterData = placed.map((p) => ({
    ...p,
    x: Math.min(TRAJECTORY_X[1] - TRAJECTORY_X_INSET, Math.max(TRAJECTORY_X[0] + TRAJECTORY_X_INSET, p.performance)),
    y: Math.min(TRAJECTORY_Y[1] - TRAJECTORY_Y_INSET, Math.max(TRAJECTORY_Y[0] + TRAJECTORY_Y_INSET, p.progression as number)),
    z: 200,
  }));
  const boxData = placed.map((p) => ({ ...p, x: xPos(p.performance), y: yPos(p.progression as number), z: 200 }));

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("talents.title")}
      </Typography>

      {/* Barre de commandes, dans l'ordre de lecture : la vue d'abord, puis la
        * période observée et sa comparaison, enfin les filtres du plus large
        * (performance, département) au plus fin (collaborateur). */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="flex-start">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v) => v && setView(v)}
          sx={{
            height: 40,
            "& .MuiToggleButton-root": {
              px: 2,
              fontWeight: 700,
              borderColor: "primary.main",
              color: "primary.main",
            },
            "& .Mui-selected": {
              bgcolor: "primary.main",
              color: "#fff !important",
              "&:hover": { bgcolor: "primary.dark" },
            },
          }}
        >
          <ToggleButton value="boxes">{t("talents.viewBoxes")}</ToggleButton>
          <ToggleButton value="trajectory">{t("talents.viewTrajectory")}</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          select
          size="small"
          label={t("common.period")}
          value={campaignId}
          onChange={(e) => setCampaignId(Number(e.target.value))}
          sx={{ minWidth: 190 }}
        >
          {campaigns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label={t("talents.fromPeriod")}
          value={fromCampaignId}
          onChange={(e) => setFromCampaignId(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">{t("talents.chooseFromPeriod")}</MenuItem>
          {campaigns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label={t("id3aMatrix.performanceFilter")}
          value={ratingFilter}
          onChange={(e) => {
            const value = e.target.value;
            setRatingFilter(typeof value === "string" ? (value.split(",") as PerformanceRating[]) : (value as PerformanceRating[]));
          }}
          sx={{ minWidth: 200 }}
          SelectProps={{
            multiple: true,
            renderValue: (selected: unknown) => {
              const values = selected as PerformanceRating[];
              if (values.length === 0) return t("id3aMatrix.allPerformanceLevels");
              return values.map((r) => t(`common.performance.${r}`)).join(", ");
            },
          }}
        >
          {ALL_RATINGS.map((rating) => (
            <MenuItem key={rating} value={rating}>
              <Checkbox
                size="small"
                checked={ratingFilter.includes(rating)}
                sx={{ color: performanceColors[rating], "&.Mui-checked": { color: performanceColors[rating] } }}
              />
              <ListItemText primary={t(`common.performance.${rating}`)} />
            </MenuItem>
          ))}
        </TextField>

        {departments.length > 1 && (
          <TextField
            select
            size="small"
            label={t("common.department")}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">{t("talents.allDepartments")}</MenuItem>
            {departments.map((d) => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          select
          size="small"
          label={t("talents.person")}
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">{t("talents.allPeople")}</MenuItem>
          {peopleByDepartment.flatMap((group) => [
            <ListSubheader key={`h-${group.department}`} sx={{ fontWeight: 700, lineHeight: 2 }}>
              {group.department || t("id3aMatrix.noDepartment")}
            </ListSubheader>,
            ...group.members.map((m) => (
              <MenuItem key={m.id} value={m.id} sx={{ pl: 3 }}>
                {m.name}
              </MenuItem>
            )),
          ])}
        </TextField>
      </Stack>

      {guidance && (
        <Alert severity={guidance.severity}>{guidance.text}</Alert>
      )}

      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={load}>
              {t("common.retry")}
            </Button>
          }
        >
          {t("common.loadError")}
        </Alert>
      )}

      {kpis && (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <StatCard label={t("talents.kpiEvaluated")} value={String(kpis.total)} color="#2E8FCB" />
          <StatCard label={t("talents.kpiImproving")} value={String(kpis.improving)} color="#4caf50" />
          <StatCard label={t("talents.kpiLeaders")} value={String(kpis.leaders)} color="#0ca30c" />
          <StatCard label={t("talents.kpiAtRisk")} value={String(kpis.atRisk)} color="#d32f2f" />
        </Stack>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress />
        </Stack>
      ) : placed.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, border: "1px solid", borderColor: "divider", textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("talents.noData")}
          </Typography>
        </Paper>
      ) : view === "boxes" ? (
        <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
          {/* Intitulé du schéma, repris tel quel du support ID-PMC. */}
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5, textAlign: "center", color: "primary.main" }}>
            {t("talents.boxesTitle")}
          </Typography>
          {/* Bande "TAUX DE PROGRESSION" à gauche, repère au centre, bande
            * "PERFORMANCE %" en bas — comme la planche du support. */}
          <Stack direction="row" spacing={0.5}>
            <Box
              sx={{
                width: 34,
                // Bandeau raccourci de 30 %, et centré sur la ZONE DE TRACÉ
                // (hors marges haute et basse) : le centrer sur le bloc entier
                // le décalait vers le bas, la marge basse portant les pastilles
                // et les intitulés de paliers.
                height: AXIS_BAND_HEIGHT,
                mt: `${AXIS_BAND_TOP}px`,
                alignSelf: "flex-start",
                flexShrink: 0,
                bgcolor: "#12275c",
                color: "#fff",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography
                variant="caption"
                fontWeight={700}
                sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 1 }}
              >
                {t("talents.progressionAxis")}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ScatterChart margin={CHART_MARGIN}>
                  <Customized component={<NineBoxFrame />} />
                  <Customized
                    component={
                      <TrailLayer trail={trail} toX={(p: TalentPoint) => xPos(p.performance)} toY={(p: TalentPoint) => yPos(p.progression as number)} />
                    }
                  />
                  {/* width/height à 0 : sans graduations, Recharts réserve
                    * quand même la taille par défaut de ses axes (60 px à
                    * gauche, 30 px en bas) — c'est ce vide qui éloignait le
                    * bandeau et le repère. Les marges suffisent aux pastilles
                    * et aux intitulés de paliers, que nous dessinons nous-mêmes. */}
                  <XAxis type="number" dataKey="x" domain={[0, 3]} ticks={[]} tickLine={false} axisLine={false} tick={false} height={0} />
                  <YAxis type="number" dataKey="y" domain={[0, 3]} ticks={[]} tickLine={false} axisLine={false} tick={false} width={0} />
                  <ZAxis type="number" dataKey="z" range={[160, 160]} />
                  <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} content={<TalentTooltip />} />
                  <Scatter data={boxData} shape={(props: any) => <TalentDot {...props} />} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
              {/* Barre d'abscisse réduite de moitié et centrée sur le repère. */}
              <Box sx={{ bgcolor: "#3F9142", color: "#fff", borderRadius: 1, textAlign: "center", py: 0.5, mt: 0.5, width: "50%", mx: "auto" }}>
                <Typography variant="caption" fontWeight={700} sx={{ letterSpacing: 1 }}>
                  {t("talents.performanceAxis")}
                </Typography>
              </Box>
            </Box>
          </Stack>
        </Paper>
      ) : (
        <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1, textAlign: "center", color: "primary.main" }}>
            {t("talents.trajectoryTitle")}
          </Typography>
          <ResponsiveContainer width="100%" height={TRAJECTORY_HEIGHT}>
            <ScatterChart margin={TRAJECTORY_MARGIN}>
              {/* Quadrillage en carrés, puis le cadre dessiné à la main :
                * quadrants arrondis, axes fléchés se croisant à 90 % et 0 %. */}
              <CartesianGrid stroke="#a9c0dc" strokeWidth={1} />
              <Customized component={<TrajectoryFrame />} />
              <Customized
                component={
                  <TrailLayer
                    trail={trail}
                    toX={(p: TalentPoint) => Math.min(TRAJECTORY_X[1] - TRAJECTORY_X_INSET, Math.max(TRAJECTORY_X[0] + TRAJECTORY_X_INSET, p.performance))}
                    toY={(p: TalentPoint) => Math.min(TRAJECTORY_Y[1] - TRAJECTORY_Y_INSET, Math.max(TRAJECTORY_Y[0] + TRAJECTORY_Y_INSET, p.progression as number))}
                  />
                }
              />
              <XAxis
                type="number"
                dataKey="x"
                domain={[TRAJECTORY_X[0], TRAJECTORY_X[1]]}
                ticks={[]}
                tick={false}
                tickLine={false}
                axisLine={false}
                height={0}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[TRAJECTORY_Y[0], TRAJECTORY_Y[1]]}
                ticks={[]}
                tick={false}
                tickLine={false}
                axisLine={false}
                width={0}
              />
              <ZAxis type="number" dataKey="z" range={[160, 160]} />
              <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} content={<TalentTooltip />} />
              <Scatter
                data={scatterData}
                isAnimationActive={false}
                shape={(props: any) => <TalentDot {...props} flip={props.payload.x > TRAJECTORY_X[1] - 12} />}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {trail.length > 1 && (
        <Alert severity="info" icon={false}>
          {t("talents.trailHint", { name: trail[0].name })}
        </Alert>
      )}

      {/* Sur les données réelles, la majorité des collaborateurs n'a qu'une
        * seule campagne évaluée : on annonce le nombre plutôt que d'aligner
        * des dizaines de noms, la liste complète restant au survol. */}
      {unrated.length > 0 && (
        <Alert severity="info">
          <Tooltip title={unrated.map((p) => p.name).join(", ")}>
            <span>
              {t("talents.firstEvaluation", { count: unrated.length })}
              {" — "}
              {unrated.slice(0, 5).map((p) => p.name).join(", ")}
              {unrated.length > 5 ? ` … (+${unrated.length - 5})` : ""}
            </span>
          </Tooltip>
        </Alert>
      )}

      {user?.role === "COMPANY_ADMIN" && placed.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {t("talents.legend")}
        </Typography>
      )}
    </Stack>
  );
}
