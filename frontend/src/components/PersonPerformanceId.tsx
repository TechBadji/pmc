import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import {
  Alert,
  Avatar,
  CircularProgress,
  Box,
  Button,
  GlobalStyles,
  IconButton,
  InputBase,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { apiClient } from "@/api/client";
import { useUnsavedChanges } from "@/app/unsavedChanges";
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

// ---------------------------------------------------------------------------
// Fiche "ID-PMC Manager Performance ID" — rendue comme la feuille Excel de
// référence : une grille unique par bandeau, hauteur de ligne constante, et
// chaque bloc posé sur des lignes de grille explicites. C'est ce qui garantit
// que les entêtes de toutes les colonnes tombent sur les mêmes lignes : des
// colonnes empilées indépendamment (Stack) ne peuvent pas s'aligner entre elles.
// ---------------------------------------------------------------------------
const HEADER_ORANGE = "#E08A34"; // orange du logo — même bandeau que le Plan de Développement du Manager
const CREAM = "#f5efd6";
const ROW_H = 21; // hauteur d'une ligne de la fiche
const SHEET_GAP = "3px";
/** Lignes de synthèse « % de performance » et « Catégorie de performance » :
 * intitulé au plus large, case de saisie volontairement étroite. */
const SYNTHESIS_COLS = "1fr 64px";
/** L'intitulé « Catégorie de performance » est plus long que sa colonne sur les
 * écrans étroits et à l'impression : on l'autorise à passer sur deux lignes
 * dans la hauteur de ligne existante plutôt que de le rogner. */
const SYNTHESIS_LAB_SX = {
  fontSize: 10,
  px: 0.5,
  whiteSpace: "normal" as const,
  lineHeight: 0.95,
};
const SELECT_VALUE_SX = (color: string) => ({
  fontSize: 10,
  fontWeight: 700,
  color,
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
});
const SHEET_BORDER = "1px solid #b6bdc9";
// La fiche reproduit une feuille de tableur : ses fonds sont clairs en toutes
// circonstances. Sa couleur de texte doit l'être aussi — héritée du thème,
// elle passait en quasi-blanc sur fond clair en mode sombre, rendant la fiche
// illisible alors que toutes les données étaient bien chargées.
const SHEET_TEXT = "#20242e";
const SHEET_PLACEHOLDER = "#8b8f99";
const FIELD_BG = "#eaeef6"; // bleu très pâle des cases de saisie
const READONLY_BG = "#f5f6f8"; // gris neutre : donnée calculée, non modifiable
const LABEL_BG = "#f3f2ef"; // gris des intitulés de ligne
const CELL_RADIUS = "2px";
const HARD_BAND = "#8a93c4"; // bandeau "HARD SKILLS" de la feuille
const SOFT_BAND = "#4caf7d"; // bandeau "SOFT SKILLS" de la feuille

/** Bandeau orange d'une section (PROFESSIONAL INFORMATION, ID-3A…). */
function Band({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={{
        bgcolor: HEADER_ORANGE,
        color: "#fff",
        border: SHEET_BORDER,
        borderRadius: CELL_RADIUS,
        height: ROW_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** Intitulé de sous-bloc (QUALIFICATIONS, PRIORITIES…) : encadré, centré. */
function SubHead({
  children,
  right,
  bg = "#fff",
  color,
  sx,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  bg?: string;
  color?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={{
        border: SHEET_BORDER,
        borderRadius: CELL_RADIUS,
        bgcolor: bg,
        color,
        height: ROW_H,
        display: "flex",
        alignItems: "center",
        justifyContent: right ? "space-between" : "center",
        px: 0.75,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        ...sx,
      }}
    >
      <span>{children}</span>
      {right && <span>{right}</span>}
    </Box>
  );
}

/** Étiquette de ligne (Gender, Age…) — cadre gris, texte à gauche. */
function Lab({
  children,
  center,
  bg = LABEL_BG,
  sx,
}: {
  children: React.ReactNode;
  center?: boolean;
  bg?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={{
        border: SHEET_BORDER,
        borderRadius: CELL_RADIUS,
        bgcolor: bg,
        height: ROW_H,
        display: "flex",
        alignItems: "center",
        justifyContent: center ? "center" : "flex-start",
        px: 0.75,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** Case de saisie de la fiche — sans habillage MUI, pour coller au tableur. */
function Fld({
  value,
  onChange,
  placeholder,
  readOnly,
  bg = FIELD_BG,
  align,
  bold,
  color,
  sx,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  bg?: string;
  align?: "center" | "right";
  bold?: boolean;
  color?: string;
  sx?: SxProps<Theme>;
}) {
  const locked = readOnly || !onChange;
  return (
    <Box
      sx={{
        border: SHEET_BORDER,
        borderRadius: CELL_RADIUS,
        // Une case grise ne se saisit pas, une case bleue si : la distinction
        // évite de chercher à écrire dans une valeur calculée.
        bgcolor: locked && bg === FIELD_BG ? READONLY_BG : bg,
        height: ROW_H,
        display: "flex",
        alignItems: "center",
        px: 0.5,
        transition: "border-color 0.12s, box-shadow 0.12s",
        ...(locked ? {} : { "&:hover": { borderColor: "primary.light" } }),
        "&:focus-within": { borderColor: "primary.main", boxShadow: "0 0 0 1px rgba(46,143,203,0.45)" },
        ...sx,
      }}
    >
      <InputBase
        value={value}
        placeholder={placeholder}
        readOnly={locked}
        onChange={(e) => onChange?.(e.target.value)}
        // Le texte long est tronqué par la case : l'infobulle native évite
        // d'avoir à faire défiler le champ pour le relire.
        title={value || undefined}
        sx={{
          width: "100%",
          fontSize: 11,
          fontWeight: bold ? 700 : 400,
          color,
          "& input": { p: 0, textAlign: align ?? "left", cursor: locked ? "default" : "text" },
        }}
      />
    </Box>
  );
}

function padTo(value: string[], rows: number): string[] {
  const arr = [...value];
  while (arr.length < rows) arr.push("");
  return arr.slice(0, rows);
}

/** Suite de cases numérotées d'une même colonne, posées ligne par ligne. */
function listCells(values: string[], count: number, column: number, startRow: number, onChange: (v: string[]) => void) {
  const items = padTo(values, count);
  return items.map((v, i) => (
    <Fld
      key={`${column}-${startRow}-${i}`}
      value={v}
      placeholder={`${i + 1}.`}
      onChange={(text) => {
        const next = [...items];
        next[i] = text;
        onChange(next);
      }}
      sx={{ gridColumn: column, gridRow: startRow + i }}
    />
  ));
}

const SKILL_ORDERS = [1, 2, 3, 4, 5];

/** Forces/faiblesses : libellé en lecture seule + note SI, sur deux colonnes. */
function noteCells(notes: SkillNote[], colText: number, colScore: number, startRow: number) {
  return SKILL_ORDERS.map((order, i) => {
    const note = notes.find((n) => n.order === order);
    return (
      <Fragment key={`${colText}-${startRow}-${order}`}>
        <Fld value={note?.text ?? ""} readOnly placeholder={`${order}.`} sx={{ gridColumn: colText, gridRow: startRow + i }} />
        <Fld
          value={note?.score != null ? String(note.score) : ""}
          readOnly
          align="center"
          sx={{ gridColumn: colScore, gridRow: startRow + i }}
        />
      </Fragment>
    );
  });
}

const ID3A_AXIS_MAX = 6; // même échelle que la page Matrice ID-3A

/** Mini-matrice ID-3A d'une personne : Aptitudes (HSI) en X, Attitudes (SSI)
 * en Y, quadrants et projections sur les axes — même langage visuel que la
 * page Matrice ID-3A, en version carrée pour la fiche. */
function Id3aMiniMatrix({ hsi, ssi, altitude, rating }: { hsi: number; ssi: number; altitude: number; rating: PerformanceRating }) {
  const { t } = useTranslation();
  const S = 200;
  const ML = 22;
  const MB = 20;
  const MT = 8;
  const MR = 8;
  const plotW = S - ML - MR;
  const plotH = S - MT - MB;
  const x = (v: number) => ML + (v / ID3A_AXIS_MAX) * plotW;
  const y = (v: number) => MT + plotH - (v / ID3A_AXIS_MAX) * plotH;
  const color = performanceColors[rating];
  const quadrantLabel = { fontSize: 7, fontWeight: 700, letterSpacing: 0.3, fill: CHART_NEUTRALS.quadrantLabel } as const;
  const axisLabel = { fontSize: 7, fontWeight: 700, letterSpacing: 0.4, fill: CHART_NEUTRALS.axisTitle } as const;

  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <rect x={ML} y={MT} width={plotW} height={plotH} fill="#f3f2ee" />

      {/* Séparateurs de quadrants : toujours à 2,5, milieu du barème 1-5. */}
      <line x1={x(2.5)} y1={y(ID3A_AXIS_MAX)} x2={x(2.5)} y2={y(0)} stroke="#e1e0d9" strokeDasharray="3 3" />
      <line x1={x(0)} y1={y(2.5)} x2={x(ID3A_AXIS_MAX)} y2={y(2.5)} stroke="#e1e0d9" strokeDasharray="3 3" />
      <text x={x(0) + 4} y={y(ID3A_AXIS_MAX) + 9} textAnchor="start" style={quadrantLabel}>
        {t("id3aMatrix.quadrantExperts").toUpperCase()}
      </text>
      <text x={x(ID3A_AXIS_MAX) - 4} y={y(ID3A_AXIS_MAX) + 9} textAnchor="end" style={quadrantLabel}>
        {t("id3aMatrix.quadrantTalents").toUpperCase()}
      </text>
      <text x={x(0) + 4} y={y(0) - 5} textAnchor="start" style={quadrantLabel}>
        {t("id3aMatrix.quadrantWatch").toUpperCase()}
      </text>
      <text x={x(ID3A_AXIS_MAX) - 4} y={y(0) - 5} textAnchor="end" style={quadrantLabel}>
        {t("id3aMatrix.quadrantRelational").toUpperCase()}
      </text>

      {/* Axes gradués 0-6 (marge au-delà du barème 1-5). */}
      <line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(ID3A_AXIS_MAX)} stroke={CHART_NEUTRALS.plotAxisLine} />
      <line x1={x(0)} y1={y(0)} x2={x(ID3A_AXIS_MAX)} y2={y(0)} stroke={CHART_NEUTRALS.plotAxisLine} />
      {[0, 1, 2, 3, 4, 5, 6].map((v) => (
        <g key={v}>
          <line x1={x(v)} y1={y(0)} x2={x(v)} y2={y(0) + 3} stroke={CHART_NEUTRALS.plotAxisLine} />
          <line x1={x(0) - 3} y1={y(v)} x2={x(0)} y2={y(v)} stroke={CHART_NEUTRALS.plotAxisLine} />
          <text x={x(v)} y={y(0) + 10} textAnchor="middle" fontSize={7} fill="#898781">
            {v}
          </text>
          <text x={x(0) - 4} y={y(v) + 2.5} textAnchor="end" fontSize={7} fill="#898781">
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

      <line x1={x(hsi)} y1={y(ssi)} x2={x(hsi)} y2={y(0)} stroke={color} strokeDasharray="2 2" />
      <line x1={x(0)} y1={y(ssi)} x2={x(hsi)} y2={y(ssi)} stroke={color} strokeDasharray="2 2" />
      <circle cx={x(hsi)} cy={y(ssi)} r={9} fill={color} opacity={0.18} />
      <circle cx={x(hsi)} cy={y(ssi)} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
      <text
        x={x(hsi) + (hsi > ID3A_AXIS_MAX * 0.7 ? -8 : 8)}
        y={y(ssi) - 7}
        textAnchor={hsi > ID3A_AXIS_MAX * 0.7 ? "end" : "start"}
        fontSize={10}
        fontWeight={700}
        fill={color}
      >
        {altitude}%
      </text>
    </svg>
  );
}

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

type PerformerCategory = "" | "OUTSTANDING" | "GOOD" | "AVERAGE" | "LOW" | "VERY_LOW";
const PERFORMER_CATEGORIES: Exclude<PerformerCategory, "">[] = ["OUTSTANDING", "GOOD", "AVERAGE", "LOW", "VERY_LOW"];

type ProfileForm = Record<ListKey, string[]> & {
  /** Dates de prise de fonction des postes précédents, alignées par index. */
  previous_position_dates: string[];
  gender: string;
  contract_type: string;
  performance_pct: string;
  performer_category: PerformerCategory;
  vision_aspirations: string;
  personal_projects: string;
  bono_hat: string;
};

function emptyForm(): ProfileForm {
  return {
    gender: "",
    contract_type: "",
    performance_pct: "",
    performer_category: "",
    vision_aspirations: "",
    personal_projects: "",
    bono_hat: "",
    qualifications: [],
    previous_positions: [],
    previous_position_dates: [],
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
  const [dirty, setDirty] = useState(false);
  // Un appel en échec laissait la fiche muette : cadre et intitulés dessinés,
  // toutes les cases vides, sans rien qui distingue une panne d'une personne
  // réellement sans données. On retient donc ce qui a échoué, pour le dire.
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedUser = people.find((p) => p.id === selectedId) ?? null;
  const managerOf = selectedUser?.manager != null ? people.find((p) => p.id === selectedUser.manager) : null;

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (selectedId === "") return;
    setSaved(false);
    setDirty(false);
    setLoadErrors([]);
    setLoading(true);
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending === 0) setLoading(false);
    };
    function failed(what: string, err: any) {
      const status = err?.response?.status;
      setLoadErrors((prev) => [...prev, status ? `${what} (HTTP ${status})` : `${what} (réseau)`]);
    }
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { user: selectedId, page_size: 500 } })
      .then((r) => setEvaluations(r.data.results))
      .catch((err) => {
        setEvaluations([]);
        failed(t("performanceId.loadEvaluations"), err);
      })
      .finally(done);
    apiClient.get<Paginated<PerformanceProfile>>("/performance-profiles/", { params: { user: selectedId } }).then((r) => {
      const p = r.data.results[0];
      setForm(
        p
          ? {
              gender: p.gender,
              contract_type: p.contract_type,
              performance_pct: p.performance_pct,
              performer_category: p.performer_category,
              vision_aspirations: p.vision_aspirations,
              personal_projects: p.personal_projects,
              bono_hat: p.bono_hat,
              qualifications: p.qualifications,
              previous_positions: p.previous_positions,
              previous_position_dates: p.previous_position_dates ?? [],
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
    })
      .catch((err) => {
        setForm(emptyForm());
        failed(t("performanceId.loadProfile"), err);
      })
      .finally(done);
  }, [selectedId, reloadKey, t]);

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
  // Domaine calé pour toujours montrer le repère des 100 %, et écart avec la
  // période précédente affiché sous la courbe.
  const values = history.map((h) => h.value);
  const yDomainMin = Math.min(100, ...(values.length ? values : [100])) - 15;
  const yDomainMax = Math.max(100, ...(values.length ? values : [100])) + 15;
  const historyTrend = history.length > 1 ? history[history.length - 1].value - history[history.length - 2].value : null;

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

  /** Toute modification passe par ici : le bandeau d'enregistrement peut
   * ainsi signaler des changements en attente et n'activer le bouton que
   * lorsqu'il y a réellement quelque chose à enregistrer. */
  function patchForm(patch: Partial<ProfileForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setSaved(false);
    setDirty(true);
  }

  function setList(key: ListKey, value: string[]) {
    patchForm({ [key]: value } as Partial<ProfileForm>);
  }

  async function handleSave() {
    if (selectedId === "") return;
    setSaving(true);
    try {
      await apiClient.put("/performance-profiles/save-for-user/", { user: selectedId, ...form });
      setSaved(true);
      setDirty(false);
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

  // Quitter la page (menu, fermeture d'onglet) avec des saisies en cours
  // déclenche une demande de confirmation, avec enregistrement possible.
  useUnsavedChanges(dirty, handleSave);

  const teamCandidates = selectedUser ? people.filter((p) => p.department === selectedUser.department && p.id !== selectedUser.id) : [];

  /** Lignes "relation d'équipe" : les relations enregistrées occupent les
   * premières cases, la suivante propose la liste des collègues, le reste
   * reste vide — la colonne garde ainsi toujours la même hauteur. */
  function relationshipCells(quality: "EXCELLENT" | "DIFFICULT", count: number, column: number, startRow: number) {
    const rows = relationships.filter((r) => r.quality === quality);
    const used = new Set(rows.map((r) => r.to_user));
    const available = teamCandidates.filter((c) => !used.has(c.id));
    return Array.from({ length: count }, (_, i) => {
      const rel = rows[i];
      const cellSx = { gridColumn: column, gridRow: startRow + i };
      if (rel) {
        return (
          <Box
            key={`${quality}-${i}`}
            sx={{ ...cellSx, border: SHEET_BORDER, bgcolor: FIELD_BG, height: ROW_H, display: "flex", alignItems: "center", px: 0.5, gap: 0.25 }}
          >
            <Typography sx={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {rel.to_user_name}
            </Typography>
            <IconButton size="small" sx={{ p: 0 }} aria-label={t("common.delete")} onClick={() => removeRelationship(rel.id)}>
              <DeleteOutlineIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Box>
        );
      }
      if (i === rows.length && available.length > 0) {
        return (
          <Box
            key={`${quality}-${i}`}
            sx={{ ...cellSx, border: SHEET_BORDER, bgcolor: FIELD_BG, height: ROW_H, display: "flex", alignItems: "center", px: 0.5 }}
          >
            <Select
              value=""
              displayEmpty
              variant="standard"
              disableUnderline
              fullWidth
              onChange={(e) => addRelationship(quality, Number(e.target.value))}
              renderValue={() => (
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{`${i + 1}. ${t("performanceId.addPerson")}`}</Typography>
              )}
              sx={{ fontSize: 11, "& .MuiSelect-select": { p: 0 } }}
            >
              {available.map((c) => (
                <MenuItem key={c.id} value={c.id} sx={{ fontSize: 12 }}>
                  {c.full_name || c.email}
                </MenuItem>
              ))}
            </Select>
          </Box>
        );
      }
      return <Fld key={`${quality}-${i}`} value="" readOnly placeholder={`${i + 1}.`} sx={cellSx} />;
    });
  }

  const gridSx = { display: "grid", gap: SHEET_GAP, gridAutoRows: `${ROW_H}px`, mb: 0.75 } as const;
  const bigTextSx = {
    fontSize: 11,
    alignItems: "flex-start",
    height: "100%",
    "& textarea": { height: "100% !important", overflow: "auto !important" },
  } as const;

  return (
    <Stack spacing={2}>
      {/* Impression : la fiche est faite pour être remise au client, on masque
        * donc le cadre de l'application et on force les aplats de couleur, que
        * les navigateurs suppriment par défaut à l'impression. */}
      <GlobalStyles
        styles={{
          "@media print": {
            "@page": { size: "A4 landscape", margin: "8mm" },
            ".MuiDrawer-root, .MuiAppBar-root, .pmc-no-print": { display: "none !important" },
            "main.MuiBox-root": { padding: "0 !important" },
            "*": { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" },
          },
        }}
      />
      <Stack direction="row" spacing={1.5} alignItems="center" className="pmc-no-print">
        <TextField
          select
          size="small"
          label={t("performanceId.selectPerson")}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ width: 240 }}
        >
          {selectable.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.full_name || p.email}
              {p.department_name ? ` — ${p.department_name}` : ""}
            </MenuItem>
          ))}
        </TextField>
        {selectedUser && (
          <Button size="small" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
            {t("performanceId.print")}
          </Button>
        )}
        {loading && <CircularProgress size={18} />}
      </Stack>

      {/* Une fiche vide a désormais toujours une explication : appel en échec,
        * ou personne sans évaluation. */}
      {loadErrors.length > 0 && (
        <Alert
          severity="error"
          className="pmc-no-print"
          action={
            <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
              {t("common.retry")}
            </Button>
          }
        >
          {t("performanceId.loadFailed", { details: loadErrors.join(" · ") })}
        </Alert>
      )}
      {selectedUser && !loading && loadErrors.length === 0 && evaluations.length === 0 && (
        <Alert severity="info" className="pmc-no-print">
          {t("performanceId.noEvaluation", { name: selectedUser.full_name || selectedUser.email })}
        </Alert>
      )}

      {selectedUser && (
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            border: SHEET_BORDER,
            bgcolor: "#fbfbfa",
            color: SHEET_TEXT,
            // Les champs MUI tirent leur couleur de la palette : on la fixe ici
            // pour toute la fiche, y compris les valeurs saisies, les textes
            // d'aide et le chevron des listes déroulantes.
            "& .MuiInputBase-root, & .MuiInputBase-input, & .MuiSelect-select": { color: "inherit" },
            "& .MuiInputBase-input::placeholder": { color: SHEET_PLACEHOLDER, opacity: 1 },
            "& .MuiSelect-icon": { color: SHEET_PLACEHOLDER },
          }}
        >
          {/* Bandeau titre, comme l'entête de la feuille de référence. */}
          <Box sx={{ bgcolor: CREAM, border: SHEET_BORDER, py: 0.5, mb: 0.75, textAlign: "center" }}>
            <Typography sx={{ fontSize: 17, fontWeight: 800, color: "primary.main" }}>
              {t("performanceId.title", { name: selectedUser.full_name || selectedUser.email })}
            </Typography>
          </Box>

          {/* ----- Bandeau 1 : photo · informations · réalisations · performance ----- */}
          <Box sx={{ ...gridSx, gridTemplateColumns: "155px 150px 46px 0.85fr 1fr 1fr 1.18fr" }}>
            <Box
              sx={{
                gridColumn: 1,
                gridRow: "1 / span 10",
                border: SHEET_BORDER,
                bgcolor: "#fff",
                p: 0.5,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Avatar
                src={selectedUser.avatar ?? undefined}
                variant="square"
                sx={{
                  width: "100%",
                  height: 150,
                  border: "1px solid",
                  borderColor: latestEvaluation ? performanceColors[latestEvaluation.performance_rating] : "divider",
                }}
              >
                {(selectedUser.full_name || selectedUser.email).charAt(0).toUpperCase()}
              </Avatar>
              <Fld value={selectedUser.full_name || selectedUser.email} readOnly bold color="primary.main" sx={{ width: "100%" }} />
              <Fld value={selectedUser.position || ""} readOnly sx={{ width: "100%" }} />
            </Box>

            <Band sx={{ gridColumn: "2 / 5", gridRow: 1 }}>{t("performanceId.professionalInfo")}</Band>
            <Band sx={{ gridColumn: "5 / 7", gridRow: 1 }}>{t("performanceId.achievements")}</Band>
            <Band sx={{ gridColumn: 7, gridRow: 1 }}>{t("performanceId.performanceRecord")}</Band>

            {/* Colonne identité : intitulé + valeur, une ligne par donnée. */}
            <Lab sx={{ gridColumn: 2, gridRow: 2 }}>{t("performanceId.gender")}</Lab>
            <Fld value={form.gender} onChange={(v) => patchForm({ gender: v })} sx={{ gridColumn: 3, gridRow: 2 }} />
            <Lab sx={{ gridColumn: 2, gridRow: 3 }}>{t("performanceId.age")}</Lab>
            <Fld value={selectedUser.age != null ? String(selectedUser.age) : "—"} readOnly align="center" sx={{ gridColumn: 3, gridRow: 3 }} />
            <Lab sx={{ gridColumn: 2, gridRow: 4 }}>{t("performanceId.yearsInPosition")}</Lab>
            <Fld
              value={selectedUser.years_in_current_role != null ? String(selectedUser.years_in_current_role) : "—"}
              readOnly
              align="center"
              sx={{ gridColumn: 3, gridRow: 4 }}
            />
            <Lab sx={{ gridColumn: 2, gridRow: 5 }}>{t("performanceId.yearsInCompany")}</Lab>
            <Fld
              value={selectedUser.years_in_company != null ? String(selectedUser.years_in_company) : "—"}
              readOnly
              align="center"
              sx={{ gridColumn: 3, gridRow: 5 }}
            />
            <Lab sx={{ gridColumn: 2, gridRow: 6 }}>{t("performanceId.totalExperience")}</Lab>
            <Fld
              value={selectedUser.total_experience_years != null ? String(selectedUser.total_experience_years) : "—"}
              readOnly
              align="center"
              sx={{ gridColumn: 3, gridRow: 6 }}
            />
            <Lab sx={{ gridColumn: 2, gridRow: 7 }}>{t("performanceId.contractType")}</Lab>
            <Fld value={form.contract_type} onChange={(v) => patchForm({ contract_type: v })} sx={{ gridColumn: 3, gridRow: 7 }} />
            <Box sx={{ gridColumn: "2 / 4", gridRow: 8, display: "grid", gridTemplateColumns: "auto 1fr", gap: SHEET_GAP }}>
              <Lab>{t("performanceId.reportTo")}</Lab>
              <Fld value={managerOf?.full_name ?? "—"} readOnly />
            </Box>

            {/* Qualifications puis postes précédents, sur la même colonne. */}
            <SubHead sx={{ gridColumn: 4, gridRow: 2 }}>{t("performanceId.qualifications")}</SubHead>
            {listCells(form.qualifications, 5, 4, 3, (v) => setList("qualifications", v))}
            <SubHead sx={{ gridColumn: 4, gridRow: 8 }}>{t("performanceId.previousPositions")}</SubHead>
            {/* Date de prise de fonction devant chaque poste : une case étroite
              * dans la même ligne, pour ne pas ajouter de ligne à la fiche. */}
            {[0, 1].map((i) => (
              <Box
                key={`prev-${i}`}
                sx={{ gridColumn: 4, gridRow: 9 + i, display: "grid", gridTemplateColumns: "58px 1fr", gap: SHEET_GAP }}
              >
                <Fld
                  value={padTo(form.previous_position_dates, 2)[i]}
                  placeholder={t("performanceId.since")}
                  onChange={(v) => {
                    const next = padTo(form.previous_position_dates, 2);
                    next[i] = v;
                    patchForm({ previous_position_dates: next });
                  }}
                  sx={{ "& input": { fontSize: 10 } }}
                />
                <Fld
                  value={padTo(form.previous_positions, 2)[i]}
                  placeholder={`${i + 1}.`}
                  onChange={(v) => {
                    const next = padTo(form.previous_positions, 2);
                    next[i] = v;
                    patchForm({ previous_positions: next });
                  }}
                />
              </Box>
            ))}

            <SubHead sx={{ gridColumn: 5, gridRow: 2 }}>{t("performanceId.professionalAchievements")}</SubHead>
            {listCells(form.professional_achievements, 5, 5, 3, (v) => setList("professional_achievements", v))}
            <SubHead sx={{ gridColumn: 6, gridRow: 2 }}>{t("performanceId.personalAchievements")}</SubHead>
            {listCells(form.personal_achievements, 5, 6, 3, (v) => setList("personal_achievements", v))}

            {/* Synthèse de performance, sous les réalisations. */}
            {/* % de performance : saisi à la main comme sur la feuille, avec
              * l'Altitude calculée en valeur par défaut affichée en repère.
              * HSO/SSIO se placent à droite, sur les deux mêmes lignes. */}
            <Box sx={{ gridColumn: 5, gridRow: 9, display: "grid", gridTemplateColumns: SYNTHESIS_COLS, gap: SHEET_GAP }}>
              <Lab bg={CREAM} sx={SYNTHESIS_LAB_SX}>
                {t("performanceId.performancePct")}
              </Lab>
              <Fld
                value={form.performance_pct}
                onChange={(v) => patchForm({ performance_pct: v })}
                placeholder={latestEvaluation ? `${latestEvaluation.altitude_percentage}%` : "—"}
                align="center"
                bold
                color={latestEvaluation ? performanceColors[latestEvaluation.performance_rating] : undefined}
              />
            </Box>
            <Box sx={{ gridColumn: 6, gridRow: 9, display: "grid", gridTemplateColumns: "1fr 46px 54px", gap: SHEET_GAP }}>
              <Box />
              <Lab center bg={HARD_BAND} sx={{ color: "#fff" }}>
                HSO
              </Lab>
              <Fld value={latestEvaluation ? String(latestEvaluation.hso) : "—"} readOnly align="center" bold />
            </Box>

            <Box sx={{ gridColumn: 5, gridRow: 10, display: "grid", gridTemplateColumns: SYNTHESIS_COLS, gap: SHEET_GAP }}>
              <Lab bg={CREAM} sx={SYNTHESIS_LAB_SX}>
                {t("performanceId.categoryOfPerformer")}
              </Lab>
              <Box sx={{ border: SHEET_BORDER, bgcolor: FIELD_BG, height: ROW_H, display: "flex", alignItems: "center", px: 0.25 }}>
                <Select
                  value={form.performer_category}
                  displayEmpty
                  variant="standard"
                  disableUnderline
                  fullWidth
                  onChange={(e) => patchForm({ performer_category: e.target.value as PerformerCategory })}
                  /* Case étroite : on n'y affiche que le palier, sans sa plage
                   * de pourcentage — celle-ci reste lisible dans la liste
                   * déroulante, et le % exact est juste au-dessus. */
                  renderValue={(v) =>
                    v ? (
                      <Typography sx={SELECT_VALUE_SX(performanceColors[v as PerformanceRating])}>
                        {t(`common.performanceShort.${v}`)}
                      </Typography>
                    ) : (
                      <Typography sx={SELECT_VALUE_SX("text.secondary")}>
                        {latestEvaluation ? t(`common.performanceShort.${latestEvaluation.performance_rating}`) : "—"}
                      </Typography>
                    )
                  }
                  /* Chevron réduit : dans une case aussi étroite, l'icône par
                   * défaut mangerait la moitié de la largeur utile. */
                  sx={{
                    fontSize: 9,
                    "& .MuiSelect-select": { p: 0, pr: "12px !important" },
                    "& .MuiSelect-icon": { right: -2, fontSize: 14 },
                  }}
                >
                  {PERFORMER_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c} sx={{ fontSize: 12, fontWeight: 700, color: performanceColors[c] }}>
                      {t(`common.performance.${c}`)}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Box>
            <Box sx={{ gridColumn: 6, gridRow: 10, display: "grid", gridTemplateColumns: "1fr 46px 54px", gap: SHEET_GAP }}>
              <Box />
              <Lab center bg={SOFT_BAND} sx={{ color: "#fff" }}>
                SSIO
              </Lab>
              <Fld value={latestEvaluation ? String(latestEvaluation.ssio) : "—"} readOnly align="center" bold />
            </Box>

            {/* Graphe de performance : lisible par un lecteur non initié —
              * repère des 100 % (objectifs atteints), valeur de chaque période
              * en % colorée selon le palier, et lecture de la tendance en
              * toutes lettres sous la courbe. */}
            <SubHead sx={{ gridColumn: 7, gridRow: 2 }}>{t("performanceId.performanceGraph")}</SubHead>
            <Box
              sx={{
                gridColumn: 7,
                gridRow: "3 / span 8",
                border: SHEET_BORDER,
                bgcolor: "#fff",
                p: 0.25,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {history.length > 0 ? (
                <>
                  <Box sx={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history} margin={{ top: 18, right: 30, left: 8, bottom: 2 }}>
                        <defs>
                          <linearGradient id="perf-history-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={HEADER_ORANGE} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={HEADER_ORANGE} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#eceae3" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: "#898781", fontSize: 10 }} tickLine={false} axisLine={false} />
                        {/* Le domaine englobe toujours 100 : sans ça, le repère
                          * d'objectif disparaîtrait dès qu'une personne reste
                          * durablement au-dessus ou en dessous. */}
                        <YAxis hide domain={[yDomainMin, yDomainMax]} />
                        <ReferenceLine
                          y={100}
                          stroke={CHART_NEUTRALS.connectorArrow}
                          strokeDasharray="4 4"
                          label={{
                            value: t("performanceId.objectiveLine"),
                            position: "right",
                            fill: CHART_NEUTRALS.axisTitle,
                            fontSize: 9,
                            fontWeight: 700,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={HEADER_ORANGE}
                          strokeWidth={2.2}
                          fill="url(#perf-history-fill)"
                          isAnimationActive={false}
                          dot={(props: any) => {
                            const point = history[props.index];
                            const isLast = props.index === history.length - 1;
                            return (
                              <circle
                                key={`dot-${props.index}`}
                                cx={props.cx}
                                cy={props.cy}
                                r={isLast ? 5 : 3.5}
                                fill={performanceColors[point.rating]}
                                stroke="#fff"
                                strokeWidth={isLast ? 2 : 1.2}
                              />
                            );
                          }}
                          activeDot={{ r: 6 }}
                        >
                          <LabelList
                            dataKey="value"
                            content={(props: any) => (
                              <text
                                key={`label-${props.index}`}
                                x={props.x}
                                y={props.y - 8}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={700}
                                fill={performanceColors[history[props.index].rating]}
                                // Liseré blanc : la valeur reste lisible même
                                // quand elle passe sur la grille ou l'aire.
                                stroke="#fff"
                                strokeWidth={2.5}
                                paintOrder="stroke"
                              >
                                {props.value}%
                              </text>
                            )}
                          />
                        </Area>
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                  {/* Lecture en clair de la dernière période : niveau atteint
                    * et évolution, pour un lecteur qui découvre la fiche. */}
                  <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center" sx={{ pb: 0.25, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: performanceColors[history[history.length - 1].rating] }}>
                      {history[history.length - 1].value}% — {t(`common.performance.${history[history.length - 1].rating}`)}
                    </Typography>
                    {historyTrend !== null && (
                      <Typography sx={{ fontSize: 10, color: historyTrend >= 0 ? "success.main" : "error.main", fontWeight: 700 }}>
                        {historyTrend >= 0 ? "▲" : "▼"} {Math.abs(historyTrend)} {t("performanceId.pointsVsPrevious")}
                      </Typography>
                    )}
                  </Stack>
                </>
              ) : (
                <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
                  <Typography variant="caption" color="text.secondary">
                    {t("evaluations.notEvaluated")}
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>

          {/* ----- Bandeau 2 : forces · axes · vision · dynamique · ID-3A ----- */}
          <Box sx={{ ...gridSx, gridTemplateColumns: "1fr 38px 1fr 38px 0.95fr 1fr 1fr 1.05fr" }}>
            <Band sx={{ gridColumn: "1 / 3", gridRow: 1 }}>{t("performanceId.keyStrengths")}</Band>
            <Band sx={{ gridColumn: "3 / 5", gridRow: 1 }}>{t("performanceId.areasOfImprovement")}</Band>
            <Band sx={{ gridColumn: 5, gridRow: 1 }}>{t("performanceId.vision")}</Band>
            <Band sx={{ gridColumn: "6 / 8", gridRow: 1 }}>{t("performanceId.teamDynamics")}</Band>
            <Band sx={{ gridColumn: 8, gridRow: 1 }}>{t("performanceId.id3a")}</Band>

            {/* Forces : hard puis soft, chaque ligne avec sa note SI. */}
            <SubHead bg={HARD_BAND} color="#fff" right="SI" sx={{ gridColumn: "1 / 3", gridRow: 2 }}>
              {t("managerDevPlan.hardSkills")}
            </SubHead>
            {noteCells(notesFor("HARD_STRENGTH"), 1, 2, 3)}
            <SubHead bg={SOFT_BAND} color="#fff" right="SI" sx={{ gridColumn: "1 / 3", gridRow: 9 }}>
              {t("managerDevPlan.softSkills")}
            </SubHead>
            {noteCells(notesFor("SOFT_STRENGTH"), 1, 2, 10)}
            <Lab center bg="#fff" sx={{ gridColumn: 1, gridRow: 16, color: HARD_SKILLS_COLOR }}>
              {t("performanceId.hardSkillsIndex")}
            </Lab>
            <Fld
              value={latestEvaluation ? String(latestEvaluation.hsi) : "—"}
              readOnly
              align="center"
              bold
              sx={{ gridColumn: 2, gridRow: 16 }}
            />

            <SubHead bg={HARD_BAND} color="#fff" right="SI" sx={{ gridColumn: "3 / 5", gridRow: 2 }}>
              {t("managerDevPlan.hardSkills")}
            </SubHead>
            {noteCells(notesFor("HARD_WEAKNESS"), 3, 4, 3)}
            <SubHead bg={SOFT_BAND} color="#fff" right="SI" sx={{ gridColumn: "3 / 5", gridRow: 9 }}>
              {t("managerDevPlan.softSkills")}
            </SubHead>
            {noteCells(notesFor("SOFT_WEAKNESS"), 3, 4, 10)}
            <Lab center bg="#fff" sx={{ gridColumn: 3, gridRow: 16, color: SOFT_SKILLS_COLOR }}>
              {t("performanceId.softSkillsIndex")}
            </Lab>
            <Fld
              value={latestEvaluation ? String(latestEvaluation.ssi) : "—"}
              readOnly
              align="center"
              bold
              sx={{ gridColumn: 4, gridRow: 16 }}
            />

            {/* Vision puis projets personnels : deux grandes zones de texte. */}
            <Box sx={{ gridColumn: 5, gridRow: "2 / span 7", border: SHEET_BORDER, bgcolor: CREAM, p: 0.5 }}>
              <InputBase
                multiline
                fullWidth
                value={form.vision_aspirations}
                onChange={(e) => patchForm({ vision_aspirations: e.target.value })}
                sx={bigTextSx}
              />
            </Box>
            <Band sx={{ gridColumn: 5, gridRow: 9 }}>{t("performanceId.personalProjects")}</Band>
            <Box sx={{ gridColumn: 5, gridRow: "10 / span 7", border: SHEET_BORDER, bgcolor: CREAM, p: 0.5 }}>
              <InputBase
                multiline
                fullWidth
                value={form.personal_projects}
                onChange={(e) => patchForm({ personal_projects: e.target.value })}
                sx={bigTextSx}
              />
            </Box>

            {/* Dynamique d'équipe : relations à gauche, modèles/moteurs à droite. */}
            <SubHead sx={{ gridColumn: 6, gridRow: 2 }}>{t("performanceId.excellentWith")}</SubHead>
            {relationshipCells("EXCELLENT", 5, 6, 3)}
            <SubHead sx={{ gridColumn: 6, gridRow: 8 }}>{t("performanceId.difficultWith")}</SubHead>
            {relationshipCells("DIFFICULT", 3, 6, 9)}
            <SubHead sx={{ gridColumn: 6, gridRow: 12 }}>{t("performanceId.dislikes")}</SubHead>
            {listCells(form.dislikes, 4, 6, 13, (v) => setList("dislikes", v))}

            <SubHead sx={{ gridColumn: 7, gridRow: 2 }}>{t("performanceId.professionalRoleModels")}</SubHead>
            {listCells(form.professional_role_models, 4, 7, 3, (v) => setList("professional_role_models", v))}
            <SubHead sx={{ gridColumn: 7, gridRow: 7 }}>{t("performanceId.roleModelsInLife")}</SubHead>
            {listCells(form.role_models_in_life, 4, 7, 8, (v) => setList("role_models_in_life", v))}
            <SubHead sx={{ gridColumn: 7, gridRow: 12 }}>{t("performanceId.motivates")}</SubHead>
            {listCells(form.motivates, 4, 7, 13, (v) => setList("motivates", v))}

            {/* ID-3A : la matrice, puis loisirs, traits et chapeau de Bono. */}
            <Box sx={{ gridColumn: 8, gridRow: "2 / span 7", border: SHEET_BORDER, bgcolor: "#fff", p: 0.25 }}>
              {latestEvaluation ? (
                <Id3aMiniMatrix
                  hsi={Number(latestEvaluation.hsi)}
                  ssi={Number(latestEvaluation.ssi)}
                  altitude={Math.round(Number(latestEvaluation.altitude_percentage))}
                  rating={latestEvaluation.performance_rating}
                />
              ) : (
                <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
                  <Typography variant="caption" color="text.secondary">
                    {t("evaluations.notEvaluated")}
                  </Typography>
                </Stack>
              )}
            </Box>
            <SubHead sx={{ gridColumn: 8, gridRow: 9 }}>{t("performanceId.hobbies")}</SubHead>
            {listCells(form.hobbies, 2, 8, 10, (v) => setList("hobbies", v))}
            <SubHead sx={{ gridColumn: 8, gridRow: 12 }}>{t("performanceId.personalityTraits")}</SubHead>
            {listCells(form.personality_traits, 3, 8, 13, (v) => setList("personality_traits", v))}
            <Box sx={{ gridColumn: 8, gridRow: 16, display: "grid", gridTemplateColumns: "auto 1fr", gap: SHEET_GAP }}>
              <Lab>{t("performanceId.bonoHat")}</Lab>
              <Fld value={form.bono_hat} onChange={(v) => patchForm({ bono_hat: v })} />
            </Box>
          </Box>

          {/* ----- Bandeau 3 : contribution · plan de développement personnel ----- */}
          <Box sx={{ ...gridSx, gridTemplateColumns: "1fr 1fr 1fr 1fr", mb: 0 }}>
            <Band sx={{ gridColumn: "1 / 3", gridRow: 1 }}>{t("performanceId.contribution")}</Band>
            <Band sx={{ gridColumn: "3 / 5", gridRow: 1 }}>{t("performanceId.personalDevPlan")}</Band>

            <SubHead sx={{ gridColumn: 1, gridRow: 2 }}>{t("performanceId.bringsToTeam")}</SubHead>
            {listCells(form.brings_to_team, 4, 1, 3, (v) => setList("brings_to_team", v))}
            <SubHead sx={{ gridColumn: 1, gridRow: 7 }}>{t("performanceId.expectsFromTeam")}</SubHead>
            {listCells(form.expects_from_team, 3, 1, 8, (v) => setList("expects_from_team", v))}

            <SubHead sx={{ gridColumn: 2, gridRow: 2 }}>{t("performanceId.bringsToManager")}</SubHead>
            {listCells(form.brings_to_manager, 4, 2, 3, (v) => setList("brings_to_manager", v))}
            <SubHead sx={{ gridColumn: 2, gridRow: 7 }}>{t("performanceId.expectsFromManager")}</SubHead>
            {listCells(form.expects_from_manager, 3, 2, 8, (v) => setList("expects_from_manager", v))}

            <SubHead sx={{ gridColumn: 3, gridRow: 2 }}>{t("performanceId.priorities")}</SubHead>
            {listCells(form.dev_priorities, 4, 3, 3, (v) => setList("dev_priorities", v))}
            <SubHead sx={{ gridColumn: 3, gridRow: 7 }}>{t("performanceId.actionsToSupport")}</SubHead>
            {listCells(form.dev_actions_support, 3, 3, 8, (v) => setList("dev_actions_support", v))}

            <SubHead sx={{ gridColumn: 4, gridRow: 2 }}>{t("performanceId.professionalPerspectives")}</SubHead>
            {listCells(form.dev_professional_perspectives, 4, 4, 3, (v) => setList("dev_professional_perspectives", v))}
            <SubHead sx={{ gridColumn: 4, gridRow: 7 }}>{t("performanceId.risksObstacles")}</SubHead>
            {listCells(form.dev_risks_obstacles, 3, 4, 8, (v) => setList("dev_risks_obstacles", v))}
          </Box>

          <Stack
            direction="row"
            justifyContent="flex-end"
            alignItems="center"
            spacing={1.5}
            className="pmc-no-print"
            sx={{
              mt: 1.5,
              pt: 1,
              borderTop: "1px solid",
              borderColor: "divider",
              position: "sticky",
              bottom: 0,
              bgcolor: "#fbfbfa",
              zIndex: 1,
            }}
          >
            {saved && <Alert severity="success" sx={{ py: 0 }}>{t("performanceId.saved")}</Alert>}
            {dirty && (
              <Typography sx={{ fontSize: 12, color: "warning.main", fontWeight: 700 }}>
                {t("performanceId.unsavedChanges")}
              </Typography>
            )}
            <Button variant="contained" onClick={handleSave} disabled={saving || !dirty}>
              {t("common.save")}
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
