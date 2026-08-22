import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { TeamBoard, TeamRelationship, UserRecord } from "@/api/types";
import { BOARD_TEXT, EditableList, TeamSpiderGraph } from "./BoardPieces";

const GOOD = "#4a9a52";
const BAD = "#b3211f";

function SideBlock({
  title,
  color,
  items,
  onChange,
  readOnly,
}: {
  title: string;
  color: string;
  items: string[];
  onChange: (next: string[]) => void;
  readOnly: boolean;
}) {
  return (
    <Paper elevation={0} sx={{ p: 1, border: "1px solid", borderColor: "divider", bgcolor: "#f4f5f7" }}>
      <Box sx={{ bgcolor: color, borderRadius: 0.5, py: 0.5, textAlign: "center", mb: 1 }}>
        <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: 13.5, letterSpacing: 0.6 }}>
          {title.toUpperCase()}
        </Typography>
      </Box>
      <Box sx={{ color: BOARD_TEXT }}>
        <EditableList items={items} onChange={onChange} rows={5} readOnly={readOnly} dense />
      </Box>
    </Paper>
  );
}

/**
 * Planche « Relationship Dynamic » : au centre la toile des relations de
 * l'équipe, telle qu'elle est déjà saisie dans la fiche de cohésion ; de part
 * et d'autre, ce qui nourrit la relation (catalyseurs, nourrisseurs) et ce qui
 * l'abîme (inhibiteurs, toxines). Le graphe n'est pas ressaisi ici : il se
 * déduit des relations existantes, une double saisie finirait par diverger.
 */
export default function TeamRelationshipBoard({
  board,
  patch,
  readOnly,
  members,
  relationships,
  teamName,
  iceScore,
}: {
  board: TeamBoard | null;
  patch: (values: Partial<TeamBoard>) => void;
  readOnly: boolean;
  members: UserRecord[];
  relationships: TeamRelationship[];
  teamName: string;
  iceScore: number | null;
}) {
  const { t } = useTranslation();
  if (!board) return <Alert severity="info">{t("teamBoard.noEntryHint")}</Alert>;

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
      <Box sx={{ bgcolor: "#efe9cd", borderRadius: 1, py: 1, mb: 2, textAlign: "center" }}>
        <Typography sx={{ fontWeight: 800, fontSize: 17, color: BOARD_TEXT }}>
          {t("teamBoard.relationshipTitle").toUpperCase()}
        </Typography>
      </Box>

      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        alignItems="stretch"
        sx={{ "& > *": { minWidth: 0 } }}
      >
        <Stack spacing={2} sx={{ flex: 1 }}>
          <SideBlock
            title={t("teamBoard.catalysts")}
            color={GOOD}
            items={board.catalysts}
            onChange={(v) => patch({ catalysts: v })}
            readOnly={readOnly}
          />
          <SideBlock
            title={t("teamBoard.nourishers")}
            color={GOOD}
            items={board.nourishers}
            onChange={(v) => patch({ nourishers: v })}
            readOnly={readOnly}
          />
        </Stack>

        <Stack spacing={1} alignItems="center" sx={{ flex: 1.4 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {t("teamBoard.team")}
            </Typography>
            <Box sx={{ bgcolor: "#2f6bad", px: 2, py: 0.4, borderRadius: 0.5 }}>
              <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{teamName || "—"}</Typography>
            </Box>
          </Stack>
          <TeamSpiderGraph members={members} relationships={relationships} />
          {iceScore !== null && (
            <Box sx={{ bgcolor: "#f6e5e3", px: 2, py: 0.5, borderRadius: 0.5 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 14, color: BOARD_TEXT }}>
                {t("teamBoard.ice")} = {iceScore.toFixed(1)}
              </Typography>
            </Box>
          )}
        </Stack>

        <Stack spacing={2} sx={{ flex: 1 }}>
          <SideBlock
            title={t("teamBoard.inhibitors")}
            color={BAD}
            items={board.inhibitors}
            onChange={(v) => patch({ inhibitors: v })}
            readOnly={readOnly}
          />
          <SideBlock
            title={t("teamBoard.toxins")}
            color={BAD}
            items={board.toxins}
            onChange={(v) => patch({ toxins: v })}
            readOnly={readOnly}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}
