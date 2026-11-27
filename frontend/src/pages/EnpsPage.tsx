import { Alert, Box, Button, ButtonBase, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useUnsavedChanges } from "@/app/unsavedChanges";
import type { EvaluationCampaign, Paginated } from "@/api/types";
import { ENPS_COLORS, enpsCategory, type EnpsAnswer } from "@/utils/enps";

/** eNPS côté collaborateur : une note de 0 à 10 et un commentaire, une
 *  réponse par campagne, modifiable tant que la campagne est ouverte. */
export default function EnpsPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [answers, setAnswers] = useState<EnpsAnswer[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ score?: string; reason?: string }>({});

  useEffect(() => {
    Promise.all([
      apiClient.get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 } }),
      apiClient.get<Paginated<EnpsAnswer>>("/enps-responses/", { params: { page_size: 200 } }),
    ])
      .then(([c, a]) => {
        const sorted = [...c.data.results].sort((x, y) => y.start_date.localeCompare(x.start_date));
        setCampaigns(sorted);
        setAnswers(a.data.results);
        setCampaignId((sorted.find((x) => !x.is_closed) ?? sorted[0])?.id ?? "");
      })
      .catch(() => setError(t("enps.loadFailed")));
  }, [t]);

  const existing = useMemo(() => answers.find((a) => a.campaign === campaignId) ?? null, [answers, campaignId]);
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const readOnly = !!campaign?.is_closed;

  useEffect(() => {
    setScore(existing?.score ?? null);
    setReason(existing?.reason ?? "");
    setDirty(false);
    setSaved(false);
    setProblems({});
  }, [existing, campaignId]);

  async function handleSave() {
    setError(null);
    const next: typeof problems = {};
    if (score === null) next.score = t("enps.missingScore");
    if (reason.trim().length < 3) next.reason = t("enps.missingReason");
    setProblems(next);
    if (next.score || next.reason || campaignId === "") return;
    setSaving(true);
    try {
      const body = { campaign: campaignId, score, reason: reason.trim() };
      const r = existing
        ? await apiClient.put<EnpsAnswer>(`/enps-responses/${existing.id}/`, body)
        : await apiClient.post<EnpsAnswer>("/enps-responses/", body);
      setAnswers((prev) => [r.data, ...prev.filter((x) => x.id !== r.data.id)]);
      setSaved(true);
      setDirty(false);
    } catch (err: any) {
      const d = err?.response?.data;
      const detail = d && typeof d === "object" ? Object.values(d).flat().join(" ") : "";
      setError(detail || t("enps.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges(dirty, handleSave);

  return (
    <Stack spacing={2.5} maxWidth={980}>
      <Typography variant="h5" fontWeight={700}>
        {t("enps.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("enps.intro")}
      </Typography>

      {campaigns.length === 0 && !error ? (
        <Alert severity="info">{t("enps.noCampaign")}</Alert>
      ) : (
        <TextField
          select
          size="small"
          label={t("enps.campaign")}
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
      )}

      {readOnly && <Alert severity="info">{t("enps.closed")}</Alert>}

      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: "1px solid", borderColor: problems.score ? "error.main" : "divider" }}>
        <Typography fontWeight={700} sx={{ mb: 2 }}>
          1. {t("enps.q1")}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(11, minmax(0, 1fr))", gap: { xs: 0.5, md: 1 }, maxWidth: 720 }}>
          {Array.from({ length: 11 }, (_, n) => {
            const color = ENPS_COLORS[enpsCategory(n)];
            const selected = score === n;
            return (
              <ButtonBase
                key={n}
                disabled={readOnly}
                aria-pressed={selected}
                aria-label={`${n} / 10`}
                onClick={() => {
                  setScore(n);
                  setDirty(true);
                  setSaved(false);
                  setProblems((p) => ({ ...p, score: undefined }));
                }}
                sx={{
                  height: { xs: 40, md: 48 },
                  borderRadius: 1,
                  fontWeight: 800,
                  fontSize: { xs: 15, md: 18 },
                  border: `2px solid ${color}`,
                  bgcolor: selected ? color : "transparent",
                  color: selected ? "#fff" : color,
                  transform: selected ? "scale(1.08)" : "none",
                  transition: "transform 0.12s ease, background-color 0.12s ease",
                  "&:hover": { bgcolor: selected ? color : `${color}22` },
                }}
              >
                {n}
              </ButtonBase>
            );
          })}
        </Box>
        <Stack direction="row" justifyContent="space-between" sx={{ maxWidth: 720, mt: 0.75 }}>
          <Typography variant="caption" color="text.secondary">
            {t("enps.notLikely")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("enps.veryLikely")}
          </Typography>
        </Stack>
        {problems.score && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {problems.score}
          </Typography>
        )}
      </Paper>

      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: "1px solid", borderColor: problems.reason ? "error.main" : "divider" }}>
        <Typography fontWeight={700} sx={{ mb: 2 }}>
          2. {t("enps.q2")}
        </Typography>
        <TextField
          multiline
          minRows={4}
          fullWidth
          disabled={readOnly}
          value={reason}
          placeholder={t("enps.reasonPlaceholder")}
          inputProps={{ maxLength: 2000 }}
          error={!!problems.reason}
          helperText={problems.reason || `${reason.length} / 2000`}
          onChange={(e) => {
            setReason(e.target.value);
            setDirty(true);
            setSaved(false);
            if (e.target.value.trim().length >= 3) setProblems((p) => ({ ...p, reason: undefined }));
          }}
        />
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{t("enps.saved")}</Alert>}

      {!readOnly && campaignId !== "" && (
        <Box>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {existing ? t("enps.update") : t("enps.save")}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
