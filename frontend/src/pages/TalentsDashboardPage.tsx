import {
  Alert,
  Avatar,
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

const PROGRESS_BANDS = [
  { key: "regression", max: 0 },
  { key: "moderate", max: 5.999 },
  { key: "strong", max: Infinity },
] as const;

function perfBand(value: number) {
  return PERF_BANDS.findIndex((b) => value <= b.max);
}

function progressBand(value: number) {
  return PROGRESS_BANDS.findIndex((b) => value <= b.max);
}

/** Teinte de fond d'une case : verte en haut à droite, rouge en bas à gauche —
 * repère de lecture immédiat, la 9 Box du support restant en blanc. */
function boxTint(col: number, row: number) {
  const score = col + row; // 0 (bas gauche) → 4 (haut droite)
  if (score >= 3) return "#e8f5e9";
  if (score === 2) return "#f6f8ec";
  if (score === 1) return "#fff6e5";
  return "#fdecea";
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

  function peopleIn(col: number, row: number) {
    return placed.filter((p) => perfBand(p.performance) === col && progressBand(p.progression as number) === row);
  }

  function PersonChip({ p }: { p: TalentPoint }) {
    const delta = p.progression as number;
    return (
      <Tooltip
        title={
          <Box sx={{ fontSize: 12 }}>
            <strong>{p.name}</strong>
            {p.position ? ` — ${p.position}` : ""}
            <br />
            {t("talents.performance")}: {p.performance}%
            <br />
            {t("talents.progression")}: {delta >= 0 ? "+" : ""}
            {delta}%
            {p.previousPerformance !== null && ` (${p.previousPerformance}% → ${p.performance}%)`}
          </Box>
        }
      >
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ maxWidth: "100%" }}>
          <Avatar
            src={p.avatar ?? undefined}
            sx={{ width: 28, height: 28, fontSize: 12, border: "2px solid", borderColor: performanceColors[p.rating] }}
          >
            {p.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.name}
            </Typography>
            <Typography sx={{ fontSize: 10, lineHeight: 1.1, color: delta >= 0 ? "success.main" : "error.main", fontWeight: 700 }}>
              {p.performance}% · {delta >= 0 ? "+" : ""}
              {delta}%
            </Typography>
          </Box>
        </Stack>
      </Tooltip>
    );
  }

  const scatterData = placed.map((p) => ({ ...p, x: p.performance, y: p.progression as number, z: 200 }));

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
          {/* Bande verticale "Taux de progression" + les 3 lignes de la 9 Box,
            * de la progression la plus forte (en haut) à la régression. */}
          <Box sx={{ display: "grid", gridTemplateColumns: "34px 150px repeat(3, 1fr)", gap: 1 }}>
            <Box
              sx={{
                gridRow: "1 / span 3",
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

            {[2, 1, 0].map((row) => (
              <Box key={row} sx={{ display: "contents" }}>
                <Box sx={{ display: "flex", alignItems: "center", px: 0.5 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#2E5AAC" }}>
                    {t(`talents.progressBand.${PROGRESS_BANDS[row].key}`)}
                  </Typography>
                </Box>
                {[0, 1, 2].map((col) => {
                  const people = peopleIn(col, row);
                  return (
                    <Paper
                      key={col}
                      elevation={0}
                      sx={{
                        p: 1,
                        minHeight: 150,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: boxTint(col, row),
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.75,
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontSize: 11.5, fontWeight: 800 }}>
                          {t(`talents.box.${col}${row}.title`)}
                        </Typography>
                        <Typography sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.25 }}>
                          {t(`talents.box.${col}${row}.advice`)}
                        </Typography>
                      </Box>
                      <Stack spacing={0.5} sx={{ mt: "auto" }}>
                        {people.map((p) => (
                          <PersonChip key={p.userId} p={p} />
                        ))}
                      </Stack>
                    </Paper>
                  );
                })}
              </Box>
            ))}

            {/* Intitulés des paliers de performance, sous les colonnes. */}
            <Box />
            <Box />
            {[0, 1, 2].map((col) => (
              <Typography key={col} sx={{ fontSize: 11, fontWeight: 700, color: "#2E5AAC", textAlign: "center", pt: 0.5 }}>
                {t(`talents.perfBand.${PERF_BANDS[col].key}`)}
              </Typography>
            ))}
            <Box />
            <Box />
            <Box sx={{ gridColumn: "3 / span 3", bgcolor: "#3F9142", color: "#fff", borderRadius: 1, textAlign: "center", py: 0.5 }}>
              <Typography variant="caption" fontWeight={700} sx={{ letterSpacing: 1 }}>
                {t("talents.performanceAxis")}
              </Typography>
            </Box>
          </Box>
        </Paper>
      ) : (
        <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
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
              <RechartsTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }: any) => {
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
                        {p.performance}% · {delta >= 0 ? "+" : ""}
                        {delta}%
                      </Typography>
                    </Paper>
                  );
                }}
              />
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
