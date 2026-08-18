import {
  Alert,
  Box,
  Button,
  CircularProgress,
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
  ReferenceLine,
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
import type { Evaluation, Paginated } from "@/api/types";
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
}

/** Paliers de performance (abscisse) et de progression (ordonnée). */
const PERF_BANDS = [
  { key: "low", max: 74.999 },
  { key: "mid", max: 89.999 },
  { key: "high", max: Infinity },
] as const;

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
function TalentDot({ cx, cy, payload }: any) {
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
  // Près du bord droit, l'écart s'écrit à gauche du point : à droite il
  // sortirait du cadre.
  const labelLeft = p.x > 2.5;
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
      </defs>
      {/* Halo dessiné à l'extérieur de l'anneau, pour détacher la vignette de
          la grille sans entamer la couleur du palier. */}
      <circle cx={cx} cy={cy} r={r + 1.5} fill={CHART_NEUTRALS.halo} style={{ transition: DOT_TRANSITION }} />
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
    return result.sort((a, b) => b.performance - a.performance);
  }, [evaluations, campaigns, campaignId, departmentFilter]);

  const placed = points.filter((p) => p.progression !== null);
  const unrated = points.filter((p) => p.progression === null);

  const kpis = useMemo(() => {
    if (!placed.length) return null;
    const improving = placed.filter((p) => (p.progression ?? 0) > 0).length;
    const atRisk = placed.filter((p) => p.performance < 90 && (p.progression ?? 0) <= 0).length;
    const leaders = placed.filter((p) => p.performance >= 90 && (p.progression ?? 0) >= 6).length;
    return { improving, atRisk, leaders, total: placed.length };
  }, [placed]);

  const scatterData = placed.map((p) => ({ ...p, x: p.performance, y: p.progression as number, z: 200 }));
  const boxData = placed.map((p) => ({ ...p, x: xPos(p.performance), y: yPos(p.progression as number), z: 200 }));

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Typography variant="h5" fontWeight={700}>
          {t("talents.title")}
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="boxes">{t("talents.viewBoxes")}</ToggleButton>
          <ToggleButton value="trajectory">{t("talents.viewTrajectory")}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label={t("common.period")}
          value={campaignId}
          onChange={(e) => setCampaignId(Number(e.target.value))}
          sx={{ minWidth: 220 }}
        >
          {campaigns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
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
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">{t("talents.allDepartments")}</MenuItem>
            {departments.map((d) => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

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
          <ResponsiveContainer width="100%" height={460}>
            <ScatterChart margin={{ top: 20, right: 40, bottom: 30, left: 10 }}>
              <CartesianGrid stroke="#e1e0d9" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[50, 120]}
                ticks={[50, 60, 70, 80, 90, 100, 110, 120]}
                tick={{ fill: "#898781", fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
                label={{ value: t("talents.performanceAxisShort"), position: "insideBottom", offset: -14, fill: CHART_NEUTRALS.axisTitle }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[-20, 20]}
                ticks={[-20, -15, -10, -5, 0, 5, 10, 15, 20]}
                tick={{ fill: "#898781", fontSize: 11 }}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
                label={{ value: t("talents.progressionAxisShort"), angle: -90, position: "insideLeft", fill: CHART_NEUTRALS.axisTitle }}
              />
              <ZAxis type="number" dataKey="z" range={[140, 140]} />
              {/* Séparateurs du support ID-PMC : 90 % de performance et
                * progression nulle. */}
              <ReferenceLine x={90} stroke="#2E5AAC" strokeWidth={2} />
              <ReferenceLine y={0} stroke="#2E5AAC" strokeWidth={2} />
              <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} content={<TalentTooltip />} />
              <Scatter
                data={scatterData}
                shape={(props: any) => {
                  const { cx, cy, payload } = props;
                  const p: TalentPoint = payload;
                  const color = performanceColors[p.rating];
                  const clipId = `talent-clip-${p.userId}`;
                  return (
                    <g key={p.userId}>
                      <defs>
                        <clipPath id={clipId}>
                          <circle cx={cx} cy={cy} r={16} />
                        </clipPath>
                      </defs>
                      <circle cx={cx} cy={cy} r={19} fill={color} />
                      {p.avatar ? (
                        <image href={p.avatar} x={cx - 16} y={cy - 16} width={32} height={32} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
                      ) : (
                        <circle cx={cx} cy={cy} r={16} fill="#fff" />
                      )}
                      <text x={cx + 23} y={cy + 4} fontSize={11} fontWeight={700} fill={(p.progression as number) >= 0 ? "#2e7d32" : "#c62828"}>
                        {p.performance}% ({(p.progression as number) >= 0 ? "+" : ""}
                        {p.progression}%)
                      </text>
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </Paper>
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
