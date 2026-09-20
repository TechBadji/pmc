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
import { useTranslation } from "react-i18next";
import { DecimalField } from "@/components/inputs/DecimalField";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { apiMessage, fmtNum, hasExtraDecimals, nameList, outOfRange } from "@/utils/evaluationValidation";
import { useIssues } from "@/utils/validation";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type {
  Evaluation,
  EvaluationCampaign,
  Paginated,
  SkillItem,
  SkillMatrix,
  UserRecord,
} from "@/api/types";
import { HARD_SKILLS_COLOR as HARD_COLOR, SOFT_SKILLS_COLOR as SOFT_COLOR, performanceColors } from "@/theme";
// Barème unique : recopié ici, il aurait fini par diverger de celui des
// tableaux de bord et deux écrans auraient affiché deux paliers différents.
import { ratingForAltitude as ratingFor } from "@/utils/performance";

type ScoreState = Record<number, number | "">;

/**
 * Une note de compétence : la saisie décimale commune, plus le barème 1-5.
 *
 * Hors de cette plage, le champ le signale — c'est ce que faisaient `min` et
 * `max`, qui n'ont plus cours sur un champ texte, et le serveur refuse de
 * toute façon la valeur.
 */
function ScoreField({
  value,
  onChange,
  helperText,
  invalid,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
  helperText?: string;
  invalid?: boolean;
}) {
  return (
    <DecimalField
      value={value}
      onChange={onChange}
      helperText={helperText}
      error={invalid || outOfRange(value, 1, 5)}
      width={54}
      decimals={1}
      ariaLabel="note"
    />
  );
}

/** Un taux d'atteinte en pourcentage : même saisie, sans le barème 1-5 — ces
 *  deux champs se comptent en dizaines, et un dépassement de 100 % y est un
 *  bon résultat, pas une erreur. */
function PercentField({
  label,
  value,
  onChange,
  error,
  helperText,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  error?: boolean;
  helperText?: string;
}) {
  return (
    <DecimalField
      label={label}
      value={value}
      onChange={(v) => onChange(v === "" ? 0 : v)}
      error={error || outOfRange(value, 0, 200)}
      helperText={helperText}
      sx={{ maxWidth: 200 }}
    />
  );
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
  const [saving, setSaving] = useState(false);
  const { issues, check, clear, has, messageFor } = useIssues();

  // Un Company Admin évalue directement les managers ; les collaborateurs
  // sont évalués par leur propre manager (même règle que EvaluationsPage,
  // et désormais également appliquée côté backend).
  const evaluatedRole = authUser?.role === "COMPANY_ADMIN" ? "MANAGER" : undefined;

  useEffect(() => {
    setLoadError(false);
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { page_size: 500, ...(evaluatedRole ? { role: evaluatedRole } : {}) } })
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
  }, [authUser?.company, evaluatedRole]);

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

  const memberName = selectedMember?.full_name || selectedMember?.email || "";
  const chosenCampaign = campaigns.find((c) => c.id === campaignId);

  // Toute modification efface le constat précédent : il ne doit pas rester affiché sur une saisie corrigée.
  function edited() {
    if (issues.length) clear();
  }

  function validate(): boolean {
    const missing = allSelectedItems.filter((item) => scores[item.id] === undefined || scores[item.id] === "");
    const scaleRules = allSelectedItems.flatMap((item) =>
      (
        [
          ["score", scores, "fieldCurrent"],
          ["objective", objectives, "fieldObjective"],
          ["achieved", achievements, "fieldAchieved"],
        ] as const
      ).flatMap(([kind, source, label]) => {
        const value = source[item.id];
        const decimals = typeof value === "number" && hasExtraDecimals(value);
        return [
          [
            outOfRange(value, 1, 5),
            t("validation.evaluationForm.scoreRange", { label: t(`validation.evaluationForm.${label}`), skill: item.name, value: fmtNum(Number(value)) }),
            `${kind}:${item.id}`,
          ],
          [
            decimals,
            t("validation.evaluationForm.scoreDecimals", { label: t(`validation.evaluationForm.${label}`), skill: item.name, value: fmtNum(Number(value)) }),
            `${kind}:${item.id}`,
          ],
        ] as const;
      })
    );
    return check([
      [!userId, t("validation.evaluationForm.memberRequired"), "member"],
      [!campaignId, t("validation.evaluationForm.campaignRequired"), "campaign"],
      [!isEdit && !!campaignId && !!chosenCampaign?.is_closed, t("validation.evaluationForm.campaignClosed", { name: chosenCampaign?.name }), "campaign"],
      [
        !isEdit && !!campaignId && usedCampaignIds.has(Number(campaignId)),
        t("validation.evaluationForm.campaignUsed", { member: memberName, name: chosenCampaign?.name }),
        "campaign",
      ],
      [!!userId && hardItems.length + softItems.length === 0, t("validation.evaluationForm.noSkills", { member: memberName })],
      [hardItems.length + softItems.length > 0 && allSelectedItems.length === 0, t("validation.evaluationForm.noSkillSelected")],
      [
        missing.length > 0,
        t("validation.evaluationForm.missingScores", {
          count: missing.length,
          names: nameList(missing.map((item) => item.name), (n) => t("validation.evaluationForm.andOthers", { count: n })),
        }),
        "missing",
      ],
      ...scaleRules,
      [outOfRange(businessScore, 0, 200), t("validation.evaluationForm.businessRange", { value: fmtNum(businessScore) }), "business"],
      [outOfRange(peopleScore, 0, 200), t("validation.evaluationForm.peopleRange", { value: fmtNum(peopleScore) }), "people"],
      [hasExtraDecimals(businessScore), t("validation.evaluationForm.decimalsPercent", { which: "Business", value: fmtNum(businessScore) }), "business"],
      [hasExtraDecimals(peopleScore), t("validation.evaluationForm.decimalsPercent", { which: "People", value: fmtNum(peopleScore) }), "people"],
    ]);
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitError(null);
    setSaving(true);
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
      // L'écran affiche lui-même le motif du refus : pas de second message en bulle.
      if (isEdit) {
        await apiClient.put(`/evaluations/${id}/`, payload, { silent: true });
      } else {
        await apiClient.post("/evaluations/", payload, { silent: true });
      }
      navigate("/evaluations");
    } catch (err) {
      setSubmitError(apiMessage(err));
    } finally {
      setSaving(false);
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
              {items.map((item, i) => {
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
                          edited();
                          setSelectedSkills(newSelected);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {i + 1}. {item.name}
                    </TableCell>
                    <TableCell align="center">
                      <ScoreField
                        value={scores[item.id] ?? ""}
                        invalid={has(`score:${item.id}`) || (has("missing") && selectedSkills.has(item.id) && (scores[item.id] ?? "") === "")}
                        onChange={(v) => {
                          edited();
                          setScores((prev) => ({ ...prev, [item.id]: v }));
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <ScoreField
                        value={objectives[item.id] ?? ""}
                        invalid={has(`objective:${item.id}`)}
                        onChange={(v) => {
                          edited();
                          setObjectives((prev) => ({ ...prev, [item.id]: v }));
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <ScoreField
                        value={achievements[item.id] ?? ""}
                        invalid={has(`achieved:${item.id}`)}
                        onChange={(v) => {
                          edited();
                          setAchievements((prev) => ({ ...prev, [item.id]: v }));
                        }}
                        helperText={
                          hasPreviousObjective
                            ? t("evaluationForm.previousObjective", { value: previousObjective.toFixed(1) })
                            : undefined
                        }
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
            onChange={(e) => {
              edited();
              setUserId(Number(e.target.value));
            }}
            sx={{ minWidth: 220 }}
            disabled={isEdit}
            size="small"
            error={has("member")}
            helperText={messageFor("member")}
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
            onChange={(e) => {
              edited();
              setCampaignId(Number(e.target.value));
            }}
            size="small"
            error={has("campaign")}
            sx={{ minWidth: 240 }}
            disabled={isEdit || (!isEdit && availableCampaigns.length === 0)}
            required
            helperText={
              has("campaign")
                ? messageFor("campaign")
                : !isEdit && availableCampaigns.length === 0
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
            <PercentField
              label={t("evaluationForm.businessScore")}
              value={businessScore}
              onChange={(v) => {
                edited();
                setBusinessScore(v);
              }}
              error={has("business")}
            />
            <PercentField
              label={t("evaluationForm.peopleScore")}
              value={peopleScore}
              onChange={(v) => {
                edited();
                setPeopleScore(v);
              }}
              error={has("people")}
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

      <ValidationSummary issues={issues} onClose={clear} />

      {/* Actions */}
      <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ pt: 1 }}>
        <Button onClick={() => navigate("/evaluations")} variant="outlined">
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          sx={{ minWidth: 120 }}
        >
          {t("common.save")}
        </Button>
      </Stack>
    </Stack>
  );
}
