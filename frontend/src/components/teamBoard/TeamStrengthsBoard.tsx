import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TeamBoard } from "@/api/types";
import { BOARD_TEXT, EditableList } from "./BoardPieces";

/** Couleurs de la planche ID-PMC : forces en vert, faiblesses en rouge, la
 * ligne People au-dessus de la ligne Business. */
const PEOPLE_STRENGTH_BG = "#e8f3e2";
const PEOPLE_WEAKNESS_BG = "#fdeedd";
const BUSINESS_STRENGTH_BG = "#e3eefb";
const BUSINESS_WEAKNESS_BG = "#fbe4e2";
const PEOPLE_BAR = "#4a9a52";
const BUSINESS_BAR = "#2f6bad";

function SideLabel({ text, color }: { text: string; color: string }) {
  return (
    <Box
      sx={{
        bgcolor: color,
        borderRadius: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography
        sx={{
          color: "#fff",
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: 1,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}

function Quadrant({
  bg,
  items,
  onChange,
  readOnly,
}: {
  bg: string;
  items: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
}) {
  return (
    <Box sx={{ bgcolor: bg, borderRadius: 1, p: 1.25, flex: 1, minWidth: 0, color: BOARD_TEXT }}>
      <EditableList items={items} onChange={onChange} rows={5} readOnly={readOnly} />
    </Box>
  );
}

/**
 * Planche « Team Strengths & Weaknesses » : forces et faiblesses de l'équipe,
 * croisées avec les deux registres du modèle ID-PMC — People (la relation) et
 * Business (le résultat). Quatre listes de cinq entrées, comme la planche de
 * référence, chacune extensible si l'atelier en produit davantage.
 */
export default function TeamStrengthsBoard({
  board,
  patch,
  readOnly,
  teamName,
  teamSize,
}: {
  board: TeamBoard | null;
  patch: (values: Partial<TeamBoard>) => void;
  readOnly: boolean;
  teamName: string;
  teamSize: number;
}) {
  const { t } = useTranslation();
  if (!board) return <Alert severity="info">{t("teamBoard.noEntryHint")}</Alert>;

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
      <Box sx={{ bgcolor: "#f0d9dc", borderRadius: 1, py: 1, mb: 2, textAlign: "center" }}>
        <Typography sx={{ fontWeight: 800, fontSize: 17, color: BOARD_TEXT }}>
          {t("teamBoard.strengthsTitle").toUpperCase()}
        </Typography>
      </Box>

      <Stack direction="row" spacing={3} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Typography variant="body2">
          <strong>{t("teamBoard.team")} :</strong> {teamName || "—"}
        </Typography>
        <Typography variant="body2">
          <strong>{t("teams.memberCount", { count: teamSize })}</strong>
        </Typography>
      </Stack>

      {/* Grille à deux colonnes et trois lignes : la bande latérale occupe
          exactement la hauteur de sa rangée de compartiments, et son texte s'y
          centre. Empilées à part, les deux bandes ne pouvaient pas suivre la
          hauteur des blocs qu'elles désignent. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "38px minmax(0, 1fr)",
          gridTemplateRows: "auto auto auto",
          columnGap: 1,
          rowGap: 1,
          alignItems: "stretch",
        }}
      >
        {/* Ligne 1 : rien à gauche, les deux entêtes à droite */}
        <Box />
        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0, bgcolor: PEOPLE_BAR, borderRadius: 1, py: 0.4, textAlign: "center" }}>
            <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{t("teamBoard.strengths")}</Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, bgcolor: "#a52a2a", borderRadius: 1, py: 0.4, textAlign: "center" }}>
            <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{t("teamBoard.weaknesses")}</Typography>
          </Box>
        </Stack>

        {/* Ligne 2 : People, en vert */}
        <SideLabel text={t("teamBoard.people").toUpperCase()} color={PEOPLE_BAR} />
        <Stack direction="row" spacing={1}>
          <Quadrant
            bg={PEOPLE_STRENGTH_BG}
            items={board.people_strengths}
            onChange={(v) => patch({ people_strengths: v })}
            readOnly={readOnly}
          />
          <Quadrant
            bg={PEOPLE_WEAKNESS_BG}
            items={board.people_weaknesses}
            onChange={(v) => patch({ people_weaknesses: v })}
            readOnly={readOnly}
          />
        </Stack>

        {/* Ligne 3 : Business, en bleu */}
        <SideLabel text={t("teamBoard.business").toUpperCase()} color={BUSINESS_BAR} />
        <Stack direction="row" spacing={1}>
          <Quadrant
            bg={BUSINESS_STRENGTH_BG}
            items={board.business_strengths}
            onChange={(v) => patch({ business_strengths: v })}
            readOnly={readOnly}
          />
          <Quadrant
            bg={BUSINESS_WEAKNESS_BG}
            items={board.business_weaknesses}
            onChange={(v) => patch({ business_weaknesses: v })}
            readOnly={readOnly}
          />
        </Stack>
      </Box>
    </Paper>
  );
}
