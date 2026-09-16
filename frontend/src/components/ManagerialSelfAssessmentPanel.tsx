import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
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
import { DecimalField } from "@/components/inputs/DecimalField";
import { cohesionColor } from "@/theme";
import type { EvaluationCampaign, ManagerialSelfAssessment, Paginated } from "@/api/types";
import { useManagerialAssessmentCategories } from "@/utils/managerialSelfAssessment";

const TIERS = [1, 2, 3, 4, 5];

/** Pastille de note — même geste que la fiche de cohésion (couleur du barème,
 *  cercle plein quand sélectionné) : un même code visuel pour toute note 1-5
 *  dans l'application. */
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

type RowState = { score: number | null; objective_score: number | null };
type CategoryState = Record<number, RowState>;

function emptyState(): CategoryState {
  const state: CategoryState = {};
  for (let order = 1; order <= 10; order += 1) state[order] = { score: null, objective_score: null };
  return state;
}

/**
 * Auto-évaluation managériale : cinq fiches fixes (Communication, Écoute,
 * Motivation des équipes, Délégation, Gestion du temps et des priorités),
 * chacune notée par le manager sur lui-même pour la campagne sélectionnée —
 * une ligne `ManagerialSelfAssessment` par (campagne, fiche).
 *
 * Panneau intégré à la page Évaluations (bandeau de vues ID-3A / Objectifs
 * individuels / Objectifs équipe / Auto-évaluation managériale), sur le
 * modèle d'`ObjectivesSheetPanel` : pas d'entête propre, la page hôte porte
 * déjà le titre et le sous-titre pour la vue active.
 *
 * Le chargement se fait par campagne (toutes les fiches d'un coup) plutôt
 * que fiche par fiche : changer d'onglet ne redemande rien au serveur, un
 * changement de campagne recharge les cinq d'un coup.
 */
export default function ManagerialSelfAssessmentPanel() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const categories = useManagerialAssessmentCategories();

  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [assessments, setAssessments] = useState<Record<string, ManagerialSelfAssessment>>({});
  const [tab, setTab] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, CategoryState>>({});
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
        // Campagne ouverte la plus récente par défaut — à défaut, la plus
        // récente tout court, pour qu'une entreprise sans campagne ouverte
        // puisse quand même consulter son historique.
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
      .get<Paginated<ManagerialSelfAssessment>>("/managerial-self-assessments/", {
        params: { campaign: campaignId, page_size: 20 },
      })
      .then((r) => {
        const byCategory: Record<string, ManagerialSelfAssessment> = {};
        const nextDrafts: Record<string, CategoryState> = {};
        r.data.results.forEach((a) => {
          byCategory[a.category] = a;
          const state = emptyState();
          a.scores.forEach((s) => {
            state[s.order] = { score: s.score, objective_score: s.objective_score };
          });
          nextDrafts[a.category] = state;
        });
        setAssessments(byCategory);
        setDrafts(nextDrafts);
        setSaved(false);
      })
      .catch(() => setLoadError(true));
  }, [campaignId]);

  const activeCategory = categories[tab];
  const activeCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const readOnly = !!activeCampaign?.is_closed;
  const draft = drafts[activeCategory?.key ?? ""] ?? emptyState();

  const { ic, oc } = useMemo(() => {
    const scores = Object.values(draft).map((r) => r.score).filter((v): v is number => v !== null);
    const objectives = Object.values(draft).map((r) => r.objective_score).filter((v): v is number => v !== null);
    return {
      ic: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      oc: objectives.length ? objectives.reduce((a, b) => a + b, 0) / objectives.length : null,
    };
  }, [draft]);

  function updateRow(order: number, patch: Partial<RowState>) {
    if (!activeCategory) return;
    setDrafts((current) => ({
      ...current,
      [activeCategory.key]: {
        ...(current[activeCategory.key] ?? emptyState()),
        [order]: { ...(current[activeCategory.key]?.[order] ?? { score: null, objective_score: null }), ...patch },
      },
    }));
    setSaved(false);
  }

  async function handleSave() {
    if (!activeCategory || !campaignId) return;
    setSaving(true);
    setError(false);
    const scores = Object.entries(draft)
      .map(([order, row]) => ({ order: Number(order), score: row.score, objective_score: row.objective_score }))
      .filter((entry) => entry.score !== null || entry.objective_score !== null);
    const payload = { campaign: campaignId, category: activeCategory.key, scores };
    const existing = assessments[activeCategory.key];
    try {
      const r = existing
        ? await apiClient.patch<ManagerialSelfAssessment>(`/managerial-self-assessments/${existing.id}/`, payload)
        : await apiClient.post<ManagerialSelfAssessment>("/managerial-self-assessments/", payload);
      setAssessments((current) => ({ ...current, [activeCategory.key]: r.data }));
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <Alert severity="error">{t("managerialSelfAssessment.saveFailed")}</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t("managerialSelfAssessment.nomManager")}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {user?.full_name}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t("managerialSelfAssessment.position")}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {user?.position || "—"}
              </Typography>
            </Box>
          </Stack>
          <TextField
            select
            size="small"
            label={t("managerialSelfAssessment.campaignLabel")}
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 220 }}
          >
            {campaigns.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
                {c.is_closed ? ` (${t("managerialSelfAssessment.closedCampaign")})` : ""}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      {campaigns.length === 0 && <Alert severity="info">{t("managerialSelfAssessment.noCampaign")}</Alert>}

      {campaignId !== "" && (
        <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: "1px solid", borderColor: "divider", px: 1 }}
          >
            {categories.map((c) => (
              <Tab key={c.key} label={c.label} />
            ))}
          </Tabs>

          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent="flex-end"
            flexWrap="wrap"
            useFlexGap
            sx={{ p: 2 }}
          >
            <Stack alignItems="center">
              <Typography variant="caption" color="text.secondary">
                {t("managerialSelfAssessment.icLabel")}
              </Typography>
              <Box sx={{ minWidth: 64, px: 1.5, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, textAlign: "center" }}>
                <Typography variant="h6" fontWeight={800} sx={{ color: ic !== null ? cohesionColor(ic) : "text.disabled" }}>
                  {ic !== null ? ic.toFixed(1) : "—"}
                </Typography>
              </Box>
            </Stack>
            <Stack alignItems="center">
              <Typography variant="caption" color="text.secondary">
                {t("managerialSelfAssessment.ocLabel")}
              </Typography>
              <Box sx={{ minWidth: 64, px: 1.5, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, textAlign: "center" }}>
                <Typography variant="h6" fontWeight={800} sx={{ color: oc !== null ? cohesionColor(oc) : "text.disabled" }}>
                  {oc !== null ? oc.toFixed(1) : "—"}
                </Typography>
              </Box>
            </Stack>
          </Stack>

          <TableContainer>
            <Table size="small" sx={{ "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider" } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "40%", bgcolor: "#dde5ef", color: "#243747", fontWeight: 800, fontSize: 12 }}>
                    {activeCategory?.label}
                  </TableCell>
                  {TIERS.map((tier) => (
                    <TableCell
                      key={tier}
                      align="center"
                      sx={{ bgcolor: cohesionColor(tier), color: "#fff", fontWeight: 700, fontSize: 11, lineHeight: 1.25, minWidth: 78 }}
                    >
                      {t(`managerialSelfAssessment.scale${activeCategory?.scale === "level" ? "Level" : "Frequency"}.${tier}`).toUpperCase()}
                      <br />
                      {tier}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ fontWeight: 800, fontSize: 12, minWidth: 70 }}>
                    {t("managerialSelfAssessment.totalCol")}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800, fontSize: 12, minWidth: 80, bgcolor: "#fffaf0" }}>
                    {t("managerialSelfAssessment.objectiveCol")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeCategory?.items.map((statement, i) => {
                  const order = i + 1;
                  const row = draft[order] ?? { score: null, objective_score: null };
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
                            selected={row.score === tier}
                            color={cohesionColor(tier)}
                            disabled={readOnly}
                            ariaLabel={`${statement} — ${tier}`}
                            onClick={() => updateRow(order, { score: tier })}
                          />
                        </TableCell>
                      ))}
                      <TableCell align="center" sx={{ fontWeight: 800 }}>
                        {row.score !== null ? row.score.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell align="center" sx={{ bgcolor: "#fffaf0" }}>
                        <DecimalField
                          value={row.objective_score}
                          onChange={(v) => updateRow(order, { objective_score: v === "" ? null : v })}
                          placeholder={t("managerialSelfAssessment.unset")}
                          min={1}
                          max={5}
                          decimals={1}
                          disabled={readOnly}
                          width={64}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" sx={{ p: 2 }}>
            {error && <Alert severity="error" sx={{ py: 0 }}>{t("managerialSelfAssessment.saveFailed")}</Alert>}
            {saved && <Alert severity="success" sx={{ py: 0 }}>{t("managerialSelfAssessment.saved")}</Alert>}
            {!readOnly && (
              <Button variant="contained" onClick={handleSave} disabled={saving}>
                {assessments[activeCategory?.key ?? ""] ? t("managerialSelfAssessment.update") : t("managerialSelfAssessment.save")}
              </Button>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
