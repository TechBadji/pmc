import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import TrendingFlatOutlinedIcon from "@mui/icons-material/TrendingFlatOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Evaluation, Paginated, PerformanceRating } from "@/api/types";
import { CHART_NEUTRALS, performanceColors } from "@/theme";

const AXIS_TICKS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
// Quadrillage secondaire (pas de 0.25) — lecture plus fine entre les
// graduations principales de 0.5, sans les dupliquer.
const MINOR_AXIS_TICKS = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 4.25, 4.75];

interface Point {
  userId: number;
  x: number; // SSI — Attitudes (Soft Skills)
  y: number; // HSI — Aptitudes (Hard Skills)
  z: number;
  name: string;
  position: string;
  department: string | null;
  age: number | null;
  avatar: string | null;
  rating: PerformanceRating;
  altitude: string;
  campaignName: string;
  campaignStartDate: string;
  hsi: number;
  ssi: number;
}

function toPoint(e: Evaluation): Point {
  return {
    userId: e.user,
    x: Number(e.ssi),
    y: Number(e.hsi),
    z: 200,
    name: e.user_name,
    position: e.user_position,
    department: e.user_department,
    age: e.user_age,
    avatar: e.user_avatar,
    rating: e.performance_rating,
    altitude: e.altitude_percentage,
    campaignName: e.campaign_name,
    campaignStartDate: e.campaign_start_date,
    hsi: Number(e.hsi),
    ssi: Number(e.ssi),
  };
}

const DECLUTTER_MIN_DIST = 0.3;

/** Écarte doucement les points trop proches (positions HSI/SSI voisines) pour
 * qu'ils restent distinguables à l'affichage, sans jamais les éloigner
 * beaucoup de leur véritable position — utile dès qu'une quarantaine de
 * collaborateurs se trouvent affichés en même temps ("Toute l'entreprise").
 * Les notes réelles (hsi/ssi) ne sont pas modifiées, seules les coordonnées
 * d'affichage (x/y) bougent ; la note affichée au clic reste donc exacte. */
function declutterPoints(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const adjusted = points.map((p) => ({ ...p }));
  for (let iteration = 0; iteration < 40; iteration++) {
    let moved = false;
    for (let i = 0; i < adjusted.length; i++) {
      for (let j = i + 1; j < adjusted.length; j++) {
        const dx = adjusted[j].x - adjusted[i].x;
        const dy = adjusted[j].y - adjusted[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < DECLUTTER_MIN_DIST) {
          moved = true;
          const push = (DECLUTTER_MIN_DIST - dist) / 2;
          const ux = dist > 0.0001 ? dx / dist : 1;
          const uy = dist > 0.0001 ? dy / dist : 0;
          adjusted[i].x -= ux * push;
          adjusted[i].y -= uy * push;
          adjusted[j].x += ux * push;
          adjusted[j].y += uy * push;
        }
      }
    }
    if (!moved) break;
  }
  adjusted.forEach((p) => {
    p.x = Math.min(5, Math.max(0, p.x));
    p.y = Math.min(5, Math.max(0, p.y));
  });
  return adjusted;
}

function CustomTooltip({ active, payload }: any) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  return (
    <Paper elevation={0} sx={{ p: 1.5, minWidth: 200, border: "1px solid", borderColor: "divider" }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Avatar src={p.avatar ?? undefined} sx={{ width: 32, height: 32, fontSize: 14, bgcolor: "primary.main" }}>
          {p.name.charAt(0).toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
            {p.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {p.position}
            {p.age ? ` · ${p.age} ${t("common.years")}` : ""}
          </Typography>
          {p.department && (
            <Typography variant="caption" color="text.secondary">
              {p.department}
            </Typography>
          )}
        </Box>
      </Stack>
      <Typography variant="body2" sx={{ mt: 0.75 }}>
        Aptitudes (HSI): <strong>{p.hsi.toFixed(1)}</strong> · Attitudes (SSI):{" "}
        <strong>{p.ssi.toFixed(1)}</strong>
      </Typography>
      <Typography variant="body2" sx={{ color: performanceColors[p.rating] }}>
        Altitude: <strong>{p.altitude}%</strong> — {t(`common.performance.${p.rating}`)} ({p.campaignName})
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        {t("id3aMatrix.clickHint")}
      </Typography>
    </Paper>
  );
}

const DOT_TRANSITION = "r 0.15s ease, width 0.15s ease, height 0.15s ease, x 0.15s ease, y 0.15s ease";

/** Point d'une position (actuelle ou de comparaison) : photo découpée en
 * cercle, cerclée de la couleur du palier de performance à cette période —
 * reprend le rendu des matrices ID-3A du PDF ID-PMC (photo du directeur
 * entourée d'un anneau de couleur). La position de comparaison réutilise le
 * même rendu, en plus estompé, pour rester lisible sans la confondre avec la
 * position actuelle. Grossit légèrement au survol de la souris pour mieux
 * mettre en valeur le visage du collaborateur. */
function PhotoDot({ cx, cy, payload, dimmed, onSelect }: any) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const p: Point = payload;
  const baseR = dimmed ? 15 : 19;
  const r = hovered ? baseR + 20 : baseR;
  // Épaisseur de l'anneau proportionnelle au rayon (et non fixe), pour que
  // la couleur reste bien présente tout autour de la photo même une fois
  // agrandie au survol, au lieu de devenir un mince filet à peine visible.
  const ringWidth = r * (dimmed ? 0.27 : 0.26);
  const color = performanceColors[p.rating];
  const photoR = r - ringWidth;
  // Identifiant sans espace ni accent : une référence CSS url(#...) non
  // citée casse silencieusement dès qu'elle contient un espace (ex. "Semestre
  // 1 2025"), ce qui désactive le clip-path et affiche la photo en carré non
  // découpé au lieu d'un cercle — la date de campagne (format ISO) est un
  // identifiant sûr et déjà unique par utilisateur.
  const clipId = `id3a-clip-${p.userId}-${p.campaignStartDate}`;
  return (
    <g
      style={{ cursor: "pointer" }}
      opacity={dimmed && !hovered ? 0.6 : 1}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect?.(p)}
      tabIndex={0}
      role="button"
      aria-label={`${p.name} — ${t("dashboard.manager.altitude")} ${p.altitude}% — ${t(`common.performance.${p.rating}`)}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(p);
        }
      }}
    >
      <defs>
        {/* Pas de transition CSS ici : un clip-path animé référencé via
            <clipPath>/url() n'est pas fiable dans tous les navigateurs et
            peut faire apparaître la photo non découpée (carrée) — seule
            l'image elle-même (ci-dessous) a besoin d'animer en douceur. */}
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={photoR} />
        </clipPath>
      </defs>
      {/* Halo de séparation dessiné à l'extérieur de l'anneau (jamais par-
          dessus), pour que la couleur du palier de performance enroule tout
          le tour de la photo sans être entamée par le liseré blanc. */}
      <circle cx={cx} cy={cy} r={r + 1.5} fill={CHART_NEUTRALS.halo} style={{ transition: DOT_TRANSITION }} />
      {/* Anneau de couleur du palier de performance, renforcé pour rester
          bien visible même sur les points estompés de l'historique. */}
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
          <circle cx={cx} cy={cy} r={photoR} fill="#2E8FCB" style={{ transition: DOT_TRANSITION }} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize={hovered ? 24 : 12}
            fontWeight={700}
            style={{ transition: "font-size 0.15s ease" }}
          >
            {p.name.charAt(0).toUpperCase()}
          </text>
        </>
      )}
      {/* Altitude affichée au-dessus de l'anneau — liseré clair "peint" sous
          le texte (paintOrder) pour rester lisible par-dessus la grille ou
          d'autres vignettes, sans avoir besoin d'un fond opaque séparé. */}
      <text
        x={cx}
        y={cy - r - 6}
        textAnchor="middle"
        fontSize={hovered ? 13 : 10}
        fontWeight={700}
        fill={color}
        stroke={CHART_NEUTRALS.halo}
        strokeWidth={3}
        paintOrder="stroke"
        style={{ transition: DOT_TRANSITION }}
      >
        {p.altitude}%
      </text>
    </g>
  );
}

/** Recule chaque extrémité d'un segment le long de sa direction, du rayon du
 * point qu'elle touche — sans ça, la pointe de la flèche (dessinée au centre
 * exact du point d'arrivée) se retrouve entièrement cachée sous le cercle
 * photo, plus grand, dessiné par-dessus. */
function shrinkLine(x1: number, y1: number, x2: number, y2: number, startR: number, endR: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    x1: x1 + ux * startR,
    y1: y1 + uy * startR,
    x2: x2 - ux * endR,
    y2: y2 - uy * endR,
  };
}

const DOT_RADIUS = { full: 19, dimmed: 15 };

/** Flèches reliant, pour chaque personne présente dans les deux périodes, sa
 * position de comparaison à sa position actuelle sur la matrice — rendu via
 * <Customized/> pour accéder aux échelles pixels réelles calculées par
 * Recharts (xAxisMap/yAxisMap), nécessaire puisque les deux jeux de points
 * sont deux <Scatter/> indépendants qui ne se "voient" pas entre eux. */
function MatrixConnectors({ xAxisMap, yAxisMap, currentPoints, comparePoints }: any) {
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis || !comparePoints?.length) return null;
  const compareByUser = new Map<number, Point>(comparePoints.map((p: Point) => [p.userId, p]));
  return (
    <g>
      <defs>
        <marker id="id3a-matrix-arrow" markerWidth="9" markerHeight="9" refX="6.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={CHART_NEUTRALS.connectorArrow} />
        </marker>
      </defs>
      {currentPoints.map((cp: Point) => {
        const prev = compareByUser.get(cp.userId);
        if (!prev) return null;
        // La flèche pointe toujours vers la période la plus récente des deux,
        // que ce soit "Période" ou "Comparer avec" qui soit postérieure.
        // prev vient toujours du Scatter estompé (rayon 15), cp du Scatter
        // plein (rayon 19), quel que soit l'ordre chronologique des deux.
        const prevIsOlder = prev.campaignStartDate <= cp.campaignStartDate;
        const older = prevIsOlder ? prev : cp;
        const newer = prevIsOlder ? cp : prev;
        const olderR = prevIsOlder ? DOT_RADIUS.dimmed : DOT_RADIUS.full;
        const newerR = prevIsOlder ? DOT_RADIUS.full : DOT_RADIUS.dimmed;
        if (xAxis.scale(older.x) === xAxis.scale(newer.x) && yAxis.scale(older.y) === yAxis.scale(newer.y)) return null;
        const { x1, y1, x2, y2 } = shrinkLine(
          xAxis.scale(older.x),
          yAxis.scale(older.y),
          xAxis.scale(newer.x),
          yAxis.scale(newer.y),
          olderR + 3,
          newerR + 3
        );
        return (
          <line
            key={cp.userId}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={CHART_NEUTRALS.connectorArrow}
            strokeWidth={1.75}
            strokeDasharray="6 4"
            strokeLinecap="round"
            markerEnd="url(#id3a-matrix-arrow)"
          />
        );
      })}
    </g>
  );
}

/** Chaîne de flèches reliant, année après année, toutes les positions d'une
 * même personne sur la matrice — utilisée quand un seul dirigeant/membre est
 * isolé via les filtres, pour visualiser sa trajectoire complète sur la
 * période choisie plutôt qu'un simple avant/après. */
function MatrixTrail({ xAxisMap, yAxisMap, trail }: any) {
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis || !trail || trail.length < 2) return null;
  return (
    <g>
      <defs>
        <marker id="id3a-trail-arrow" markerWidth="9" markerHeight="9" refX="6.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={CHART_NEUTRALS.connectorArrow} />
        </marker>
      </defs>
      {trail.slice(1).map((p: Point, i: number) => {
        const prev = trail[i];
        // prev est toujours un point estompé (rayon 15) ; p n'est plein
        // (rayon 19) que pour le dernier segment, qui rejoint la période la
        // plus récente rendue en pleine taille.
        const pR = i === trail.length - 2 ? DOT_RADIUS.full : DOT_RADIUS.dimmed;
        if (xAxis.scale(prev.x) === xAxis.scale(p.x) && yAxis.scale(prev.y) === yAxis.scale(p.y)) return null;
        const { x1, y1, x2, y2 } = shrinkLine(
          xAxis.scale(prev.x),
          yAxis.scale(prev.y),
          xAxis.scale(p.x),
          yAxis.scale(p.y),
          DOT_RADIUS.dimmed + 3,
          pR + 3
        );
        return (
          <line
            key={p.campaignName}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={CHART_NEUTRALS.connectorArrow}
            strokeWidth={1.75}
            strokeDasharray="6 4"
            strokeLinecap="round"
            markerEnd="url(#id3a-trail-arrow)"
          />
        );
      })}
    </g>
  );
}

/** Repères de zones en fond de matrice : une croix discrète au point milieu
 * (2,5 / 2,5) et un libellé par cadran, pour donner un sens de lecture
 * immédiat sans ajouter de couleur (les couleurs restent réservées aux
 * paliers de performance des vignettes, seul canal identitaire du graphe). */
/** Fond gris clair optionnel de la zone de tracé, dessiné avant les
 * quadrants/points (voir `matrixBackground`) — mêmes coordonnées d'échelle
 * que MatrixQuadrants pour rester pixel-parfait avec les axes. */
function MatrixBackground({ xAxisMap, yAxisMap, enabled }: any) {
  if (!enabled) return null;
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis) return null;
  const x0 = xAxis.scale(0);
  const x5 = xAxis.scale(5);
  const y0 = yAxis.scale(0);
  const y5 = yAxis.scale(5);
  return (
    <rect
      x={Math.min(x0, x5)}
      y={Math.min(y0, y5)}
      width={Math.abs(x5 - x0)}
      height={Math.abs(y0 - y5)}
      fill="#f3f2ee"
    />
  );
}

function MatrixQuadrants({ xAxisMap, yAxisMap }: any) {
  const { t } = useTranslation();
  const xAxis = xAxisMap?.[0];
  const yAxis = yAxisMap?.[0];
  if (!xAxis || !yAxis) return null;
  const x0 = xAxis.scale(0);
  const x5 = xAxis.scale(5);
  const xMid = xAxis.scale(2.5);
  const y0 = yAxis.scale(0);
  const y5 = yAxis.scale(5);
  const yMid = yAxis.scale(2.5);
  const labelStyle = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    fill: CHART_NEUTRALS.quadrantLabel,
  } as const;

  return (
    <g>
      <line x1={xMid} y1={y5} x2={xMid} y2={y0} stroke="#e1e0d9" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={x0} y1={yMid} x2={x5} y2={yMid} stroke="#e1e0d9" strokeWidth={1} strokeDasharray="3 3" />
      <text x={x0 + 8} y={y5 + 14} textAnchor="start" style={labelStyle}>
        {t("id3aMatrix.quadrantExperts").toUpperCase()}
      </text>
      <text x={x5 - 8} y={y5 + 14} textAnchor="end" style={labelStyle}>
        {t("id3aMatrix.quadrantTalents").toUpperCase()}
      </text>
      <text x={x0 + 8} y={y0 - 8} textAnchor="start" style={labelStyle}>
        {t("id3aMatrix.quadrantWatch").toUpperCase()}
      </text>
      <text x={x5 - 8} y={y0 - 8} textAnchor="end" style={labelStyle}>
        {t("id3aMatrix.quadrantRelational").toUpperCase()}
      </text>
    </g>
  );
}

const NONE_PERIOD = "__none__";

interface ObjectivePair {
  current: Point;
  prev: Point | null;
}

/** Mini-graphique Aptitudes × Attitudes pour une personne : position
 * précédente (gris) vs position objectif/actuelle (couleur du palier), avec
 * projections en pointillés sur les deux axes — reprend le style de la
 * fiche "ID-3A du Manager" du PDF ID-PMC. */
function ObjectiveMiniChart({ current, prev }: ObjectivePair) {
  const W = 200;
  const H = 140;
  const ML = 26;
  const MB = 18;
  const MT = 10;
  const MR = 10;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const sx = (v: number) => ML + (v / 5) * plotW;
  const sy = (v: number) => MT + plotH - (v / 5) * plotH;
  const color = performanceColors[current.rating];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={140}>
      {/* axes */}
      <line x1={ML} y1={MT} x2={ML} y2={MT + plotH} stroke={CHART_NEUTRALS.plotAxisLine} strokeWidth={1} />
      <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH} stroke={CHART_NEUTRALS.plotAxisLine} strokeWidth={1} />
      <text x={ML - 4} y={MT + 4} textAnchor="end" fontSize={8} fill="#898781">5</text>
      <text x={ML - 4} y={MT + plotH} textAnchor="end" fontSize={8} fill="#898781">0</text>
      <text x={ML} y={H - 2} textAnchor="start" fontSize={8} fill="#898781">0</text>
      <text x={ML + plotW} y={H - 2} textAnchor="end" fontSize={8} fill="#898781">5</text>

      {prev && (
        <g>
          <line x1={sx(prev.x)} y1={sy(prev.y)} x2={sx(prev.x)} y2={MT + plotH} stroke={CHART_NEUTRALS.trailMarker} strokeDasharray="2,2" />
          <line x1={ML} y1={sy(prev.y)} x2={sx(prev.x)} y2={sy(prev.y)} stroke={CHART_NEUTRALS.trailMarker} strokeDasharray="2,2" />
          <circle cx={sx(prev.x)} cy={sy(prev.y)} r={6} fill={CHART_NEUTRALS.trailMarker} stroke="#fff" strokeWidth={1.5} />
          <text x={sx(prev.x) + 8} y={sy(prev.y) + 3} fontSize={9} fill="#898781">
            {prev.altitude}%
          </text>
        </g>
      )}

      <g>
        <line x1={sx(current.x)} y1={sy(current.y)} x2={sx(current.x)} y2={MT + plotH} stroke={color} strokeDasharray="2,2" />
        <line x1={ML} y1={sy(current.y)} x2={sx(current.x)} y2={sy(current.y)} stroke={color} strokeDasharray="2,2" />
        {prev && (
          <line
            x1={sx(prev.x)}
            y1={sy(prev.y)}
            x2={sx(current.x)}
            y2={sy(current.y)}
            stroke={color}
            strokeWidth={1.25}
            markerEnd="url(#id3a-arrow)"
          />
        )}
        <circle cx={sx(current.x)} cy={sy(current.y)} r={7} fill={color} stroke="#fff" strokeWidth={1.5} />
        <text x={sx(current.x) + 9} y={sy(current.y) + 3} fontSize={9} fontWeight={700} fill={color}>
          {current.altitude}%
        </text>
      </g>

      <defs>
        <marker id="id3a-arrow" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={color} />
        </marker>
      </defs>
    </svg>
  );
}

function DeltaChip({ current, prev }: { current: number; prev: number | null }) {
  if (prev === null) return <Typography variant="caption" color="text.secondary">—</Typography>;
  const delta = Math.round((current - prev) * 10) / 10;
  if (delta > 0.05)
    return (
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: "success.main" }}>
        <TrendingUpOutlinedIcon fontSize="inherit" />
        <Typography variant="caption" fontWeight={700}>+{delta}</Typography>
      </Stack>
    );
  if (delta < -0.05)
    return (
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: "error.main" }}>
        <TrendingDownOutlinedIcon fontSize="inherit" />
        <Typography variant="caption" fontWeight={700}>{delta}</Typography>
      </Stack>
    );
  return (
    <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: "text.secondary" }}>
      <TrendingFlatOutlinedIcon fontSize="inherit" />
      <Typography variant="caption">0</Typography>
    </Stack>
  );
}

function ObjectiveCard({ pair }: { pair: ObjectivePair }) {
  const { t } = useTranslation();
  const { current, prev } = pair;
  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", width: 260 }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
        <Avatar src={current.avatar ?? undefined} sx={{ width: 36, height: 36, bgcolor: "primary.main", fontSize: 14 }}>
          {current.name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {current.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {current.position}
          </Typography>
        </Box>
      </Stack>

      <ObjectiveMiniChart current={current} prev={prev} />

      <Table size="small" sx={{ mt: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ p: 0.5 }} />
            <TableCell sx={{ p: 0.5 }} align="right">
              {prev?.campaignName ?? "—"}
            </TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">
              {current.campaignName}
            </TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">
              Δ
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell sx={{ p: 0.5 }}>HSI</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">{prev ? prev.hsi.toFixed(1) : "—"}</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">{current.hsi.toFixed(1)}</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">
              <DeltaChip current={current.hsi} prev={prev?.hsi ?? null} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ p: 0.5 }}>SSI</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">{prev ? prev.ssi.toFixed(1) : "—"}</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">{current.ssi.toFixed(1)}</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">
              <DeltaChip current={current.ssi} prev={prev?.ssi ?? null} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ p: 0.5 }}>{t("id3aMatrix.perfShort")}</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">{prev ? `${prev.altitude}%` : "—"}</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">{current.altitude}%</TableCell>
            <TableCell sx={{ p: 0.5 }} align="right">
              <DeltaChip current={Number(current.altitude)} prev={prev ? Number(prev.altitude) : null} />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  );
}

export default function ID3AMatrixPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const canFilterLeadership = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";
  const isManager = user?.role === "MANAGER";

  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | "">("");
  const [compareCampaignId, setCompareCampaignId] = useState<number | typeof NONE_PERIOD>(NONE_PERIOD);
  const [leadershipOnly, setLeadershipOnly] = useState(true);
  const [directorFilter, setDirectorFilter] = useState<number | "">("");
  const [memberFilter, setMemberFilter] = useState<number | "">("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"matrix" | "objectives">("matrix");
  const [matrixBackground, setMatrixBackground] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function loadEvaluations() {
    setLoading(true);
    setLoadError(false);
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => {
        setAllEvaluations(r.data.results);
        const sorted = [...r.data.results].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
        if (sorted.length) setSelectedCampaignId(sorted[sorted.length - 1].campaign);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(loadEvaluations, []);

  // Campagnes distinctes présentes dans les évaluations chargées, triées
  // chronologiquement (date de début) — remplace l'ancien tri par chaîne de
  // caractères sur un champ "période" en texte libre.
  const campaignOptions = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; start_date: string }>();
    allEvaluations.forEach((e) => {
      byId.set(e.campaign, { id: e.campaign, name: e.campaign_name, start_date: e.campaign_start_date });
    });
    return Array.from(byId.values()).sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [allEvaluations]);

  const directors = useMemo(() => {
    const byId = new Map<number, string>();
    allEvaluations.forEach((e) => {
      if (e.user_role !== "MEMBER") byId.set(e.user, e.user_name);
    });
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEvaluations]);

  const showDirectorFilter = canFilterLeadership && leadershipOnly;
  const showMemberFilter = isManager;

  const teamMembers = useMemo(() => {
    const byId = new Map<number, string>();
    allEvaluations.forEach((e) => byId.set(e.user, e.user_name));
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEvaluations]);

  const scopedEvaluations = useMemo(
    () =>
      allEvaluations.filter((e) => {
        if (canFilterLeadership && leadershipOnly && e.user_role === "MEMBER") return false;
        if (showDirectorFilter && directorFilter !== "" && e.user !== directorFilter) return false;
        if (showMemberFilter && memberFilter !== "" && e.user !== memberFilter) return false;
        return true;
      }),
    [allEvaluations, leadershipOnly, directorFilter, memberFilter, showDirectorFilter, showMemberFilter, canFilterLeadership]
  );

  function filterEvaluations(campaignId: number) {
    return scopedEvaluations.filter((e) => e.campaign === campaignId).map(toPoint);
  }

  const currentPoints = useMemo(
    () => (selectedCampaignId ? filterEvaluations(selectedCampaignId) : []),
    [scopedEvaluations, selectedCampaignId]
  );
  const comparePoints = useMemo(
    () => (compareCampaignId !== NONE_PERIOD ? filterEvaluations(compareCampaignId) : []),
    [scopedEvaluations, compareCampaignId]
  );

  // Quand un seul dirigeant/membre est isolé via les filtres et qu'une
  // période de comparaison est choisie, on affiche sa trajectoire complète
  // (une vignette par année couverte) plutôt qu'un simple avant/après.
  const singlePersonId =
    showDirectorFilter && directorFilter !== ""
      ? directorFilter
      : showMemberFilter && memberFilter !== ""
        ? memberFilter
        : null;

  const personTrail = useMemo(() => {
    if (!singlePersonId || compareCampaignId === NONE_PERIOD || !selectedCampaignId) return [];
    const selectedCampaign = campaignOptions.find((c) => c.id === selectedCampaignId);
    const compareCampaign = campaignOptions.find((c) => c.id === compareCampaignId);
    if (!selectedCampaign || !compareCampaign) return [];
    const [lo, hi] =
      compareCampaign.start_date <= selectedCampaign.start_date
        ? [compareCampaign.start_date, selectedCampaign.start_date]
        : [selectedCampaign.start_date, compareCampaign.start_date];
    return allEvaluations
      .filter((e) => e.user === singlePersonId && e.campaign_start_date >= lo && e.campaign_start_date <= hi)
      .sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date))
      .map(toPoint);
  }, [allEvaluations, singlePersonId, compareCampaignId, selectedCampaignId, campaignOptions]);

  // L'écartement anti-chevauchement ne s'applique qu'à la vue "période
  // simple, tout le monde" : dès qu'une comparaison ou une trajectoire est
  // affichée, les flèches doivent pointer vers la vraie position des points.
  const showsArrows = comparePoints.length > 0 || personTrail.length > 1;
  const declutteredCurrentPoints = useMemo(
    () => (showsArrows ? currentPoints : declutterPoints(currentPoints)),
    [currentPoints, showsArrows]
  );

  const objectivePairs = useMemo<ObjectivePair[]>(() => {
    if (viewMode !== "objectives" || !selectedCampaignId) return [];
    const byUser = new Map<number, Evaluation[]>();
    scopedEvaluations.forEach((e) => {
      if (!byUser.has(e.user)) byUser.set(e.user, []);
      byUser.get(e.user)!.push(e);
    });
    const pairs: ObjectivePair[] = [];
    byUser.forEach((evals) => {
      const sorted = [...evals].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
      const currentEval = sorted.find((e) => e.campaign === selectedCampaignId);
      if (!currentEval) return;
      let prevEval: Evaluation | undefined;
      if (compareCampaignId !== NONE_PERIOD) {
        prevEval = sorted.find((e) => e.campaign === compareCampaignId);
      } else {
        const idx = sorted.findIndex((e) => e.campaign === selectedCampaignId);
        prevEval = idx > 0 ? sorted[idx - 1] : undefined;
      }
      pairs.push({ current: toPoint(currentEval), prev: prevEval ? toPoint(prevEval) : null });
    });
    return pairs.sort((a, b) => a.current.name.localeCompare(b.current.name));
  }, [scopedEvaluations, viewMode, selectedCampaignId, compareCampaignId]);

  const selectedUserHistory = useMemo(() => {
    if (!selectedUserId) return [];
    return allEvaluations
      .filter((e) => e.user === selectedUserId)
      .sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
  }, [allEvaluations, selectedUserId]);

  const selectedUserInfo = selectedUserHistory[selectedUserHistory.length - 1];

  function handlePointClick(data: any) {
    const userId = data?.userId ?? data?.payload?.userId;
    if (userId) setSelectedUserId(userId);
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {t("id3aMatrix.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {viewMode === "matrix" ? t("id3aMatrix.subtitleMatrix") : t("id3aMatrix.subtitleObjectives")}
        </Typography>
      </Box>

      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={loadEvaluations}>
              {t("common.retry")}
            </Button>
          }
        >
          {t("id3aMatrix.loadError")}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        !loadError && (
      <>
      <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, v) => v && setViewMode(v)}
        >
          <ToggleButton value="matrix">{t("id3aMatrix.matrixTab")}</ToggleButton>
          <ToggleButton value="objectives">{t("id3aMatrix.objectivesTab")}</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          select
          label={viewMode === "matrix" ? t("common.period") : t("id3aMatrix.targetPeriod")}
          size="small"
          value={selectedCampaignId}
          onChange={(e) => setSelectedCampaignId(Number(e.target.value))}
          sx={{ minWidth: 160 }}
        >
          {campaignOptions.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label={t("id3aMatrix.compareWith")}
          size="small"
          value={compareCampaignId}
          onChange={(e) => setCompareCampaignId(e.target.value === NONE_PERIOD ? NONE_PERIOD : Number(e.target.value))}
          sx={{ minWidth: 200 }}
          helperText={viewMode === "objectives" && compareCampaignId === NONE_PERIOD ? t("id3aMatrix.autoPrevious") : " "}
        >
          <MenuItem value={NONE_PERIOD}>{t("id3aMatrix.none")}</MenuItem>
          {campaignOptions
            .filter((c) => c.id !== selectedCampaignId)
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
        </TextField>
        {canFilterLeadership && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={leadershipOnly ? "leadership" : "all"}
            onChange={(_, v) => {
              if (!v) return;
              setLeadershipOnly(v === "leadership");
              if (v !== "leadership") setDirectorFilter("");
            }}
          >
            <ToggleButton value="leadership">{t("id3aMatrix.leadershipOnly")}</ToggleButton>
            <ToggleButton value="all">{t("id3aMatrix.wholeCompany")}</ToggleButton>
          </ToggleButtonGroup>
        )}
        {showDirectorFilter && (
          <TextField
            select
            label={t("id3aMatrix.director")}
            size="small"
            value={directorFilter}
            onChange={(e) => setDirectorFilter(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">{t("id3aMatrix.allDirectors")}</MenuItem>
            {directors.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {showMemberFilter && (
          <TextField
            select
            label={t("id3aMatrix.teamMember")}
            size="small"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">{t("id3aMatrix.allTeamMembers")}</MenuItem>
            {teamMembers.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {viewMode === "matrix" && (
          <IconButton
            size="small"
            aria-label={t("id3aMatrix.toggleBackground")}
            aria-pressed={matrixBackground}
            onClick={() => setMatrixBackground((v) => !v)}
            sx={{
              border: "1px solid",
              borderColor: matrixBackground ? "primary.main" : "divider",
              color: matrixBackground ? "primary.main" : "text.secondary",
              borderRadius: 1,
            }}
          >
            <GridOnOutlinedIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {viewMode === "matrix" ? (
        currentPoints.length === 0 ? (
          <Paper elevation={0} sx={{ p: 4, border: "1px solid", borderColor: "divider", textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {t("id3aMatrix.noData")}
            </Typography>
          </Paper>
        ) : (
        <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
          <ResponsiveContainer width="100%" height={480}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
              <Customized component={<MatrixBackground enabled={matrixBackground} />} />
              <CartesianGrid horizontalValues={MINOR_AXIS_TICKS} verticalValues={MINOR_AXIS_TICKS} stroke="#e1e0d9" strokeDasharray="2 3" strokeOpacity={0.6} />
              <CartesianGrid stroke="#e1e0d9" />
              <XAxis
                type="number"
                dataKey="x"
                name="Attitudes (Soft Skills)"
                domain={[0, 5]}
                ticks={AXIS_TICKS}
                tick={{ fill: "#898781", fontSize: 12 }}
                label={{ value: "ATTITUDE (SOFT SKILLS)", position: "insideBottom", offset: -10, fill: CHART_NEUTRALS.axisTitle }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Aptitudes (Hard Skills)"
                domain={[0, 5]}
                ticks={AXIS_TICKS}
                tick={{ fill: "#898781", fontSize: 12 }}
                label={{ value: "APTITUDES (HARD SKILLS)", angle: -90, position: "insideLeft", fill: CHART_NEUTRALS.axisTitle }}
              />
              <ZAxis type="number" dataKey="z" range={[120, 120]} />
              <Customized component={<MatrixQuadrants />} />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              {personTrail.length > 1 ? (
                <>
                  <Customized component={<MatrixTrail trail={personTrail} />} />
                  <Scatter
                    data={personTrail.slice(0, -1)}
                    shape={<PhotoDot dimmed onSelect={handlePointClick} />}
                    isAnimationActive={false}
                    onClick={handlePointClick}
                  />
                  <Scatter
                    data={personTrail.slice(-1)}
                    shape={<PhotoDot onSelect={handlePointClick} />}
                    isAnimationActive={false}
                    onClick={handlePointClick}
                  />
                </>
              ) : (
                <>
                  {comparePoints.length > 0 && (
                    <Customized
                      component={<MatrixConnectors currentPoints={currentPoints} comparePoints={comparePoints} />}
                    />
                  )}
                  {comparePoints.length > 0 && (
                    <Scatter
                      data={comparePoints}
                      shape={<PhotoDot dimmed onSelect={handlePointClick} />}
                      isAnimationActive={false}
                      onClick={handlePointClick}
                    />
                  )}
                  <Scatter
                    data={comparePoints.length > 0 ? currentPoints : declutteredCurrentPoints}
                    shape={<PhotoDot onSelect={handlePointClick} />}
                    isAnimationActive={false}
                    onClick={handlePointClick}
                  />
                </>
              )}
            </ScatterChart>
          </ResponsiveContainer>

          <Stack direction="row" spacing={3} flexWrap="wrap" justifyContent="center" sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent="center">
              {(Object.keys(performanceColors) as PerformanceRating[]).map((rating) => (
                <Stack key={rating} direction="row" spacing={0.75} alignItems="center">
                  <Box
                    sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: performanceColors[rating] }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {t(`common.performance.${rating}`)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            {compareCampaignId !== NONE_PERIOD && (
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: CHART_NEUTRALS.trailMarker }} />
                <Typography variant="caption" color="text.secondary">
                  {personTrail.length > 1
                    ? t("id3aMatrix.trailPositions", { count: personTrail.length })
                    : t("id3aMatrix.comparisonPosition", {
                        period: campaignOptions.find((c) => c.id === compareCampaignId)?.name ?? "",
                      })}
                </Typography>
              </Stack>
            )}
          </Stack>
        </Paper>
        )
      ) : (
        <Stack direction="row" flexWrap="wrap" gap={2}>
          {objectivePairs.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t("id3aMatrix.noData")}
            </Typography>
          )}
          {objectivePairs.map((pair) => (
            <ObjectiveCard key={pair.current.userId} pair={pair} />
          ))}
        </Stack>
      )}

      {selectedUserInfo && (
        <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                src={selectedUserInfo.user_avatar ?? undefined}
                sx={{ width: 56, height: 56, bgcolor: "primary.main", fontSize: 22 }}
              >
                {selectedUserInfo.user_name.charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
                  {selectedUserInfo.user_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedUserInfo.user_position}
                  {selectedUserInfo.user_age ? ` · ${selectedUserInfo.user_age} ${t("common.years")}` : ""}
                  {selectedUserInfo.user_department ? ` · ${selectedUserInfo.user_department}` : ""}
                </Typography>
              </Box>
            </Stack>
            <IconButton size="small" aria-label={t("common.close")} onClick={() => setSelectedUserId(null)}>
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("id3aMatrix.progressionTitle")}
          </Typography>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={selectedUserHistory.map((e) => ({ period: e.campaign_name, altitude: Number(e.altitude_percentage) }))}>
              <CartesianGrid stroke="#e1e0d9" />
              <XAxis dataKey="period" tick={{ fill: "#898781", fontSize: 12 }} />
              <YAxis tick={{ fill: "#898781", fontSize: 12 }} domain={[0, "dataMax + 15"]} />
              <Tooltip formatter={(value: number) => [`${value}%`, t("dashboard.manager.altitude")]} />
              <Line
                type="monotone"
                dataKey="altitude"
                stroke="#2E8FCB"
                strokeWidth={2}
                dot={{ r: 5, fill: "#2E8FCB" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            {t("id3aMatrix.detailByPeriod")}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("common.period")}</TableCell>
                <TableCell align="right">HSI</TableCell>
                <TableCell align="right">SSI</TableCell>
                <TableCell align="right">{t("dashboard.manager.altitude")}</TableCell>
                <TableCell>{t("id3aMatrix.tier")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {selectedUserHistory.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.campaign_name}</TableCell>
                  <TableCell align="right">{Number(e.hsi).toFixed(2)}</TableCell>
                  <TableCell align="right">{Number(e.ssi).toFixed(2)}</TableCell>
                  <TableCell align="right">{e.altitude_percentage}%</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t(`common.performance.${e.performance_rating}`)}
                      sx={{
                        bgcolor: performanceColors[e.performance_rating],
                        color: "#fff",
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      </>
        )
      )}
    </Stack>
  );
}
