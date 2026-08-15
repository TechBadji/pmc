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
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { apiClient } from "@/api/client";
import { CHART_NEUTRALS, HARD_SKILLS_COLOR, SOFT_SKILLS_COLOR, performanceColors } from "@/theme";
import type {
  Evaluation,
  Paginated,
  PerformanceProfile,
  PerformanceRating,
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
  // minWidth: 0 — sans ça, la largeur mini d'un <input> vient de son attribut
  // `size` natif (~180 px) : les colonnes de la grille se calent sur cette
  // largeur et cessent d'être égales dès que la place manque.
  "& .MuiInputBase-input": { fontSize: 12, paddingTop: "4px", paddingBottom: "4px", minWidth: 0 },
  "& .MuiInputBase-input::placeholder": { fontSize: 12 },
} as const;

// Informations professionnelles (Âge, Anciennetés, Genre, Type de contrat,
// Rattaché à…) : ces champs ne portent qu'un nombre ou un mot, la place
// récupérée revient à la colonne Qualifications, elle bien plus dense.
const INFO_FIELD_WIDTH = 100;
// Largeur de la colonne identité : les champs y font INFO_FIELD_WIDTH, la
// marge restante allant aux intitulés ("Ancienneté entreprise") pour qu'ils
// tiennent sur une ligne. Elle est fixe, c'est ce qui permet aux colonnes de
// champs voisines d'être exactement égales entre elles.
const IDENTITY_COL_WIDTH = 120;

// Contribution / Plan de développement personnel : champs réduits d'environ
// moitié par rapport à COMPACT_INPUT_SX (hauteur et police).
const EXTRA_COMPACT_INPUT_SX = {
  "& .MuiInputBase-input": { fontSize: 11, paddingTop: "1px", paddingBottom: "1px", minWidth: 0 },
  "& .MuiInputBase-input::placeholder": { fontSize: 11 },
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
  dense,
  multiline,
}: {
  label?: string;
  value: string[];
  rows: number;
  onChange: (v: string[]) => void;
  dense?: boolean;
  /** Cases hautes : le texte revient à la ligne et la case grandit avec lui,
   * au lieu de défiler horizontalement sur une seule ligne. */
  multiline?: boolean;
}) {
  const items = padTo(value, rows);
  const baseSx = dense ? EXTRA_COMPACT_INPUT_SX : COMPACT_INPUT_SX;
  // Cases multilignes : interligne resserré et pas de hauteur plancher — la
  // case fait une ligne quand elle est vide ou courte, et ne prend deux
  // lignes que si le texte les remplit vraiment.
  const fieldSx = multiline
    ? { ...baseSx, "& .MuiInputBase-input": { ...baseSx["& .MuiInputBase-input"], lineHeight: 1.2 } }
    : baseSx;

  function update(index: number, text: string) {
    const next = [...items];
    next[index] = text;
    onChange(next);
  }

  return (
    <Stack spacing={dense ? 0.25 : 0.5} sx={{ flex: 1, minWidth: 0 }}>
      {label && (
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={dense ? { fontSize: 11 } : undefined}>
          {label}
        </Typography>
      )}
      {items.map((v, i) => (
        <TextField
          key={i}
          size="small"
          fullWidth
          multiline={multiline}
          value={v}
          placeholder={`${i + 1}.`}
          onChange={(e) => update(i, e.target.value)}
          sx={fieldSx}
        />
      ))}
    </Stack>
  );
}

/** Mini-matrice ID-3A d'une personne : Aptitudes (HSI) en X, Attitudes (SSI)
 * en Y, quadrants et projections sur les axes — même langage visuel que la
 * page Matrice ID-3A, en version carrée pour la fiche. */
function Id3aMiniMatrix({ hsi, ssi, altitude, rating }: { hsi: number; ssi: number; altitude: number; rating: PerformanceRating }) {
  const { t } = useTranslation();
  const S = 200; // repère carré, mis à l'échelle par le viewBox
  const ML = 24;
  const MB = 22;
  const MT = 10;
  const MR = 10;
  const plotW = S - ML - MR;
  const plotH = S - MT - MB;
  const x = (v: number) => ML + (v / 5) * plotW;
  const y = (v: number) => MT + plotH - (v / 5) * plotH;
  const color = performanceColors[rating];
  const quadrantLabel = { fontSize: 7, fontWeight: 700, letterSpacing: 0.3, fill: CHART_NEUTRALS.quadrantLabel } as const;
  const axisLabel = { fontSize: 7, fontWeight: 700, letterSpacing: 0.4, fill: CHART_NEUTRALS.axisTitle } as const;

  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ display: "block" }}>
      <rect x={ML} y={MT} width={plotW} height={plotH} fill="#f3f2ee" />

      {/* Séparateurs de quadrants + intitulés, comme sur la page Matrice. */}
      <line x1={x(2.5)} y1={y(5)} x2={x(2.5)} y2={y(0)} stroke="#e1e0d9" strokeDasharray="3 3" />
      <line x1={x(0)} y1={y(2.5)} x2={x(5)} y2={y(2.5)} stroke="#e1e0d9" strokeDasharray="3 3" />
      <text x={x(0) + 4} y={y(5) + 9} textAnchor="start" style={quadrantLabel}>
        {t("id3aMatrix.quadrantExperts").toUpperCase()}
      </text>
      <text x={x(5) - 4} y={y(5) + 9} textAnchor="end" style={quadrantLabel}>
        {t("id3aMatrix.quadrantTalents").toUpperCase()}
      </text>
      <text x={x(0) + 4} y={y(0) - 5} textAnchor="start" style={quadrantLabel}>
        {t("id3aMatrix.quadrantWatch").toUpperCase()}
      </text>
      <text x={x(5) - 4} y={y(0) - 5} textAnchor="end" style={quadrantLabel}>
        {t("id3aMatrix.quadrantRelational").toUpperCase()}
      </text>

      {/* Axes gradués 0-5. */}
      <line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(5)} stroke={CHART_NEUTRALS.plotAxisLine} />
      <line x1={x(0)} y1={y(0)} x2={x(5)} y2={y(0)} stroke={CHART_NEUTRALS.plotAxisLine} />
      {[0, 1, 2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line x1={x(v)} y1={y(0)} x2={x(v)} y2={y(0) + 3} stroke={CHART_NEUTRALS.plotAxisLine} />
          <line x1={x(0) - 3} y1={y(v)} x2={x(0)} y2={y(v)} stroke={CHART_NEUTRALS.plotAxisLine} />
          <text x={x(v)} y={y(0) + 11} textAnchor="middle" fontSize={7} fill="#898781">
            {v}
          </text>
          <text x={x(0) - 5} y={y(v) + 2.5} textAnchor="end" fontSize={7} fill="#898781">
            {v}
          </text>
        </g>
      ))}
      <text x={ML + plotW / 2} y={S - 2} textAnchor="middle" style={axisLabel}>
        APTITUDES (HSI)
      </text>
      <text x={7} y={MT + plotH / 2} textAnchor="middle" transform={`rotate(-90 7 ${MT + plotH / 2})`} style={axisLabel}>
        ATTITUDES (SSI)
      </text>

      {/* Position de la personne : projections sur les deux axes, puis le point. */}
      <line x1={x(hsi)} y1={y(ssi)} x2={x(hsi)} y2={y(0)} stroke={color} strokeDasharray="2 2" />
      <line x1={x(0)} y1={y(ssi)} x2={x(hsi)} y2={y(ssi)} stroke={color} strokeDasharray="2 2" />
      <circle cx={x(hsi)} cy={y(ssi)} r={9} fill={color} opacity={0.18} />
      <circle cx={x(hsi)} cy={y(ssi)} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
      <text
        x={x(hsi) + (hsi > 3.5 ? -8 : 8)}
        y={y(ssi) - 7}
        textAnchor={hsi > 3.5 ? "end" : "start"}
        fontSize={10}
        fontWeight={700}
        fill={color}
      >
        {altitude}%
      </text>
    </svg>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <TextField size="small" value={value} InputProps={{ readOnly: true }} sx={{ bgcolor: "action.hover", width: INFO_FIELD_WIDTH, ...COMPACT_INPUT_SX }} />
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
        // Largeur fixe et calée à gauche : sans ça le Stack l'étire sur toute
        // la fiche, ce qui donne un sélecteur démesuré au-dessus du contenu.
        sx={{ width: 240, alignSelf: "flex-start" }}
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

          {/* Ligne 1 : photo + informations professionnelles + réalisations + performance.
           * La grille est découpée par CHAMP et non par section : identité à
           * largeur fixe, puis quatre colonnes égales (Qualifications, les deux
           * Réalisations, Historique). Les deux sections s'étendent chacune sur
           * deux colonnes, si bien que le champ Qualifications et les champs de
           * Réalisations ont exactement la même largeur à toutes les tailles
           * d'écran — un simple rapport de `fr` entre sections ne pouvait pas
           * le garantir, la section identité mangeant une largeur fixe. */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `180px ${IDENTITY_COL_WIDTH}px repeat(4, minmax(0, 1fr))`,
              gap: 1.5,
              mb: 2,
            }}
          >
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

            <Stack spacing={1} sx={{ gridColumn: "span 2", minWidth: 0 }}>
              <SectionHeader>{t("performanceId.professionalInfo")}</SectionHeader>
              <Stack direction="row" spacing={1.5}>
                {/* Colonne d'identité calée sur la 2e colonne de la grille :
                 * Qualifications tombe ainsi exactement sur la 3e. */}
                <Stack spacing={0.5} sx={{ flex: `0 0 ${IDENTITY_COL_WIDTH}px`, width: IDENTITY_COL_WIDTH }}>
                  <ReadOnlyField label={t("performanceId.age")} value={selectedUser.age != null ? String(selectedUser.age) : "—"} />
                  <ReadOnlyField label={t("performanceId.yearsInPosition")} value={selectedUser.years_in_current_role != null ? String(selectedUser.years_in_current_role) : "—"} />
                  <ReadOnlyField label={t("performanceId.yearsInCompany")} value={selectedUser.years_in_company != null ? String(selectedUser.years_in_company) : "—"} />
                  <ReadOnlyField label={t("performanceId.totalExperience")} value={selectedUser.total_experience_years != null ? String(selectedUser.total_experience_years) : "—"} />
                  <Stack spacing={0.25}>
                    <Typography variant="caption" color="text.secondary">
                      {t("performanceId.gender")}
                    </Typography>
                    <TextField size="small" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} sx={{ width: INFO_FIELD_WIDTH, ...COMPACT_INPUT_SX }} />
                  </Stack>
                  <Stack spacing={0.25}>
                    <Typography variant="caption" color="text.secondary">
                      {t("performanceId.contractType")}
                    </Typography>
                    <TextField size="small" value={form.contract_type} onChange={(e) => setForm((f) => ({ ...f, contract_type: e.target.value }))} sx={{ width: INFO_FIELD_WIDTH, ...COMPACT_INPUT_SX }} />
                  </Stack>
                  <ReadOnlyField label={t("performanceId.reportTo")} value={managerOf?.full_name ?? "—"} />
                </Stack>
                <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                  <ListField label={t("performanceId.qualifications")} value={form.qualifications} rows={5} onChange={(v) => setList("qualifications", v)} />
                  <ListField label={t("performanceId.previousPositions")} value={form.previous_positions} rows={2} onChange={(v) => setList("previous_positions", v)} />
                </Stack>
              </Stack>
            </Stack>

            <Stack spacing={1} sx={{ gridColumn: "span 2", minWidth: 0 }}>
              <SectionHeader>{t("performanceId.achievements")}</SectionHeader>
              <Stack direction="row" spacing={1.5}>
                {/* `dense` : police 11 px et lignes resserrées — la case n'est
                 * qu'un aperçu, le texte entier s'affiche au survol. */}
                <ListField label={t("performanceId.professionalAchievements")} value={form.professional_achievements} rows={5} multiline dense onChange={(v) => setList("professional_achievements", v)} />
                <ListField label={t("performanceId.personalAchievements")} value={form.personal_achievements} rows={5} multiline dense onChange={(v) => setList("personal_achievements", v)} />
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
                    sx={{ bgcolor: performanceColors[latestEvaluation.performance_rating] + "22", color: performanceColors[latestEvaluation.performance_rating], fontWeight: 700 }}
                  />
                </Stack>
              )}
            </Stack>

            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.performanceRecord")}</SectionHeader>
              {history.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={history} margin={{ top: 22, right: 16, left: 16, bottom: 0 }}>
                    <CartesianGrid stroke="#e1e0d9" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: "#898781", fontSize: 11 }} tickLine={false} />
                    <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={HEADER_ORANGE}
                      strokeWidth={2.5}
                      // Point et étiquette colorés selon le palier de
                      // performance de l'année : le graphe dit d'un coup d'œil
                      // le niveau atteint, pas seulement la tendance.
                      dot={(props: any) => (
                        <circle
                          key={`dot-${props.index}`}
                          cx={props.cx}
                          cy={props.cy}
                          r={4}
                          fill={performanceColors[history[props.index].rating]}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      )}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    >
                      <LabelList
                        dataKey="value"
                        content={(props: any) => (
                          <text
                            key={`label-${props.index}`}
                            x={props.x}
                            y={props.y - 9}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={700}
                            fill={performanceColors[history[props.index].rating]}
                          >
                            {props.value}%
                          </text>
                        )}
                      />
                    </Line>
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
          <Box sx={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 1fr 2.4fr 1.4fr", gap: 1.5, mb: 2 }}>
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
                <Stack spacing={0.75}>
                  <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", p: 0.5 }}>
                    <Id3aMiniMatrix
                      hsi={Number(latestEvaluation.hsi)}
                      ssi={Number(latestEvaluation.ssi)}
                      altitude={Math.round(Number(latestEvaluation.altitude_percentage))}
                      rating={latestEvaluation.performance_rating}
                    />
                  </Box>
                  <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={`HSI ${latestEvaluation.hsi}`} sx={{ bgcolor: HARD_SKILLS_COLOR + "22", color: HARD_SKILLS_COLOR, fontWeight: 700 }} />
                    <Chip size="small" label={`SSI ${latestEvaluation.ssi}`} sx={{ bgcolor: SOFT_SKILLS_COLOR + "22", color: SOFT_SKILLS_COLOR, fontWeight: 700 }} />
                  </Stack>
                </Stack>
              ) : (
                <Box
                  sx={{
                    width: "100%",
                    aspectRatio: "1",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {t("evaluations.notEvaluated")}
                  </Typography>
                </Box>
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

          {/* Ligne 3 : contribution + plan de développement personnel, côte à côte —
              chaque section a ses 2 colonnes réellement parallèles (pas une
              grille 2x2) : brings/expects (ou priorités/actions) empilés dans
              la même colonne. */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.contribution")}</SectionHeader>
              <Stack direction="row" spacing={1.5}>
                <Stack spacing={1} sx={{ flex: 1 }}>
                  <ListField dense label={t("performanceId.bringsToTeam")} value={form.brings_to_team} rows={4} onChange={(v) => setList("brings_to_team", v)} />
                  <ListField dense label={t("performanceId.expectsFromTeam")} value={form.expects_from_team} rows={3} onChange={(v) => setList("expects_from_team", v)} />
                </Stack>
                <Stack spacing={1} sx={{ flex: 1 }}>
                  <ListField dense label={t("performanceId.bringsToManager")} value={form.brings_to_manager} rows={3} onChange={(v) => setList("brings_to_manager", v)} />
                  <ListField dense label={t("performanceId.expectsFromManager")} value={form.expects_from_manager} rows={3} onChange={(v) => setList("expects_from_manager", v)} />
                </Stack>
              </Stack>
            </Stack>

            <Stack spacing={1}>
              <SectionHeader>{t("performanceId.personalDevPlan")}</SectionHeader>
              <Stack direction="row" spacing={1.5}>
                <Stack spacing={1} sx={{ flex: 1 }}>
                  <ListField dense label={t("performanceId.priorities")} value={form.dev_priorities} rows={4} onChange={(v) => setList("dev_priorities", v)} />
                  <ListField dense label={t("performanceId.actionsToSupport")} value={form.dev_actions_support} rows={3} onChange={(v) => setList("dev_actions_support", v)} />
                </Stack>
                <Stack spacing={1} sx={{ flex: 1 }}>
                  <ListField dense label={t("performanceId.professionalPerspectives")} value={form.dev_professional_perspectives} rows={4} onChange={(v) => setList("dev_professional_perspectives", v)} />
                  <ListField dense label={t("performanceId.risksObstacles")} value={form.dev_risks_obstacles} rows={3} onChange={(v) => setList("dev_risks_obstacles", v)} />
                </Stack>
              </Stack>
            </Stack>
          </Box>

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
