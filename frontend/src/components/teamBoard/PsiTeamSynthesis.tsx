import { Box, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { apiClient } from "@/api/client";
import type { EvaluationCampaign, Paginated, PsiResults, PsiSummary } from "@/api/types";
import {
  dimensionReading,
  fmtPsi,
  globalReading,
  GLOBAL_READING_COLORS,
  PSI_DIMENSIONS,
  READING_COLORS,
} from "@/utils/psychologicalSafety";
import { BOARD_TEXT } from "./BoardPieces";

type Point = { campaign: EvaluationCampaign; summary: PsiSummary };

/**
 * Synthèse Psychological Safety d'une équipe, pour la planche Team Performance
 * ID : le PSI global de la dernière campagne publiée et sa lecture, les quatre
 * dimensions, puis l'évolution d'une campagne à l'autre. Mêmes moyennes et
 * même seuil d'anonymat que l'écran Psychological Safety : une campagne sous
 * le seuil de répondants reste masquée.
 */
export default function PsiTeamSynthesis({ teamId }: { teamId: number }) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<Point[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setFailed(false);
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 }, silent: true })
      .then(async (r) => {
        const campaigns = [...r.data.results].sort((a, b) => a.start_date.localeCompare(b.start_date));
        const results = await Promise.all(
          campaigns.map((campaign) =>
            apiClient
              .get<PsiResults>("/psychological-safety-responses/results/", {
                params: { campaign: campaign.id, team: teamId },
                silent: true,
              })
              .then((res): Point | null => (res.data.teams[0] ? { campaign, summary: res.data.teams[0] } : null))
          )
        );
        if (!cancelled) setPoints(results.filter((p): p is Point => p !== null && p.summary.respondents > 0));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (failed) {
    return (
      <Typography variant="caption" color="text.secondary">
        {t("psi.board.loadFailed")}
      </Typography>
    );
  }
  if (points === null) return null;
  if (points.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        {t("psi.board.noData")}
      </Typography>
    );
  }

  const latest = points[points.length - 1];
  const published = points.filter((p) => p.summary.published && p.summary.global != null);
  const shown = latest.summary.published ? latest : published[published.length - 1];
  const history = published.map((p) => ({
    name: p.campaign.name,
    global: p.summary.global as number,
    color: GLOBAL_READING_COLORS[globalReading(p.summary.global as number)],
  }));

  return (
    <Stack spacing={1}>
      {!latest.summary.published && (
        <Typography variant="caption" color="text.secondary">
          {latest.campaign.name} —{" "}
          {t("psi.board.notPublished", { n: latest.summary.respondents, min: latest.summary.min_respondents })}
        </Typography>
      )}
      {shown && shown.summary.global != null && shown.summary.dimensions && (
        <Stack direction="row" spacing={1.5} alignItems="stretch">
          {/* PSI global et sa lecture */}
          <Box sx={{ flex: "0 0 128px", textAlign: "center", alignSelf: "center" }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: BOARD_TEXT, letterSpacing: 0.4 }}>
              {t("psi.board.latest", { campaign: shown.campaign.name }).toUpperCase()}
            </Typography>
            <Typography
              sx={{
                fontSize: 30,
                fontWeight: 800,
                lineHeight: 1.15,
                color: GLOBAL_READING_COLORS[globalReading(shown.summary.global)],
              }}
            >
              {fmtPsi(shown.summary.global)}
              <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}>
                {" "}
                /5
              </Typography>
            </Typography>
            <Typography
              sx={{ fontSize: 11, fontWeight: 700, color: GLOBAL_READING_COLORS[globalReading(shown.summary.global)] }}
            >
              {t(`psi.readingGlobal.${globalReading(shown.summary.global)}`)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("psi.board.respondents", { n: shown.summary.respondents, total: shown.summary.headcount })}
            </Typography>
          </Box>

          {/* Les quatre dimensions, en barres sur 5 */}
          <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
            {PSI_DIMENSIONS.map((key) => {
              const score = shown.summary.dimensions!.find((d) => d.key === key)?.score ?? 0;
              const color = READING_COLORS[dimensionReading(score)];
              return (
                <Box key={key}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: BOARD_TEXT }} noWrap>
                      {t(`psi.dimension.${key}`)}
                    </Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color }}>{fmtPsi(score)}</Typography>
                  </Stack>
                  <Box sx={{ height: 7, borderRadius: 4, bgcolor: "#ecebe6", overflow: "hidden" }}>
                    <Box sx={{ width: `${(score / 5) * 100}%`, height: "100%", bgcolor: color, borderRadius: 4 }} />
                  </Box>
                </Box>
              );
            })}
          </Stack>

          {/* Évolution du PSI global, une barre par campagne publiée */}
          {history.length > 1 && (
            <Box sx={{ flex: "0 0 38%", minWidth: 0 }}>
              <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: BOARD_TEXT, textAlign: "center" }}>
                {t("psi.board.evolution").toUpperCase()}
              </Typography>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={history} margin={{ top: 16, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "#6b6b66" }} tickLine={false} interval={0} />
                  <YAxis hide domain={[0, 5]} />
                  <Bar dataKey="global" radius={[2, 2, 0, 0]}>
                    {history.map((h, i) => (
                      <Cell key={i} fill={h.color} />
                    ))}
                    <LabelList
                      dataKey="global"
                      position="top"
                      formatter={(v: number) => fmtPsi(v)}
                      style={{ fontSize: 10.5, fontWeight: 700, fill: BOARD_TEXT }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}
