import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { EvaluationCampaign, Paginated } from "@/api/types";
import { ENPS_COLORS, enpsCategory, enpsReading, type EnpsCategory, type EnpsResults, type EnpsSummary } from "@/utils/enps";
import EnpsDirectionsChart from "./EnpsDirectionsChart";
import EnpsScaleLegend from "./EnpsScaleLegend";

const CATEGORIES: { key: EnpsCategory; label: string }[] = [
  { key: "promoter", label: "enps.promoters" },
  { key: "passive", label: "enps.passives" },
  { key: "detractor", label: "enps.detractors" },
];

function signed(v: number) {
  return `${v > 0 ? "+" : ""}${v}`;
}

/** Résultats eNPS pour le CEO et l'encadrement : à l'échelle de l'entreprise
 *  (avec le détail par direction) ou d'une direction. */
export default function EnpsBoard({ teamId, orgView }: { teamId: number | ""; orgView: boolean }) {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [data, setData] = useState<EnpsResults | null>(null);
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
    setData(null);
    apiClient
      .get<EnpsResults>("/enps-responses/results/", {
        params: { campaign: campaignId, ...(!orgView && teamId !== "" ? { team: teamId } : {}) },
      })
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, [campaignId, teamId, orgView]);

  // Sans équipe choisie, l'entreprise entière (et le détail par direction).
  const wholeCompany = orgView || teamId === "";
  const summary: EnpsSummary | undefined = wholeCompany
    ? data?.company ?? (data?.teams.length === 1 ? data.teams[0] : undefined)
    : data?.teams.find((x) => x.team === teamId);

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label={t("enps.campaign")}
          value={campaignId}
          onChange={(e) => setCampaignId(Number(e.target.value))}
          sx={{ minWidth: 240 }}
        >
          {campaigns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {error && <Alert severity="error">{t("enps.loadFailed")}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.4fr) minmax(0, 1fr)" }, gap: 2.5, alignItems: "start" }}>
        <Stack spacing={2.5}>
          {summary && <SummaryCard summary={summary} />}
        </Stack>
        <EnpsScaleLegend />
      </Box>
      {wholeCompany && data && data.teams.length > 1 && <EnpsDirectionsChart teams={data.teams} company={data.company} />}
      {summary?.published && <Comments summary={summary} />}
    </Stack>
  );
}

function SummaryCard({ summary }: { summary: EnpsSummary }) {
  const { t } = useTranslation();
  if (!summary.respondents) {
    return <Alert severity="info">{t("enps.noData")}</Alert>;
  }
  if (!summary.published || summary.enps === undefined || !summary.percentages || !summary.distribution) {
    return <Alert severity="info">{t("enps.notPublished", { n: summary.respondents, min: summary.min_respondents })}</Alert>;
  }
  const reading = enpsReading(summary.enps);
  const maxCount = Math.max(1, ...summary.distribution);
  return (
    <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: "1px solid", borderColor: "divider" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems={{ sm: "center" }}>
        <Box sx={{ textAlign: "center", minWidth: 160 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ textTransform: "none" }}>
            {t("enps.score")}
          </Typography>
          <Typography sx={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: reading.color }}>{signed(summary.enps)}</Typography>
          <Chip size="small" label={t(`enps.reading.${reading.key}`)} sx={{ mt: 1, bgcolor: alpha(reading.color, 0.15), color: reading.color, fontWeight: 700 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", height: 28, borderRadius: 1, overflow: "hidden" }}>
            {CATEGORIES.map((c) =>
              summary.percentages![c.key] > 0 ? (
                <Tooltip key={c.key} title={`${t(c.label)} : ${summary.counts![c.key]}`}>
                  <Box
                    sx={{
                      width: `${summary.percentages![c.key]}%`,
                      bgcolor: ENPS_COLORS[c.key],
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {summary.percentages![c.key] >= 8 ? `${Math.round(summary.percentages![c.key])} %` : ""}
                  </Box>
                </Tooltip>
              ) : null,
            )}
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {CATEGORIES.map((c) => (
              <Stack key={c.key} direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: ENPS_COLORS[c.key] }} />
                <Typography variant="body2">
                  {t(c.label)} <b>{summary.percentages![c.key].toLocaleString("fr-FR")} %</b> ({summary.counts![c.key]})
                </Typography>
              </Stack>
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("enps.respondents", { n: summary.respondents, headcount: summary.headcount })} ·{" "}
            {t("enps.average", { value: summary.average?.toLocaleString("fr-FR") })}
          </Typography>
        </Box>
      </Stack>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1 }}>
        {t("enps.distribution")}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(11, minmax(0, 1fr))", gap: 0.75, alignItems: "end", height: 140 }}>
        {summary.distribution.map((count, n) => (
          <Stack key={n} alignItems="center" justifyContent="flex-end" sx={{ height: "100%" }}>
            <Typography variant="caption" fontWeight={700}>
              {count || ""}
            </Typography>
            <Box
              sx={{
                width: "100%",
                height: `${(count / maxCount) * 100}px`,
                minHeight: count ? 4 : 0,
                bgcolor: ENPS_COLORS[enpsCategory(n)],
                borderRadius: "4px 4px 0 0",
              }}
            />
          </Stack>
        ))}
        {summary.distribution.map((_, n) => (
          <Typography key={`l-${n}`} variant="caption" textAlign="center" fontWeight={700} sx={{ color: ENPS_COLORS[enpsCategory(n)] }}>
            {n}
          </Typography>
        ))}
      </Box>
    </Paper>
  );
}

function Comments({ summary }: { summary: EnpsSummary }) {
  const { t } = useTranslation();
  const comments = summary.comments ?? [];
  return (
    <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle1" fontWeight={800}>
        {t("enps.comments")}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {t("enps.commentsHelp")}
      </Typography>
      <Stack spacing={2} sx={{ mt: 2 }}>
        {CATEGORIES.map((c) => {
          const list = comments.filter((x) => x.category === c.key);
          return (
            <Box key={c.key}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ color: ENPS_COLORS[c.key], mb: 0.75 }}>
                {t(c.label)} ({list.length})
              </Typography>
              {list.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("enps.noComment")}
                </Typography>
              ) : (
                <Stack spacing={0.75}>
                  {list.map((x, i) => (
                    <Stack key={i} direction="row" spacing={1.25} alignItems="flex-start">
                      <Box
                        sx={{
                          flexShrink: 0,
                          width: 28,
                          height: 24,
                          borderRadius: 1,
                          bgcolor: ENPS_COLORS[c.key],
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {x.score}
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {x.text}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}
