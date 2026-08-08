import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import { Alert, Avatar, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Paginated, SkillNote, SkillNoteCategory } from "@/api/types";

const ORDERS = [1, 2, 3, 4, 5];

type NoteMap = Record<string, string>;

function key(category: SkillNoteCategory, order: number) {
  return `${category}-${order}`;
}

function Column({
  category,
  notes,
  onChange,
}: {
  category: SkillNoteCategory;
  notes: NoteMap;
  onChange: (category: SkillNoteCategory, order: number, text: string) => void;
}) {
  return (
    <Stack spacing={0.75} sx={{ flex: 1 }}>
      {ORDERS.map((order) => (
        <TextField
          key={order}
          size="small"
          fullWidth
          placeholder={`${order}.`}
          value={notes[key(category, order)] ?? ""}
          onChange={(e) => onChange(category, order, e.target.value)}
          inputProps={{ maxLength: 255 }}
        />
      ))}
    </Stack>
  );
}

function Section({
  labelKey,
  labelColor,
  strengthCategory,
  weaknessCategory,
  notes,
  onChange,
}: {
  labelKey: string;
  labelColor: string;
  strengthCategory: SkillNoteCategory;
  weaknessCategory: SkillNoteCategory;
  notes: NoteMap;
  onChange: (category: SkillNoteCategory, order: number, text: string) => void;
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
      <Column category={strengthCategory} notes={notes} onChange={onChange} />
      <Column category={weaknessCategory} notes={notes} onChange={onChange} />
    </Stack>
  );
}

export default function StrengthsWeaknesses({
  evaluationId,
  userName,
  avatar,
}: {
  evaluationId: number;
  userName: string;
  avatar: string | null;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<NoteMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
    apiClient
      .get<Paginated<SkillNote>>("/skill-notes/", { params: { evaluation: evaluationId, page_size: 100 } })
      .then((r) => {
        const map: NoteMap = {};
        r.data.results.forEach((n) => {
          map[key(n.category, n.order)] = n.text;
        });
        setNotes(map);
      });
  }, [evaluationId]);

  function handleChange(category: SkillNoteCategory, order: number, text: string) {
    setNotes((prev) => ({ ...prev, [key(category, order)]: text }));
    setSaved(false);
  }

  const payload = useMemo(() => {
    const categories: SkillNoteCategory[] = ["SOFT_STRENGTH", "SOFT_WEAKNESS", "HARD_STRENGTH", "HARD_WEAKNESS"];
    const list: { category: SkillNoteCategory; order: number; text: string }[] = [];
    categories.forEach((category) => {
      ORDERS.forEach((order) => {
        list.push({ category, order, text: notes[key(category, order)] ?? "" });
      });
    });
    return list;
  }, [notes]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiClient.post("/skill-notes/bulk-save/", { evaluation: evaluationId, notes: payload });
      setSaved(true);
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
            onChange={handleChange}
          />
          <Section
            labelKey="strengthsWeaknesses.hardSkills"
            labelColor="#2E5AAC"
            strengthCategory="HARD_STRENGTH"
            weaknessCategory="HARD_WEAKNESS"
            notes={notes}
            onChange={handleChange}
          />
        </Stack>
        <Avatar
          src={avatar ?? undefined}
          sx={{
            width: 56,
            height: 56,
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            border: "2px solid",
            borderColor: "background.paper",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          {userName.charAt(0).toUpperCase()}
        </Avatar>
      </Box>

      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={2} sx={{ mt: 2 }}>
        {saved && (
          <Alert severity="success" sx={{ py: 0 }}>
            {t("strengthsWeaknesses.saved")}
          </Alert>
        )}
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {t("common.save")}
        </Button>
      </Stack>
    </Paper>
  );
}
