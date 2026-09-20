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
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { DecimalField } from "@/components/inputs/DecimalField";
import { fmtNum, hasExtraDecimals, outOfRange } from "@/utils/evaluationValidation";
import { useIssues } from "@/utils/validation";
import { cohesionColor } from "@/theme";
import type { EvaluationCampaign, ManagerialSelfAssessment, ManagerialSynthesis, Paginated, UserRecord } from "@/api/types";
import { useManagerialAssessmentCategories } from "@/utils/managerialSelfAssessment";

const TIERS = [1, 2, 3, 4, 5];

// Mêmes couleurs fixes que Monkey Management pour les deux premiers paliers
// (Jamais/Très faible en rouge, Rarement/Faible en orange) — les trois
// autres gardent le dégradé continu de `cohesionColor`.
const MAGNET_RED = "#b71c1c";
const RISK_ORANGE = "#ef6c00";
function tierColor(tier: number): string {
  if (tier === 1) return MAGNET_RED;
  if (tier === 2) return RISK_ORANGE;
  return cohesionColor(tier);
}

/** Encadré valeur (IC/OC) — même style "case Excel" que ICE/OCE sur la
 *  fiche de cohésion de l'encadrant : boîte bordée, étiquette à gauche,
 *  valeur en grand ; l'OC reprend le même fond jaune pâle que sa colonne. */
function ValueBox({ label, value, bg }: { label: string; value: number | null; bg?: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="subtitle2" fontWeight={700}>
        {label}
      </Typography>
      <Box
        sx={{
          minWidth: 64,
          px: 1.5,
          py: 0.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: bg ?? "background.paper",
          textAlign: "center",
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          {value !== null ? value.toFixed(1) : "—"}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Pastille de note — même forme que la fiche de cohésion de l'encadrant
 *  (pilule arrondie, aplat plein quand sélectionnée), plutôt que le cercle
 *  de la fiche individuelle de cohésion : un même code visuel pour les
 *  fiches remplies par un encadrant sur lui-même. */
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
        width: 40,
        height: 24,
        borderRadius: 12,
        border: "1px solid",
        borderColor: selected ? color : "divider",
        bgcolor: selected ? color : "background.paper",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "background-color 0.15s",
        "&:hover": disabled ? undefined : { bgcolor: selected ? color : "action.hover" },
      }}
    />
  );
}

type RowState = { score: number | null; objective_score: number | null; comment: string };
type CategoryState = Record<number, RowState>;

function emptyState(): CategoryState {
  const state: CategoryState = {};
  for (let order = 1; order <= 10; order += 1) state[order] = { score: null, objective_score: null, comment: "" };
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
/** Trois lignes au minimum ; le bouton « Ajouter » en ouvre d'autres, jusqu'à MAX_SYNTHESIS_ROWS. */
const MAX_SYNTHESIS_ROWS = 10;
function padRows(values: string[]): string[] {
  const out = [...values];
  while (out.length < 3) out.push("");
  return out;
}

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
  const { issues, check, clear } = useIssues();

  // Compétences clés / axes d'amélioration de la synthèse — une fiche à
  // part, indépendante des 5 catégories (voir ManagerialSynthesis).
  const [synthesis, setSynthesis] = useState<ManagerialSynthesis | null>(null);
  const [keySkills, setKeySkills] = useState<string[]>(["", "", ""]);
  const [improvementAreas, setImprovementAreas] = useState<string[]>(["", "", ""]);
  const [synthesisSaving, setSynthesisSaving] = useState(false);
  const [synthesisSaved, setSynthesisSaved] = useState(false);
  const [synthesisError, setSynthesisError] = useState(false);

  // Le CODIR peut consulter la fiche de n'importe quel manager de son
  // entreprise (lecture seule) — voir ManagerialSelfAssessmentViewSet côté
  // API. Un manager, lui, n'a personne d'autre à choisir : le sélecteur ne
  // s'affiche que pour un Company Admin.
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const [managers, setManagers] = useState<UserRecord[]>([]);
  const [viewedUserId, setViewedUserId] = useState<number | "">(user?.id ?? "");

  useEffect(() => {
    if (!isCompanyAdmin || !user?.company) return;
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { company: user.company, role: "MANAGER", page_size: 500 } })
      .then((r) => setManagers(r.data.results))
      .catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompanyAdmin, user?.company]);

  const viewedPerson = viewedUserId === user?.id ? user : managers.find((m) => m.id === viewedUserId);

  useEffect(() => {
    if (viewedUserId === "" && user?.id) setViewedUserId(user.id);
  }, [user?.id, viewedUserId]);

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
    clear();
    if (!campaignId || viewedUserId === "") return;
    apiClient
      .get<Paginated<ManagerialSelfAssessment>>("/managerial-self-assessments/", {
        params: { campaign: campaignId, user: viewedUserId, page_size: 20 },
      })
      .then((r) => {
        const byCategory: Record<string, ManagerialSelfAssessment> = {};
        const nextDrafts: Record<string, CategoryState> = {};
        r.data.results.forEach((a) => {
          byCategory[a.category] = a;
          const state = emptyState();
          a.scores.forEach((s) => {
            state[s.order] = { score: s.score, objective_score: s.objective_score, comment: s.comment ?? "" };
          });
          nextDrafts[a.category] = state;
        });
        setAssessments(byCategory);
        setDrafts(nextDrafts);
        setSaved(false);
      })
      .catch(() => setLoadError(true));

    apiClient
      .get<Paginated<ManagerialSynthesis>>("/managerial-syntheses/", {
        params: { campaign: campaignId, user: viewedUserId, page_size: 1 },
      })
      .then((r) => {
        const existing = r.data.results[0] ?? null;
        setSynthesis(existing);
        const skills = existing?.key_skills ?? [];
        const areas = existing?.improvement_areas ?? [];
        setKeySkills(padRows(skills));
        setImprovementAreas(padRows(areas));
        setSynthesisSaved(false);
      })
      .catch(() => setLoadError(true));
  }, [campaignId, viewedUserId, clear]);

  const isSynthesis = tab === categories.length;
  const activeCategory = categories[tab];
  const activeCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const viewingSelf = viewedUserId === user?.id;
  const readOnly = !!activeCampaign?.is_closed || !viewingSelf;
  const draft = drafts[activeCategory?.key ?? ""] ?? emptyState();

  // Radar de synthèse : l'IC de chacune des 5 fiches, sur la même campagne —
  // lu depuis `drafts` (déjà chargé pour les 5 catégories d'un coup), pas
  // besoin d'un nouvel appel serveur pour changer d'onglet.
  const synthesisData = useMemo(
    () =>
      categories.map((c) => {
        const catDraft = drafts[c.key] ?? emptyState();
        const values = Object.values(catDraft).map((r) => r.score).filter((v): v is number => v !== null);
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        const objectives = Object.values(catDraft).map((r) => r.objective_score).filter((v): v is number => v !== null);
        const oc = objectives.length ? objectives.reduce((a, b) => a + b, 0) / objectives.length : null;
        return { category: c.label, ic: Math.round(avg * 10) / 10, oc: oc === null ? null : Math.round(oc * 10) / 10 };
      }),
    [categories, drafts]
  );

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
    clear();
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
    if (!activeCategory || !viewingSelf) return;
    const scores = Object.entries(draft)
      .map(([order, row]) => ({
        order: Number(order),
        score: row.score,
        objective_score: row.objective_score,
        comment: row.comment,
      }))
      .filter((entry) => entry.score !== null || entry.objective_score !== null || entry.comment);
    const rules: Parameters<typeof check>[0] = [
      [!campaignId, t("validation.managerial.campaignRequired")],
      // Vider une fiche déjà enregistrée reste permis ; en créer une vide n'a pas de sens.
      [!assessments[activeCategory.key] && scores.length === 0, t("validation.managerial.nothingEntered", { category: activeCategory.label })],
    ];
    scores.forEach((entry) => {
      const value = entry.objective_score === null ? "" : fmtNum(entry.objective_score);
      rules.push(
        [outOfRange(entry.objective_score, 1, 5), t("validation.managerial.objectiveRange", { order: entry.order, value })],
        [entry.objective_score !== null && hasExtraDecimals(entry.objective_score), t("validation.managerial.objectiveDecimals", { order: entry.order, value })],
        [entry.comment.length > 255, t("validation.managerial.commentTooLong", { order: entry.order, count: entry.comment.length })]
      );
    });
    if (!check(rules)) return;
    setSaving(true);
    setError(false);
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

  async function handleSaveSynthesis() {
    if (!viewingSelf) return;
    const skills = keySkills.map((v) => v.trim());
    const areas = improvementAreas.map((v) => v.trim());
    const norm = (v: string) => v.toLowerCase();
    const rules: Parameters<typeof check>[0] = [
      [!campaignId, t("validation.managerial.campaignRequired")],
      [!synthesis && !skills.some(Boolean) && !areas.some(Boolean), t("validation.managerial.synthesisEmpty")],
    ];
    (
      [
        [skills, t("validation.managerial.keySkills")],
        [areas, t("validation.managerial.improvementAreas")],
      ] as const
    ).forEach(([list, section]) => {
      const seen = new Set<string>();
      list.forEach((text, i) => {
        if (!text) return;
        rules.push(
          [seen.has(norm(text)), t("validation.managerial.synthesisDuplicate", { text, section })],
          [text.length > 255, t("validation.managerial.synthesisTooLong", { section, n: i + 1, count: text.length })]
        );
        seen.add(norm(text));
      });
    });
    const areaSet = new Set(areas.filter(Boolean).map(norm));
    [...new Set(skills.filter((v) => v && areaSet.has(norm(v))).map(norm))].forEach((key) => {
      rules.push([true, t("validation.managerial.synthesisContradiction", { text: skills.find((v) => norm(v) === key) })]);
    });
    if (!check(rules)) return;
    setSynthesisSaving(true);
    setSynthesisError(false);
    const payload = {
      campaign: campaignId,
      key_skills: keySkills.map((s) => s.trim()).filter(Boolean),
      improvement_areas: improvementAreas.map((s) => s.trim()).filter(Boolean),
    };
    try {
      const r = synthesis
        ? await apiClient.patch<ManagerialSynthesis>(`/managerial-syntheses/${synthesis.id}/`, payload)
        : await apiClient.post<ManagerialSynthesis>("/managerial-syntheses/", payload);
      setSynthesis(r.data);
      setSynthesisSaved(true);
    } catch {
      setSynthesisError(true);
    } finally {
      setSynthesisSaving(false);
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
                {viewedPerson?.full_name}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t("managerialSelfAssessment.position")}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700}>
                {viewedPerson?.position || "—"}
              </Typography>
            </Box>
          </Stack>
          {isCompanyAdmin && (
            <TextField
              select
              size="small"
              label={t("managerialSelfAssessment.viewingLabel")}
              value={viewedUserId}
              onChange={(e) => setViewedUserId(e.target.value === "" ? "" : Number(e.target.value))}
              sx={{ minWidth: 220 }}
            >
              {user && (
                <MenuItem value={user.id}>{t("managerialSelfAssessment.myself", { name: user.full_name })}</MenuItem>
              )}
              {managers.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.full_name} — {m.position}
                </MenuItem>
              ))}
            </TextField>
          )}
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
      {!viewingSelf && viewedPerson && (
        <Alert severity="info">{t("managerialSelfAssessment.viewingOther", { name: viewedPerson.full_name })}</Alert>
      )}

      {campaignId !== "" && (
        <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
          <Tabs
            value={tab}
            onChange={(_, v) => {
              clear();
              setTab(v);
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: "1px solid", borderColor: "divider", px: 1 }}
          >
            {categories.map((c) => (
              <Tab key={c.key} label={c.label.toUpperCase()} />
            ))}
            <Tab label={t("managerialSelfAssessment.synthesisTab").toUpperCase()} />
          </Tabs>

          {isSynthesis ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
                {t("managerialSelfAssessment.synthesisTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t("managerialSelfAssessment.synthesisHint")}
              </Typography>

              <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
                <Box sx={{ flex: "3 1 0", minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={560}>
                    <RadarChart data={synthesisData} outerRadius="85%">
                      <PolarGrid />
                      <PolarAngleAxis dataKey="category" tick={{ fontSize: 13, fontWeight: 600 }} />
                      <PolarRadiusAxis domain={[0, 5]} tickCount={6} angle={90} />
                      <Radar
                        name={viewedPerson?.full_name}
                        dataKey="ic"
                        stroke="#2E8FCB"
                        fill="#2E8FCB"
                        fillOpacity={0.45}
                        strokeWidth={2}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          const row = active && payload?.length ? (payload[0].payload as { category: string; ic: number; oc: number | null }) : null;
                          if (!row) return null;
                          return (
                            <Paper elevation={4} sx={{ px: 1.5, py: 1, minWidth: 150 }}>
                              <Typography variant="caption" fontWeight={800} display="block" sx={{ mb: 0.5 }}>
                                {row.category}
                              </Typography>
                              <Stack direction="row" justifyContent="space-between" spacing={2}>
                                <Typography variant="caption" color="text.secondary">IC</Typography>
                                <Typography variant="caption" fontWeight={700}>{row.ic.toFixed(1)} / 5</Typography>
                              </Stack>
                              <Stack direction="row" justifyContent="space-between" spacing={2}>
                                <Typography variant="caption" color="text.secondary">OC</Typography>
                                <Typography variant="caption" fontWeight={700}>{row.oc === null ? "—" : `${row.oc.toFixed(1)} / 5`}</Typography>
                              </Stack>
                            </Paper>
                          );
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </Box>

                <Stack sx={{ flex: "1 1 0", minWidth: { lg: 280 } }} spacing={2}>
                  <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                    <Box sx={{ bgcolor: "#3F9142", color: "#fff", px: 2, py: 0.75 }}>
                      <Typography variant="subtitle2" fontWeight={800}>
                        {t("managerialSelfAssessment.keySkillsTitle")}
                      </Typography>
                    </Box>
                    <Stack spacing={1} sx={{ p: 1.5 }}>
                      {keySkills.map((_, i) => (
                        <TextField
                          key={i}
                          size="small"
                          fullWidth
                          placeholder={t("managerialSelfAssessment.keySkillPlaceholder", { n: i + 1 })}
                          value={keySkills[i]}
                          disabled={readOnly}
                          onChange={(e) => {
                            setKeySkills((current) => {
                              const next = [...current];
                              next[i] = e.target.value;
                              return next;
                            });
                            setSynthesisSaved(false);
                            clear();
                          }}
                          inputProps={{ maxLength: 255 }}
                        />
                      ))}
                      {!readOnly && (
                        <Button
                          size="small"
                          startIcon={<AddOutlinedIcon />}
                          disabled={keySkills.length >= MAX_SYNTHESIS_ROWS}
                          onClick={() => {
                            setKeySkills((current) => [...current, ""]);
                            setSynthesisSaved(false);
                          }}
                          sx={{ alignSelf: "flex-start" }}
                        >
                          {t("managerialSelfAssessment.add")}
                        </Button>
                      )}
                    </Stack>
                  </Paper>

                  <Paper variant="outlined" sx={{ overflow: "hidden" }}>
                    <Box sx={{ bgcolor: "#8B2E2E", color: "#fff", px: 2, py: 0.75 }}>
                      <Typography variant="subtitle2" fontWeight={800}>
                        {t("managerialSelfAssessment.improvementAreasTitle")}
                      </Typography>
                    </Box>
                    <Stack spacing={1} sx={{ p: 1.5 }}>
                      {improvementAreas.map((_, i) => (
                        <TextField
                          key={i}
                          size="small"
                          fullWidth
                          placeholder={t("managerialSelfAssessment.improvementAreaPlaceholder", { n: i + 1 })}
                          value={improvementAreas[i]}
                          disabled={readOnly}
                          onChange={(e) => {
                            setImprovementAreas((current) => {
                              const next = [...current];
                              next[i] = e.target.value;
                              return next;
                            });
                            setSynthesisSaved(false);
                            clear();
                          }}
                          inputProps={{ maxLength: 255 }}
                        />
                      ))}
                      {!readOnly && (
                        <Button
                          size="small"
                          startIcon={<AddOutlinedIcon />}
                          disabled={improvementAreas.length >= MAX_SYNTHESIS_ROWS}
                          onClick={() => {
                            setImprovementAreas((current) => [...current, ""]);
                            setSynthesisSaved(false);
                          }}
                          sx={{ alignSelf: "flex-start" }}
                        >
                          {t("managerialSelfAssessment.add")}
                        </Button>
                      )}
                    </Stack>
                  </Paper>

                  <ValidationSummary issues={issues} onClose={clear} />
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                    {synthesisError && <Alert severity="error" sx={{ py: 0 }}>{t("managerialSelfAssessment.saveFailed")}</Alert>}
                    {synthesisSaved && <Alert severity="success" sx={{ py: 0 }}>{t("managerialSelfAssessment.saved")}</Alert>}
                    {!readOnly && (
                      <Button variant="contained" onClick={handleSaveSynthesis} disabled={synthesisSaving}>
                        {synthesis ? t("managerialSelfAssessment.update") : t("managerialSelfAssessment.save")}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Stack>
            </Box>
          ) : (
            <>
          <Stack
            direction="row"
            spacing={3}
            alignItems="center"
            justifyContent="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ p: 2 }}
          >
            <ValueBox label={t("managerialSelfAssessment.icLabel")} value={ic} />
            <ValueBox label={t("managerialSelfAssessment.ocLabel")} value={oc} bg="#fff4c2" />
          </Stack>

          <TableContainer>
            <Table size="small" sx={{ "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider" } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "36%", bgcolor: "#dde5ef", color: "#243747", fontWeight: 800, fontSize: 13, py: 0.5 }}>
                    {activeCategory?.label.toUpperCase()}
                  </TableCell>
                  {TIERS.map((tier) => (
                    <TableCell
                      key={tier}
                      align="center"
                      sx={{ bgcolor: tierColor(tier), color: "#fff", fontWeight: 700, fontSize: 10, lineHeight: 1.2, minWidth: 52, px: 0.5 }}
                    >
                      {t(`managerialSelfAssessment.scale${activeCategory?.scale === "level" ? "Level" : "Frequency"}.${tier}`).toUpperCase()}
                      <br />
                      {tier}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ fontWeight: 800, fontSize: 12, minWidth: 60 }}>
                    {t("managerialSelfAssessment.totalCol")}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800, fontSize: 12, minWidth: 58, px: 0.5, bgcolor: "#fffaf0" }}>
                    {t("managerialSelfAssessment.objectiveCol")}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800, fontSize: 12, minWidth: 200 }}>
                    {t("managerialSelfAssessment.commentCol")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeCategory?.items.map((statement, i) => {
                  const order = i + 1;
                  const row = draft[order] ?? { score: null, objective_score: null, comment: "" };
                  return (
                    <TableRow key={order}>
                      <TableCell>
                        <Typography variant="body1">
                          {order}. {statement}
                        </Typography>
                      </TableCell>
                      {TIERS.map((tier) => (
                        <TableCell key={tier} align="center" sx={{ px: 0.5 }}>
                          <ScoreOval
                            selected={row.score === tier}
                            color={tierColor(tier)}
                            disabled={readOnly}
                            ariaLabel={`${statement} — ${tier}`}
                            onClick={() => updateRow(order, { score: tier })}
                          />
                        </TableCell>
                      ))}
                      <TableCell align="center" sx={{ fontWeight: 800 }}>
                        {row.score !== null ? row.score.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell align="center" sx={{ bgcolor: "#fffaf0", px: 0.5 }}>
                        <DecimalField
                          value={row.objective_score}
                          onChange={(v) => updateRow(order, { objective_score: v === "" ? null : v })}
                          placeholder={t("managerialSelfAssessment.unset")}
                          min={1}
                          max={5}
                          decimals={1}
                          disabled={readOnly}
                          width={52}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder={t("managerialSelfAssessment.commentPlaceholder")}
                          value={row.comment}
                          disabled={readOnly}
                          onChange={(e) => updateRow(order, { comment: e.target.value })}
                          inputProps={{ maxLength: 255 }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {issues.length > 0 && (
            <Box sx={{ px: 2, pt: 2 }}>
              <ValidationSummary issues={issues} onClose={clear} />
            </Box>
          )}
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" sx={{ p: 2 }}>
            {error && <Alert severity="error" sx={{ py: 0 }}>{t("managerialSelfAssessment.saveFailed")}</Alert>}
            {saved && <Alert severity="success" sx={{ py: 0 }}>{t("managerialSelfAssessment.saved")}</Alert>}
            {!readOnly && (
              <Button variant="contained" onClick={handleSave} disabled={saving}>
                {assessments[activeCategory?.key ?? ""] ? t("managerialSelfAssessment.update") : t("managerialSelfAssessment.save")}
              </Button>
            )}
          </Stack>
            </>
          )}
        </Paper>
      )}
    </Stack>
  );
}
