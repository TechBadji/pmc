import { Avatar, Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PerformanceRating } from "@/api/types";
import { performanceColors } from "@/theme";

export interface VisioPerson {
  userId: number;
  name: string;
  position: string;
  department: string | null;
  avatar: string | null;
  performance: number;
  progression: number | null;
  rating: PerformanceRating;
  col: number;
  row: number;
}

/** Teinte de fond d'une case : plus la case est haute et à droite, plus elle
 * est favorable. Le dégradé remplace la légende — on voit où l'on est avant
 * d'avoir lu l'intitulé. */
const CELL_TONES = [
  ["#fdecea", "#fdf3e2", "#f2f7e9"], // colonne performance faible
  ["#fdf3e2", "#f4f7ee", "#e9f4e6"], // performance intermédiaire
  ["#f2f7e9", "#e9f4e6", "#dff0dc"], // performance élevée
];

function PersonChip({ person }: { person: VisioPerson }) {
  const { t } = useTranslation();
  const color = performanceColors[person.rating];
  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {person.name}
          </Typography>
          <Typography variant="caption" display="block">
            {person.position}
          </Typography>
          {person.department && (
            <Typography variant="caption" display="block" color="inherit">
              {person.department}
            </Typography>
          )}
          <Typography variant="caption" display="block">
            {t("talents.performance")} : {person.performance}%
            {person.progression !== null ? ` · ${person.progression > 0 ? "+" : ""}${person.progression}%` : ""}
          </Typography>
        </Box>
      }
    >
      <Stack
        alignItems="center"
        spacing={0.25}
        sx={{
          width: 76,
          p: 0.5,
          borderRadius: 1,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          transition: "transform 0.12s, box-shadow 0.12s",
          "&:hover": { transform: "translateY(-2px)", boxShadow: `0 4px 12px ${color}55`, borderColor: color },
        }}
      >
        <Avatar
          src={person.avatar ?? undefined}
          sx={{ width: 44, height: 44, border: "2.5px solid", borderColor: color, bgcolor: "primary.light" }}
        >
          {person.name.charAt(0).toUpperCase()}
        </Avatar>
        <Typography noWrap sx={{ fontSize: 10, fontWeight: 700, maxWidth: "100%" }}>
          {person.name.split(" ")[0]}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="baseline">
          <Typography sx={{ fontSize: 11, fontWeight: 800, color }}>{person.performance}%</Typography>
          {person.progression !== null && (
            <Typography
              sx={{ fontSize: 9.5, fontWeight: 700, color: person.progression >= 0 ? "#2e7d32" : "#c62828" }}
            >
              {person.progression >= 0 ? "▲" : "▼"}
              {Math.abs(person.progression)}
            </Typography>
          )}
        </Stack>
      </Stack>
    </Tooltip>
  );
}

/**
 * TPD-VISIO — la 9 Box en planche de visages plutôt qu'en nuage de points.
 *
 * Le nuage place chaque personne au pixel près, mais dès qu'une case en
 * contient plusieurs les vignettes se recouvrent et deviennent illisibles.
 * Ici chaque case est un vrai casier : la position reste celle du modèle
 * (performance en abscisse, progression en ordonnée), et les personnes d'une
 * même case s'y rangent côte à côte, à taille constante et sans recouvrement.
 * C'est la vue qui se lit à distance, en comité.
 */
export default function TpdVisioBoard({ people }: { people: VisioPerson[] }) {
  const { t } = useTranslation();
  // Ligne du haut = progression la plus forte, comme sur le repère.
  const rows = [2, 1, 0];
  const cols = [0, 1, 2];

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5, textAlign: "center", color: "primary.main" }}>
        {t("talents.visioTitle")}
      </Typography>

      <Stack direction="row" spacing={1}>
        {/* Axe des ordonnées : le taux de progression, du plus fort au plus faible. */}
        <Box
          sx={{
            width: 34,
            bgcolor: "#12275c",
            borderRadius: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography
            sx={{
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1,
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            {t("talents.progressionAxis").toUpperCase()}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
            {rows.map((row) =>
              cols.map((col) => {
                const cell = people.filter((p) => p.col === col && p.row === row);
                return (
                  <Box
                    key={`${col}-${row}`}
                    sx={{
                      bgcolor: CELL_TONES[col][row],
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                      p: 1,
                      minHeight: 150,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: 10.5, fontWeight: 800, color: "#5b6472", letterSpacing: 0.3, mb: 0.75 }}
                    >
                      {t(`talents.box.${col}${row}.title`).toUpperCase()}
                      {cell.length > 0 && ` · ${cell.length}`}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {cell.map((p) => (
                        <PersonChip key={p.userId} person={p} />
                      ))}
                    </Stack>
                  </Box>
                );
              })
            )}
          </Box>

          {/* Axe des abscisses : la performance, du plus faible au plus élevé. */}
          <Box sx={{ mt: 1, bgcolor: "#12275c", borderRadius: 0.5, py: 0.5, textAlign: "center" }}>
            <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: 12, letterSpacing: 1 }}>
              {t("talents.performanceAxis").toUpperCase()}
            </Typography>
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}
