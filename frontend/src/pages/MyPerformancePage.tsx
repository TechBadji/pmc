import { Chip, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Evaluation, Paginated } from "@/api/types";
import StatCard from "@/components/StatCard";
import { performanceColors } from "@/theme";

export default function MyPerformancePage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  useEffect(() => {
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 1 } })
      .then((r) => setEvaluation(r.data.results[0] ?? null));
  }, []);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700} className="pmc-no-print">
        {t("myPerformance.greeting", { name: user?.full_name || user?.email })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {user?.position} — {user?.department_name ?? t("myPerformance.noDepartment")}
      </Typography>

      {evaluation ? (
        <>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <StatCard label={t("myPerformance.aptitudes")} value={evaluation.hsi} />
            <StatCard label={t("myPerformance.attitudes")} value={evaluation.ssi} />
            <StatCard
              label={t("myPerformance.altitude")}
              value={`${evaluation.altitude_percentage}%`}
              color={performanceColors[evaluation.performance_rating]}
            />
          </Stack>
          <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider" }}>
            <Stack spacing={1.5}>
              <Chip
                label={t(`common.performance.${evaluation.performance_rating}`)}
                sx={{
                  alignSelf: "flex-start",
                  bgcolor: performanceColors[evaluation.performance_rating] + "22",
                  color: performanceColors[evaluation.performance_rating],
                  fontWeight: 600,
                }}
              />
              <Typography variant="body2">
                {t("myPerformance.summary", {
                  business: evaluation.business_objectives_score,
                  people: evaluation.people_objectives_score,
                  period: evaluation.campaign_name,
                })}
              </Typography>
            </Stack>
          </Paper>
        </>
      ) : (
        <Typography color="text.secondary">{t("myPerformance.noEvaluation")}</Typography>
      )}
    </Stack>
  );
}
