import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import WorkspacesOutlinedIcon from "@mui/icons-material/WorkspacesOutlined";
import {
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
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { Department, Evaluation, Paginated, UserRecord } from "@/api/types";
import StatCard from "@/components/StatCard";
import { performanceColors } from "@/theme";

interface DeptRow {
  department: Department;
  avgHsi: number;
  avgSsi: number;
  avgAltitude: number;
  evaluatedCount: number;
}

function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export default function CompanyAdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  useEffect(() => {
    apiClient.get<Paginated<Department>>("/departments/", { params: { page_size: 500 } }).then((r) => setDepartments(r.data.results));
    apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } }).then((r) => setMembers(r.data.results));
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => setEvaluations(r.data.results));
  }, []);

  // Dernière évaluation connue par collaborateur (même logique que
  // EvaluationsPage/ID3AMatrixPage) — sert de base aux moyennes par
  // département, plutôt que la seule évaluation du manager comme proxy.
  const lastEvaluationByUser = useMemo(() => {
    const byUser = new Map<number, Evaluation[]>();
    evaluations.forEach((e) => {
      if (!byUser.has(e.user)) byUser.set(e.user, []);
      byUser.get(e.user)!.push(e);
    });
    const last = new Map<number, Evaluation>();
    byUser.forEach((list, userId) => {
      const sorted = [...list].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
      last.set(userId, sorted[sorted.length - 1]);
    });
    return last;
  }, [evaluations]);

  const rows: DeptRow[] = departments.map((department) => {
    const deptMembers = members.filter((m) => m.department === department.id);
    const deptEvals = deptMembers
      .map((m) => lastEvaluationByUser.get(m.id))
      .filter((e): e is Evaluation => e !== undefined);
    return {
      department,
      avgHsi: average(deptEvals.map((e) => Number(e.hsi))),
      avgSsi: average(deptEvals.map((e) => Number(e.ssi))),
      avgAltitude: average(deptEvals.map((e) => Number(e.altitude_percentage))),
      evaluatedCount: deptEvals.length,
    };
  });

  const companyAvgAltitude = evaluations.length
    ? evaluations.reduce((s, e) => s + Number(e.altitude_percentage), 0) / evaluations.length
    : 0;

  function ratingForAltitude(pct: number) {
    if (pct < 50) return "VERY_LOW" as const;
    if (pct < 75) return "LOW" as const;
    if (pct < 90) return "AVERAGE" as const;
    if (pct <= 100) return "GOOD" as const;
    return "OUTSTANDING" as const;
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("dashboard.companyAdmin.title")}
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <StatCard label={t("common.department")} value={departments.length} icon={<WorkspacesOutlinedIcon />} />
        <StatCard
          label={t("dashboard.companyAdmin.evaluatedMembers")}
          value={evaluations.length}
          color="#B23FA0"
          icon={<GroupsOutlinedIcon />}
        />
        <StatCard
          label={t("dashboard.companyAdmin.avgPerformance")}
          value={`${companyAvgAltitude.toFixed(0)}%`}
          color="#0ca30c"
          icon={<TrendingUpOutlinedIcon />}
        />
      </Stack>

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("common.department")}</TableCell>
                <TableCell>{t("common.manager")}</TableCell>
                <TableCell align="right">{t("dashboard.companyAdmin.headcount")}</TableCell>
                <TableCell align="right">HSI</TableCell>
                <TableCell align="right">SSI</TableCell>
                <TableCell align="right">{t("dashboard.companyAdmin.performance")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const rating = row.evaluatedCount ? ratingForAltitude(row.avgAltitude) : null;
                return (
                  <TableRow
                    key={row.department.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/departments/${row.department.id}`)}
                    tabIndex={0}
                    role="button"
                    aria-label={row.department.name}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/departments/${row.department.id}`);
                      }
                    }}
                  >
                    <TableCell>{row.department.name}</TableCell>
                    <TableCell>{row.department.manager_name ?? "—"}</TableCell>
                    <TableCell align="right">{row.department.member_count}</TableCell>
                    <TableCell align="right">{row.evaluatedCount ? row.avgHsi.toFixed(2) : "—"}</TableCell>
                    <TableCell align="right">{row.evaluatedCount ? row.avgSsi.toFixed(2) : "—"}</TableCell>
                    <TableCell align="right">
                      {rating ? (
                        <span style={{ color: performanceColors[rating], fontWeight: 600 }} title={t(`common.performance.${rating}`)}>
                          {row.avgAltitude.toFixed(0)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
