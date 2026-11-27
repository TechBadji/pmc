import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

export interface NineBoxPerson {
  userId: number;
  name: string;
  performance: number;
  progression: number;
}

/** Couleur de chaque case (colonne performance, ligne progression) — celles du rapport PDF. */
const BOX_COLOR: Record<string, string> = {
  "22": "#4A9A52",
  "21": "#17A89E",
  "12": "#17A89E",
  "20": "#D9B42C",
  "11": "#2E7FC1",
  "02": "#2E7FC1",
  "10": "#F28C28",
  "01": "#F28C28",
  "00": "#B23F3F",
};
const PERF_KEYS = ["low", "mid", "high"] as const;
const PROG_KEYS = ["regression", "moderate", "strong"] as const;
/** Noms montrés par case avant « + n autre(s) » ; la liste complète reste au survol. */
const MAX_NAMES = 8;

export function perfBand(performance: number) {
  return performance < 75 ? 0 : performance < 90 ? 1 : 2;
}

export function progBand(progression: number) {
  return progression <= 0 ? 0 : progression < 6 ? 1 : 2;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** 9 Box en planche : une case par croisement performance × progression,
 *  avec sa recommandation, les personnes qui s'y trouvent et leur nombre.
 *  Même dessin que la figure du rapport PDF. */
export default function NineBoxBoard({
  people,
  company,
  period,
}: {
  people: NineBoxPerson[];
  company: string;
  period: string;
}) {
  const { t } = useTranslation();
  const cells = new Map<string, NineBoxPerson[]>();
  for (const p of [...people].sort((a, b) => b.performance - a.performance)) {
    const key = `${perfBand(p.performance)}${progBand(p.progression)}`;
    cells.set(key, [...(cells.get(key) ?? []), p]);
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight={800} color="primary.main">
        {t("nineBox.heading")}
      </Typography>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1.5, mb: 1.5 }}>
        {t("nineBox.figure")}
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "18px 18px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", md: "24px 28px repeat(3, minmax(0,1fr))" },
          gridTemplateRows: { xs: "repeat(3, minmax(150px, auto)) auto auto", md: "repeat(3, minmax(185px, auto)) auto auto" },
          columnGap: { xs: 0.5, md: 0.75 },
          rowGap: 0.75,
        }}
      >
        {/* Titre de l'axe vertical, sur toute la hauteur des 3 rangées */}
        <Box sx={{ gridColumn: 1, gridRow: "1 / 4", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography
            variant="caption"
            fontWeight={700}
            sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", letterSpacing: 0.3 }}
          >
            {t("nineBox.progAxis")}
          </Typography>
        </Box>

        {[2, 1, 0].map((row, r) => (
          <Box key={`p-${row}`} sx={{ gridColumn: 2, gridRow: r + 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography
              variant="caption"
              fontWeight={600}
              sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", textAlign: "center", lineHeight: 1.2 }}
            >
              {t(`nineBox.prog.${PROG_KEYS[row]}`)}
            </Typography>
          </Box>
        ))}

        {[2, 1, 0].flatMap((row, r) =>
          [0, 1, 2].map((col) => {
            const key = `${col}${row}`;
            const color = BOX_COLOR[key];
            const list = cells.get(key) ?? [];
            const shown = list.length > MAX_NAMES ? list.slice(0, MAX_NAMES - 1) : list;
            return (
              <Box
                key={key}
                sx={{
                  gridColumn: col + 3,
                  gridRow: r + 1,
                  position: "relative",
                  bgcolor: alpha(color, 0.13),
                  borderTop: `6px solid ${color}`,
                  p: { xs: 1, md: 1.5 },
                  pb: 5,
                  minWidth: 0,
                }}
              >
                <Typography variant="body2" fontWeight={700} noWrap title={t(`talents.box.${key}.title`)}>
                  {t(`talents.box.${key}.title`)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div" title={t(`talents.box.${key}.advice`)}>
                  {t(`talents.box.${key}.advice`)}
                </Typography>
                <Stack spacing={0.25} sx={{ mt: 1.25 }}>
                  {shown.map((p) => (
                    <Tooltip
                      key={p.userId}
                      placement="right"
                      title={t("nineBox.detail", {
                        performance: p.performance.toLocaleString("fr-FR", { maximumFractionDigits: 1 }),
                        progression: signed(p.progression),
                      })}
                    >
                      <Typography variant="caption" noWrap sx={{ width: "fit-content", maxWidth: "calc(100% - 40px)", cursor: "default" }}>
                        {p.name}
                      </Typography>
                    </Tooltip>
                  ))}
                  {list.length > shown.length && (
                    <Tooltip title={list.slice(shown.length).map((p) => p.name).join(", ")}>
                      <Typography variant="caption" color="text.secondary" sx={{ width: "fit-content", cursor: "default" }}>
                        {t("nineBox.more", { count: list.length - shown.length })}
                      </Typography>
                    </Tooltip>
                  )}
                </Stack>
                <Typography
                  aria-hidden
                  sx={{ position: "absolute", right: 12, bottom: 4, fontSize: { xs: 26, md: 32 }, fontWeight: 800, color, lineHeight: 1.2 }}
                >
                  {list.length}
                </Typography>
              </Box>
            );
          }),
        )}

        {PERF_KEYS.map((k, col) => (
          <Typography key={k} variant="caption" fontWeight={600} textAlign="center" sx={{ gridColumn: col + 3, gridRow: 4, pt: 0.5 }}>
            {t(`nineBox.perf.${k}`)}
          </Typography>
        ))}
        <Typography variant="caption" fontWeight={700} textAlign="center" sx={{ gridColumn: "3 / 6", gridRow: 5, letterSpacing: 0.3 }}>
          {t("nineBox.perfAxis")}
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary" fontStyle="italic" component="p" sx={{ mt: 2 }}>
        {t("nineBox.source", { company, period, count: people.length })}
      </Typography>
    </Box>
  );
}
