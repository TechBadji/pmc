import { Alert, Box, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { EvaluationCampaign, Paginated, PsiResults, PsiSummary } from "@/api/types";
import { dimensionReading, globalReading, PSI_DIMENSIONS, READING_COLORS } from "@/utils/psychologicalSafety";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

/** Tableau de bord PSI d'une direction (ou de toute l'entreprise pour le CEO) :
 * score par dimension, lecture, indice global et radar des 4 dimensions. */
export default function PsychologicalSafetyBoard({ teamId, orgView }: { teamId: number | ""; orgView: boolean }) {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [data, setData] = useState<PsiResults | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 } })
      .then((r) => {
        const sorted = [...r.data.results].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setCampaigns(sorted);
        setCampaignId((prev) => (prev === "" ? sorted[0]?.id ?? "" : prev));
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (campaignId === "") return;
    setError(false);
    apiClient
      .get<PsiResults>("/psychological-safety-responses/results/", {
        params: { campaign: campaignId, ...(orgView || teamId === "" ? {} : { team: teamId }) },
      })
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, [campaignId, teamId, orgView]);

  const summary: PsiSummary | undefined = orgView ? data?.company : data?.teams[0];

  const chart = summary?.published
    ? PSI_DIMENSIONS.map((k) => ({ dimension: t(`psi.dimension.${k}`), score: summary.dimensions?.find((d) => d.key === k)?.score ?? 0 }))
    : [];
  const sorted = summary?.dimensions ? [...summary.dimensions].sort((a, b) => b.score - a.score) : [];

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField select size="small" label={t("psi.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))} sx={{ minWidth: 260 }}>
          {campaigns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        {summary && (
          <Typography variant="body2" color="text.secondary">
            {t("psi.dash.respondents", { n: summary.respondents, total: summary.headcount })}
          </Typography>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {t("psi.objective")}
      </Typography>

      {error && <Alert severity="error">{t("psi.dash.loadFailed")}</Alert>}
      {summary && summary.respondents === 0 && <Alert severity="info">{t("psi.dash.noData")}</Alert>}
      {summary && summary.respondents > 0 && !summary.published && (
        <Alert severity="info">{t("psi.dash.notPublished", { min: summary.min_respondents, n: summary.respondents })}</Alert>
      )}

      {summary?.published && summary.dimensions && summary.global != null && (
        <>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
            <Paper variant="outlined" sx={{ flex: 1, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "primary.main" }}>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{t("psi.dash.title")}</TableCell>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">{t("psi.dash.score")}</TableCell>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{t("psi.dash.reading")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {PSI_DIMENSIONS.map((k) => {
                    const score = summary.dimensions!.find((d) => d.key === k)!.score;
                    const reading = dimensionReading(score);
                    return (
                      <TableRow key={k}>
                        <TableCell>{t(`psi.dimension.${k}`)}</TableCell>
                        <TableCell align="right">{fmt(score)}</TableCell>
                        <TableCell sx={{ color: READING_COLORS[reading], fontWeight: 700 }}>{t(`psi.readingDim.${reading}`)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ bgcolor: "action.hover" }}>
                    <TableCell sx={{ fontWeight: 800 }}>{t("psi.dash.global")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{fmt(summary.global)}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{t(`psi.readingGlobal.${globalReading(summary.global)}`)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>
            <Paper variant="outlined" sx={{ flex: 1, p: 1 }}>
              <Typography variant="subtitle2" fontWeight={800} align="center">
                {t("psi.dash.radar")}
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={chart} outerRadius="75%">
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fontWeight: 600 }} />
                  <PolarRadiusAxis domain={[0, 5]} tickCount={6} angle={90} />
                  <Radar dataKey="score" stroke="#2E8FCB" fill="#2E8FCB" fillOpacity={0.45} strokeWidth={2} />
                  <RechartsTooltip formatter={(v: number) => fmt(v)} />
                </RadarChart>
              </ResponsiveContainer>
            </Paper>
          </Stack>
          {sorted.length > 1 && (
            <Alert severity="info">
              {t("psi.dash.insight", {
                high: t(`psi.dimension.${sorted[0].key}`),
                highScore: fmt(sorted[0].score),
                low: t(`psi.dimension.${sorted[sorted.length - 1].key}`),
                lowScore: fmt(sorted[sorted.length - 1].score),
              })}
            </Alert>
          )}
          <Box sx={{ p: 2, border: "1px dashed", borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="subtitle2" fontWeight={800}>
              {t("psi.dash.debriefTitle")}
            </Typography>
            <Typography variant="body1" sx={{ fontStyle: "italic" }}>
              « {t("psi.dash.debrief")} »
            </Typography>
          </Box>
        </>
      )}
    </Stack>
  );
}
