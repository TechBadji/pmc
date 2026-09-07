import { Alert, Box, Chip, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { cohesionColor } from "@/theme";
import type { CohesionAggregate, CohesionDirectionResult } from "@/api/types";

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
 * Le résultat d'un collectif : une direction, ou l'entreprise entière.
 *
 * Les deux se lisent avec la même planche — le serveur donne d'ailleurs à
 * l'organisation la forme d'une direction. Seuls deux chiffres n'ont pas de
 * sens à l'échelle de l'entreprise et disparaissent alors : l'écart avec la
 * note de l'encadrant, qui n'a pas de fiche pour l'organisation, et l'objectif
 * quand aucune direction n'en a fixé.
 */
function ResultCard({ result, badge }: { result: CohesionDirectionResult; badge?: string }) {
  const { t } = useTranslation();
  const isOrganisation = badge !== undefined;
  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
      <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="flex-start">
        <Stack sx={{ minWidth: 240, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography sx={{ fontWeight: 800 }}>{result.team_name}</Typography>
            {badge && <Chip size="small" color="primary" variant="outlined" label={badge} />}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {t("cohesionOpinion.participation", {
              respondents: result.respondents,
              headcount: result.headcount ?? 0,
            })}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (result.participation ?? 0) * 100)}
            sx={{ mt: 0.75, height: 6, borderRadius: 3 }}
          />
        </Stack>

        {result.published ? (
          <>
            <Figure
              value={result.score !== null ? result.score.toFixed(2) : "—"}
              label={t("cohesionOpinion.score")}
              color={result.score !== null ? cohesionColor(result.score) : undefined}
            />
            <Figure
              value={result.low_share !== null ? `${Math.round(result.low_share * 100)} %` : "—"}
              label={t("cohesionOpinion.lowShare")}
              color={result.low_share !== null && result.low_share > 0.2 ? RED : undefined}
            />
            {/* L'objectif de l'organisation est la moyenne de ceux que les
                directions se sont fixés : sans direction, il n'existe pas, et
                un tiret se lirait comme un objectif manquant plutôt
                qu'inapplicable. */}
            {(!isOrganisation || result.oce != null) && (
              <Figure
                value={result.oce != null ? result.oce.toFixed(2) : "—"}
                label={t("cohesionOpinion.oce")}
              />
            )}
            {/* L'écart n'est affiché que si les deux notes existent : un
                zéro faute de données se lirait comme un accord parfait. */}
            {!isOrganisation && (
              <Figure
                value={result.gap !== null ? `${result.gap > 0 ? "+" : ""}${result.gap.toFixed(2)}` : "—"}
                label={t("cohesionOpinion.gap")}
                color={result.gap !== null && Math.abs(result.gap) >= 1 ? RED : undefined}
              />
            )}
          </>
        ) : (
          <Chip
            size="small"
            color="default"
            label={t("cohesionOpinion.tooFew", { min: result.min_respondents })}
            sx={{ alignSelf: "center" }}
          />
        )}
      </Stack>

      {result.published && result.criteria.length > 0 && (
        <Box sx={{ mt: 2 }}>
          {result.criteria.map((c) => (
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
              {/* La note la plus choisie, avec la part qui l'a choisie :
                  une réponse réellement donnée, là où la moyenne peut
                  désigner une valeur que personne n'a exprimée. */}
              {c.mode !== null && (
                <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                  {t("cohesionOpinion.mostChosen", {
                    note: c.mode,
                    share: Math.round((c.mode_share ?? 0) * 100),
                  })}
                </Typography>
              )}
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
  );
}

/**
 * Résultat des avis : l'entreprise d'abord, puis direction par direction.
 *
 * Trois chiffres vont toujours ensemble, et c'est le fond de la règle : le
 * niveau, la dispersion et la participation. Une moyenne seule est trompeuse
 * ici plus qu'ailleurs — deux directions à 3,5, l'une homogène et l'autre
 * partagée entre 1 et 5, appellent des décisions opposées — et une moyenne
 * calculée sur deux réponses n'a pas le poids d'une moyenne sur six.
 *
 * L'avis porté sur l'entreprise a sa propre planche, et non une ligne de plus
 * parmi les directions : il ne se déduit pas d'elles, et il existe même quand
 * il n'y en a aucune — le cas d'une organisation dont les collaborateurs sont
 * rattachés directement à l'entreprise, où c'est la seule lecture possible.
 */
export default function CohesionOpinionBoard({ data }: { data: CohesionAggregate | null }) {
  const { t } = useTranslation();
  if (!data) return <Alert severity="info">{t("cohesionOpinion.loading")}</Alert>;

  const { directions, company_score: companyScore, organisation } = data;
  const published = directions.filter((d) => d.published);

  // Un écran vide se prend pour une panne. On dit donc ce qui manque : des
  // directions, ou des répondants en nombre suffisant.
  if (directions.length === 0 && !organisation) {
    return <Alert severity="info">{t("cohesionOpinion.noDirection")}</Alert>;
  }

  return (
    <Stack spacing={2}>
      {organisation && (
        <Stack spacing={0.75}>
          <ResultCard result={organisation} badge={t("cohesionOpinion.organisationBadge")} />
          <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
            {t("cohesionOpinion.organisationHint")}
          </Typography>
        </Stack>
      )}

      {directions.length > 0 && (
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
      )}

      {directions.length > 0 && published.length === 0 && (
        <Alert severity="warning">
          {t("cohesionOpinion.noneReachThreshold", { min: directions[0].min_respondents })}
        </Alert>
      )}

      {directions.map((d) => (
        <ResultCard key={d.team} result={d} />
      ))}
    </Stack>
  );
}
