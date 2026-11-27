import { Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { ENPS_COLORS, enpsReading, type EnpsCategory, type EnpsSummary } from "@/utils/enps";

const ORDER: { key: EnpsCategory; label: string }[] = [
  { key: "detractor", label: "enps.detractors" },
  { key: "passive", label: "enps.passives" },
  { key: "promoter", label: "enps.promoters" },
];

function signed(v: number) {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}`;
}

/** Position (0-100 %) d'un eNPS sur l'échelle −100 → +100. */
const at = (v: number) => (v + 100) / 2;

/** eNPS par direction, façon tableau de bord de conseil : directions classées,
 *  barre 100 % des trois catégories, eNPS sur une échelle −100 → +100 avec la
 *  moyenne de l'entreprise en repère, écart à l'entreprise. Les directions sous
 *  le seuil d'anonymat sont listées à part, sans chiffres. */
export default function EnpsDirectionsChart({ teams, company }: { teams: EnpsSummary[]; company?: EnpsSummary }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const published = teams.filter((s) => s.published && s.enps !== undefined).sort((a, b) => b.enps! - a.enps!);
  const hidden = teams.filter((s) => !(s.published && s.enps !== undefined));
  const benchmark = company?.published ? company.enps : undefined;
  const rule = theme.palette.divider;
  const grid = "minmax(160px, 1.1fr) minmax(220px, 2fr) minmax(170px, 1.2fr) 130px";

  return (
    <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
      <Box sx={{ px: { xs: 2, md: 3 }, pt: 2.5, pb: 2, borderBottom: `3px solid ${theme.palette.primary.main}` }}>
        <Typography variant="overline" color="primary" fontWeight={800} sx={{ letterSpacing: 1.2, lineHeight: 1.4 }}>
          {t("enps.directions.kicker")}
        </Typography>
        <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.25 }}>
          {t("enps.directions.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {benchmark !== undefined ? t("enps.directions.subtitle", { value: signed(benchmark) }) : t("enps.directions.subtitleNoBenchmark")}
        </Typography>
        <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          {ORDER.map((c) => (
            <Stack key={c.key} direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 12, height: 12, borderRadius: "2px", bgcolor: ENPS_COLORS[c.key] }} />
              <Typography variant="caption" fontWeight={600}>
                {t(c.label)}
              </Typography>
            </Stack>
          ))}
          {benchmark !== undefined && (
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 0, height: 14, borderLeft: `2px dashed ${theme.palette.text.primary}` }} />
              <Typography variant="caption" fontWeight={600}>
                {t("enps.directions.benchmark")}
              </Typography>
            </Stack>
          )}
        </Stack>
      </Box>

      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: 720, px: { xs: 2, md: 3 }, pb: 1 }}>
          {/* En-têtes de colonnes */}
          <Box sx={{ display: "grid", gridTemplateColumns: grid, columnGap: 2, alignItems: "end", py: 1.25, borderBottom: `1px solid ${rule}` }}>
            {["direction", "split", "scale", "score"].map((k, i) => (
              <Typography
                key={k}
                variant="caption"
                color="text.secondary"
                fontWeight={700}
                sx={{ letterSpacing: 0.3, textAlign: i === 3 ? "right" : "left" }}
              >
                {t(`enps.directions.col.${k}`)}
              </Typography>
            ))}
          </Box>
          {/* Graduations de l'échelle −100 → +100, alignées sur la 3ᵉ colonne */}
          <Box sx={{ display: "grid", gridTemplateColumns: grid, columnGap: 2, pt: 0.75 }}>
            <Box />
            <Box />
            <Box sx={{ position: "relative", height: 14 }}>
              {[-100, -50, 0, 50, 100].map((v) => (
                <Typography
                  key={v}
                  variant="caption"
                  color="text.secondary"
                  sx={{ position: "absolute", left: `${at(v)}%`, transform: "translateX(-50%)", fontSize: 10, lineHeight: 1 }}
                >
                  {signed(v)}
                </Typography>
              ))}
            </Box>
            <Box />
          </Box>

          {published.map((s, index) => {
            const reading = enpsReading(s.enps!);
            const gap = benchmark !== undefined ? s.enps! - benchmark : undefined;
            return (
              <Box
                key={s.team}
                sx={{
                  display: "grid",
                  gridTemplateColumns: grid,
                  columnGap: 2,
                  alignItems: "center",
                  py: 1.25,
                  borderBottom: `1px solid ${rule}`,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ minWidth: 16 }}>
                      {index + 1}
                    </Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.25 }}>
                      {s.team_name}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ pl: 3, display: "block" }}>
                    {t("enps.directions.participation", { n: s.respondents, headcount: s.headcount })}
                  </Typography>
                </Box>

                {/* Barre 100 % : détracteurs, neutres, promoteurs */}
                <Box sx={{ display: "flex", height: 22, borderRadius: "3px", overflow: "hidden", bgcolor: alpha(rule, 0.4) }}>
                  {ORDER.map((c) => {
                    const p = s.percentages![c.key];
                    if (!p) return null;
                    return (
                      <Tooltip key={c.key} title={`${t(c.label)} : ${Math.round(p)} % (${s.counts![c.key]})`}>
                        <Box
                          sx={{
                            width: `${p}%`,
                            bgcolor: ENPS_COLORS[c.key],
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRight: "1px solid rgba(255,255,255,0.6)",
                            "&:last-of-type": { borderRight: "none" },
                          }}
                        >
                          {p >= 12 ? `${Math.round(p)}%` : ""}
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>

                {/* Échelle −100 → +100 : zéro, moyenne entreprise, point de la direction */}
                <Box sx={{ position: "relative", height: 22 }}>
                  <Box sx={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, bgcolor: alpha(theme.palette.text.primary, 0.12) }} />
                  <Box sx={{ position: "absolute", top: 2, bottom: 2, left: "50%", width: "1px", bgcolor: alpha(theme.palette.text.primary, 0.35) }} />
                  {benchmark !== undefined && (
                    <Box sx={{ position: "absolute", top: -4, bottom: -4, left: `${at(benchmark)}%`, borderLeft: `2px dashed ${theme.palette.text.primary}`, opacity: 0.55 }} />
                  )}
                  <Box
                    sx={{
                      position: "absolute",
                      top: "50%",
                      height: 4,
                      transform: "translateY(-50%)",
                      left: `${Math.min(50, at(s.enps!))}%`,
                      width: `${Math.abs(at(s.enps!) - 50)}%`,
                      bgcolor: alpha(reading.color, 0.45),
                      borderRadius: 2,
                    }}
                  />
                  <Tooltip title={`eNPS ${signed(s.enps!)}`}>
                    <Box
                      sx={{
                        position: "absolute",
                        top: "50%",
                        left: `${at(s.enps!)}%`,
                        width: 14,
                        height: 14,
                        transform: "translate(-50%, -50%)",
                        borderRadius: "50%",
                        bgcolor: reading.color,
                        border: `2px solid ${theme.palette.background.paper}`,
                        boxShadow: `0 0 0 1px ${reading.color}`,
                      }}
                    />
                  </Tooltip>
                </Box>

                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: reading.color }}>{signed(s.enps!)}</Typography>
                  {gap !== undefined && (
                    <Typography variant="caption" noWrap component="div" sx={{ color: gap > 0 ? ENPS_COLORS.promoter : gap < 0 ? ENPS_COLORS.detractor : "text.secondary", fontWeight: 600 }}>
                      {gap === 0 ? t("enps.directions.atBenchmark") : t("enps.directions.gap", { value: signed(gap) })}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}

          {hidden.length > 0 && (
            <Box sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
                {t("enps.directions.notPublishedTitle", { min: hidden[0].min_respondents })}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                {hidden.map((s) => (
                  <Box key={s.team} sx={{ px: 1.25, py: 0.5, borderRadius: 1, border: `1px dashed ${rule}`, color: "text.secondary" }}>
                    <Typography variant="caption" fontWeight={600}>
                      {s.team_name} · {t("enps.directions.participation", { n: s.respondents, headcount: s.headcount })}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary" component="p" sx={{ px: { xs: 2, md: 3 }, py: 1.25, borderTop: `1px solid ${rule}`, fontStyle: "italic" }}>
        {t("enps.directions.source")}
      </Typography>
    </Paper>
  );
}
