import { Avatar, Box, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Evaluation, Paginated, PerformanceRating, UserRecord } from "@/api/types";
import { EXECUTIVE_BADGE_COLOR, performanceColors } from "@/theme";

interface YearPoint {
  year: string;
  value: number;
  rating: PerformanceRating;
}

/** Étiquette de valeur au-dessus/en-dessous du point — au-dessus par défaut,
 * en-dessous quand le point est un minimum local, pour ne jamais recouper la
 * ligne (même logique visuelle que la capture de référence). */
function makeValueLabel(points: YearPoint[]) {
  return function ValueLabel({ x, y, index }: any) {
    if (index === undefined) return null;
    const point = points[index];
    if (!point) return null;
    const prev = points[index - 1];
    const next = points[index + 1];
    const isLocalMin = (prev === undefined || point.value < prev.value) && (next === undefined || point.value < next.value);
    const dy = isLocalMin ? 22 : -12;
    return (
      <text x={x} y={y + dy} textAnchor="middle" fontSize={13} fontWeight={700} fill="#3a3a3a">
        {point.value}%
      </text>
    );
  };
}

function DirectorPerformanceCard({ director, points }: { director: UserRecord; points: YearPoint[] }) {
  const { t } = useTranslation();
  const ValueLabel = useMemo(() => makeValueLabel(points), [points]);
  // Anneau coloré selon le palier de performance le plus récent affiché —
  // même code couleur que la Matrice ID-3A (rouge → vert), pas de sens
  // concurrent (voir DESIGN.md).
  const currentRating = points[points.length - 1]?.rating;
  const ringColor = currentRating ? performanceColors[currentRating] : "#c9c8c0";

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", position: "relative" }}>
      <Box sx={{ position: "absolute", top: 10, right: 14, zIndex: 1 }}>
        <Stack alignItems="center" spacing={0.4}>
          <Avatar
            src={director.avatar ?? undefined}
            sx={{
              width: 52,
              height: 52,
              border: "5px solid",
              borderColor: ringColor,
              boxShadow: `0 0 0 2px ${ringColor}33, 0 3px 10px ${ringColor}80`,
            }}
          >
            {(director.full_name || director.email).charAt(0).toUpperCase()}
          </Avatar>
          <Paper elevation={0} sx={{ px: 1, py: 0.15, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="caption" fontWeight={700} noWrap>
              {director.full_name || director.email}
            </Typography>
          </Paper>
        </Stack>
      </Box>

      {points.length === 0 ? (
        <Box sx={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("evaluations.notEvaluated")}
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 36, right: 16, left: 16, bottom: 5 }}>
            <CartesianGrid stroke="#e1e0d9" />
            <XAxis dataKey="year" tick={{ fill: "#898781", fontSize: 13 }} tickLine={false} />
            <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={EXECUTIVE_BADGE_COLOR}
              strokeWidth={2.5}
              dot={{ r: 4, fill: EXECUTIVE_BADGE_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
              label={<ValueLabel />}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ mt: 0.5 }}>
        <Box sx={{ width: 18, height: 2.5, bgcolor: EXECUTIVE_BADGE_COLOR, borderRadius: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {t("directorsReview.achievement")}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default function DirectorsPerformanceReviewPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  // La même revue à deux échelles : le CEO passe ses directeurs en revue, un
  // directeur ses collaborateurs. Filtrer sur le rôle Manager côté directeur
  // ne lui montrerait que lui-même.
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const [directors, setDirectors] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  useEffect(() => {
    apiClient
      .get<Paginated<UserRecord>>("/users/", {
        params: { page_size: 500, ...(isCompanyAdmin ? { role: "MANAGER" } : {}) },
      })
      .then((r) => setDirectors(r.data.results.filter((u) => isCompanyAdmin || u.id !== user?.id)));
    apiClient.get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } }).then((r) => setEvaluations(r.data.results));
  }, [isCompanyAdmin, user?.id]);

  const pointsByDirector = useMemo(() => {
    const map = new Map<number, YearPoint[]>();
    directors.forEach((d) => {
      const history = evaluations
        .filter((e) => e.user === d.id)
        .map((e) => ({
          year: e.campaign_start_date.slice(0, 4),
          value: Math.round(Number(e.altitude_percentage)),
          rating: e.performance_rating,
        }))
        .sort((a, b) => a.year.localeCompare(b.year));
      map.set(d.id, history);
    });
    return map;
  }, [directors, evaluations]);

  // Années réellement présentes dans les évaluations — alimente le
  // sélecteur de période (toute la plage, ou une fenêtre de 2 années
  // consécutives pour se concentrer sur une évolution récente).
  const availableYears = useMemo(
    () => Array.from(new Set(evaluations.map((e) => e.campaign_start_date.slice(0, 4)))).sort(),
    [evaluations]
  );

  const periodOptions = useMemo(() => {
    if (availableYears.length === 0) return [];
    const rangeLabel = (years: string[]) => (years[0] === years[years.length - 1] ? years[0] : `${years[0]}-${years[years.length - 1]}`);
    const opts: { id: string; label: string; years: string[] }[] = [
      { id: "all", label: t("directorsReview.allPeriods", { range: rangeLabel(availableYears) }), years: availableYears },
    ];
    for (let i = 0; i < availableYears.length - 1; i++) {
      const pair = [availableYears[i], availableYears[i + 1]];
      opts.push({ id: pair.join("-"), label: pair.join(" – "), years: pair });
    }
    return opts;
  }, [availableYears, t]);

  const [selectedPeriodId, setSelectedPeriodId] = useState("all");

  const selectedPeriod = periodOptions.find((p) => p.id === selectedPeriodId) ?? periodOptions[0];

  const filteredPointsByDirector = useMemo(() => {
    const map = new Map<number, YearPoint[]>();
    pointsByDirector.forEach((points, id) => {
      map.set(id, selectedPeriod ? points.filter((p) => selectedPeriod.years.includes(p.year)) : points);
    });
    return map;
  }, [pointsByDirector, selectedPeriod]);

  const titleRange =
    selectedPeriod && selectedPeriod.years.length
      ? selectedPeriod.years[0] === selectedPeriod.years[selectedPeriod.years.length - 1]
        ? selectedPeriod.years[0]
        : `${selectedPeriod.years[0]}-${selectedPeriod.years[selectedPeriod.years.length - 1]}`
      : "";

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={800} textAlign="center" sx={{ color: "primary.main" }}>
        {t(isCompanyAdmin ? "directorsReview.title" : "directorsReview.titleTeam", { range: titleRange }).toUpperCase()}
      </Typography>

      {periodOptions.length > 1 && (
        <Stack direction="row" justifyContent="center">
          <TextField
            select
            size="small"
            label={t("directorsReview.period")}
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            {periodOptions.map((opt) => (
              <MenuItem key={opt.id} value={opt.id}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}

      <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent="center">
        {(Object.keys(performanceColors) as PerformanceRating[]).map((rating) => (
          <Stack key={rating} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: performanceColors[rating] }} />
            <Typography variant="caption" color="text.secondary">
              {t(`common.performance.${rating}`)}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
          gap: 2,
        }}
      >
        {directors.map((d) => (
          <DirectorPerformanceCard key={d.id} director={d} points={filteredPointsByDirector.get(d.id) ?? []} />
        ))}
      </Box>
    </Stack>
  );
}
