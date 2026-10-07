import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PsiSummary } from "@/api/types";
import { dimensionReading, PSI_DIMENSIONS, READING_COLORS, type PsiReading } from "@/utils/psychologicalSafety";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

// Géométrie : quatre anneaux concentriques sur une même échelle de 0 à 5, qui
// part de midi et tourne sur trois quarts de tour. Le quart laissé libre, en
// haut à gauche, reçoit le nom et le score de chaque anneau, à sa hauteur.
const WIDTH = 560;
const HEIGHT = 404;
const CX = 318;
const CY = 200;
const SWEEP = 270;
const STROKE = 18;
const RADII = [156, 130, 104, 78];
const OUTER = RADII[0] + STROKE / 2;
const INNER = RADII[RADII.length - 1] - STROKE / 2;
const READINGS: PsiReading[] = ["strong", "consolidate", "watch", "priority"];

const angleOf = (score: number) => (Math.max(0, Math.min(5, score)) / 5) * SWEEP;

function polar(radius: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)] as const;
}

/**
 * Arc de cercle de midi jusqu'à `degrees`, dans le sens des aiguilles, pour un
 * trait à bouts arrondis. Le tracé est raccourci d'un demi-trait à chaque
 * bout : c'est la pointe de l'arrondi, et non son centre, qui tombe sur
 * l'angle demandé. Sans cela chaque anneau dépasserait son score, et
 * d'autant plus que l'anneau est petit — la comparaison avec le repère de
 * l'indice global serait faussée.
 */
function arc(radius: number, degrees: number) {
  const cap = ((STROKE / 2 / radius) * 180) / Math.PI;
  const from = Math.min(cap, degrees / 2);
  const to = Math.max(degrees - cap, degrees / 2);
  const [sx, sy] = polar(radius, from);
  const [ex, ey] = polar(radius, to);
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

/**
 * Lecture d'ensemble du PSI de l'entreprise : l'indice global au centre, et
 * les quatre dimensions en anneaux superposés sur la même échelle. Un trait
 * traverse les anneaux à la hauteur de l'indice global : chaque dimension se
 * lit d'un coup d'œil au-dessus ou en dessous de la moyenne. La couleur d'un
 * anneau est celle de sa lecture (forte, à consolider, vigilance, priorité),
 * la même que dans le tableau voisin.
 */
export default function PsiOrganisationRings({ summary }: { summary: PsiSummary }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [active, setActive] = useState<string | null>(null);
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const paper = theme.palette.background.paper;
  const global = summary.global ?? 0;

  const rings = PSI_DIMENSIONS.map((key, index) => {
    const score = summary.dimensions?.find((d) => d.key === key)?.score ?? 0;
    const reading = dimensionReading(score);
    return { key, score, reading, color: READING_COLORS[reading], radius: RADII[index] };
  });

  const meanAngle = angleOf(global);
  const [mx1, my1] = polar(INNER - 5, meanAngle);
  const [mx2, my2] = polar(OUTER + 12, meanAngle);
  const [lx, ly] = polar(OUTER + 20, meanAngle);
  const meanSin = Math.sin((meanAngle * Math.PI) / 180);
  const meanCos = Math.cos((meanAngle * Math.PI) / 180);
  const meanAnchor = meanSin > 0.3 ? "start" : meanSin < -0.3 ? "end" : "middle";

  return (
    <Stack spacing={1} alignItems="center">
      <Box sx={{ width: "100%", maxWidth: 560 }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label={t("psi.dash.orgChart")} style={{ display: "block" }}>
          {/* Graduations de l'échelle, juste hors du plus grand anneau. */}
          {[0, 1, 2, 3, 4, 5].map((tick) => {
            const a = angleOf(tick);
            const [x1, y1] = polar(OUTER + 3, a);
            const [x2, y2] = polar(OUTER + 7, a);
            const [tx, ty] = polar(OUTER + 16, a);
            return (
              <g key={tick}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={muted} strokeWidth={1} opacity={0.6} />
                <text x={tx} y={ty + 3.5} textAnchor="middle" fontSize={10} fill={muted}>
                  {tick}
                </text>
              </g>
            );
          })}

          {rings.map((ring) => {
            const faded = active !== null && active !== ring.key;
            const name = t(`psi.dimension.${ring.key}`);
            return (
              <g
                key={ring.key}
                opacity={faded ? 0.3 : 1}
                style={{ transition: "opacity 120ms", cursor: "default" }}
                onMouseEnter={() => setActive(ring.key)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${name} — ${fmt(ring.score)} / 5 — ${t(`psi.readingDim.${ring.reading}`)}`}</title>
                {/* Piste entière, dans une teinte claire de la couleur de l'anneau, puis le score. */}
                <path d={arc(ring.radius, SWEEP)} fill="none" stroke={ring.color} strokeOpacity={0.16} strokeWidth={STROKE} strokeLinecap="round" />
                {ring.score > 0 && (
                  <path d={arc(ring.radius, angleOf(ring.score))} fill="none" stroke={ring.color} strokeWidth={STROKE} strokeLinecap="round" />
                )}
                {/* Zone de survol plus large que le trait. */}
                <path d={arc(ring.radius, SWEEP)} fill="none" stroke="transparent" strokeWidth={STROKE + 8} />
                <text x={CX - 22} y={CY - ring.radius + 4.5} textAnchor="end" fontSize={13} fill={ink}>
                  <tspan fontWeight={600}>{name}</tspan>
                  <tspan dx={8} fontWeight={800}>
                    {fmt(ring.score)}
                  </tspan>
                </text>
              </g>
            );
          })}

          {/* L'indice global, reporté sur les quatre anneaux. */}
          <g pointerEvents="none">
            <line x1={mx1} y1={my1} x2={mx2} y2={my2} stroke={paper} strokeWidth={5} strokeLinecap="round" />
            <line x1={mx1} y1={my1} x2={mx2} y2={my2} stroke={ink} strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4" />
            <text x={lx} y={ly + (meanCos < 0 ? 12 : 0)} textAnchor={meanAnchor} fontSize={12} fontWeight={700} fill={ink} stroke={paper} strokeWidth={3} paintOrder="stroke">
              {t("psi.dash.mean", { score: fmt(global) })}
            </text>
          </g>

          {/* Chiffre central : l'indice global de l'entreprise. */}
          <text x={CX} y={CY - 26} textAnchor="middle" fontSize={11} fontWeight={700} fill={muted} letterSpacing={0.6}>
            {t("psi.dash.global")}
          </text>
          <text x={CX} y={CY + 16} textAnchor="middle" fill={ink}>
            <tspan fontSize={42} fontWeight={800}>
              {fmt(global)}
            </tspan>
            <tspan dx={3} fontSize={15} fontWeight={600} fill={muted}>
              /5
            </tspan>
          </text>
        </svg>
      </Box>

      {/* Légende des couleurs : la lecture d'une dimension, pas son nom. */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap justifyContent="center">
        {READINGS.map((reading) => (
          <Stack key={reading} direction="row" spacing={0.6} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: READING_COLORS[reading] }} />
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{t(`psi.readingDim.${reading}`)}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
