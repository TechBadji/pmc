import { Alert, Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { apiClient } from "@/api/client";
import type { ManagerialSelfAssessment, ManagerialSynthesis, Paginated, UserRecord } from "@/api/types";
import { useManagerialAssessmentCategories } from "@/utils/managerialSelfAssessment";

const NO_DEPT = "—";

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(1));

/** Fréquence des mentions d'un texte libre : « Écoute » et « écoute » comptent pour une. */
function tally(lists: string[][]) {
  const map = new Map<string, { label: string; count: number }>();
  lists.flat().forEach((raw) => {
    const label = raw.trim();
    if (!label) return;
    const key = label.toLowerCase();
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { label, count: 1 });
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 10);
}

/**
 * Synthèse du CEO sur l'ensemble du personnel : agrégation de toutes les
 * fiches d'une campagne, soit pour l'entreprise entière, soit direction par
 * direction. La lecture d'un collaborateur reste celle de la fiche individuelle.
 */
export default function ManagerialCompanyOverview({
  campaignId,
  people,
  mode,
}: {
  campaignId: number;
  people: UserRecord[];
  mode: "ALL" | "DEPTS";
}) {
  const { t } = useTranslation();
  const categories = useManagerialAssessmentCategories();
  const [assessments, setAssessments] = useState<ManagerialSelfAssessment[]>([]);
  const [syntheses, setSyntheses] = useState<ManagerialSynthesis[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dept, setDept] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      apiClient.get<Paginated<ManagerialSelfAssessment>>("/managerial-self-assessments/", { params: { campaign: campaignId, page_size: 1000 } }),
      apiClient.get<Paginated<ManagerialSynthesis>>("/managerial-syntheses/", { params: { campaign: campaignId, page_size: 1000 } }),
    ])
      .then(([a, s]) => {
        setAssessments(a.data.results);
        setSyntheses(s.data.results);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const deptOf = useMemo(() => {
    const map = new Map<number, string>();
    people.forEach((p) => map.set(p.id, p.department_name || NO_DEPT));
    return map;
  }, [people]);

  /** IC/OC moyens par catégorie sur un sous-ensemble de collaborateurs. */
  function rowsFor(filter: (userId: number) => boolean) {
    return categories.map((c) => {
      const mine = assessments.filter((a) => a.category === c.key && filter(a.user));
      return {
        category: c.label,
        ic: mean(mine.map((a) => Number(a.ic_score)).filter((v) => !Number.isNaN(v) && v > 0)),
        oc: mean(mine.map((a) => Number(a.oc_score)).filter((v) => !Number.isNaN(v) && v > 0)),
        n: mine.length,
      };
    });
  }

  const departments = useMemo(
    () => [...new Set(people.map((p) => p.department_name || NO_DEPT))].sort((a, b) => a.localeCompare(b)),
    [people]
  );
  const activeDept = dept || departments[0] || "";
  const scope = mode === "ALL" ? () => true : (id: number) => deptOf.get(id) === activeDept;
  const rows = rowsFor(scope);
  const respondents = new Set(assessments.filter((a) => scope(a.user)).map((a) => a.user)).size;
  const headcount = mode === "ALL" ? people.length : people.filter((p) => (p.department_name || NO_DEPT) === activeDept).length;
  const scoped = syntheses.filter((s) => scope(s.user));
  const skills = tally(scoped.map((s) => s.key_skills ?? []));
  const areas = tally(scoped.map((s) => s.improvement_areas ?? []));

  if (error) return <Alert severity="error">{t("managerialSelfAssessment.overview.loadFailed")}</Alert>;
  if (loading) return null;

  const chart = rows.map((r) => ({ category: r.category, ic: r.ic === null ? 0 : Math.round(r.ic * 10) / 10 }));

  return (
    <Stack spacing={3}>
      {mode === "DEPTS" && (
        <Paper variant="outlined" sx={{ overflow: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "primary.main" }}>
                <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{t("managerialSelfAssessment.overview.department")}</TableCell>
                {categories.map((c) => (
                  <TableCell key={c.key} align="center" sx={{ color: "#fff", fontWeight: 700 }}>
                    {c.label}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ color: "#fff", fontWeight: 700 }}>
                  {t("managerialSelfAssessment.overview.respondents")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {departments.map((d) => {
                const r = rowsFor((id) => deptOf.get(id) === d);
                const answered = new Set(assessments.filter((a) => deptOf.get(a.user) === d).map((a) => a.user)).size;
                const total = people.filter((p) => (p.department_name || NO_DEPT) === d).length;
                return (
                  <TableRow key={d} hover selected={d === activeDept} sx={{ cursor: "pointer" }} onClick={() => setDept(d)}>
                    <TableCell sx={{ fontWeight: 700 }}>{d}</TableCell>
                    {r.map((x, i) => (
                      <TableCell key={i} align="center">
                        {fmt(x.ic)}
                      </TableCell>
                    ))}
                    <TableCell align="center">
                      {answered} / {total}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
        <Box sx={{ flex: "3 1 0", minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800}>
            {mode === "ALL" ? t("managerialSelfAssessment.overview.allTitle") : t("managerialSelfAssessment.overview.deptTitle", { name: activeDept })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("managerialSelfAssessment.overview.respondentsOf", { n: respondents, total: headcount })}
          </Typography>
          <ResponsiveContainer width="100%" height={440}>
            <RadarChart data={chart} outerRadius="80%">
              <PolarGrid />
              <PolarAngleAxis dataKey="category" tick={{ fontSize: 13, fontWeight: 600 }} />
              <PolarRadiusAxis domain={[0, 5]} tickCount={6} angle={90} />
              <Radar dataKey="ic" stroke="#2E8FCB" fill="#2E8FCB" fillOpacity={0.45} strokeWidth={2} label={{ fontSize: 12, fontWeight: 800, fill: "#1c5f8c" }} />
            </RadarChart>
          </ResponsiveContainer>
          <Table size="small" sx={{ maxWidth: 520 }}>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell align="center">IC</TableCell>
                <TableCell align="center">OC</TableCell>
                <TableCell align="center">{t("managerialSelfAssessment.overview.forms")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.category}>
                  <TableCell sx={{ fontWeight: 600 }}>{r.category}</TableCell>
                  <TableCell align="center">{fmt(r.ic)}</TableCell>
                  <TableCell align="center">{fmt(r.oc)}</TableCell>
                  <TableCell align="center">{r.n}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        <Stack sx={{ flex: "1 1 0", minWidth: { lg: 300 } }} spacing={2}>
          {[
            { title: t("managerialSelfAssessment.keySkillsTitle"), color: "#3F9142", items: skills },
            { title: t("managerialSelfAssessment.improvementAreasTitle"), color: "#8B2E2E", items: areas },
          ].map((block) => (
            <Paper key={block.title} variant="outlined" sx={{ overflow: "hidden" }}>
              <Box sx={{ bgcolor: block.color, color: "#fff", px: 2, py: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800}>
                  {block.title}
                </Typography>
              </Box>
              <Stack spacing={0.75} sx={{ p: 1.5 }}>
                {block.items.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    —
                  </Typography>
                )}
                {block.items.map((it) => (
                  <Stack key={it.label} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Typography variant="body2">{it.label}</Typography>
                    <Chip size="small" label={`×${it.count}`} />
                  </Stack>
                ))}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}
