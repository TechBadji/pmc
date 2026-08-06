import { Avatar, Box, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { apiClient } from "@/api/client";
import type { Evaluation, Paginated, UserRecord } from "@/api/types";
import { EXECUTIVE_BADGE_COLOR } from "@/theme";

interface YearPoint {
  year: string;
  value: number;
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

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider", position: "relative" }}>
      <Box sx={{ position: "absolute", top: 10, right: 14, zIndex: 1 }}>
        <Stack alignItems="center" spacing={0.4}>
          <Avatar
            src={director.avatar ?? undefined}
            sx={{ width: 46, height: 46, border: "2px solid", borderColor: "background.paper", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
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
  const [directors, setDirectors] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  useEffect(() => {
    apiClient.get<Paginated<UserRecord>>("/users/", { params: { role: "MANAGER", page_size: 500 } }).then((r) => setDirectors(r.data.results));
    apiClient.get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } }).then((r) => setEvaluations(r.data.results));
  }, []);

  const pointsByDirector = useMemo(() => {
    const map = new Map<number, YearPoint[]>();
    directors.forEach((d) => {
      const history = evaluations
        .filter((e) => e.user === d.id)
        .map((e) => ({ year: e.campaign_start_date.slice(0, 4), value: Math.round(Number(e.altitude_percentage)) }))
        .sort((a, b) => a.year.localeCompare(b.year));
      map.set(d.id, history);
    });
    return map;
  }, [directors, evaluations]);

  const yearRange = useMemo(() => {
    const years = evaluations.map((e) => e.campaign_start_date.slice(0, 4)).sort();
    if (!years.length) return "";
    return years[0] === years[years.length - 1] ? years[0] : `${years[0]}-${years[years.length - 1]}`;
  }, [evaluations]);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={800} textAlign="center" sx={{ color: "primary.main" }}>
        {t("directorsReview.title", { range: yearRange }).toUpperCase()}
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
          gap: 2,
        }}
      >
        {directors.map((d) => (
          <DirectorPerformanceCard key={d.id} director={d} points={pointsByDirector.get(d.id) ?? []} />
        ))}
      </Box>
    </Stack>
  );
}
