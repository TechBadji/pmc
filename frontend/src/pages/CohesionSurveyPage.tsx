import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PageHeader from "@/components/layout/PageHeader";
import { cohesionColor } from "@/theme";
import type { CohesionResponse, Paginated } from "@/api/types";

/** Note portée sur un critère : cinq pastilles, de « très faible » à « très
 *  élevé ». Le même geste que la fiche de l'encadrant, pour que la lecture des
 *  deux côtés se fasse sur la même échelle. */
function ScoreRow({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      alignItems={{ xs: "flex-start", sm: "center" }}
      justifyContent="space-between"
      sx={{ py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}
    >
      <Typography variant="body2" sx={{ flex: 1, pr: 2 }}>
        {label}
      </Typography>
      <Stack direction="row" spacing={0.75}>
        {[1, 2, 3, 4, 5].map((tier) => {
          const selected = value === tier;
          return (
            <Box
              key={tier}
              component="button"
              type="button"
              aria-label={`${label} — ${tier}`}
              aria-pressed={selected}
              onClick={() => onChange(tier)}
              sx={{
                width: 40,
                height: 34,
                borderRadius: 1,
                border: "2px solid",
                borderColor: selected ? cohesionColor(tier) : "divider",
                bgcolor: selected ? cohesionColor(tier) : "background.paper",
                color: selected ? "#fff" : "text.secondary",
                fontWeight: 700,
                cursor: "pointer",
                "&:hover": { borderColor: cohesionColor(tier) },
              }}
            >
              {tier}
            </Box>
          );
        })}
      </Stack>
    </Stack>
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
export default function CohesionSurveyPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const criteria = t("cohesion.criteria", { returnObjects: true }) as string[];

  const [scores, setScores] = useState<Record<string, number>>({});
  const [existing, setExisting] = useState<CohesionResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient
      .get<Paginated<CohesionResponse>>("/cohesion-responses/", { params: { page_size: 50 } })
      .then((r) => {
        // Le dernier avis déposé sert de point de départ : on ajuste son avis,
        // on ne le ressaisit pas de zéro.
        const mine = [...r.data.results].sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null;
        setExisting(mine);
        if (mine) {
          const map: Record<string, number> = {};
          mine.scores.forEach((s) => {
            map[s.criterion] = s.score;
          });
          setScores(map);
        }
      })
      .catch(() => setError(true));
  }, []);

  const answered = criteria.filter((c) => scores[c] !== undefined).length;
  const complete = answered === criteria.length;

  async function handleSave() {
    if (!user?.department) return;
    setSaving(true);
    setError(false);
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      team: user.department,
      date: today,
      scores: criteria
        .filter((c) => scores[c] !== undefined)
        .map((c) => ({ criterion: c, score: scores[c] })),
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

  if (!user?.department) {
    return (
      <Stack spacing={3} maxWidth={900}>
        <PageHeader title={t("cohesionSurvey.title")} />
        <Alert severity="info">{t("cohesionSurvey.noTeam")}</Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} maxWidth={900}>
      <PageHeader
        title={t("cohesionSurvey.title")}
        subtitle={t("cohesionSurvey.subtitle", { team: user.department_name ?? "" })}
      />

      <Alert severity="info">{t("cohesionSurvey.privacy")}</Alert>

      <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {t("cohesionSurvey.scaleHint")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("cohesionSurvey.progress", { answered, total: criteria.length })}
          </Typography>
        </Stack>

        {criteria.map((criterion) => (
          <ScoreRow
            key={criterion}
            label={criterion}
            value={scores[criterion] ?? null}
            onChange={(v) => {
              setScores((current) => ({ ...current, [criterion]: v }));
              setSaved(false);
            }}
          />
        ))}

        <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" sx={{ mt: 2 }}>
          {error && <Alert severity="error" sx={{ py: 0 }}>{t("cohesionSurvey.saveFailed")}</Alert>}
          {saved && <Alert severity="success" sx={{ py: 0 }}>{t("cohesionSurvey.saved")}</Alert>}
          <Button variant="contained" onClick={handleSave} disabled={saving || !complete}>
            {existing ? t("cohesionSurvey.update") : t("common.save")}
          </Button>
        </Stack>
        {!complete && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "right", mt: 0.5 }}>
            {t("cohesionSurvey.incomplete")}
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
