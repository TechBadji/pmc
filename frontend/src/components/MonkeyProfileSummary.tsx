import { Alert, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { apiClient } from "@/api/client";
import { performanceColors } from "@/theme";
import type { MonkeyManagementAssessment, MonkeyManagementLevel, Paginated, UserRecord } from "@/api/types";

// Du meilleur profil au plus risqué, avec les couleurs de la jauge individuelle.
const PROFILES: { key: MonkeyManagementLevel; color: string }[] = [
  { key: "EMPOWERING_LEADER", color: performanceColors.OUTSTANDING },
  { key: "GOOD_DELEGATOR", color: performanceColors.GOOD },
  { key: "MONKEY_RISK", color: "#ef6c00" },
  { key: "MONKEY_MAGNET", color: "#b71c1c" },
];
const ALL = "__all__";
const DEFAULT_SCOPE = "SUNU Group";

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

/**
 * Synthèse Monkey Management pour le CEO : la répartition, en pourcentage, des
 * collaborateurs d'une direction (SUNU Group par défaut) ou de toute l'entreprise
 * entre les quatre profils — Empowering Leader, Bon délégateur, Monkey Risk,
 * Monkey Magnet — sur la campagne choisie.
 */
export default function MonkeyProfileSummary({ campaignId, people }: { campaignId: number; people: UserRecord[] }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MonkeyManagementAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const departments = useMemo(
    () => [...new Set(people.map((p) => p.department_name).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b)),
    [people]
  );
  const [scope, setScope] = useState<string>(DEFAULT_SCOPE);
  const activeScope = scope === ALL || departments.includes(scope) ? scope : departments[0] ?? ALL;

  useEffect(() => {
    setLoading(true);
    setError(false);
    apiClient
      .get<Paginated<MonkeyManagementAssessment>>("/monkey-management-assessments/", { params: { campaign: campaignId, page_size: 1000 } })
      .then((r) => setRows(r.data.results))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const deptOf = useMemo(() => new Map(people.map((p) => [p.id, p.department_name])), [people]);
  const scoped = rows.filter((a) => a.level && (activeScope === ALL || deptOf.get(a.user) === activeScope));
  const total = scoped.length;
  const data = PROFILES.map((p) => {
    const count = scoped.filter((a) => a.level === p.key).length;
    return { key: p.key, name: t(`monkeyManagement.levels.${p.key}.title`), count, value: pct(count, total), color: p.color };
  });

  if (error) return <Alert severity="error">{t("monkeyManagement.summary.loadFailed")}</Alert>;

  return (
    <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "flex-start" }} sx={{ mb: 2 }}>
        <div>
          <Typography variant="subtitle1" fontWeight={800}>
            {t("monkeyManagement.summary.title", { name: activeScope === ALL ? t("monkeyManagement.summary.allCompany") : activeScope })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("monkeyManagement.summary.hint", { n: total })}
          </Typography>
        </div>
        <TextField select size="small" label={t("monkeyManagement.summary.scope")} value={activeScope} onChange={(e) => setScope(e.target.value)} sx={{ minWidth: 260 }}>
          <MenuItem value={ALL}>{t("monkeyManagement.summary.allCompany")}</MenuItem>
          {departments.map((d) => (
            <MenuItem key={d} value={d}>
              {d}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {!loading && total === 0 ? (
        <Alert severity="info">{t("monkeyManagement.summary.empty")}</Alert>
      ) : (
        <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
          <div style={{ flex: "2 1 0", minWidth: 0, maxWidth: 560 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v} %`} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={70} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                  <LabelList dataKey="value" position="top" formatter={(v: number) => fmt(v)} style={{ fontSize: 13, fontWeight: 800 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Table size="small" sx={{ flex: "1 1 0", alignSelf: "flex-start", minWidth: { lg: 280 } }}>
            <TableHead>
              <TableRow>
                <TableCell>{t("monkeyManagement.summary.profile")}</TableCell>
                <TableCell align="right">{t("monkeyManagement.summary.count")}</TableCell>
                <TableCell align="right">%</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.key}>
                  <TableCell sx={{ fontWeight: 700, color: d.color }}>{d.name}</TableCell>
                  <TableCell align="right">{d.count}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {fmt(d.value)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>{t("monkeyManagement.summary.total")}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800 }}>
                  {total}
                </TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableBody>
          </Table>
        </Stack>
      )}
    </Paper>
  );
}
