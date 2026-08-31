import { Alert, Box, Chip, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { cohesionColor } from "@/theme";
import type { CohesionAggregate } from "@/api/types";

const RED = "#c62828";

/** Un chiffre et son intitulé, alignés en colonne. */
function Figure({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <Stack sx={{ minWidth: 96 }}>
      <Typography sx={{ fontSize: 22, fontWeight: 800, color: color ?? "text.primary", lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

/**
 * Résultat des avis, direction par direction.
 *
 * Trois chiffres vont toujours ensemble, et c'est le fond de la règle : le
 * niveau, la dispersion et la participation. Une moyenne seule est trompeuse
 * ici plus qu'ailleurs — deux directions à 3,5, l'une homogène et l'autre
 * partagée entre 1 et 5, appellent des décisions opposées — et une moyenne
 * calculée sur deux réponses n'a pas le poids d'une moyenne sur six.
 */
export default function CohesionOpinionBoard({ data }: { data: CohesionAggregate | null }) {
  const { t } = useTranslation();
  if (!data) return <Alert severity="info">{t("cohesionOpinion.loading")}</Alert>;

  const { directions, company_score: companyScore } = data;
  const published = directions.filter((d) => d.published);

  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap alignItems="center">
          <Figure
            value={companyScore !== null ? companyScore.toFixed(2) : "—"}
            label={t("cohesionOpinion.companyScore")}
            color={companyScore !== null ? cohesionColor(companyScore) : undefined}
          />
          <Figure
            value={`${published.length}/${directions.length}`}
            label={t("cohesionOpinion.publishedCount")}
          />
          <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 460 }}>
            {t("cohesionOpinion.companyHint")}
          </Typography>
        </Stack>
      </Paper>

      {directions.map((d) => (
        <Paper key={d.team} elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <Stack sx={{ minWidth: 240, flex: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>{d.team_name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t("cohesionOpinion.participation", {
                  respondents: d.respondents,
                  headcount: d.headcount ?? 0,
                })}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (d.participation ?? 0) * 100)}
                sx={{ mt: 0.75, height: 6, borderRadius: 3 }}
              />
            </Stack>

            {d.published ? (
              <>
                <Figure
                  value={d.score !== null ? d.score.toFixed(2) : "—"}
                  label={t("cohesionOpinion.score")}
                  color={d.score !== null ? cohesionColor(d.score) : undefined}
                />
                <Figure
                  value={d.low_share !== null ? `${Math.round(d.low_share * 100)} %` : "—"}
                  label={t("cohesionOpinion.lowShare")}
                  color={d.low_share !== null && d.low_share > 0.2 ? RED : undefined}
                />
                {/* L'écart n'est affiché que si les deux notes existent : un
                    zéro faute de données se lirait comme un accord parfait. */}
                <Figure
                  value={d.gap !== null ? `${d.gap > 0 ? "+" : ""}${d.gap.toFixed(2)}` : "—"}
                  label={t("cohesionOpinion.gap")}
                  color={d.gap !== null && Math.abs(d.gap) >= 1 ? RED : undefined}
                />
              </>
            ) : (
              <Chip
                size="small"
                color="default"
                label={t("cohesionOpinion.tooFew", { min: d.min_respondents })}
                sx={{ alignSelf: "center" }}
              />
            )}
          </Stack>

          {d.published && d.criteria.length > 0 && (
            <Box sx={{ mt: 2 }}>
              {d.criteria.map((c) => (
                <Stack
                  key={c.criterion}
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ py: 0.6, borderTop: "1px solid", borderColor: "divider" }}
                >
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {c.criterion}
                  </Typography>
                  {c.low_share !== null && c.low_share > 0.2 && (
                    <Typography variant="caption" sx={{ color: RED, fontWeight: 700 }}>
                      {t("cohesionOpinion.lowShareShort", { share: Math.round(c.low_share * 100) })}
                    </Typography>
                  )}
                  <Typography
                    sx={{
                      fontWeight: 800,
                      minWidth: 48,
                      textAlign: "right",
                      color: c.score !== null ? cohesionColor(c.score) : "text.disabled",
                    }}
                  >
                    {c.score !== null ? c.score.toFixed(2) : "—"}
                  </Typography>
                </Stack>
              ))}
            </Box>
          )}
        </Paper>
      ))}
    </Stack>
  );
}
