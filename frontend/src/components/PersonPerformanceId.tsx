import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { apiClient } from "@/api/client";
import { HARD_SKILLS_COLOR, SOFT_SKILLS_COLOR, performanceColors } from "@/theme";
import type {
  Evaluation,
  Paginated,
  PerformanceProfile,
  SkillNote,
  SkillNoteCategory,
  TeamRelationship,
  UserRecord,
} from "@/api/types";

const HEADER_ORANGE = "#E08A34"; // orange du logo — même bandeau que le Plan de Développement du Manager
const CREAM = "#f5efd6";

// Champs compacts : police et hauteur réduites pour tenir la fiche entière
// sans scroll excessif — appliqué à tous les TextField de cette page.
const COMPACT_INPUT_SX = {
  "& .MuiInputBase-input": { fontSize: 12, paddingTop: "4px", paddingBottom: "4px" },
  "& .MuiInputBase-input::placeholder": { fontSize: 12 },
} as const;

type ListKey =
  | "qualifications"
  | "previous_positions"
  | "professional_achievements"
  | "personal_achievements"
  | "professional_role_models"
  | "role_models_in_life"
  | "dislikes"
  | "motivates"
  | "personality_traits"
  | "hobbies"
  | "brings_to_team"
  | "brings_to_manager"
  | "expects_from_team"
  | "expects_from_manager"
  | "dev_priorities"
  | "dev_professional_perspectives"
  | "dev_actions_support"
  | "dev_risks_obstacles";

type ProfileForm = Record<ListKey, string[]> & {
  gender: string;
  contract_type: string;
  vision_aspirations: string;
  personal_projects: string;
  bono_hat: string;
};

function emptyForm(): ProfileForm {
  return {
    gender: "",
    contract_type: "",
    vision_aspirations: "",
    personal_projects: "",
    bono_hat: "",
    qualifications: [],
    previous_positions: [],
    professional_achievements: [],
    personal_achievements: [],
    professional_role_models: [],
    role_models_in_life: [],
    dislikes: [],
    motivates: [],
    personality_traits: [],
    hobbies: [],
    brings_to_team: [],
    brings_to_manager: [],
    expects_from_team: [],
    expects_from_manager: [],
    dev_priorities: [],
    dev_professional_perspectives: [],
    dev_actions_support: [],
    dev_risks_obstacles: [],
  };
}

function padTo(value: string[], rows: number): string[] {
  const arr = [...value];
  while (arr.length < rows) arr.push("");
  return arr.slice(0, rows);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: HEADER_ORANGE, color: "#fff", borderRadius: 1, px: 1.5, py: 0.5, textAlign: "center" }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {children}
      </Typography>
    </Box>
  );
}

function ListField({
  label,
  value,
  rows,
  onChange,
}: {
  label?: string;
  value: string[];
  rows: number;
  onChange: (v: string[]) => void;
}) {
  const items = padTo(value, rows);
  return (
    <Stack spacing={0.5} sx={{ flex: 1 }}>
      {label && (
        <Typography variant="caption" fontWeight={700} color="text.secondary">
          {label}
        </Typography>
      )}
      {items.map((v, i) => (
        <TextField
          key={i}
          size="small"
          fullWidth
          value={v}
          placeholder={`${i + 1}.`}
          onChange={(e) => {
            const next = [...items];
            next[i] = e.target.value;
            onChange(next);
          }}
          sx={COMPACT_INPUT_SX}
        />
      ))}
    </Stack>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <TextField size="small" value={value} InputProps={{ readOnly: true }} sx={{ bgcolor: "action.hover", width: 160, ...COMPACT_INPUT_SX }} />
    </Stack>
  );
}

const SKILL_ORDERS = [1, 2, 3, 4, 5];

function SkillNoteReadColumn({ label, color, notes }: { label: string; color: string; notes: SkillNote[] }) {
  return (
    <Stack spacing={0.5} sx={{ flex: 1 }}>
      <Box sx={{ bgcolor: color, color: "#fff", borderRadius: 1, px: 1, py: 0.25, display: "flex", justifyContent: "space-between" }}>
        <Typography variant="caption" fontWeight={700}>
          {label}
        </Typography>
        <Typography variant="caption" fontWeight={700}>
          SI
        </Typography>
      </Box>
      {SKILL_ORDERS.map((order) => {
        const note = notes.find((n) => n.order === order);
        return (
          <Stack key={order} direction="row" spacing={0.5}>
            <TextField size="small" fullWidth value={note?.text ?? ""} InputProps={{ readOnly: true }} sx={COMPACT_INPUT_SX} />
            <TextField size="small" sx={{ width: 40, ...COMPACT_INPUT_SX }} value={note?.score ?? ""} InputProps={{ readOnly: true }} />
          </Stack>
        );
      })}
    </Stack>
  );
}

function RelationshipList({
  title,
  relationships,
  candidates,
  onAdd,
  onRemove,
}: {
  title: string;
  relationships: TeamRelationship[];
  candidates: UserRecord[];
  onAdd: (toUserId: number) => void;
  onRemove: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState<number | "">("");
  const usedIds = new Set(relationships.map((r) => r.to_user));
  const available = candidates.filter((c) => !usedIds.has(c.id));

  return (
    <Stack spacing={0.5} sx={{ flex: 1 }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary">
        {title}
      </Typography>
      {relationships.map((r) => (
        <Stack key={r.id} direction="row" spacing={0.5} alignItems="center">
          <TextField size="small" fullWidth value={r.to_user_name} InputProps={{ readOnly: true }} sx={COMPACT_INPUT_SX} />
          <IconButton size="small" onClick={() => onRemove(r.id)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      {available.length > 0 && (
        <TextField
          select
          size="small"
          fullWidth
          value={pick}
          label={t("performanceId.addPerson")}
          onChange={(e) => {
            const id = Number(e.target.value);
            setPick("");
            onAdd(id);
          }}
          sx={COMPACT_INPUT_SX}
        >
          {available.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.full_name || c.email}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Stack>
  );
}

export default function PersonPerformanceId({
  people,
  selectablePeople,
}: {
  people: UserRecord[];
  selectablePeople?: UserRecord[];
}) {
  const selectable = selectablePeople ?? people;
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [skillNotes, setSkillNotes] = useState<SkillNote[]>([]);
  const [relationships, setRelationships] = useState<TeamRelationship[]>([]);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedUser = people.find((p) => p.id === selectedId) ?? null;
  const managerOf = selectedUser?.manager != null ? people.find((p) => p.id === selectedUser.manager) : null;

  useEffect(() => {
    if (selectedId === "") return;
    setSaved(false);
    apiClient.get<Paginated<Evaluation>>("/evaluations/", { params: { user: selectedId, page_size: 500 } }).then((r) => setEvaluations(r.data.results));
    apiClient.get<Paginated<PerformanceProfile>>("/performance-profiles/", { params: { user: selectedId } }).then((r) => {
      const p = r.data.results[0];
      setForm(
        p
          ? {
              gender: p.gender,
              contract_type: p.contract_type,
              vision_aspirations: p.vision_aspirations,
              personal_projects: p.personal_projects,
              bono_hat: p.bono_hat,
              qualifications: p.qualifications,
              previous_positions: p.previous_positions,
              professional_achievements: p.professional_achievements,
              personal_achievements: p.personal_achievements,
              professional_role_models: p.professional_role_models,
              role_models_in_life: p.role_models_in_life,
              dislikes: p.dislikes,
              motivates: p.motivates,
              personality_traits: p.personality_traits,
              hobbies: p.hobbies,
              brings_to_team: p.brings_to_team,
              brings_to_manager: p.brings_to_manager,
              expects_from_team: p.expects_from_team,
              expects_from_manager: p.expects_from_manager,
              dev_priorities: p.dev_priorities,
              dev_professional_perspectives: p.dev_professional_perspectives,
              dev_actions_support: p.dev_actions_support,
              dev_risks_obstacles: p.dev_risks_obstacles,
            }
          : emptyForm()
      );
    });
  }, [selectedId]);

  useEffect(() => {
    if (selectedUser?.department) {
      apiClient
        .get<Paginated<TeamRelationship>>("/team-relationships/", { params: { team: selectedUser.department, page_size: 200 } })
        .then((r) => setRelationships(r.data.results.filter((rel) => rel.from_user === selectedUser.id)));
    } else {
      setRelationships([]);
    }
  }, [selectedUser?.department, selectedUser?.id]);

  const history = useMemo(
    () =>
      evaluations
        .map((e) => ({ year: e.campaign_start_date.slice(0, 4), value: Math.round(Number(e.altitude_percentage)), rating: e.performance_rating, id: e.id }))
        .sort((a, b) => a.year.localeCompare(b.year)),
    [evaluations]
  );
  const latestEvaluation = evaluations.length
    ? [...evaluations].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date))[evaluations.length - 1]
    : null;

  useEffect(() => {
    if (latestEvaluation) {
      apiClient
        .get<Paginated<SkillNote>>("/skill-notes/", { params: { evaluation: latestEvaluation.id, page_size: 100 } })
        .then((r) => setSkillNotes(r.data.results));
    } else {
      setSkillNotes([]);
    }
  }, [latestEvaluation?.id]);

  function notesFor(category: SkillNoteCategory) {
    return skillNotes.filter((n) => n.category === category);
  }

  function setList(key: ListKey, value: string[]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    if (selectedId === "") return;
    setSaving(true);
    try {
      await apiClient.put("/performance-profiles/save-for-user/", { user: selectedId, ...form });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function addRelationship(quality: "EXCELLENT" | "DIFFICULT", toUserId: number) {
    if (!selectedUser?.department) return;
    await apiClient.post("/team-relationships/", { team: selectedUser.department, from_user: selectedUser.id, to_user: toUserId, quality });
    const r = await apiClient.get<Paginated<TeamRelationship>>("/team-relationships/", { params: { team: selectedUser.department, page_size: 200 } });
    setRelationships(r.data.results.filter((rel) => rel.from_user === selectedUser.id));
  }

  async function removeRelationship(id: number) {
    await apiClient.delete(`/team-relationships/${id}/`);
    setRelationships((prev) => prev.filter((r) => r.id !== id));
  }

  const teamCandidates = selectedUser ? people.filter((p) => p.department === selectedUser.department && p.id !== selectedUser.id) : [];

  return (
    <Stack spacing={2}>
      <TextField
        select
        size="small"
        label={t("performanceId.selectPerson")}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value === "" ? "" : Number(e.target.value))}
        sx={{ minWidth: 280 }}
      >
        {selectable.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.full_name || p.email}
            {p.department_name ? ` — ${p.department_name}` : ""}
          </MenuItem>
        ))}
      </TextField>

      {selectedUser && (
        <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
          <Paper elevation={0} sx={{ py: 1, mb: 2, textAlign: "center", bgcolor: CREAM, border: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ color: "primary.main" }}>
              {t("performanceId.title", { name: selectedUser.full_name || selectedUser.email }).toUpperCase()}
            </Typography>
          </Paper>

          {/* Ligne 1 : photo + informations professionnelles + réalisations + performance */}
          <Box sx={{ display: "grid", gridTemplateColumns: "180px 1.6fr 1.6fr 1.2fr", gap: 1.5, mb: 2 }}>
            <Stack spacing={1} alignItems="center">
              <Avatar
                src={selectedUser.avatar ?? undefined}
                sx={{
                  width: 160,
                  height: 160,
                  border: "2px solid",
                  borderColor: latestEvaluation ? performanceColors[latestEvaluation.performance_rating] : "divider",
                }}
              >
                {(selectedUser.full_name || selectedUser.email).charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="body2" fontWeight={700}>
                {selectedUser.full_name}
              </Typography>
            </Stack>

            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.professionalInfo")}</SectionHeader>
              <Stack direction="row" spacing={1.5}>
                <Stack spacing={0.5} sx={{ flex: 1 }}>
                  <ReadOnlyField label={t("performanceId.age")} value={selectedUser.age != null ? String(selectedUser.age) : "—"} />
                  <ReadOnlyField label={t("performanceId.yearsInPosition")} value={selectedUser.years_in_current_role != null ? String(selectedUser.years_in_current_role) : "—"} />
                  <ReadOnlyField label={t("performanceId.yearsInCompany")} value={selectedUser.years_in_company != null ? String(selectedUser.years_in_company) : "—"} />
                  <ReadOnlyField label={t("performanceId.totalExperience")} value={selectedUser.total_experience_years != null ? String(selectedUser.total_experience_years) : "—"} />
                  <Stack spacing={0.25}>
                    <Typography variant="caption" color="text.secondary">
                      {t("performanceId.gender")}
                    </Typography>
                    <TextField size="small" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} sx={{ width: 160, ...COMPACT_INPUT_SX }} />
                  </Stack>
                  <Stack spacing={0.25}>
                    <Typography variant="caption" color="text.secondary">
                      {t("performanceId.contractType")}
                    </Typography>
                    <TextField size="small" value={form.contract_type} onChange={(e) => setForm((f) => ({ ...f, contract_type: e.target.value }))} sx={{ width: 160, ...COMPACT_INPUT_SX }} />
                  </Stack>
                  <ReadOnlyField label={t("performanceId.reportTo")} value={managerOf?.full_name ?? "—"} />
                </Stack>
                <Stack spacing={1} sx={{ flex: 1 }}>
                  <ListField label={t("performanceId.qualifications")} value={form.qualifications} rows={5} onChange={(v) => setList("qualifications", v)} />
                  <ListField label={t("performanceId.previousPositions")} value={form.previous_positions} rows={2} onChange={(v) => setList("previous_positions", v)} />
                </Stack>
              </Stack>
            </Stack>

            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.achievements")}</SectionHeader>
              <Stack direction="row" spacing={1.5}>
                <ListField label={t("performanceId.professionalAchievements")} value={form.professional_achievements} rows={5} onChange={(v) => setList("professional_achievements", v)} />
                <ListField label={t("performanceId.personalAchievements")} value={form.personal_achievements} rows={5} onChange={(v) => setList("personal_achievements", v)} />
              </Stack>
              {latestEvaluation && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Chip
                    size="small"
                    label={`${t("performanceId.performancePct")}: ${latestEvaluation.altitude_percentage}%`}
                    sx={{ bgcolor: performanceColors[latestEvaluation.performance_rating] + "22", color: performanceColors[latestEvaluation.performance_rating], fontWeight: 700 }}
                  />
                  <Chip
                    size="small"
                    label={t(`common.performance.${latestEvaluation.performance_rating}`)}
                    sx={{ bgcolor: performanceColors[latestEvaluation.performance_rating], color: "#fff", fontWeight: 700 }}
                  />
                </Stack>
              )}
            </Stack>

            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.performanceRecord")}</SectionHeader>
              {history.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={history} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e1e0d9" />
                    <XAxis dataKey="year" tick={{ fill: "#898781", fontSize: 11 }} tickLine={false} />
                    <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                    <Line type="monotone" dataKey="value" stroke={HEADER_ORANGE} strokeWidth={2.5} dot={{ r: 3, fill: HEADER_ORANGE, strokeWidth: 0 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
                  {t("evaluations.notEvaluated")}
                </Typography>
              )}
              {latestEvaluation && (
                <Stack direction="row" spacing={1} justifyContent="center">
                  <Chip size="small" label={`HSI ${latestEvaluation.hsi}`} sx={{ bgcolor: HARD_SKILLS_COLOR + "22", color: HARD_SKILLS_COLOR, fontWeight: 700 }} />
                  <Chip size="small" label={`SSI ${latestEvaluation.ssi}`} sx={{ bgcolor: SOFT_SKILLS_COLOR + "22", color: SOFT_SKILLS_COLOR, fontWeight: 700 }} />
                </Stack>
              )}
            </Stack>
          </Box>

          {/* Ligne 2 : forces / faiblesses / vision & projets / dynamique d'équipe / ID-3A */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 1fr 2.4fr 1fr", gap: 1.5, mb: 2 }}>
            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.keyStrengths")}</SectionHeader>
              <SkillNoteReadColumn label={t("managerDevPlan.hardSkills")} color={HARD_SKILLS_COLOR} notes={notesFor("HARD_STRENGTH")} />
              <SkillNoteReadColumn label={t("managerDevPlan.softSkills")} color={SOFT_SKILLS_COLOR} notes={notesFor("SOFT_STRENGTH")} />
            </Stack>
            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.areasOfImprovement")}</SectionHeader>
              <SkillNoteReadColumn label={t("managerDevPlan.hardSkills")} color={HARD_SKILLS_COLOR} notes={notesFor("HARD_WEAKNESS")} />
              <SkillNoteReadColumn label={t("managerDevPlan.softSkills")} color={SOFT_SKILLS_COLOR} notes={notesFor("SOFT_WEAKNESS")} />
            </Stack>
            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.vision")}</SectionHeader>
              <TextField multiline minRows={6} fullWidth value={form.vision_aspirations} onChange={(e) => setForm((f) => ({ ...f, vision_aspirations: e.target.value }))} sx={{ bgcolor: CREAM, ...COMPACT_INPUT_SX }} />
              <SectionHeader>{t("performanceId.personalProjects")}</SectionHeader>
              <TextField multiline minRows={4} fullWidth value={form.personal_projects} onChange={(e) => setForm((f) => ({ ...f, personal_projects: e.target.value }))} sx={{ bgcolor: CREAM, ...COMPACT_INPUT_SX }} />
            </Stack>
            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.teamDynamics")}</SectionHeader>
              <Stack direction="row" spacing={1.5}>
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  <RelationshipList
                    title={t("performanceId.excellentWith")}
                    relationships={relationships.filter((r) => r.quality === "EXCELLENT")}
                    candidates={teamCandidates}
                    onAdd={(id) => addRelationship("EXCELLENT", id)}
                    onRemove={removeRelationship}
                  />
                  <RelationshipList
                    title={t("performanceId.difficultWith")}
                    relationships={relationships.filter((r) => r.quality === "DIFFICULT")}
                    candidates={teamCandidates}
                    onAdd={(id) => addRelationship("DIFFICULT", id)}
                    onRemove={removeRelationship}
                  />
                  <ListField label={t("performanceId.dislikes")} value={form.dislikes} rows={4} onChange={(v) => setList("dislikes", v)} />
                </Stack>
                <Stack spacing={1.5} sx={{ flex: 1 }}>
                  <ListField label={t("performanceId.professionalRoleModels")} value={form.professional_role_models} rows={4} onChange={(v) => setList("professional_role_models", v)} />
                  <ListField label={t("performanceId.roleModelsInLife")} value={form.role_models_in_life} rows={2} onChange={(v) => setList("role_models_in_life", v)} />
                  <ListField label={t("performanceId.motivates")} value={form.motivates} rows={4} onChange={(v) => setList("motivates", v)} />
                </Stack>
              </Stack>
            </Stack>
            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.id3a")}</SectionHeader>
              {latestEvaluation ? (
                <Box sx={{ position: "relative", width: "100%", aspectRatio: "1", border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
                  <Box sx={{ position: "absolute", left: "50%", top: 0, bottom: 0, borderLeft: "1px dashed", borderColor: "divider" }} />
                  <Box sx={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px dashed", borderColor: "divider" }} />
                  <Box
                    sx={{
                      position: "absolute",
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: performanceColors[latestEvaluation.performance_rating],
                      left: `${(Number(latestEvaluation.hsi) / 5) * 100}%`,
                      bottom: `${(Number(latestEvaluation.ssi) / 5) * 100}%`,
                      transform: "translate(-50%, 50%)",
                      boxShadow: "0 0 0 3px rgba(255,255,255,0.6)",
                    }}
                  />
                </Box>
              ) : (
                <Box sx={{ width: "100%", aspectRatio: "1", border: "1px solid", borderColor: "divider" }} />
              )}
              <ListField label={t("performanceId.hobbies")} value={form.hobbies} rows={2} onChange={(v) => setList("hobbies", v)} />
              <ListField label={t("performanceId.personalityTraits")} value={form.personality_traits} rows={3} onChange={(v) => setList("personality_traits", v)} />
              <Stack spacing={0.25}>
                <Typography variant="caption" color="text.secondary">
                  {t("performanceId.bonoHat")}
                </Typography>
                <TextField size="small" value={form.bono_hat} onChange={(e) => setForm((f) => ({ ...f, bono_hat: e.target.value }))} sx={{ width: 200, ...COMPACT_INPUT_SX }} />
              </Stack>
            </Stack>
          </Box>

          {/* Ligne 3 : contribution */}
          <Stack spacing={1} sx={{ mb: 2 }}>
            <SectionHeader>{t("performanceId.contribution")}</SectionHeader>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5 }}>
              <ListField label={t("performanceId.bringsToTeam")} value={form.brings_to_team} rows={4} onChange={(v) => setList("brings_to_team", v)} />
              <ListField label={t("performanceId.bringsToManager")} value={form.brings_to_manager} rows={3} onChange={(v) => setList("brings_to_manager", v)} />
              <ListField label={t("performanceId.expectsFromTeam")} value={form.expects_from_team} rows={3} onChange={(v) => setList("expects_from_team", v)} />
              <ListField label={t("performanceId.expectsFromManager")} value={form.expects_from_manager} rows={3} onChange={(v) => setList("expects_from_manager", v)} />
            </Box>
          </Stack>

          {/* Ligne 4 : plan de développement personnel */}
          <Stack spacing={1}>
            <SectionHeader>{t("performanceId.personalDevPlan")}</SectionHeader>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5 }}>
              <ListField label={t("performanceId.priorities")} value={form.dev_priorities} rows={4} onChange={(v) => setList("dev_priorities", v)} />
              <ListField label={t("performanceId.professionalPerspectives")} value={form.dev_professional_perspectives} rows={4} onChange={(v) => setList("dev_professional_perspectives", v)} />
              <ListField label={t("performanceId.actionsToSupport")} value={form.dev_actions_support} rows={3} onChange={(v) => setList("dev_actions_support", v)} />
              <ListField label={t("performanceId.risksObstacles")} value={form.dev_risks_obstacles} rows={3} onChange={(v) => setList("dev_risks_obstacles", v)} />
            </Box>
          </Stack>

          <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={2} sx={{ mt: 2 }}>
            {saved && (
              <Alert severity="success" sx={{ py: 0 }}>
                {t("performanceId.saved")}
              </Alert>
            )}
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {t("common.save")}
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
