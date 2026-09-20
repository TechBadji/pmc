import { Alert, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Evaluation, EvaluationCampaign, Paginated, SkillNote, SkillNoteCategory } from "@/api/types";

/** Forces et faiblesses d'un collaborateur : ses cinq meilleures et ses cinq
 * plus faibles compétences, hard puis soft, telles que relevées par son
 * évaluation sur la campagne choisie. Lecture seule. */
const COLUMNS: { key: SkillNoteCategory; group: "hard" | "soft"; strength: boolean }[] = [
  { key: "HARD_STRENGTH", group: "hard", strength: true },
  { key: "SOFT_STRENGTH", group: "soft", strength: true },
  { key: "HARD_WEAKNESS", group: "hard", strength: false },
  { key: "SOFT_WEAKNESS", group: "soft", strength: false },
];

export default function MyStrengthsPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [notes, setNotes] = useState<SkillNote[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 } }),
      apiClient.get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 200 } }),
    ])
      .then(([c, e]) => {
        const sorted = [...c.data.results].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setCampaigns(sorted);
        setEvaluations(e.data.results);
        // Campagne la plus récente qui a une évaluation, à défaut la plus récente.
        const evaluated = sorted.find((camp) => e.data.results.some((ev) => ev.campaign === camp.id));
        setCampaignId((evaluated ?? sorted[0])?.id ?? "");
      })
      .catch(() => setLoadError(true));
  }, []);

  const evaluation = useMemo(() => evaluations.find((e) => e.campaign === campaignId) ?? null, [evaluations, campaignId]);

  useEffect(() => {
    if (!evaluation) {
      setNotes([]);
      return;
    }
    apiClient
      .get<Paginated<SkillNote>>("/skill-notes/", { params: { evaluation: evaluation.id, page_size: 100 } })
      .then((r) => setNotes(r.data.results))
      .catch(() => setLoadError(true));
  }, [evaluation]);

  return (
    <Stack spacing={2.5} maxWidth={1100}>
      <Typography variant="h5" fontWeight={700}>
        {t("myStrengths.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("myStrengths.intro")}
      </Typography>
      {loadError && <Alert severity="error">{t("common.loadError")}</Alert>}
      <TextField
        select
        size="small"
        label={t("cohesion.campaign")}
        value={campaignId}
        onChange={(e) => setCampaignId(Number(e.target.value))}
        sx={{ width: 280 }}
      >
        {campaigns.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>

      {campaignId !== "" && !evaluation && !loadError && <Alert severity="info">{t("myStrengths.noEvaluation")}</Alert>}

      {evaluation && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          {[true, false].map((strength) => (
            <Paper key={String(strength)} variant="outlined" sx={{ flex: 1, overflow: "hidden" }}>
              <Typography
                sx={{ bgcolor: strength ? "#3F9142" : "#8B2E2E", color: "#fff", px: 2, py: 0.75 }}
                variant="subtitle2"
                fontWeight={800}
              >
                {t(strength ? "performanceId.keyStrengths" : "performanceId.areasOfImprovement")}
              </Typography>
              {COLUMNS.filter((c) => c.strength === strength).map((col) => (
                <Stack key={col.key} sx={{ p: 1.5 }} spacing={0.5}>
                  <Typography variant="caption" fontWeight={800} color={col.group === "hard" ? "#5A64A8" : "#2E8B5E"}>
                    {t(col.group === "hard" ? "managerDevPlan.hardSkills" : "managerDevPlan.softSkills")}
                  </Typography>
                  {notes
                    .filter((n) => n.category === col.key)
                    .sort((a, b) => a.order - b.order)
                    .map((n) => (
                      <Stack key={n.id} direction="row" justifyContent="space-between" spacing={2}>
                        <Typography variant="body2">
                          {n.order}. {n.text}
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {n.score != null ? Number(n.score).toFixed(1) : "—"}
                        </Typography>
                      </Stack>
                    ))}
                </Stack>
              ))}
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
