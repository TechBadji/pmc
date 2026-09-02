import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PageHeader from "@/components/layout/PageHeader";
import { cohesionColor } from "@/theme";
import type { CohesionResponse, Paginated } from "@/api/types";
import { useCohesionCriteria } from "@/utils/cohesionCriteria";

const TIERS = [1, 2, 3, 4, 5];
const TIER_LABELS = ["cohesion.legend.1", "cohesion.legend.2", "cohesion.legend.3", "cohesion.legend.4", "cohesion.legend.5"];

/** Pastille de note : le même geste et les mêmes couleurs que la fiche de
 *  l'encadrant, pour que les deux côtés se lisent sur une échelle commune. */
function ScoreOval({
  selected,
  color,
  onClick,
  ariaLabel,
}: {
  selected: boolean;
  color: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: "2px solid",
        borderColor: selected ? color : "divider",
        bgcolor: selected ? color : "background.paper",
        cursor: "pointer",
        p: 0,
        "&:hover": { borderColor: color },
      }}
    />
  );
}

/**
 * L'avis d'un collaborateur sur sa propre direction.
 *
 * L'écran dit d'emblée ce qu'il advient des réponses : aucune n'est lisible
 * nominativement, et rien ne s'affiche tant que la direction n'a pas atteint
 * le nombre minimum de répondants. Ce n'est pas une politesse — c'est la seule
 * chose qui rende les réponses sincères, donc l'exercice utile.
 */
export default function CohesionSurveyPage({ scope = "TEAM" }: { scope?: "TEAM" | "ORGANISATION" }) {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const criteria = useCohesionCriteria();

  const [scores, setScores] = useState<Record<string, number>>({});
  const [existing, setExisting] = useState<CohesionResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient
      .get<Paginated<CohesionResponse>>("/cohesion-responses/", { params: { page_size: 50, scope } })
      .then((r) => {
        // Le dernier avis déposé sert de point de départ : on ajuste son avis,
        // on ne le ressaisit pas de zéro.
        const mine = [...r.data.results].sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null;
        setExisting(mine);
        if (mine) {
          // Indexé par texte et par rang : un avis déposé avant que les
          // libellés ne nomment l'entreprise doit rester relisible.
          const map: Record<string, number> = {};
          mine.scores.forEach((s, index) => {
            map[s.criterion] = s.score;
            map[`#${index}`] = s.score;
          });
          setScores(map);
        }
      })
      .catch(() => setError(true));
  }, [scope]);

  /** Note d'un critère : par son libellé, ou à défaut par son rang — un avis
   * déposé avant que les libellés ne nomment l'entreprise reste relisible. */
  const scoreOf = (criterion: string, index: number) => scores[criterion] ?? scores[`#${index}`];

  const answered = criteria.filter((c, i) => scoreOf(c, i) !== undefined).length;
  const complete = answered === criteria.length;

  async function handleSave() {
    if (scope === "TEAM" && !user?.department) return;
    setSaving(true);
    setError(false);
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      scope,
      // Un avis d'organisation ne vise aucune direction : c'est l'entreprise
      // du répondant qui fait foi, et le serveur la lit sur lui.
      team: scope === "TEAM" ? user?.department ?? null : null,
      date: today,
      scores: criteria
        .map((c, i) => ({ criterion: c, score: scoreOf(c, i) }))
        .filter((entry): entry is { criterion: string; score: number } => entry.score !== undefined),
    };
    try {
      // Un avis par personne et par jour : redéposer le même jour corrige le
      // précédent au lieu d'en ajouter un second.
      if (existing && existing.date === today) {
        const r = await apiClient.patch<CohesionResponse>(`/cohesion-responses/${existing.id}/`, payload);
        setExisting(r.data);
      } else {
        const r = await apiClient.post<CohesionResponse>("/cohesion-responses/", payload);
        setExisting(r.data);
      }
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (scope === "TEAM" && !user?.department) {
    return (
      <Stack spacing={3} maxWidth={1180}>
        <PageHeader title={t("cohesionSurvey.title")} />
        <Alert severity="info">{t("cohesionSurvey.noTeam")}</Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} maxWidth={1180}>
      <PageHeader
        title={t(scope === "TEAM" ? "cohesionSurvey.title" : "cohesionSurvey.titleOrg")}
        subtitle={t(scope === "TEAM" ? "cohesionSurvey.subtitle" : "cohesionSurvey.subtitleOrg", {
          team: user?.department_name ?? "",
          company: user?.company_name ?? "",
        })}
      />

      <Alert severity="info">
        {t(scope === "TEAM" ? "cohesionSurvey.privacy" : "cohesionSurvey.privacyOrg")}
      </Alert>

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ p: 2, pb: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {t("cohesionSurvey.scaleHint")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("cohesionSurvey.progress", { answered, total: criteria.length })}
          </Typography>
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider" } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: "42%", bgcolor: "#dde5ef", color: "#243747", fontWeight: 800, fontSize: 12 }}>
                  {t("cohesion.criterionCol")}
                </TableCell>
                {/* Entêtes à la couleur du barème : c'est le code couleur de la
                    fiche ID-PMC, repris par la pastille sélectionnée. */}
                {TIERS.map((tier) => (
                  <TableCell
                    key={tier}
                    align="center"
                    sx={{
                      bgcolor: cohesionColor(tier),
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 11,
                      lineHeight: 1.25,
                      minWidth: 78,
                    }}
                  >
                    {t(TIER_LABELS[tier - 1]).toUpperCase()}
                    <br />
                    {tier}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 800, fontSize: 12, minWidth: 70 }}>
                  {t("cohesion.totalCol")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {criteria.map((criterion, index) => {
                const value = scoreOf(criterion, index);
                return (
                  <TableRow key={criterion}>
                    <TableCell>
                      <Typography variant="body2">
                        {index + 1}. {criterion}
                      </Typography>
                    </TableCell>
                    {TIERS.map((tier) => (
                      <TableCell key={tier} align="center">
                        <ScoreOval
                          selected={value === tier}
                          color={cohesionColor(tier)}
                          ariaLabel={`${criterion} — ${tier}`}
                          onClick={() => {
                            setScores((current) => ({ ...current, [criterion]: tier }));
                            setSaved(false);
                          }}
                        />
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: 800 }}>
                      {value !== undefined ? value.toFixed(1) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" sx={{ p: 2 }}>
          {error && <Alert severity="error" sx={{ py: 0 }}>{t("cohesionSurvey.saveFailed")}</Alert>}
          {saved && <Alert severity="success" sx={{ py: 0 }}>{t("cohesionSurvey.saved")}</Alert>}
          <Button variant="contained" onClick={handleSave} disabled={saving || !complete}>
            {existing ? t("cohesionSurvey.update") : t("common.save")}
          </Button>
        </Stack>
        {!complete && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "right", px: 2, pb: 2 }}>
            {t("cohesionSurvey.incomplete")}
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
