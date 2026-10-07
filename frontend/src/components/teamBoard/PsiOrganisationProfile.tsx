import { Box, Paper, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import type { PsiSummary } from "@/api/types";
import { CHART_NEUTRALS } from "@/theme";
import { dimensionReading, GLOBAL_READING_COLORS, globalReading, PSI_DIMENSIONS, READING_COLORS } from "@/utils/psychologicalSafety";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const round2 = (n: number) => Math.round(n * 100) / 100;

// Orange du logo : la courbe du « Graphe de performance » de la fiche
// Performance ID, dont ce graphique reprend le dessin.
const CURVE = "#E08A34";

/**
 * Lecture d'ensemble du PSI de l'entreprise, dans le style du « Graphe de
 * performance » de la fiche Performance ID : une courbe qui relie les quatre
 * dimensions, chaque point à la couleur de sa lecture avec son score, et un
 * repère pointillé à la hauteur de l'indice global — chaque dimension se lit
 * au-dessus ou en dessous de la moyenne. Sous la courbe, l'indice global en
 * toutes lettres et son écart avec la campagne précédente.
 *
 * L'échelle est fixe, de 1 à 5 (les notes du questionnaire) : un même score
 * tombe à la même hauteur d'une campagne et d'une entreprise à l'autre.
 */
export default function PsiOrganisationProfile({ summary, previousGlobal }: { summary: PsiSummary; previousGlobal: number | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const gradientId = `psi-profile-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const muted = theme.palette.text.secondary;
  const paper = theme.palette.background.paper;
  const global = summary.global ?? 0;
  const reading = globalReading(global);

  const points = PSI_DIMENSIONS.map((key) => {
    const score = summary.dimensions?.find((d) => d.key === key)?.score ?? 0;
    return { key, name: t(`psi.dimension.${key}`), score, reading: dimensionReading(score) };
  });
  // Écart calculé sur les valeurs affichées, au centième, pour qu'il se
  // retrouve en soustrayant les deux indices tels qu'on les lit à l'écran.
  const delta = previousGlobal === null ? null : round2(round2(global) - round2(previousGlobal));

  /** Nom de la dimension sous son point, sur deux lignes : quatre noms entiers
   * côte à côte ne tiennent pas dans une carte étroite. */
  const dimensionTick = ({ x, y, payload }: any) => {
    const [first, ...rest] = String(payload.value).split(" ");
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={11.5} fill={muted}>
        <tspan x={x} fontWeight={700}>
          {first}
        </tspan>
        {rest.length > 0 && (
          <tspan x={x} dy={13}>
            {rest.join(" ")}
          </tspan>
        )}
      </text>
    );
  };

  return (
    <Stack spacing={0.5}>
      <Box sx={{ width: "100%", maxWidth: 620, mx: "auto" }}>
        <ResponsiveContainer width="100%" height={270}>
          <AreaChart data={points} margin={{ top: 24, right: 104, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CURVE} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CURVE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="name" tick={dimensionTick} height={38} tickLine={false} axisLine={false} interval={0} padding={{ left: 40, right: 40 }} />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={24} tick={{ fill: muted, fontSize: 10 }} tickLine={false} axisLine={false} />
            <ReferenceLine
              y={global}
              stroke={CHART_NEUTRALS.connectorArrow}
              strokeDasharray="4 4"
              label={{ value: t("psi.dash.mean", { score: fmt(global) }), position: "right", fill: muted, fontSize: 11, fontWeight: 700 }}
            />
            <RechartsTooltip
              cursor={{ stroke: theme.palette.divider }}
              content={({ active, payload }: any) => {
                const point = active && payload?.[0]?.payload;
                if (!point) return null;
                return (
                  <Paper elevation={0} sx={{ px: 1.25, py: 0.75, border: "1px solid", borderColor: "divider" }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{point.name}</Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: READING_COLORS[point.reading as keyof typeof READING_COLORS] }} />
                      <Typography sx={{ fontSize: 12 }}>
                        {fmt(point.score)} / 5 — {t(`psi.readingDim.${point.reading}`)}
                      </Typography>
                    </Stack>
                  </Paper>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke={CURVE}
              strokeWidth={2.2}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              dot={(props: any) => (
                <circle
                  key={`dot-${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={4.5}
                  fill={READING_COLORS[points[props.index].reading]}
                  stroke={paper}
                  strokeWidth={2}
                />
              )}
              activeDot={{ r: 6, stroke: paper, strokeWidth: 2 }}
            >
              <LabelList
                dataKey="score"
                content={(props: any) => {
                  const point = points[props.index];
                  // Sous le repère de l'indice global, le score passe sous son
                  // point : au-dessus, il tomberait sur le trait pointillé.
                  const below = point.score < global;
                  return (
                    <text
                      key={`label-${props.index}`}
                      x={props.x}
                      y={below ? props.y + 19 : props.y - 10}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={800}
                      fill={READING_COLORS[point.reading]}
                      stroke={paper}
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {fmt(point.score)}
                    </text>
                  );
                }}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </Box>

      {/* Lecture en clair, comme sous le Graphe de performance : niveau de
          l'indice global, puis évolution depuis la campagne précédente. */}
      <Stack alignItems="center" sx={{ pb: 0.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: GLOBAL_READING_COLORS[reading], textAlign: "center" }}>
          {fmt(global)} — {t(`psi.readingGlobal.${reading}`)}
        </Typography>
        {delta !== null && (
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: delta > 0 ? "success.main" : delta < 0 ? "error.main" : "text.secondary", textAlign: "center" }}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {fmt(Math.abs(delta))} {t("psi.dash.vsPrevious")}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
