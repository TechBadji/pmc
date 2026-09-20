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
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { cohesionColor, performanceColors } from "@/theme";
import { useIssues } from "@/utils/validation";
import type { EvaluationCampaign, MonkeyManagementAssessment, MonkeyManagementLevel, Paginated, UserRecord } from "@/api/types";

const TIERS = [1, 2, 3, 4, 5];
const ITEM_KEYS = Array.from({ length: 10 }, (_, i) => i + 1);

// Les 4 paliers d'interprétation, du plus faible au plus haut — bornes
// exactes de la fiche papier, pour dessiner une jauge à 4 zones égales et y
// positionner précisément le score obtenu. Couleurs fixes (pas le dégradé
// continu de `cohesionColor`) : le rouge/orange/vert de la palette de
// performance existante, demandés explicitement plutôt que déduits du score.
const MAGNET_RED = "#b71c1c";
const RISK_ORANGE = "#ef6c00";

const LEVEL_LADDER: { key: MonkeyManagementLevel; min: number; max: number; color: string }[] = [
  { key: "MONKEY_MAGNET", min: 10, max: 20, color: MAGNET_RED },
  { key: "MONKEY_RISK", min: 21, max: 30, color: RISK_ORANGE },
  { key: "GOOD_DELEGATOR", min: 31, max: 40, color: performanceColors.GOOD },
  { key: "EMPOWERING_LEADER", min: 41, max: 50, color: performanceColors.OUTSTANDING },
];

// JAMAIS et RAREMENT reprennent les couleurs de Monkey Magnet/Monkey Risk —
// les trois autres gardent le dégradé continu de `cohesionColor`.
function tierColor(tier: number): string {
  if (tier === 1) return MAGNET_RED;
  if (tier === 2) return RISK_ORANGE;
  return cohesionColor(tier);
}

/** Pastille de note — même pilule arrondie que la fiche de cohésion de
 *  l'encadrant et l'auto-évaluation managériale : un même code visuel pour
 *  toutes les fiches remplies par un encadrant sur lui-même. */
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
  const { issues, check, clear } = useIssues();

  // Le CODIR peut consulter la fiche de n'importe quel manager de son
  // entreprise (lecture seule) — voir MonkeyManagementAssessmentViewSet.
  // Un manager n'a personne d'autre à choisir : pas de sélecteur pour lui.
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

  useEffect(() => {
    if (viewedUserId === "" && user?.id) setViewedUserId(user.id);
  }, [user?.id, viewedUserId]);

  const viewedPerson = viewedUserId === user?.id ? user : managers.find((m) => m.id === viewedUserId);

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
    clear();
    if (!campaignId || viewedUserId === "") return;
    apiClient
      .get<Paginated<MonkeyManagementAssessment>>("/monkey-management-assessments/", {
        params: { campaign: campaignId, user: viewedUserId, page_size: 1 },
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
                  clear();
      })
      .catch(() => setLoadError(true));
  }, [campaignId, viewedUserId, clear]);

  const activeCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const viewingSelf = viewedUserId === user?.id;
  const readOnly = !!activeCampaign?.is_closed || !viewingSelf;

  const { total, answered, level } = useMemo(() => {
    const values = Object.values(scores).filter((v): v is number => v !== null);
    const t = values.reduce((a, b) => a + b, 0);
    return { total: t, answered: values.length, level: levelFor(t, values.length) };
  }, [scores]);

  // Une fois le palier connu, sa couleur fixe prime sur le dégradé continu —
  // utilisé seulement tant que la fiche est incomplète (pas encore de palier).
  const levelColor = level
    ? LEVEL_LADDER.find((b) => b.key === level)!.color
    : cohesionColor(total / 10 || 1);

  async function handleSave() {
    if (!viewingSelf) return;
    const filledMonkeys = monkeys.map((m) => m.trim()).filter(Boolean);
    const seen = new Set<string>();
    const duplicates = filledMonkeys.filter((m) => {
      const key = m.toLowerCase();
      const dup = seen.has(key);
      seen.add(key);
      return dup;
    });
    const hasContent =
      answered > 0 || filledMonkeys.length > 0 || [whyAccepted, returnToWhom, behaviorToChange, nextResponsibility].some((v) => v.trim());
    const ok = check([
      [!campaignId, t("validation.monkey.campaignRequired")],
      // Vider une fiche déjà enregistrée reste permis ; en créer une vide n'a pas de sens.
      [!assessment && !hasContent, t("validation.monkey.nothingEntered")],
      [filledMonkeys.length > 3, t("validation.monkey.tooManyMonkeys", { count: filledMonkeys.length })],
      ...[...new Set(duplicates.map((m) => m.toLowerCase()))].map(
        (key) => [true, t("validation.monkey.monkeyDuplicate", { text: filledMonkeys.find((m) => m.toLowerCase() === key) })] as const
      ),
    ]);
    if (!ok || !campaignId) return;
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
        <Stack spacing={2} alignItems="flex-start">
          <Box maxWidth={640}>
            <Typography variant="subtitle2" fontWeight={700}>
              {t("monkeyManagement.objectiveLabel")}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t("monkeyManagement.objectiveText")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {t("monkeyManagement.scaleHint")}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {isCompanyAdmin && (
              <TextField
                select
                size="small"
                label={t("monkeyManagement.viewingLabel")}
                value={viewedUserId}
                onChange={(e) => setViewedUserId(e.target.value === "" ? "" : Number(e.target.value))}
                sx={{ minWidth: 220 }}
              >
                {user && (
                  <MenuItem value={user.id}>{t("monkeyManagement.myself", { name: user.full_name })}</MenuItem>
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
        </Stack>
      </Paper>

      {campaigns.length === 0 && <Alert severity="info">{t("monkeyManagement.noCampaign")}</Alert>}
      {!viewingSelf && viewedPerson && (
        <Alert severity="info">{t("monkeyManagement.viewingOther", { name: viewedPerson.full_name })}</Alert>
      )}

      {campaignId !== "" && (
        <>
          <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", width: { xs: "100%", md: "80%" } }}>
            <TableContainer>
              <Table size="small" sx={{ "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider", py: 0.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: "50%", bgcolor: "#dde5ef", color: "#243747", fontWeight: 800, fontSize: 12, py: 0.5 }}>
                      {t("monkeyManagement.statementCol").toUpperCase()}
                    </TableCell>
                    {TIERS.map((tier) => (
                      <TableCell
                        key={tier}
                        align="center"
                        sx={{ bgcolor: tierColor(tier), color: "#fff", fontWeight: 700, fontSize: 12, lineHeight: 1.15, minWidth: 52, px: 0.5 }}
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
                          <Typography variant="body1">
                            {order}. {statement}
                          </Typography>
                        </TableCell>
                        {TIERS.map((tier) => (
                          <TableCell key={tier} align="center" sx={{ px: 0.5 }}>
                            <ScoreOval
                              selected={value === tier}
                              color={tierColor(tier)}
                              disabled={readOnly}
                              ariaLabel={`${statement} — ${tier}`}
                              onClick={() => {
                                setScores((current) => ({ ...current, [order]: tier }));
                                setSaved(false);
                  clear();
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
              <Typography variant="body1" fontWeight={700} color="text.secondary">
                {t("monkeyManagement.progress", { answered, total: 10 })}
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Stack alignItems="center">
                  <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                    {t("monkeyManagement.totalLabel")}
                  </Typography>
                  <Box sx={{ minWidth: 76, px: 1.5, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, textAlign: "center" }}>
                    <Typography variant="h4" fontWeight={800} sx={{ color: answered ? levelColor : "text.disabled" }}>
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
            {issues.length > 0 && (
              <Box sx={{ mx: 2, mb: 2 }}>
                <ValidationSummary issues={issues} onClose={clear} />
              </Box>
            )}
            {error && <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{t("monkeyManagement.saveFailed")}</Alert>}
            {saved && <Alert severity="success" sx={{ mx: 2, mb: 2 }}>{t("monkeyManagement.saved")}</Alert>}
            {!level && <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, pb: 2 }}>{t("monkeyManagement.incomplete")}</Typography>}
          </Paper>

          {level && (() => {
            const activeIndex = LEVEL_LADDER.findIndex((b) => b.key === level);
            const activeBand = LEVEL_LADDER[activeIndex];
            const fracInBand = (total - activeBand.min) / (activeBand.max - activeBand.min);
            const markerPct = ((activeIndex + Math.min(1, Math.max(0, fracInBand))) / LEVEL_LADDER.length) * 100;
            return (
              <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", maxWidth: { xs: "100%", md: "70%" } }}>
                <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ display: "block", mb: 1.5, fontSize: 13 }}>
                  {t("monkeyManagement.interpretationTitle")}
                </Typography>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-end" }} justifyContent="space-between" sx={{ mb: 3 }}>
                  <Typography variant="h3" fontWeight={800} sx={{ color: levelColor, lineHeight: 1.15 }}>
                    {t(`monkeyManagement.levels.${level}.title`)}
                  </Typography>
                  <Typography variant="h2" fontWeight={800} sx={{ color: levelColor, lineHeight: 1 }}>
                    {total}
                    <Typography component="span" variant="h4" color="text.secondary" fontWeight={700}>
                      /50
                    </Typography>
                  </Typography>
                </Stack>

                {/* Jauge à 4 zones — le triangle marque le score exact dans sa zone. */}
                <Box sx={{ position: "relative", mb: 1.5, mt: 3 }}>
                  <Box
                    sx={{
                      position: "absolute",
                      top: -14,
                      left: `${markerPct}%`,
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "7px solid transparent",
                      borderRight: "7px solid transparent",
                      borderTop: `9px solid ${levelColor}`,
                    }}
                  />
                  <Stack direction="row" spacing="2px" sx={{ height: 14, borderRadius: 7, overflow: "hidden" }}>
                    {LEVEL_LADDER.map((band) => (
                      <Box
                        key={band.key}
                        sx={{
                          flex: 1,
                          bgcolor: band.color,
                          opacity: band.key === level ? 1 : 0.3,
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
                <Stack direction="row">
                  {LEVEL_LADDER.map((band) => (
                    <Box key={band.key} sx={{ flex: 1, textAlign: "center", opacity: band.key === level ? 1 : 0.45 }}>
                      <Typography
                        variant="body1"
                        fontWeight={band.key === level ? 800 : 600}
                        sx={{ color: band.color }}
                      >
                        {t(`monkeyManagement.levels.${band.key}.title`)}
                      </Typography>
                      <Typography variant="body2" sx={{ color: band.color }}>
                        {t(`monkeyManagement.levels.${band.key}.range`)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>

                <Box
                  sx={{
                    mt: 3,
                    p: 2.5,
                    borderRadius: 2,
                    bgcolor: `${levelColor}14`,
                    borderLeft: "4px solid",
                    borderColor: levelColor,
                  }}
                >
                  <Typography variant="h5" fontWeight={700} sx={{ mb: 0.75 }}>
                    {t(`monkeyManagement.levels.${level}.subtitle`)}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: 16 }}>
                    {t(`monkeyManagement.levels.${level}.description`)}
                  </Typography>
                </Box>
              </Paper>
            );
          })()}

          <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider", width: { xs: "100%", md: "80%" } }}>
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
                  clear();
                      }}
                      inputProps={{ maxLength: 255 }}
                    />
                  ))}
                </Stack>
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
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
                  clear();
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
                  clear();
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
                  clear();
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
                  clear();
                }}
              />
              </Box>
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
