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
// teintes reprennent en trait pointillé ; le numéro de la pastille, lui, reste
// unique et c'est lui qui identifie la couche.
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

// Géométrie de la vue en perspective : le plan du radar est couché (TILT),
// tourné d'un quart de tour incomplet (YAW) pour que les quatre axes se
// détachent, et chaque direction occupe un étage de la pile.
const WIDTH = 560;
const CX = WIDTH / 2;
const RADIUS = 150;
const TILT = 0.5;
const YAW = (28 * Math.PI) / 180;
const SLAB = 5;
const TOP_MARGIN = 34;
const BOTTOM_MARGIN = 40;

/**
 * Radars PSI de toutes les directions, superposés en perspective : un étage
 * par direction, sur les mêmes quatre axes, pour comparer les profils d'un
 * coup d'œil. Le tableau placé dessous donne les scores exacts ; survoler une
 * ligne ou une couche isole la direction.
 */
export default function PsiDirectionsRadar3D({ teams }: { teams: Team[] }) {
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
  const step = layers.length > 1 ? Math.min(30, 150 / (layers.length - 1)) : 0;
  const baseY = TOP_MARGIN + (layers.length - 1) * step + RADIUS * TILT;
  const height = baseY + RADIUS * TILT + BOTTOM_MARGIN;

  const point = (score: number, axis: number, level: number) => {
    const angle = -Math.PI / 2 + (axis * Math.PI) / 2 + YAW;
    const r = (RADIUS * score) / 5;
    return [CX + r * Math.cos(angle), baseY - level * step + TILT * r * Math.sin(angle)] as const;
  };
  const ring = (score: number, level: number, dy = 0) =>
    [0, 1, 2, 3].map((axis) => point(score, axis, level)).map(([x, y]) => `${x.toFixed(1)},${(y + dy).toFixed(1)}`).join(" ");
  const shape = (scores: number[], level: number, dy = 0) =>
    scores.map((s, axis) => point(s, axis, level)).map(([x, y]) => `${x.toFixed(1)},${(y + dy).toFixed(1)}`).join(" ");

  const top = layers.length - 1;
  // Nom de chaque axe, posé hors de la pile : celui du fond au-dessus du
  // dernier étage, les trois autres autour du socle.
  const axisLabels = PSI_DIMENSIONS.map((key, axis) => {
    const [x, y] = point(5, axis, axis === 0 ? top : 0);
    const place = [
      { dx: 0, dy: -10, anchor: "middle" },
      // Après la pastille numérotée du socle, posée sur ce même coin.
      { dx: 28, dy: 4, anchor: "start" },
      { dx: 0, dy: 20, anchor: "middle" },
      { dx: -10, dy: 4, anchor: "end" },
    ][axis];
    return { key, x: x + place.dx, y: y + place.dy, anchor: place.anchor as "start" | "middle" | "end" };
  });

  return (
    <Stack spacing={1}>
      <Box sx={{ width: "100%", maxWidth: 620, mx: "auto" }}>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" role="img" aria-label={t("psi.dash.radarAll")} style={{ display: "block" }}>
          {/* Socle : graduations 1 à 5 et les quatre axes. */}
          {[1, 2, 3, 4, 5].map((s) => (
            <polygon key={s} points={ring(s, 0)} fill="none" stroke={grid} strokeWidth={s === 5 ? 1.25 : 0.75} />
          ))}
          {[0, 1, 2, 3].map((axis) => {
            const [x, y] = point(5, axis, 0);
            return <line key={axis} x1={CX} y1={baseY} x2={x} y2={y} stroke={grid} strokeWidth={0.75} />;
          })}
          {/* Montants : ils relient les coins du socle à ceux du dernier étage. */}
          {top > 0 &&
            [0, 1, 2, 3].map((axis) => {
              const [x1, y1] = point(5, axis, 0);
              const [x2, y2] = point(5, axis, top);
              return <line key={axis} x1={x1} y1={y1} x2={x2} y2={y2} stroke={grid} strokeWidth={0.75} strokeDasharray="2 3" />;
            })}

          {layers.map((row, level) => {
            const faded = active !== null && active !== row.team.team;
            const [bx, by] = point(5, 1, level);
            return (
              <g
                key={row.team.team}
                opacity={faded ? 0.15 : 1}
                style={{ transition: "opacity 120ms", cursor: "default" }}
                onMouseEnter={() => setActive(row.team.team)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${row.team.team_name} — ${PSI_DIMENSIONS.map((k, i) => `${t(`psi.dimension.${k}`)} ${fmt(row.scores![i])}`).join(" · ")}`}</title>
                {level > 0 && <polygon points={ring(5, level)} fill="none" stroke={grid} strokeWidth={0.75} />}
                {/* Tranche puis face du dessus : l'épaisseur donne le relief. */}
                <polygon points={shape(row.scores!, level, SLAB)} fill={row.color} fillOpacity={0.5} stroke={row.color} strokeOpacity={0.6} strokeWidth={1} strokeLinejoin="round" />
                <polygon
                  points={shape(row.scores!, level)}
                  fill={row.color}
                  fillOpacity={0.42}
                  stroke={row.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeDasharray={row.dashed ? "5 3" : undefined}
                />
                {/* Pastille numérotée : la direction se lit sans la couleur seule. */}
                <circle cx={bx + 12} cy={by} r={9} fill={row.color} stroke={paper} strokeWidth={2} />
                <text x={bx + 12} y={by + 3.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">
                  {row.index + 1}
                </text>
              </g>
            );
          })}

          {axisLabels.map((label) => (
            <text key={label.key} x={label.x} y={label.y} textAnchor={label.anchor} fontSize={12} fontWeight={700} fill={ink} stroke={paper} strokeWidth={3} paintOrder="stroke">
              {t(`psi.dimension.${label.key}`)}
            </text>
          ))}
          <text x={WIDTH - 4} y={height - 6} textAnchor="end" fontSize={10} fill={muted}>
            {t("psi.dash.scale")}
          </text>
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
