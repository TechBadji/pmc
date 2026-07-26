import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
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
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type {
  Evaluation,
  EvaluationCampaign,
  Paginated,
  PerformanceRating,
  SkillItem,
  SkillMatrix,
  UserRecord,
} from "@/api/types";
import { performanceColors } from "@/theme";

const HARD_COLOR = "#2E5AAC";
const SOFT_COLOR = "#3F9142";

function ratingFor(pct: number): PerformanceRating {
  if (pct < 50) return "VERY_LOW";
  if (pct < 75) return "LOW";
  if (pct < 90) return "AVERAGE";
  if (pct <= 100) return "GOOD";
  return "OUTSTANDING";
}

type ScoreState = Record<number, number | "">;

function parseScoreInput(raw: string): number | "" {
  if (raw === "") return "";
  const value = Number(raw);
  return Number.isNaN(value) ? "" : value;
}

// Masque les flèches natives d'incrémentation des champs number, laissées
// libres à la saisie (nombre entier ou décimal, aucun autre caractère).
const NUMBER_INPUT_SX = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
  "& input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
} as const;

function blockNonNumericKeys(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") {
    e.preventDefault();
  }
}

function calculateAverage(scores: Record<number, number | "">, itemIds: number[]): number {
  const validScores = itemIds
    .map((id) => scores[id])
    .filter((score) => score !== "" && score !== undefined) as number[];
  if (validScores.length === 0) return 0;
  return parseFloat((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1));
}

export default function EvaluationFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: authUser } = useAppSelector((s) => s.auth);

  const [members, setMembers] = useState<UserRecord[]>([]);
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [userId, setUserId] = useState<number | "">(() => {
    const preselected = searchParams.get("user");
    return preselected ? Number(preselected) : "";
  });
  const [campaignId, setCampaignId] = useState<number | "">(() => {
    const preselected = searchParams.get("campaign");
    return preselected ? Number(preselected) : "";
  });
  const [businessScore, setBusinessScore] = useState(80);
  const [peopleScore, setPeopleScore] = useState(80);
  const [hardItems, setHardItems] = useState<SkillItem[]>([]);
  const [softItems, setSoftItems] = useState<SkillItem[]>([]);
  const [scores, setScores] = useState<ScoreState>({});
  const [objectives, setObjectives] = useState<ScoreState>({});
  const [achievements, setAchievements] = useState<ScoreState>({});
  const [previousObjectives, setPreviousObjectives] = useState<ScoreState>({});
  const [usedCampaignIds, setUsedCampaignIds] = useState<Set<number>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(false);
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } })
      .then((r) => setMembers(r.data.results))
      .catch(() => setLoadError(true));
    if (authUser?.company) {
      apiClient
        .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", {
          params: { company: authUser.company, page_size: 500 },
        })
        .then((r) => setCampaigns(r.data.results))
        .catch(() => setLoadError(true));
    }
  }, [authUser?.company]);

  useEffect(() => {
    if (isEdit) {
      apiClient
        .get<Evaluation>(`/evaluations/${id}/`)
        .then((r) => {
          const evaluation = r.data;
          setUserId(evaluation.user);
          setCampaignId(evaluation.campaign);
          setBusinessScore(Number(evaluation.business_objectives_score));
          setPeopleScore(Number(evaluation.people_objectives_score));
          const initialScores: ScoreState = {};
          const initialObjectives: ScoreState = {};
          const initialAchievements: ScoreState = {};
          const selected = new Set<number>();
          evaluation.skill_scores.forEach((s) => {
            initialScores[s.skill_item] = Number(s.score);
            if (s.objective_score !== null) initialObjectives[s.skill_item] = Number(s.objective_score);
            if (s.achievement_rate !== null) initialAchievements[s.skill_item] = Number(s.achievement_rate);
            selected.add(s.skill_item);
          });
          setScores(initialScores);
          setObjectives(initialObjectives);
          setAchievements(initialAchievements);
          setSelectedSkills(selected);
        })
        .catch(() => setLoadError(true));
    }
  }, [id, isEdit]);

  const selectedMember = useMemo(() => members.find((m) => m.id === userId), [members, userId]);

  useEffect(() => {
    if (!selectedMember?.position) return;

    if (!isEdit) {
      // Nouvelle évaluation : on repart de zéro à chaque changement de
      // membre pour ne pas laisser trainer les notes du membre précédent.
      setScores({});
      setObjectives({});
    }

    apiClient.get<Paginated<SkillMatrix>>("/skill-matrices/", { params: { page_size: 500 } }).then((r) => {
      // Le référentiel exact du poste est prioritaire (cas des directeurs,
      // chacun ayant son propre référentiel nominatif). À défaut, on retombe
      // sur le référentiel rattaché au département du collaborateur — c'est
      // celui utilisé historiquement pour évaluer les membres de l'équipe
      // (voir seed_department_employees), donc les notes déjà saisies
      // restent comparables d'une période à l'autre.
      const findMatrix = (type: "HARD" | "SOFT") =>
        r.data.results.find((m) => m.name === selectedMember.position && m.type === type) ??
        r.data.results.find((m) => m.department === selectedMember.department && m.type === type);
      const hard = findMatrix("HARD")?.items ?? [];
      const soft = findMatrix("SOFT")?.items ?? [];
      setHardItems(hard);
      setSoftItems(soft);
      // Nouvelle évaluation : toutes les compétences sont cochées (donc
      // visibles et prêtes à noter) par défaut — le manager décoche au cas
      // par cas celles qui ne s'appliquent pas. En édition, la sélection
      // reste celle restaurée depuis l'évaluation existante (effet ci-dessus).
      if (!isEdit) {
        setSelectedSkills(new Set([...hard, ...soft].map((item) => item.id)));
      }
    }).catch(() => setLoadError(true));

    // Retrouve l'évaluation précédente de ce collaborateur (celle d'avant si
    // on édite une évaluation existante, la plus récente sinon) pour :
    // 1. pré-remplir la colonne "Actuel" avec ses notes (nouvelle évaluation
    //    uniquement — l'Objectif, lui, reste à définir) ;
    // 2. connaître l'objectif qui avait été fixé par compétence, affiché en
    //    repère à côté de la nouvelle colonne "Réalisé".
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { user: selectedMember.id, page_size: 500 } })
      .then((r) => {
        const others = r.data.results.filter((e) => !isEdit || e.id !== Number(id));
        setUsedCampaignIds(new Set(others.map((e) => e.campaign)));
        if (!others.length) return;
        const previous = [...others].sort((a, b) => b.campaign_start_date.localeCompare(a.campaign_start_date))[0];
        const prevObjectives: ScoreState = {};
        previous.skill_scores.forEach((s) => {
          if (s.objective_score !== null) prevObjectives[s.skill_item] = Number(s.objective_score);
        });
        setPreviousObjectives(prevObjectives);
        if (!isEdit) {
          const previousScores: ScoreState = {};
          previous.skill_scores.forEach((s) => {
            previousScores[s.skill_item] = Number(s.score);
          });
          setScores((prev) => ({ ...prev, ...previousScores }));
        }
      })
      .catch(() => setLoadError(true));
  }, [selectedMember, isEdit, id]);

  const availableCampaigns = campaigns.filter((c) => isEdit || (!c.is_closed && !usedCampaignIds.has(c.id)));

  const selectedHardItems = hardItems.filter((item) => selectedSkills.has(item.id));
  const selectedSoftItems = softItems.filter((item) => selectedSkills.has(item.id));
  const allSelectedItems = [...selectedHardItems, ...selectedSoftItems];
  const allCurrentScoresFilled = allSelectedItems.length > 0 && allSelectedItems.every((item) => scores[item.id] !== undefined && scores[item.id] !== "");

  const hsi = calculateAverage(scores, hardItems.map((i) => i.id));
  const hso = calculateAverage(objectives, hardItems.map((i) => i.id));
  const ssi = calculateAverage(scores, softItems.map((i) => i.id));
  const sso = calculateAverage(objectives, softItems.map((i) => i.id));

  // Aperçu en direct de l'Altitude (performance globale), pour que le
  // manager voie immédiatement quel palier ses saisies Business/People vont
  // produire, au lieu de le découvrir seulement après enregistrement.
  const previewAltitude = Math.round(((businessScore + peopleScore) / 2) * 10) / 10;
  const previewRating = ratingFor(previewAltitude);

  async function handleSubmit() {
    if (!userId || !campaignId || !allCurrentScoresFilled) return;
    setSubmitError(null);
    const payload = {
      user: userId,
      campaign: campaignId,
      business_objectives_score: businessScore,
      people_objectives_score: peopleScore,
      skill_scores: allSelectedItems.map((item) => ({
        skill_item: item.id,
        score: scores[item.id],
        objective_score: objectives[item.id] === "" || objectives[item.id] === undefined ? null : objectives[item.id],
        achievement_rate: achievements[item.id] === "" || achievements[item.id] === undefined ? null : achievements[item.id],
      })),
    };
    try {
      if (isEdit) {
        await apiClient.put(`/evaluations/${id}/`, payload);
      } else {
        await apiClient.post("/evaluations/", payload);
      }
      navigate("/evaluations");
    } catch (err: any) {
      const data = err.response?.data;
      const fieldError =
        data?.campaign?.[0] ?? data?.user?.[0] ?? data?.skill_scores?.[0] ?? data?.non_field_errors?.[0];
      setSubmitError(fieldError ?? data?.detail ?? t("common.saveError"));
    }
  }

  function renderSkillCard(
    items: SkillItem[],
    color: string,
    title: string,
    indexLabel: string,
    objectiveLabel: string,
    currentIndex: number,
    objectiveIndex: number
  ) {
    return (
      <Paper elevation={0} sx={{ flex: 1, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.25, bgcolor: color }}
        >
          <Typography sx={{ color: "#fff", fontWeight: 700 }}>{title}</Typography>
          <Stack direction="row" spacing={1.5}>
            <Chip
              size="small"
              label={`${indexLabel} ${currentIndex}`}
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 700 }}
            />
            <Chip
              size="small"
              label={`${objectiveLabel} ${objectiveIndex}`}
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 700 }}
            />
          </Stack>
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} align="center">
                  <Tooltip title={t("evaluationForm.includeTooltip")}>
                    <span>{t("evaluationForm.include")}</span>
                  </Tooltip>
                </TableCell>
                <TableCell>{t("skills.competency")}</TableCell>
                <TableCell align="center">{t("evaluationForm.current")}</TableCell>
                <TableCell align="center">{t("evaluationForm.objective")}</TableCell>
                <TableCell align="center">{t("evaluationForm.achieved")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const previousObjective = previousObjectives[item.id];
                const hasPreviousObjective = typeof previousObjective === "number";
                return (
                  <TableRow key={item.id} hover sx={{ opacity: selectedSkills.has(item.id) ? 1 : 0.45 }}>
                    <TableCell align="center">
                      <Checkbox
                        checked={selectedSkills.has(item.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedSkills);
                          if (e.target.checked) {
                            newSelected.add(item.id);
                          } else {
                            newSelected.delete(item.id);
                          }
                          setSelectedSkills(newSelected);
                        }}
                      />
                    </TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell align="center">
                      <TextField
                        type="number"
                        size="small"
                        inputProps={{ min: 1, max: 5, step: 0.1 }}
                        value={scores[item.id] ?? ""}
                        onChange={(e) =>
                          setScores((prev) => ({ ...prev, [item.id]: parseScoreInput(e.target.value) }))
                        }
                        onKeyDown={blockNonNumericKeys}
                        sx={{ width: 54, ...NUMBER_INPUT_SX }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <TextField
                        type="number"
                        size="small"
                        inputProps={{ min: 1, max: 5, step: 0.1 }}
                        value={objectives[item.id] ?? ""}
                        onChange={(e) =>
                          setObjectives((prev) => ({ ...prev, [item.id]: parseScoreInput(e.target.value) }))
                        }
                        onKeyDown={blockNonNumericKeys}
                        sx={{ width: 54, ...NUMBER_INPUT_SX }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <TextField
                        type="number"
                        size="small"
                        inputProps={{ min: 1, max: 5, step: 0.1 }}
                        value={achievements[item.id] ?? ""}
                        onChange={(e) =>
                          setAchievements((prev) => ({ ...prev, [item.id]: parseScoreInput(e.target.value) }))
                        }
                        onKeyDown={blockNonNumericKeys}
                        helperText={
                          hasPreviousObjective
                            ? t("evaluationForm.previousObjective", { value: previousObjective.toFixed(1) })
                            : undefined
                        }
                        sx={{ width: 54, ...NUMBER_INPUT_SX }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {isEdit ? t("evaluationForm.editTitle") : t("evaluationForm.newTitle")}
        </Typography>
        {selectedMember && (
          <Typography variant="body2" color="text.secondary">
            {selectedMember.full_name} — {selectedMember.position}
          </Typography>
        )}
      </Box>

      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>
              {t("common.retry")}
            </Button>
          }
        >
          {t("common.loadError")}
        </Alert>
      )}

      {submitError && (
        <Alert severity="error" onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Qui, quand */}
      <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }}>
          <TextField
            select
            label={t("dashboard.manager.member")}
            value={userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            sx={{ minWidth: 220 }}
            disabled={isEdit}
            size="small"
          >
            {members.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.full_name || m.email} — {m.position}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("evaluationCampaigns.selectCampaign")}
            value={campaignId}
            onChange={(e) => setCampaignId(Number(e.target.value))}
            size="small"
            sx={{ minWidth: 240 }}
            disabled={isEdit || (!isEdit && availableCampaigns.length === 0)}
            required
            helperText={
              !isEdit && availableCampaigns.length === 0
                ? t("evaluationCampaigns.noCampaign")
                : !campaignId
                  ? t("evaluationCampaigns.selectCampaignHint")
                  : " "
            }
          >
            {availableCampaigns.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack sx={{ flexGrow: 1 }} />
          {selectedMember && (
            <Avatar
              src={selectedMember.avatar ?? undefined}
              sx={{ width: 64, height: 64, fontSize: 24, bgcolor: "primary.main" }}
            >
              {(selectedMember.full_name || selectedMember.email).charAt(0).toUpperCase()}
            </Avatar>
          )}
        </Stack>
      </Paper>

      {/* Objectifs globaux + aperçu Altitude */}
      <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ md: "center" }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label={t("evaluationForm.businessScore")}
              type="number"
              value={businessScore}
              onChange={(e) => setBusinessScore(Number(e.target.value))}
              onKeyDown={blockNonNumericKeys}
              size="small"
              sx={{ maxWidth: 200, ...NUMBER_INPUT_SX }}
            />
            <TextField
              label={t("evaluationForm.peopleScore")}
              type="number"
              value={peopleScore}
              onChange={(e) => setPeopleScore(Number(e.target.value))}
              onKeyDown={blockNonNumericKeys}
              size="small"
              sx={{ maxWidth: 200, ...NUMBER_INPUT_SX }}
            />
          </Stack>
          <Stack sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="caption" color="text.secondary">
                {t("dashboard.manager.altitude")}
              </Typography>
              <Typography variant="h5" fontWeight={700} sx={{ color: performanceColors[previewRating], lineHeight: 1 }}>
                {previewAltitude}%
              </Typography>
            </Box>
            <Chip
              label={t(`common.performance.${previewRating}`)}
              sx={{
                bgcolor: performanceColors[previewRating] + "22",
                color: performanceColors[previewRating],
                fontWeight: 600,
              }}
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Compétences */}
      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        {hardItems.length > 0 && renderSkillCard(hardItems, HARD_COLOR, t("evaluationForm.aptitudes"), "HSI", "HSO", hsi, hso)}
        {softItems.length > 0 && renderSkillCard(softItems, SOFT_COLOR, t("evaluationForm.attitudes"), "SSI", "SSO", ssi, sso)}
      </Stack>

      {!userId && (
        <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
          ⚠️ {t("evaluationForm.selectMemberFirst")}
        </Typography>
      )}
      {userId && !campaignId && (
        <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
          ⚠️ {t("evaluationForm.selectCampaignFirst")}
        </Typography>
      )}
      {userId && campaignId && allSelectedItems.length > 0 && !allCurrentScoresFilled && (
        <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
          ⚠️ {t("evaluationForm.fillAllCurrent")}
        </Typography>
      )}

      {/* Actions */}
      <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ pt: 1 }}>
        <Button onClick={() => navigate("/evaluations")} variant="outlined">
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!userId || !campaignId || !allCurrentScoresFilled}
          sx={{ minWidth: 120 }}
        >
          {t("common.save")}
        </Button>
      </Stack>
    </Stack>
  );
}
