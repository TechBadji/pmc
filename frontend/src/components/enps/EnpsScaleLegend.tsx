import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { ENPS_COLORS, enpsCategory, type EnpsCategory } from "@/utils/enps";

const GROUPS: { key: EnpsCategory; range: string; from: number; to: number; label: string; long: string; help: string }[] = [
  { key: "detractor", range: "0 à 6", from: 0, to: 6, label: "enps.detractors", long: "enps.detractorsLong", help: "enps.detractorsHelp" },
  { key: "passive", range: "7 à 8", from: 7, to: 8, label: "enps.passives", long: "enps.passivesLong", help: "enps.passivesHelp" },
  { key: "promoter", range: "9 à 10", from: 9, to: 10, label: "enps.promoters", long: "enps.promotersLong", help: "enps.promotersHelp" },
];

/** Échelle de notes de l'eNPS : les 11 notes colorées, les trois catégories
 *  avec leur définition, et la formule de calcul. */
export default function EnpsScaleLegend() {
  const { t } = useTranslation();
  return (
    <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="h6" fontWeight={800} textAlign="center" sx={{ mb: 2 }}>
        {t("enps.scaleTitle")}
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(11, minmax(0, 1fr))", gap: 0.5, maxWidth: 560, mx: "auto" }}>
        {Array.from({ length: 11 }, (_, n) => (
          <Box
            key={n}
            sx={{
              bgcolor: ENPS_COLORS[enpsCategory(n)],
              color: "#fff",
              borderRadius: 1,
              textAlign: "center",
              fontWeight: 800,
              fontSize: { xs: 14, md: 18 },
              py: { xs: 0.5, md: 0.75 },
            }}
          >
            {n}
          </Box>
        ))}
        {GROUPS.map((g) => (
          <Box key={g.key} sx={{ gridColumn: `${g.from + 1} / ${g.to + 2}`, mt: 0.5, textAlign: "center" }}>
            <Box sx={{ height: 8, border: `2px solid ${ENPS_COLORS[g.key]}`, borderTop: "none", borderRadius: "0 0 4px 4px" }} />
            <Typography variant="caption" fontWeight={700} sx={{ color: ENPS_COLORS[g.key] }}>
              {t(g.label)}
            </Typography>
          </Box>
        ))}
      </Box>

      <Stack spacing={1.5} sx={{ mt: 3, maxWidth: 560, mx: "auto" }}>
        {GROUPS.map((g) => (
          <Stack key={g.key} direction="row" spacing={2} alignItems="flex-start">
            <Box
              sx={{
                flexShrink: 0,
                minWidth: 64,
                textAlign: "center",
                borderRadius: 5,
                px: 1.25,
                py: 0.25,
                bgcolor: alpha(ENPS_COLORS[g.key], 0.15),
                color: ENPS_COLORS[g.key],
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {g.range}
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={800}>
                {t(g.long)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(g.help)}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>

      <Box sx={{ mt: 3, maxWidth: 560, mx: "auto" }}>
        <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
          {t("enps.formulaTitle")}
        </Typography>
        <Box sx={{ bgcolor: "action.hover", borderRadius: 1, px: 2, py: 1.25 }}>
          <Typography fontWeight={800}>{t("enps.formula")}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          {t("enps.formulaHelp")}
        </Typography>
      </Box>
    </Paper>
  );
}
