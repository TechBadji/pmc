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
    <Stack spacing={0.75}>
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

function RowLabel({ labelKey, labelColor }: { labelKey: string; labelColor: string }) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        bgcolor: labelColor,
        color: "#fff",
        borderRadius: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
  );
}

export default function StrengthsWeaknesses({
  userId,
  userName,
  avatar,
}: {
  userId: number;
  userName: string;
  avatar: string | null;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<NoteMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
    apiClient.get<Paginated<SkillNote>>("/skill-notes/", { params: { user: userId, page_size: 100 } }).then((r) => {
      const map: NoteMap = {};
      r.data.results.forEach((n) => {
        map[key(n.category, n.order)] = n.text;
      });
      setNotes(map);
    });
  }, [userId]);

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
      await apiClient.post("/skill-notes/bulk-save/", { user: userId, notes: payload });
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

      {/* Grille 3 colonnes (étiquette / Forces / Faiblesses) × 2 lignes
          (Soft / Hard) — la photo occupe une cellule à part entière qui
          couvre les deux colonnes de données et les deux lignes, donc
          `justifySelf`/`alignSelf: center` la place exactement à
          équidistance des 4 blocs (jamais décalée par la largeur de la
          colonne étiquette, contrairement à un centrage en `position:
          absolute` sur l'ensemble du bloc). */}
      <Box
        sx={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "28px 1fr 1fr",
          columnGap: 1.5,
          rowGap: 2,
        }}
      >
        {/* cellule 1×1 volontairement vide — sans elle, l'auto-placement de
            la grille y glisserait la prochaine étiquette de ligne. */}
        <Box sx={{ gridColumn: "1 / 2" }} />
        <Box sx={{ gridColumn: "2 / 3", bgcolor: "success.main", color: "#fff", borderRadius: 1, px: 1.5, py: 0.5 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
            <FitnessCenterOutlinedIcon fontSize="small" />
            <Typography variant="subtitle2" fontWeight={700}>
              {t("strengthsWeaknesses.strengths")}
            </Typography>
          </Stack>
        </Box>
        <Box sx={{ gridColumn: "3 / 4", bgcolor: "#8B2E2E", color: "#fff", borderRadius: 1, px: 1.5, py: 0.5 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
            <LinkOffOutlinedIcon fontSize="small" />
            <Typography variant="subtitle2" fontWeight={700}>
              {t("strengthsWeaknesses.weaknesses")}
            </Typography>
          </Stack>
        </Box>

        <RowLabel labelKey="strengthsWeaknesses.softSkills" labelColor="#3F9142" />
        <Column category="SOFT_STRENGTH" notes={notes} onChange={handleChange} />
        <Column category="SOFT_WEAKNESS" notes={notes} onChange={handleChange} />

        <RowLabel labelKey="strengthsWeaknesses.hardSkills" labelColor="#2E5AAC" />
        <Column category="HARD_STRENGTH" notes={notes} onChange={handleChange} />
        <Column category="HARD_WEAKNESS" notes={notes} onChange={handleChange} />

        <Box
          sx={{
            gridColumn: "2 / 4",
            gridRow: "2 / 4",
            justifySelf: "center",
            alignSelf: "center",
            zIndex: 1,
          }}
        >
          <Avatar
            src={avatar ?? undefined}
            sx={{
              width: 56,
              height: 56,
              border: "2px solid",
              borderColor: "background.paper",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </Avatar>
        </Box>
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
