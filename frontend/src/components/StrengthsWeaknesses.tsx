import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { Alert, Avatar, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { DecimalField } from "@/components/inputs/DecimalField";
import { fmtNum, outOfRange } from "@/utils/evaluationValidation";
import { useIssues } from "@/utils/validation";
import type { Paginated, PerformanceRating, SkillNote, SkillNoteCategory } from "@/api/types";
import { performanceColors } from "@/theme";

const BASE_ROWS = 5;
const MAX_ROWS = 10;
const CATEGORIES: SkillNoteCategory[] = ["SOFT_STRENGTH", "SOFT_WEAKNESS", "HARD_STRENGTH", "HARD_WEAKNESS"];
type RowCounts = Record<SkillNoteCategory, number>;
const INITIAL_ROWS: RowCounts = { SOFT_STRENGTH: BASE_ROWS, SOFT_WEAKNESS: BASE_ROWS, HARD_STRENGTH: BASE_ROWS, HARD_WEAKNESS: BASE_ROWS };
const CATEGORY_BG: Record<SkillNoteCategory, string> = {
  SOFT_STRENGTH: "#3F914215", // vert clair — même teinte que le bandeau "Strengths"
  SOFT_WEAKNESS: "#8B2E2E15", // rouge clair — même teinte que le bandeau "Weaknesses"
  HARD_STRENGTH: "#2E5AAC15", // bleu clair — même teinte que le libellé "HARD SKILLS"
  HARD_WEAKNESS: "#D9822B15", // orange clair
};

interface RowNote {
  text: string;
  score: number | null;
}

type NoteMap = Record<string, RowNote>;

function key(category: SkillNoteCategory, order: number) {
  return `${category}-${order}`;
}

function Column({
  category,
  notes,
  rows,
  onAdd,
  readOnly,
  onChangeText,
  onChangeScore,
}: {
  category: SkillNoteCategory;
  readOnly?: boolean;
  notes: NoteMap;
  rows: number;
  onAdd: (category: SkillNoteCategory) => void;
  onChangeText: (category: SkillNoteCategory, order: number, text: string) => void;
  onChangeScore: (category: SkillNoteCategory, order: number, score: number | null) => void;
}) {
  const { t } = useTranslation();
  const bg = CATEGORY_BG[category];
  return (
    <Stack spacing={0.75} sx={{ flex: 1, bgcolor: bg, borderRadius: 1, p: 0.75 }}>
      {Array.from({ length: rows }, (_, i) => i + 1).map((order) => {
        const row = notes[key(category, order)];
        return (
          <Stack key={order} direction="row" spacing={0.5}>
            <TextField
              size="small"
              fullWidth
              placeholder={`${order}.`}
              value={row?.text ?? ""}
              disabled={readOnly}
              onChange={(e) => onChangeText(category, order, e.target.value)}
              inputProps={{ maxLength: 255 }}
              sx={{ bgcolor: "background.paper" }}
            />
            {/* Saisie libre plutôt qu'une liste de cinq entiers : l'indice se
                note au demi-point comme partout ailleurs sur la fiche, et la
                colonne l'accepte déjà (une décimale). Les bornes sont tenues
                au clavier — au-delà de 5 ou en deçà de 1, la frappe n'est pas
                prise — car l'enregistrement de cette grille est groupé et un
                refus du serveur n'y serait pas affiché. */}
            <DecimalField
              value={row?.score ?? null}
              onChange={(v) => onChangeScore(category, order, v === "" ? null : v)}
              placeholder={t("strengthsWeaknesses.indexShort")}
              min={1}
              max={5}
              decimals={1}
              disabled={readOnly}
              width={64}
              ariaLabel={t("strengthsWeaknesses.indexShort")}
              sx={{ bgcolor: "background.paper" }}
            />
          </Stack>
        );
      })}
      {!readOnly && (
      <Button
        size="small"
        startIcon={<AddOutlinedIcon />}
        disabled={rows >= MAX_ROWS}
        onClick={() => onAdd(category)}
        sx={{ alignSelf: "flex-start" }}
      >
        {t("common.add")}
      </Button>
      )}
    </Stack>
  );
}

function Section({
  labelKey,
  labelColor,
  strengthCategory,
  weaknessCategory,
  notes,
  rows,
  onAdd,
  readOnly,
  onChangeText,
  onChangeScore,
}: {
  readOnly?: boolean;
  labelKey: string;
  labelColor: string;
  strengthCategory: SkillNoteCategory;
  weaknessCategory: SkillNoteCategory;
  notes: NoteMap;
  rows: RowCounts;
  onAdd: (category: SkillNoteCategory) => void;
  onChangeText: (category: SkillNoteCategory, order: number, text: string) => void;
  onChangeScore: (category: SkillNoteCategory, order: number, score: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={1.5}>
      <Box
        sx={{
          width: 28,
          bgcolor: labelColor,
          color: "#fff",
          borderRadius: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 1, fontSize: 11 }}
        >
          {t(labelKey)}
        </Typography>
      </Box>
      <Column category={strengthCategory} notes={notes} rows={rows[strengthCategory]} onAdd={onAdd} readOnly={readOnly} onChangeText={onChangeText} onChangeScore={onChangeScore} />
      <Column category={weaknessCategory} notes={notes} rows={rows[weaknessCategory]} onAdd={onAdd} readOnly={readOnly} onChangeText={onChangeText} onChangeScore={onChangeScore} />
    </Stack>
  );
}

export default function StrengthsWeaknesses({
  evaluationId,
  userName,
  avatar,
  performanceRating,
  readOnly,
}: {
  readOnly?: boolean;
  evaluationId: number;
  userName: string;
  avatar: string | null;
  performanceRating: PerformanceRating;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<NoteMap>({});
  const [rows, setRows] = useState<RowCounts>(INITIAL_ROWS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // L'enregistrement remplace toute la fiche : sans chargement réussi, il l'effacerait.
  const [loaded, setLoaded] = useState(false);
  const { issues, check, clear } = useIssues();

  useEffect(() => {
    setSaved(false);
    setLoaded(false);
    clear();
    apiClient
      .get<Paginated<SkillNote>>("/skill-notes/", { params: { evaluation: evaluationId, page_size: 100 } })
      .then((r) => {
        const map: NoteMap = {};
        r.data.results.forEach((n) => {
          map[key(n.category, n.order)] = { text: n.text, score: n.score };
        });
        setNotes(map);
        // Une fiche déjà enregistrée avec plus de cinq lignes les rouvre toutes.
        const counts = { ...INITIAL_ROWS };
        r.data.results.forEach((n) => {
          if (n.order > counts[n.category]) counts[n.category] = Math.min(n.order, MAX_ROWS);
        });
        setRows(counts);
        setLoaded(true);
      })
      .catch(() => setLoaded(false));
  }, [evaluationId, clear]);

  function handleAdd(category: SkillNoteCategory) {
    setRows((prev) => ({ ...prev, [category]: Math.min(prev[category] + 1, MAX_ROWS) }));
  }

  function handleChangeText(category: SkillNoteCategory, order: number, text: string) {
    setNotes((prev) => ({ ...prev, [key(category, order)]: { text, score: prev[key(category, order)]?.score ?? null } }));
    setSaved(false);
    clear();
  }

  function handleChangeScore(category: SkillNoteCategory, order: number, score: number | null) {
    setNotes((prev) => ({ ...prev, [key(category, order)]: { text: prev[key(category, order)]?.text ?? "", score } }));
    setSaved(false);
    clear();
  }

  const payload = useMemo(() => {
    const list: { category: SkillNoteCategory; order: number; text: string; score: number | null }[] = [];
    CATEGORIES.forEach((category) => {
      Array.from({ length: rows[category] }, (_, i) => i + 1).forEach((order) => {
        const row = notes[key(category, order)];
        list.push({ category, order, text: row?.text ?? "", score: row?.score ?? null });
      });
    });
    return list;
  }, [notes, rows]);

  const sectionLabel: Record<SkillNoteCategory, string> = {
    SOFT_STRENGTH: t("validation.strengths.sectionSoftStrength"),
    SOFT_WEAKNESS: t("validation.strengths.sectionSoftWeakness"),
    HARD_STRENGTH: t("validation.strengths.sectionHardStrength"),
    HARD_WEAKNESS: t("validation.strengths.sectionHardWeakness"),
  };

  function validate(): boolean {
    const norm = (text: string) => text.trim().toLowerCase();
    const rules: Parameters<typeof check>[0] = [[!loaded, t("validation.strengths.notLoaded")]];
    const seen = new Map<string, number>();
    payload.forEach((row) => {
      const where = t("validation.strengths.rowWhere", { section: sectionLabel[row.category], order: row.order });
      const text = row.text.trim();
      rules.push(
        [row.text.length > 255, t("validation.strengths.tooLong", { where, count: row.text.length })],
        [!text && row.score !== null && !outOfRange(row.score, 1, 5), t("validation.strengths.scoreWithoutText", { where, score: row.score === null ? "" : fmtNum(row.score) })],
        [outOfRange(row.score, 1, 5), t("validation.strengths.rangeScore", { where, value: row.score === null ? "" : fmtNum(row.score) })]
      );
      if (text) {
        const id = `${row.category}|${norm(text)}`;
        rules.push([seen.has(id), t("validation.strengths.duplicateInColumn", { where, text })]);
        seen.set(id, row.order);
      }
    });
    // Une même compétence ne peut pas être une force et une faiblesse de la même famille.
    (["SOFT", "HARD"] as const).forEach((family) => {
      const strengths = new Set(payload.filter((r) => r.category === `${family}_STRENGTH` && r.text.trim()).map((r) => norm(r.text)));
      const shown = new Set<string>();
      payload
        .filter((r) => r.category === `${family}_WEAKNESS` && r.text.trim())
        .forEach((r) => {
          const id = norm(r.text);
          if (strengths.has(id) && !shown.has(id)) {
            shown.add(id);
            rules.push([true, t("validation.strengths.contradiction", { text: r.text.trim(), section: t(family === "SOFT" ? "validation.strengths.sectionSoft" : "validation.strengths.sectionHard") })]);
          }
        });
    });
    return check(rules);
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await apiClient.post("/skill-notes/bulk-save/", { evaluation: evaluationId, notes: payload });
      setSaved(true);
    } catch {
      // Le motif est annoncé par la bulle d'erreur ; la fiche reste marquée non enregistrée.
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper elevation={0} sx={{ p: 2, mt: 2, border: "1px solid", borderColor: "divider" }}>
      <Paper elevation={0} sx={{ py: 1, mb: 2, textAlign: "center", bgcolor: "#f5efd6", border: "1px solid", borderColor: "divider" }}>
        <Typography variant="subtitle1" fontWeight={800} sx={{ color: "primary.main" }}>
          {t("strengthsWeaknesses.title", { name: userName }).toUpperCase()}
        </Typography>
      </Paper>

      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
        <Box sx={{ width: 28, flexShrink: 0 }} />
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, bgcolor: "success.main", color: "#fff", borderRadius: 1, px: 1.5, py: 0.5 }}>
          <FitnessCenterOutlinedIcon fontSize="small" />
          <Typography variant="subtitle2" fontWeight={700}>
            {t("strengthsWeaknesses.strengths")}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, bgcolor: "#8B2E2E", color: "#fff", borderRadius: 1, px: 1.5, py: 0.5 }}>
          <LinkOffOutlinedIcon fontSize="small" />
          <Typography variant="subtitle2" fontWeight={700}>
            {t("strengthsWeaknesses.weaknesses")}
          </Typography>
        </Stack>
      </Stack>

      <Box sx={{ position: "relative" }}>
        <Stack spacing={2}>
          <Section
            labelKey="strengthsWeaknesses.softSkills"
            labelColor="#3F9142"
            strengthCategory="SOFT_STRENGTH"
            weaknessCategory="SOFT_WEAKNESS"
            notes={notes}
            rows={rows}
            onAdd={handleAdd}
            readOnly={readOnly}
            onChangeText={handleChangeText}
            onChangeScore={handleChangeScore}
          />
          <Section
            labelKey="strengthsWeaknesses.hardSkills"
            labelColor="#2E5AAC"
            strengthCategory="HARD_STRENGTH"
            weaknessCategory="HARD_WEAKNESS"
            notes={notes}
            rows={rows}
            onAdd={handleAdd}
            readOnly={readOnly}
            onChangeText={handleChangeText}
            onChangeScore={handleChangeScore}
          />
        </Stack>
        <Avatar
          src={avatar ?? undefined}
          sx={{
            width: 56,
            height: 56,
            position: "absolute",
            // Centré sur la gouttière entre la colonne Forces et la colonne
            // Faiblesses — et non au milieu du bloc : la bande verticale
            // "SOFT/HARD SKILLS" (28 px) et son écart (12 px) décalent cette
            // gouttière de 20 px vers la droite par rapport à 50 %.
            // Verticalement, 50 % tombe pile sur l'espace entre les deux
            // sections, qui ont le même nombre de lignes.
            top: "50%",
            left: "calc(50% + 20px)",
            transform: "translate(-50%, -50%) scale(1)",
            transformOrigin: "center",
            border: "3px solid",
            borderColor: performanceColors[performanceRating],
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            cursor: "pointer",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
            "&:hover": {
              transform: "translate(-50%, -50%) scale(1.8)",
              boxShadow: `0 4px 16px rgba(0,0,0,0.35), 0 0 0 3px ${performanceColors[performanceRating]}55`,
              zIndex: 1,
            },
          }}
        >
          {userName.charAt(0).toUpperCase()}
        </Avatar>
      </Box>

      <Box sx={{ mt: 2 }}>
        <ValidationSummary issues={issues} onClose={clear} />
      </Box>

      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={2} sx={{ mt: 2 }}>
        {saved && (
          <Alert severity="success" sx={{ py: 0 }}>
            {t("strengthsWeaknesses.saved")}
          </Alert>
        )}
        {!readOnly && (
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {t("common.save")}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
