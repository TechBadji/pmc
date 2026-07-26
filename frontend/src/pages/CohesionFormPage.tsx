import {
  Button,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Rating,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Department, Paginated } from "@/api/types";

export default function CohesionFormPage() {
  const { t } = useTranslation();
  const criteria = t("cohesion.criteria", { returnObjects: true }) as string[];
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");
  const [scores, setScores] = useState<number[]>(Array(criteria.length).fill(3));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.get<Paginated<Department>>("/departments/").then((r) => {
      setDepartments(r.data.results);
      if (r.data.results.length === 1) setTeamId(r.data.results[0].id);
    });
  }, []);

  const ice = scores.reduce((s, v) => s + v, 0) / scores.length;

  async function handleSubmit() {
    if (!teamId) return;
    await apiClient.post("/cohesion-analyses/", {
      team: teamId,
      date: new Date().toISOString().slice(0, 10),
      criterion_scores: criteria.map((criterion, i) => ({ criterion, score: scores[i] })),
    });
    setSaved(true);
  }

  return (
    <Stack spacing={3} maxWidth={780}>
      <Typography variant="h5" fontWeight={700}>
        {t("cohesion.title")}
      </Typography>

      <TextField
        select
        label={t("cohesion.team")}
        value={teamId}
        onChange={(e) => {
          setTeamId(Number(e.target.value));
          setSaved(false);
        }}
        sx={{ maxWidth: 320 }}
      >
        {departments.map((d) => (
          <MenuItem key={d.id} value={d.id}>
            {d.name}
          </MenuItem>
        ))}
      </TextField>

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <Stack divider={<span />} sx={{ "& > div": { borderBottom: "1px solid #e1e0d9" }, "& > div:last-child": { borderBottom: "none" } }}>
          {criteria.map((criterion, i) => (
            <Stack key={i} direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ maxWidth: 480 }}>
                {i + 1}. {criterion}
              </Typography>
              <RadioGroup
                row
                value={scores[i]}
                onChange={(e) => {
                  const next = [...scores];
                  next[i] = Number(e.target.value);
                  setScores(next);
                  setSaved(false);
                }}
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <Stack key={v} alignItems="center">
                    <Radio value={v} size="small" />
                    <Typography variant="caption" color="text.secondary">
                      {v}
                    </Typography>
                  </Stack>
                ))}
              </RadioGroup>
            </Stack>
          ))}
        </Stack>
      </Paper>

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {t("cohesion.iceLabel")}
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {ice.toFixed(1)} / 5
          </Typography>
          <Rating value={ice} precision={0.1} readOnly size="small" />
        </Stack>
        <Button variant="contained" onClick={handleSubmit} disabled={!teamId}>
          {t("cohesion.save")}
        </Button>
      </Stack>
      {saved && <Typography color="success.main">{t("cohesion.saved")}</Typography>}
    </Stack>
  );
}
