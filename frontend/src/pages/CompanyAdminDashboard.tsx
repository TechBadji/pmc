import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
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
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Department, Evaluation, Paginated, UserRecord } from "@/api/types";
import LeadershipOverview from "@/components/LeadershipOverview";
import StatCard from "@/components/StatCard";
import { EXECUTIVE_BADGE_COLOR, performanceColors } from "@/theme";
import { average, lastEvaluationByUser as lastByUserOf, ratingForAltitude } from "@/utils/performance";

interface DeptRow {
  department: Department;
  avgHsi: number;
  avgSsi: number;
  avgAltitude: number;
  evaluatedCount: number;
}

export default function CompanyAdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAppSelector((s) => s.auth);
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
  const lastEvaluationByUser = useMemo(() => lastByUserOf(evaluations), [evaluations]);

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

  const directors = members.filter((m) => m.role === "MANAGER");
  // Effectif encadré par chaque directeur : dernière ligne du tableau de tête.
  const headcountByDirector = new Map<number, number>();
  departments.forEach((d) => {
    if (d.manager) headcountByDirector.set(d.manager, d.member_count);
  });

  return (
    <Stack spacing={3}>
      {user && (
        <LeadershipOverview
          root={user}
          people={directors}
          headcountById={headcountByDirector}
          lastEvaluationByUser={lastEvaluationByUser}
        />
      )}

      <PageHeader title={t("dashboard.companyAdmin.title")} />
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <StatCard label={t("common.department")} value={departments.length} icon={<WorkspacesOutlinedIcon />} />
        <StatCard
          label={t("dashboard.companyAdmin.evaluatedMembers")}
          value={evaluations.length}
          color="#B23FA0"
          icon={<GroupsOutlinedIcon />}
        />
        <StatCard
          label={t("nav.directorsReview")}
          value={directors.length}
          color={EXECUTIVE_BADGE_COLOR}
          icon={<InsightsOutlinedIcon />}
          onClick={() => navigate("/directors-performance-review")}
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
