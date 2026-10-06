import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PsiResults } from "@/api/types";
import { PSI_DIMENSIONS } from "@/utils/psychologicalSafety";

type Team = PsiResults["teams"][number];

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

// Une teinte par direction, dans un ordre fixe : la couleur suit la direction
// (son rang dans la liste), pas son score. Au-delà de huit directions les
// teintes reprennent en trait pointillé ; le numéro de la ligne du tableau,
// lui, reste unique.
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

// Géométrie du radar : les quatre axes en croix, le premier vers le haut,
// comme sur le radar d'une seule direction.
const WIDTH = 640;
const HEIGHT = 500;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RADIUS = 195;
// Étiquettes des sommets : taille de la pastille d'un score (« 4,25 »), pas
// entre deux pastilles, et écart de la première à l'axe.
const PILL_WIDTH = 34;
const PILL_HEIGHT = 16;
const LABEL_WIDTH = PILL_WIDTH + 3;
const LABEL_HEIGHT = PILL_HEIGHT + 2;
const LABEL_GAP = 10;
const MAX_LABELLED = 8;

/**
 * Radars PSI de toutes les directions, superposés sur les mêmes quatre axes
 * pour comparer les profils d'un coup d'œil. Le tableau placé dessous donne
 * les scores exacts ; survoler une ligne ou un tracé isole la direction.
 */
export default function PsiDirectionsRadar({ teams }: { teams: Team[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [active, setActive] = useState<number | null>(null);
  const dark = theme.palette.mode === "dark";
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const grid = theme.palette.divider;
  const paper = theme.palette.background.paper;

  const rows = teams.map((team, index) => ({
    team,
    index,
    color: palette[index % palette.length],
    dashed: index >= palette.length,
    scores: team.published && team.dimensions ? PSI_DIMENSIONS.map((k) => team.dimensions!.find((d) => d.key === k)?.score ?? 0) : null,
  }));
  const layers = rows.filter((r) => r.scores !== null);

  const point = (score: number, axis: number) => {
    const angle = -Math.PI / 2 + (axis * Math.PI) / 2;
    const r = (RADIUS * score) / 5;
    return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)] as const;
  };
  const outline = (scores: number[]) =>
    scores.map((s, axis) => point(s, axis)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // Score exact à côté de chaque sommet, dans une pastille cerclée de la
  // couleur de la direction. Sur un même axe les sommets sont souvent
  // voisins : les pastilles partent alternativement d'un côté et de l'autre
  // de l'axe, et s'en écartent d'un cran de plus tant qu'elles buteraient sur
  // une pastille déjà posée. Un trait fin relie chacune à son point.
  // Au-delà de huit directions il n'y a plus la place : le score ne s'affiche
  // alors que pour la direction survolée.
  const labelsAlways = layers.length <= MAX_LABELLED;
  // Centre de chaque pastille.
  const scoreLabels = new Map<number, { x: number; y: number }[]>();
  layers.forEach((row) => scoreLabels.set(row.team.team, []));
  [0, 1, 2, 3].forEach((axis) => {
    const vertical = axis % 2 === 0;
    const reach = vertical ? LABEL_HEIGHT : LABEL_WIDTH; // encombrement le long de l'axe
    const stride = vertical ? LABEL_WIDTH : LABEL_HEIGHT; // pas d'écartement de l'axe
    const placed: { side: number; rank: number; r: number }[] = [];
    [...layers]
      .sort((a, b) => a.scores![axis] - b.scores![axis])
      .forEach((row, i) => {
        const [x, y] = point(row.scores![axis], axis);
        const r = vertical ? y : x;
        const side = i % 2 === 0 ? 1 : -1;
        let rank = 0;
        while (placed.some((p) => p.side === side && p.rank === rank && Math.abs(p.r - r) < reach)) rank += 1;
        placed.push({ side, rank, r });
        const offset = side * (LABEL_GAP + (vertical ? PILL_WIDTH : PILL_HEIGHT) / 2 + rank * stride);
        scoreLabels.get(row.team.team)![axis] = vertical ? { x: x + offset, y } : { x, y: y + offset };
      });
  });

  // Nom de chaque axe, au bout de celui-ci, hors de la grille.
  const axisLabels = PSI_DIMENSIONS.map((key, axis) => {
    const [x, y] = point(5, axis);
    const place = [
      { dx: 0, dy: -12, anchor: "middle" },
      { dx: 10, dy: 4, anchor: "start" },
      { dx: 0, dy: 22, anchor: "middle" },
      { dx: -10, dy: 4, anchor: "end" },
    ][axis];
    return { key, x: x + place.dx, y: y + place.dy, anchor: place.anchor as "start" | "middle" | "end" };
  });

  return (
    <Stack spacing={1}>
      <Box sx={{ width: "100%", maxWidth: 640, mx: "auto" }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label={t("psi.dash.radarAll")} style={{ display: "block" }}>
          {/* Grille : graduations 1 à 5 et les quatre axes. */}
          {[1, 2, 3, 4, 5].map((s) => (
            <polygon key={s} points={outline([s, s, s, s])} fill="none" stroke={grid} strokeWidth={s === 5 ? 1.25 : 0.75} />
          ))}
          {[0, 1, 2, 3].map((axis) => {
            const [x, y] = point(5, axis);
            return <line key={axis} x1={CX} y1={CY} x2={x} y2={y} stroke={grid} strokeWidth={0.75} />;
          })}
          {[1, 2, 3, 4, 5].map((s) => (
            <text key={s} x={CX + 4} y={point(s, 0)[1] + 11} fontSize={9.5} fill={muted}>
              {s}
            </text>
          ))}

          {layers.map((row) => {
            const faded = active !== null && active !== row.team.team;
            const focused = active === row.team.team;
            return (
              <g
                key={row.team.team}
                opacity={faded ? 0.12 : 1}
                style={{ transition: "opacity 120ms", cursor: "default" }}
                onMouseEnter={() => setActive(row.team.team)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${row.team.team_name} — ${PSI_DIMENSIONS.map((k, i) => `${t(`psi.dimension.${k}`)} ${fmt(row.scores![i])}`).join(" · ")}`}</title>
                {/* Remplissage léger : cinq aplats pleins superposés ne laisseraient plus rien lire. */}
                <polygon
                  points={outline(row.scores!)}
                  fill={row.color}
                  fillOpacity={focused ? 0.3 : 0.1}
                  stroke={row.color}
                  strokeWidth={focused ? 3 : 2}
                  strokeLinejoin="round"
                  strokeDasharray={row.dashed ? "5 3" : undefined}
                />
              </g>
            );
          })}

          {/* Sommets et scores, tracés après tous les polygones pour qu'aucun
              tracé ne passe par-dessus un chiffre. */}
          {layers.map((row) => {
            const faded = active !== null && active !== row.team.team;
            const focused = active === row.team.team;
            return (
              <g key={row.team.team} opacity={faded ? 0.12 : 1} style={{ transition: "opacity 120ms" }} pointerEvents="none">
                {row.scores!.map((s, axis) => {
                  const [x, y] = point(s, axis);
                  const label = scoreLabels.get(row.team.team)![axis];
                  return (
                    <g key={axis}>
                      {(labelsAlways || focused) && (
                        <>
                          <line x1={x} y1={y} x2={label.x} y2={label.y} stroke={row.color} strokeWidth={1.25} />
                          <rect
                            x={label.x - PILL_WIDTH / 2}
                            y={label.y - PILL_HEIGHT / 2}
                            width={PILL_WIDTH}
                            height={PILL_HEIGHT}
                            rx={PILL_HEIGHT / 2}
                            fill={paper}
                            stroke={row.color}
                            strokeWidth={1.5}
                          />
                          <text x={label.x} y={label.y + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={ink}>
                            {fmt(s)}
                          </text>
                        </>
                      )}
                      <circle cx={x} cy={y} r={4} fill={row.color} stroke={paper} strokeWidth={2} />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {axisLabels.map((label) => (
            <text key={label.key} x={label.x} y={label.y} textAnchor={label.anchor} fontSize={12} fontWeight={700} fill={ink} stroke={paper} strokeWidth={3} paintOrder="stroke">
              {t(`psi.dimension.${label.key}`)}
            </text>
          ))}
        </svg>
      </Box>

      <Table size="small" sx={{ "& td, & th": { px: 0.75, py: 0.4, fontSize: 12 } }}>
        <TableHead>
          <TableRow>
            <TableCell>{t("psi.dash.team")}</TableCell>
            {PSI_DIMENSIONS.map((k) => (
              <TableCell key={k} align="right" title={t(`psi.dimension.${k}`)}>
                {t(`psi.dimension.${k}`).split(" ")[0]}
              </TableCell>
            ))}
            <TableCell align="right" sx={{ fontWeight: 800 }}>PSI</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.team.team}
              hover={row.scores !== null}
              onMouseEnter={() => row.scores && setActive(row.team.team)}
              onMouseLeave={() => setActive(null)}
              sx={{ opacity: row.scores === null || (active !== null && active !== row.team.team) ? 0.5 : 1 }}
            >
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Box
                    sx={{
                      flex: "0 0 auto", width: 18, height: 18, borderRadius: "50%", fontSize: 10, fontWeight: 800, lineHeight: "18px",
                      textAlign: "center", color: "#fff", bgcolor: row.scores ? row.color : "action.disabled",
                    }}
                  >
                    {row.index + 1}
                  </Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{row.team.team_name}</Typography>
                </Stack>
              </TableCell>
              {row.scores
                ? row.scores.map((s, i) => (
                    <TableCell key={i} align="right">{fmt(s)}</TableCell>
                  ))
                : (
                    <TableCell colSpan={4} align="right" sx={{ color: "text.secondary", fontStyle: "italic" }}>
                      {t("psi.dash.hidden", { n: row.team.respondents, min: row.team.min_respondents })}
                    </TableCell>
                  )}
              <TableCell align="right" sx={{ fontWeight: 800 }}>{row.scores && row.team.global != null ? fmt(row.team.global) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}
