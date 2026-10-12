import { Alert, Avatar, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PageHeader from "@/components/layout/PageHeader";
import type { Department, Paginated, UserRecord } from "@/api/types";
import { LEADERSHIP_STAT_KEYS, LEADERSHIP_STAT_LABELS, leadershipLine, leadershipStat, type LeadershipStatKey } from "@/utils/leadership";

type Draft = Record<number, Record<LeadershipStatKey, string>>;

/** Saisie rapide des chiffres de l'« Aperçu de l'Équipe Dirigeante » : une
 * ligne par dirigeant, cinq nombres. Ce qui est saisi ici s'affiche tel quel
 * sur le tableau de bord du dirigeant, à la place des valeurs calculées. */
export default function LeadershipStatsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAppSelector((s) => s.auth);
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loadError, setLoadError] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } }),
      apiClient.get<Paginated<Department>>("/departments/", { params: { page_size: 500 } }),
    ])
      .then(([u, d]) => {
        setMembers(u.data.results);
        setDepartments(d.data.results);
      })
      .catch(() => setLoadError(true));
  }, []);

  const people = useMemo(() => leadershipLine(members, user?.id).directors, [members, user?.id]);

  // Chaque case part de la valeur affichée aujourd'hui sur le tableau de bord.
  useEffect(() => {
    const headcount = new Map<number, number>();
    departments.forEach((d) => {
      if (d.manager) headcount.set(d.manager, d.member_count);
    });
    const next: Draft = {};
    people.forEach((p) => {
      next[p.id] = Object.fromEntries(
        LEADERSHIP_STAT_KEYS.map((k) => [k, String(leadershipStat(p, k, headcount.get(p.id)) ?? "")])
      ) as Record<LeadershipStatKey, string>;
    });
    setDraft(next);
  }, [people, departments]);

  async function handleSave() {
    setErrors([]);
    setSaved(false);
    const problems: string[] = [];
    const rows = people.map((p) => {
      const row: Record<string, number | null> = { user: p.id };
      LEADERSHIP_STAT_KEYS.forEach((k) => {
        const raw = (draft[p.id]?.[k] ?? "").trim();
        if (raw === "") row[k] = null;
        else if (/^\d+$/.test(raw)) row[k] = Number(raw);
        else problems.push(t("leadershipStats.notANumber", { name: p.full_name, field: t(LEADERSHIP_STAT_LABELS[k]), value: raw }));
      });
      return row;
    });
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/users/leadership-stats/", { rows }, { silent: true });
      setSaved(true);
    } catch (err: any) {
      const detail = err?.response?.data?.rows;
      setErrors(Array.isArray(detail) ? detail : [typeof detail === "string" ? detail : t("leadershipStats.saveFailed")]);
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "COMPANY_ADMIN") return <Alert severity="info">{t("leadershipStats.adminOnly")}</Alert>;

  return (
    <Stack spacing={2.5} maxWidth={1100}>
      <PageHeader title={t("leadershipStats.title")} subtitle={t("leadershipStats.subtitle")} parent={{ label: t("nav.dashboard"), to: "/" }} />
      {loadError && <Alert severity="error">{t("common.loadError")}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "primary.main" }}>
              <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{t("leadershipStats.person")}</TableCell>
              {LEADERSHIP_STAT_KEYS.map((k) => (
                <TableCell key={k} align="center" sx={{ color: "#fff", fontWeight: 700, lineHeight: 1.2 }}>
                  {t(LEADERSHIP_STAT_LABELS[k])}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {people.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Avatar src={p.avatar ?? undefined} sx={{ width: 34, height: 34 }}>
                      {(p.full_name || p.email).charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" fontWeight={700}>
                        {p.full_name || p.email}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.position}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                {LEADERSHIP_STAT_KEYS.map((k) => (
                  <TableCell key={k} align="center">
                    <TextField
                      size="small"
                      value={draft[p.id]?.[k] ?? ""}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, [p.id]: { ...prev[p.id], [k]: e.target.value } }));
                        setSaved(false);
                      }}
                      inputProps={{ inputMode: "numeric", "aria-label": `${p.full_name} — ${t(LEADERSHIP_STAT_LABELS[k])}`, style: { textAlign: "center" } }}
                      sx={{ width: 84 }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary">
        {t("leadershipStats.hint")}
      </Typography>
      {errors.length > 0 && (
        <Alert severity="error">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Alert>
      )}
      {saved && <Alert severity="success">{t("leadershipStats.saved")}</Alert>}
      <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
        <Button onClick={() => navigate("/")}>{t("leadershipStats.back")}</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || people.length === 0}>
          {t("leadershipStats.save")}
        </Button>
      </Stack>
    </Stack>
  );
}
