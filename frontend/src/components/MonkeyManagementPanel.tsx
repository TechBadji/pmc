import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import { cohesionColor } from "@/theme";
import type { EvaluationCampaign, MonkeyManagementAssessment, MonkeyManagementLevel, Paginated } from "@/api/types";

const TIERS = [1, 2, 3, 4, 5];
const ITEM_KEYS = Array.from({ length: 10 }, (_, i) => i + 1);

/** Pastille de note — même geste que le reste de l'application (couleur du
 *  barème, cercle plein quand sélectionné). */
function ScoreOval({
  selected,
  color,
  onClick,
  disabled,
  ariaLabel,
}: {
  selected: boolean;
  color: string;
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: "2px solid",
        borderColor: selected ? color : "divider",
        bgcolor: selected ? color : "background.paper",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        p: 0,
        "&:hover": disabled ? undefined : { borderColor: color },
      }}
    />
  );
}

function levelFor(total: number, answered: number): MonkeyManagementLevel | null {
  if (answered < 10) return null;
  if (total >= 41) return "EMPOWERING_LEADER";
  if (total >= 31) return "GOOD_DELEGATOR";
  if (total >= 21) return "MONKEY_RISK";
  return "MONKEY_MAGNET";
}

function emptyScores(): Record<number, number | null> {
  const state: Record<number, number | null> = {};
  ITEM_KEYS.forEach((order) => (state[order] = null));
  return state;
}

/**
 * Auto-diagnostic ID-PMC « Monkey Management » : une fiche fixe de 10
 * affirmations (barème Jamais..Toujours), un score total sur 50 lu par
 * palier d'interprétation, et cinq questions de débrief personnel à texte
 * libre — la partie plan d'action de la fiche papier, non notée.
 *
 * Panneau intégré à la page Évaluations (bandeau de vues), sur le même
 * modèle que `ManagerialSelfAssessmentPanel` : pas d'entête propre, un seul
 * enregistrement par (manager, campagne) plutôt que par fiche puisqu'il n'y
 * a ici qu'une seule fiche.
 */
export default function MonkeyManagementPanel() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const items = t("monkeyManagement.items", { returnObjects: true }) as string[];

  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [assessment, setAssessment] = useState<MonkeyManagementAssessment | null>(null);
  const [scores, setScores] = useState<Record<number, number | null>>(emptyScores());
  const [monkeys, setMonkeys] = useState<string[]>(["", "", ""]);
  const [whyAccepted, setWhyAccepted] = useState("");
  const [returnToWhom, setReturnToWhom] = useState("");
  const [behaviorToChange, setBehaviorToChange] = useState("");
  const [nextResponsibility, setNextResponsibility] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user?.company) return;
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", {
        params: { company: user.company, page_size: 500 },
      })
      .then((r) => {
        const list = r.data.results;
        setCampaigns(list);
        const open = list.filter((c) => !c.is_closed).sort((a, b) => b.start_date.localeCompare(a.start_date));
        const fallback = [...list].sort((a, b) => b.start_date.localeCompare(a.start_date));
        const pick = open[0] ?? fallback[0];
        if (pick) setCampaignId(pick.id);
      })
      .catch(() => setLoadError(true));
  }, [user?.company]);

  useEffect(() => {
    if (!campaignId) return;
    apiClient
      .get<Paginated<MonkeyManagementAssessment>>("/monkey-management-assessments/", {
        params: { campaign: campaignId, page_size: 1 },
      })
      .then((r) => {
        const existing = r.data.results[0] ?? null;
        setAssessment(existing);
        const state = emptyScores();
        (existing?.scores ?? []).forEach((s) => (state[s.order] = s.score));
        setScores(state);
        const m = existing?.monkeys ?? [];
        setMonkeys([m[0] ?? "", m[1] ?? "", m[2] ?? ""]);
        setWhyAccepted(existing?.why_accepted ?? "");
        setReturnToWhom(existing?.return_to_whom ?? "");
        setBehaviorToChange(existing?.behavior_to_change ?? "");
        setNextResponsibility(existing?.next_responsibility ?? "");
        setSaved(false);
      })
      .catch(() => setLoadError(true));
  }, [campaignId]);

  const activeCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const readOnly = !!activeCampaign?.is_closed;

  const { total, answered, level } = useMemo(() => {
    const values = Object.values(scores).filter((v): v is number => v !== null);
    const t = values.reduce((a, b) => a + b, 0);
    return { total: t, answered: values.length, level: levelFor(t, values.length) };
  }, [scores]);

  const levelColor = cohesionColor(total / 10 || 1);

  async function handleSave() {
    if (!campaignId) return;
    setSaving(true);
    setError(false);
    const payload = {
      campaign: campaignId,
      scores: ITEM_KEYS.map((order) => ({ order, score: scores[order] })),
      monkeys: monkeys.map((m) => m.trim()).filter(Boolean),
      why_accepted: whyAccepted,
      return_to_whom: returnToWhom,
      behavior_to_change: behaviorToChange,
      next_responsibility: nextResponsibility,
    };
    try {
      const r = assessment
        ? await apiClient.patch<MonkeyManagementAssessment>(`/monkey-management-assessments/${assessment.id}/`, payload)
        : await apiClient.post<MonkeyManagementAssessment>("/monkey-management-assessments/", payload);
      setAssessment(r.data);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <Alert severity="error">{t("monkeyManagement.saveFailed")}</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={3} alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" useFlexGap>
          <Box maxWidth={640}>
            <Typography variant="subtitle2" fontWeight={700}>
              {t("monkeyManagement.objectiveLabel")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("monkeyManagement.objectiveText")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {t("monkeyManagement.scaleHint")}
            </Typography>
          </Box>
          <TextField
            select
            size="small"
            label={t("monkeyManagement.campaignLabel")}
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 220 }}
          >
            {campaigns.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
                {c.is_closed ? ` (${t("monkeyManagement.closedCampaign")})` : ""}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      {campaigns.length === 0 && <Alert severity="info">{t("monkeyManagement.noCampaign")}</Alert>}

      {campaignId !== "" && (
        <>
          <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <TableContainer>
              <Table size="small" sx={{ "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: "50%", bgcolor: "#dde5ef", color: "#243747", fontWeight: 800, fontSize: 12 }}>
                      {t("monkeyManagement.statementCol")}
                    </TableCell>
                    {TIERS.map((tier) => (
                      <TableCell
                        key={tier}
                        align="center"
                        sx={{ bgcolor: cohesionColor(tier), color: "#fff", fontWeight: 700, fontSize: 11, lineHeight: 1.25, minWidth: 78 }}
                      >
                        {t(`monkeyManagement.scale.${tier}`).toUpperCase()}
                        <br />
                        {tier}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((statement, i) => {
                    const order = i + 1;
                    const value = scores[order] ?? null;
                    return (
                      <TableRow key={order}>
                        <TableCell>
                          <Typography variant="body2">
                            {order}. {statement}
                          </Typography>
                        </TableCell>
                        {TIERS.map((tier) => (
                          <TableCell key={tier} align="center">
                            <ScoreOval
                              selected={value === tier}
                              color={cohesionColor(tier)}
                              disabled={readOnly}
                              ariaLabel={`${statement} — ${tier}`}
                              onClick={() => {
                                setScores((current) => ({ ...current, [order]: tier }));
                                setSaved(false);
                              }}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t("monkeyManagement.progress", { answered, total: 10 })}
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Stack alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {t("monkeyManagement.totalLabel")}
                  </Typography>
                  <Box sx={{ minWidth: 76, px: 1.5, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, textAlign: "center" }}>
                    <Typography variant="h6" fontWeight={800} sx={{ color: answered ? levelColor : "text.disabled" }}>
                      {total} / 50
                    </Typography>
                  </Box>
                </Stack>
                {!readOnly && (
                  <Button variant="contained" onClick={handleSave} disabled={saving}>
                    {assessment ? t("monkeyManagement.update") : t("monkeyManagement.save")}
                  </Button>
                )}
              </Stack>
            </Stack>
            {error && <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{t("monkeyManagement.saveFailed")}</Alert>}
            {saved && <Alert severity="success" sx={{ mx: 2, mb: 2 }}>{t("monkeyManagement.saved")}</Alert>}
            {!level && <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, pb: 2 }}>{t("monkeyManagement.incomplete")}</Typography>}
          </Paper>

          {level && (
            <Paper elevation={0} sx={{ p: 2.5, border: "2px solid", borderColor: levelColor }}>
              <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                <Typography variant="h6" fontWeight={800} sx={{ color: levelColor }}>
                  {t(`monkeyManagement.levels.${level}.title`)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({t(`monkeyManagement.levels.${level}.range`)})
                </Typography>
              </Stack>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5 }}>
                {t(`monkeyManagement.levels.${level}.subtitle`)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t(`monkeyManagement.levels.${level}.description`)}
              </Typography>
            </Paper>
          )}

          <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
              {t("monkeyManagement.debrief.title")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              {t("monkeyManagement.debrief.hint")}
            </Typography>

            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
                  {t("monkeyManagement.debrief.monkeysLabel")}
                </Typography>
                <Stack spacing={1}>
                  {[0, 1, 2].map((i) => (
                    <TextField
                      key={i}
                      size="small"
                      fullWidth
                      placeholder={t("monkeyManagement.debrief.monkeyPlaceholder", { n: i + 1 })}
                      value={monkeys[i]}
                      disabled={readOnly}
                      onChange={(e) => {
                        setMonkeys((current) => {
                          const next = [...current];
                          next[i] = e.target.value;
                          return next;
                        });
                        setSaved(false);
                      }}
                      inputProps={{ maxLength: 255 }}
                    />
                  ))}
                </Stack>
              </Box>

              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label={t("monkeyManagement.debrief.whyAcceptedLabel")}
                value={whyAccepted}
                disabled={readOnly}
                onChange={(e) => {
                  setWhyAccepted(e.target.value);
                  setSaved(false);
                }}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label={t("monkeyManagement.debrief.returnToWhomLabel")}
                value={returnToWhom}
                disabled={readOnly}
                onChange={(e) => {
                  setReturnToWhom(e.target.value);
                  setSaved(false);
                }}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label={t("monkeyManagement.debrief.behaviorToChangeLabel")}
                value={behaviorToChange}
                disabled={readOnly}
                onChange={(e) => {
                  setBehaviorToChange(e.target.value);
                  setSaved(false);
                }}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label={t("monkeyManagement.debrief.nextResponsibilityLabel")}
                value={nextResponsibility}
                disabled={readOnly}
                onChange={(e) => {
                  setNextResponsibility(e.target.value);
                  setSaved(false);
                }}
              />
            </Stack>

            {!readOnly && (
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                <Button variant="contained" onClick={handleSave} disabled={saving}>
                  {assessment ? t("monkeyManagement.update") : t("monkeyManagement.save")}
                </Button>
              </Stack>
            )}
          </Paper>
        </>
      )}
    </Stack>
  );
}
