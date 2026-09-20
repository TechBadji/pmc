import { Alert, Box, Button, FormControlLabel, MenuItem, Paper, Radio, RadioGroup, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import { useUnsavedChanges } from "@/app/unsavedChanges";
import type { EvaluationCampaign, Paginated, PsiResponse } from "@/api/types";
import { PSI_DIMENSIONS } from "@/utils/psychologicalSafety";

/** Questionnaire PSI d'un collaborateur : 12 affirmations sur sa propre équipe,
 * notées de 1 à 5, une réponse par campagne. Anonyme : seule la moyenne de
 * l'équipe est lue par l'encadrement. */
export default function PsychologicalSafetyPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [responses, setResponses] = useState<PsiResponse[]>([]);
  const [scores, setScores] = useState<(number | null)[]>(Array(12).fill(null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 } }),
      apiClient.get<Paginated<PsiResponse>>("/psychological-safety-responses/", { params: { page_size: 200 } }),
    ])
      .then(([c, r]) => {
        const sorted = [...c.data.results].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setCampaigns(sorted);
        setResponses(r.data.results);
        const open = sorted.find((x) => !x.is_closed) ?? sorted[0];
        setCampaignId(open?.id ?? "");
      })
      .catch(() => setError(t("psi.loadFailed")));
  }, [t]);

  const existing = useMemo(() => responses.find((r) => r.campaign === campaignId) ?? null, [responses, campaignId]);
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const readOnly = !!campaign?.is_closed;

  useEffect(() => {
    setScores(existing ? [...existing.scores] : Array(12).fill(null));
    setDirty(false);
    setSaved(false);
    setShowMissing(false);
  }, [existing, campaignId]);

  const missing = scores.filter((s) => s === null).length;

  async function handleSave() {
    setError(null);
    if (campaignId === "") return;
    if (missing > 0) {
      setShowMissing(true);
      return;
    }
    setSaving(true);
    try {
      const body = { campaign: campaignId, scores };
      const r = existing
        ? await apiClient.put<PsiResponse>(`/psychological-safety-responses/${existing.id}/`, body)
        : await apiClient.post<PsiResponse>("/psychological-safety-responses/", body);
      setResponses((prev) => [r.data, ...prev.filter((x) => x.id !== r.data.id)]);
      setSaved(true);
      setDirty(false);
    } catch (err: any) {
      const d = err?.response?.data;
      const detail = d && typeof d === "object" ? Object.values(d).flat().join(" ") : "";
      setError(detail || t("psi.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges(dirty, handleSave);

  if (!user?.department) return <Alert severity="info">{t("psi.noDepartment")}</Alert>;

  return (
    <Stack spacing={2.5} maxWidth={980}>
      <Typography variant="h5" fontWeight={700}>
        {t("psi.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("psi.objective")}
      </Typography>
      <Typography variant="body2" sx={{ fontStyle: "italic" }}>
        « {t("psi.quote")} »
      </Typography>

      <TextField
        select
        size="small"
        label={t("psi.campaign")}
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

      <Typography fontWeight={700}>{t("psi.question")}</Typography>
      <Typography variant="caption" color="text.secondary">
        {t("psi.scale")}
      </Typography>
      {readOnly && <Alert severity="info">{t("psi.closed")}</Alert>}

      {PSI_DIMENSIONS.map((dim, d) => (
        <Paper key={dim} variant="outlined" sx={{ overflow: "hidden" }}>
          <Box sx={{ bgcolor: "primary.main", color: "#fff", px: 2, py: 1 }}>
            <Typography fontWeight={800}>
              {d + 1}). {t(`psi.dimension.${dim}`).toUpperCase()} — {t(`psi.dimensionTitle.${dim}`)}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              « {t(`psi.dimensionQuestion.${dim}`)} »
            </Typography>
          </Box>
          <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
            {[0, 1, 2].map((k) => {
              const i = d * 3 + k;
              const unanswered = showMissing && scores[i] === null;
              return (
                <Stack
                  key={i}
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  alignItems={{ md: "center" }}
                  justifyContent="space-between"
                  sx={{ px: 2, py: 1, bgcolor: unanswered ? "rgba(178,63,63,0.08)" : undefined }}
                >
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    <strong>{i + 1}.</strong> {t(`psi.statements.${i}`)}
                  </Typography>
                  <RadioGroup
                    row
                    value={scores[i] ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setScores((prev) => prev.map((x, j) => (j === i ? v : x)));
                      setDirty(true);
                      setSaved(false);
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((v) => (
                      <FormControlLabel key={v} value={v} disabled={readOnly} control={<Radio size="small" />} label={v} labelPlacement="bottom" sx={{ mx: 0.25 }} />
                    ))}
                  </RadioGroup>
                </Stack>
              );
            })}
          </Stack>
        </Paper>
      ))}

      {showMissing && missing > 0 && <Alert severity="warning">{t("psi.incomplete", { count: missing })}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{t("psi.saved")}</Alert>}
      {!readOnly && (
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="contained" onClick={handleSave} disabled={saving || (!dirty && !!existing)}>
            {existing ? t("psi.update") : t("psi.save")}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
