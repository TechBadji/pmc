import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PsiSummary } from "@/api/types";
import {
  DIMENSION_THRESHOLDS,
  dimensionReading,
  GLOBAL_READING_COLORS,
  GLOBAL_THRESHOLDS,
  globalReading,
  PSI_DIMENSIONS,
  READING_COLORS,
  type PsiDimension,
  type PsiReading,
} from "@/utils/psychologicalSafety";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");
const round2 = (n: number) => Math.round(n * 100) / 100;

// Une teinte par dimension, la même partout où la dimension apparaît. Elles
// sont choisies hors du vert, de l'orange et du rouge, réservés à la lecture
// (forte, vigilance, priorité) : une couleur dit QUELLE dimension, l'autre
// dit COMMENT elle se porte. Chaque thème a ses nuances.
const DIMENSION_COLORS: Record<"light" | "dark", Record<PsiDimension, string>> = {
  light: { belonging: "#2a78d6", learning: "#1baf7a", contributing: "#4a3aa7", challenging: "#e87ba4" },
  dark: { belonging: "#3987e5", learning: "#199e70", contributing: "#9085e9", challenging: "#d55181" },
};

// Les scores se lisent sur l'échelle du questionnaire, de 1 à 5.
const SCALE_MIN = 1;
const SCALE_MAX = 5;
const position = (score: number) => `${(Math.max(SCALE_MIN, Math.min(SCALE_MAX, score)) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) * 100}%`;
const READINGS: PsiReading[] = ["strong", "consolidate", "watch", "priority"];

function Overline({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color: "text.secondary", lineHeight: 1.4 }}>
      {children}
    </Typography>
  );
}

/** État en toutes lettres, précédé d'une pastille de sa couleur : la couleur
 * n'est jamais seule à porter l'information. */
function StatusPill({ color, label }: { color: string; label: string }) {
  const dark = useTheme().palette.mode === "dark";
  return (
    <Box
      sx={{
        display: "inline-flex", alignItems: "center", gap: 0.6, px: 0.9, py: 0.2, borderRadius: 999,
        bgcolor: alpha(color, dark ? 0.24 : 0.12), border: "1px solid", borderColor: alpha(color, 0.4),
      }}
    >
      <Box sx={{ flex: "0 0 auto", width: 7, height: 7, borderRadius: "50%", bgcolor: color }} />
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.5 }}>{label}</Typography>
    </Box>
  );
}

/** Écart avec la campagne précédente, au centième. */
function Delta({ value, suffix }: { value: number; suffix?: string }) {
  return (
    <Typography
      sx={{ fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", color: value > 0 ? "success.main" : value < 0 ? "error.main" : "text.secondary" }}
    >
      {value > 0 ? "▲" : value < 0 ? "▼" : "="} {fmt(Math.abs(value))}
      {suffix ? ` ${suffix}` : ""}
    </Typography>
  );
}

/**
 * Version 2 du graphique d'ensemble : une fiche de synthèse à la manière d'un
 * cabinet de conseil, sur toute la largeur du tableau de bord. À gauche,
 * l'indice global, son état, sa position sur l'échelle et ce qu'il faut
 * retenir. À droite, une ligne par dimension — sa couleur, ce qu'elle
 * mesure, son score sur une jauge où un trait rappelle l'indice global, son
 * état et son évolution depuis la campagne précédente — puis la clé de
 * lecture. Elle reprend tout le contenu du tableau des scores, qu'elle
 * remplace à l'écran. (La version 1 est `PsiOrganisationBars`.)
 */
export default function PsiOrganisationScorecard({
  summary,
  previous,
  previousName,
}: {
  summary: PsiSummary;
  previous: PsiSummary | null;
  previousName: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = DIMENSION_COLORS[theme.palette.mode === "dark" ? "dark" : "light"];
  const ink = theme.palette.text.primary;
  const global = summary.global ?? 0;
  const globalKey = globalReading(global);
  // Les écarts sont calculés sur les valeurs affichées, au centième.
  const delta = (now: number, before: number | undefined | null) => (before == null ? null : round2(round2(now) - round2(before)));
  const globalDelta = delta(global, previous?.global);

  const rows = PSI_DIMENSIONS.map((key) => {
    const score = summary.dimensions?.find((d) => d.key === key)?.score ?? 0;
    return {
      key,
      score,
      name: t(`psi.dimension.${key}`),
      reading: dimensionReading(score),
      delta: delta(score, previous?.dimensions?.find((d) => d.key === key)?.score),
    };
  });
  const strongest = rows.reduce((a, b) => (b.score > a.score ? b : a));
  const weakest = rows.reduce((a, b) => (b.score < a.score ? b : a));
  const gap = round2(round2(global) - round2(weakest.score));

  const zones = [
    { key: "fragile" as const, from: SCALE_MIN, to: GLOBAL_THRESHOLDS.improvable },
    { key: "improvable" as const, from: GLOBAL_THRESHOLDS.improvable, to: GLOBAL_THRESHOLDS.solid },
    { key: "solid" as const, from: GLOBAL_THRESHOLDS.solid, to: SCALE_MAX },
  ];
  const readingRule = (reading: PsiReading) =>
    reading === "priority" ? `< ${fmt1(DIMENSION_THRESHOLDS.watch)}` : `≥ ${fmt1(DIMENSION_THRESHOLDS[reading])}`;

  const paper = theme.palette.background.paper;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 0.9fr) minmax(0, 1.7fr)" }, columnGap: 5, rowGap: 2.5, alignItems: "start" }}>
      {/* Colonne de synthèse : l'indice global, son état, sa position sur
          l'échelle, et ce qu'il faut retenir. */}
      <Stack spacing={2}>
        <Box>
          <Overline>{t("psi.dash.global")}</Overline>
          <Stack direction="row" alignItems="baseline" spacing={0.5}>
            <Typography sx={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>{fmt(global)}</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 600, color: "text.secondary" }}>/5</Typography>
          </Stack>
          <Stack direction="row" columnGap={1} rowGap={0.5} alignItems="center" flexWrap="wrap" sx={{ mt: 0.75 }}>
            <StatusPill color={GLOBAL_READING_COLORS[globalKey]} label={t(`psi.dash.v2.zone.${globalKey}`)} />
            {globalDelta !== null && <Delta value={globalDelta} suffix={t("psi.dash.v2.vsCampaign", { campaign: previousName })} />}
          </Stack>
        </Box>

        <Box>
          <Overline>{t("psi.dash.v2.globalScale")}</Overline>
          <Box sx={{ position: "relative", pt: 1.5 }}>
            {/* Curseur de l'indice global. */}
            <Box
              sx={{
                position: "absolute", top: 2, left: position(global), transform: "translateX(-50%)", width: 0, height: 0,
                borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `8px solid ${ink}`,
              }}
            />
            <Box sx={{ display: "flex", gap: "2px", height: 10 }}>
              {zones.map((zone, index) => (
                <Box
                  key={zone.key}
                  sx={{
                    flex: `${zone.to - zone.from} 1 0`, bgcolor: alpha(GLOBAL_READING_COLORS[zone.key], 0.6),
                    borderRadius: index === 0 ? "5px 0 0 5px" : index === zones.length - 1 ? "0 5px 5px 0" : 0,
                  }}
                />
              ))}
            </Box>
            <Box sx={{ position: "relative", height: 18 }}>
              {[SCALE_MIN, GLOBAL_THRESHOLDS.improvable, GLOBAL_THRESHOLDS.solid, SCALE_MAX].map((tick, index, all) => (
                <Typography
                  key={tick}
                  sx={{
                    position: "absolute", top: 2, left: position(tick), fontSize: 10.5, color: "text.secondary", fontVariantNumeric: "tabular-nums",
                    transform: index === 0 ? "none" : index === all.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                >
                  {Number.isInteger(tick) ? tick : fmt1(tick)}
                </Typography>
              ))}
            </Box>
            <Stack direction="row" columnGap={1.5} rowGap={0.25} flexWrap="wrap">
              {zones.map((zone) => (
                <Stack key={zone.key} direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 9, height: 9, borderRadius: "2px", bgcolor: alpha(GLOBAL_READING_COLORS[zone.key], 0.6) }} />
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{t(`psi.dash.v2.zone.${zone.key}`)}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        </Box>

        {/* Participation : ce que valent les moyennes dépend de qui a répondu. */}
        {summary.headcount > 0 && (
          <Box>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" columnGap={1} flexWrap="wrap">
              <Overline>{t("psi.dash.v2.participation")}</Overline>
              <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                {t("psi.dash.respondents", { n: summary.respondents, total: summary.headcount })}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                {Math.round((summary.respondents / summary.headcount) * 100)} %
              </Typography>
              <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}>
                <Box sx={{ height: "100%", borderRadius: 3, bgcolor: "text.secondary", width: `${Math.min(100, (summary.respondents / summary.headcount) * 100)}%` }} />
              </Box>
            </Stack>
          </Box>
        )}

        {/* Ce qu'il faut retenir, en deux phrases. */}
        <Box sx={{ px: 1.5, py: 1.1, borderLeft: "3px solid", borderColor: "primary.main", bgcolor: "action.hover", borderRadius: "0 6px 6px 0" }}>
          <Overline>{t("psi.dash.v2.takeaway")}</Overline>
          {gap < 0.005 ? (
            <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>{t("psi.dash.v2.level")}</Typography>
          ) : (
            <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>
              <b>{t("psi.dash.v2.strength")}</b> : {strongest.name} ({fmt(strongest.score)}). <b>{t("psi.dash.v2.priority")}</b> : {weakest.name} (
              {fmt(weakest.score)}), {t("psi.dash.v2.belowGlobal", { gap: fmt(gap) })}.
            </Typography>
          )}
          {globalDelta !== null && (
            <Typography sx={{ fontSize: 13, lineHeight: 1.5, mt: 0.25 }}>
              {t(globalDelta > 0 ? "psi.dash.v2.trendUp" : globalDelta < 0 ? "psi.dash.v2.trendDown" : "psi.dash.v2.trendFlat", {
                delta: fmt(Math.abs(globalDelta)),
                campaign: previousName,
              })}
            </Typography>
          )}
        </Box>
      </Stack>

      {/* Colonne de détail : une ligne par dimension, dans l'ordre du modèle. */}
      <Box sx={{ minWidth: 0 }}>
        <Overline>{t("psi.dash.v2.dimensions")}</Overline>
        {rows.map((row, index) => (
          <Box key={row.key} sx={{ display: "grid", gridTemplateColumns: "4px minmax(0, 1fr)", columnGap: 1.5, py: 1.1, borderTop: index === 0 ? "none" : "1px solid", borderColor: "divider" }}>
            <Box sx={{ bgcolor: colors[row.key], borderRadius: 2 }} />
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" columnGap={1.5} rowGap={0.25} flexWrap="wrap">
                <Tooltip title={t(`psi.dimensionQuestion.${row.key}`)} placement="top-start" arrow>
                  <Stack direction="row" spacing={0.9} alignItems="baseline" sx={{ minWidth: 0, cursor: "help" }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: "text.secondary", letterSpacing: 0.5, fontVariantNumeric: "tabular-nums" }}>
                      {String(index + 1).padStart(2, "0")}
                    </Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 800 }}>{row.name}</Typography>
                  </Stack>
                </Tooltip>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmt(row.score)}</Typography>
                  <StatusPill color={READING_COLORS[row.reading]} label={t(`psi.readingDim.${row.reading}`)} />
                  {row.delta !== null && <Delta value={row.delta} />}
                </Stack>
              </Stack>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary", lineHeight: 1.35 }}>{t(`psi.dimensionTitle.${row.key}`)}</Typography>
              {/* Jauge de 1 à 5 : la piste est une teinte claire de la couleur
                  de la dimension, coupée à chaque point entier ; le trait
                  pointillé rappelle l'indice global. */}
              <Box sx={{ position: "relative", height: 20, mt: 0.5 }}>
                <Box sx={{ position: "absolute", left: 0, right: 0, top: 5, height: 10, borderRadius: 5, bgcolor: alpha(colors[row.key], 0.16) }} />
                <Box sx={{ position: "absolute", left: 0, top: 5, height: 10, borderRadius: 5, width: position(row.score), bgcolor: colors[row.key] }} />
                {[2, 3, 4].map((tick) => (
                  <Box key={tick} sx={{ position: "absolute", left: position(tick), top: 5, height: 10, width: "2px", bgcolor: paper, transform: "translateX(-1px)" }} />
                ))}
                <Box sx={{ position: "absolute", left: position(global), top: 0, bottom: 0, borderLeft: `2px dashed ${ink}`, transform: "translateX(-1px)" }} />
              </Box>
            </Box>
          </Box>
        ))}
        {/* Graduations communes aux quatre jauges. */}
        <Box sx={{ display: "grid", gridTemplateColumns: "4px minmax(0, 1fr)", columnGap: 1.5 }}>
          <Box />
          <Box sx={{ position: "relative", height: 16 }}>
            {[1, 2, 3, 4, 5].map((tick, index, all) => (
              <Typography
                key={tick}
                sx={{
                  position: "absolute", top: 0, left: position(tick), fontSize: 10.5, color: "text.secondary", fontVariantNumeric: "tabular-nums",
                  transform: index === 0 ? "none" : index === all.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {tick}
              </Typography>
            ))}
          </Box>
        </Box>

        {/* Clé de lecture : les états d'une dimension et leurs seuils, puis le trait de l'indice global. */}
        <Stack direction="row" columnGap={1.75} rowGap={0.25} flexWrap="wrap" alignItems="center" sx={{ mt: 1.25, pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary" }}>{t("psi.dash.v2.readingKey")}</Typography>
          {READINGS.map((reading) => (
            <Stack key={reading} direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: READING_COLORS[reading] }} />
              <Typography sx={{ fontSize: 11, color: "text.secondary", whiteSpace: "nowrap" }}>
                {t(`psi.readingDim.${reading}`)} {readingRule(reading)}
              </Typography>
            </Stack>
          ))}
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ height: 16, borderLeft: `2px dashed ${ink}` }} />
            <Typography sx={{ fontSize: 11, color: "text.secondary", whiteSpace: "nowrap" }}>{t("psi.dash.v2.globalMarker")}</Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
