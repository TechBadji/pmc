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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Department, Evaluation, Paginated } from "@/api/types";
import StatCard from "@/components/StatCard";
import { performanceColors } from "@/theme";

interface DeptRow {
  department: Department;
  avgHsi: number;
  avgSsi: number;
  avgAltitude: number;
  count: number;
}

export default function CompanyAdminDashboard() {
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  useEffect(() => {
    apiClient.get<Paginated<Department>>("/departments/").then((r) => setDepartments(r.data.results));
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => setEvaluations(r.data.results));
  }, []);

  const rows: DeptRow[] = departments.map((department) => {
    const managerEval = evaluations.find((e) => e.user_position && e.user === department.manager);
    const teamEvals = managerEval ? [managerEval] : [];
    const avg = (key: "hsi" | "ssi" | "altitude_percentage") =>
      teamEvals.length
        ? teamEvals.reduce((s, e) => s + Number(e[key]), 0) / teamEvals.length
        : 0;
    return {
      department,
      avgHsi: avg("hsi"),
      avgSsi: avg("ssi"),
      avgAltitude: avg("altitude_percentage"),
      count: department.member_count,
    };
  });

  const companyAvgAltitude = evaluations.length
    ? evaluations.reduce((s, e) => s + Number(e.altitude_percentage), 0) / evaluations.length
    : 0;

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
                <TableCell align="right">{t("dashboard.companyAdmin.hsiManager")}</TableCell>
                <TableCell align="right">{t("dashboard.companyAdmin.ssiManager")}</TableCell>
                <TableCell align="right">{t("dashboard.companyAdmin.performance")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const evalRow = evaluations.find((e) => e.user === row.department.manager);
                const rating = evalRow?.performance_rating;
                return (
                  <TableRow key={row.department.id} hover>
                    <TableCell>{row.department.name}</TableCell>
                    <TableCell>{row.department.manager_name ?? "—"}</TableCell>
                    <TableCell align="right">{row.count}</TableCell>
                    <TableCell align="right">{row.avgHsi ? row.avgHsi.toFixed(2) : "—"}</TableCell>
                    <TableCell align="right">{row.avgSsi ? row.avgSsi.toFixed(2) : "—"}</TableCell>
                    <TableCell align="right">
                      {rating ? (
                        <span
                          style={{
                            color: performanceColors[rating],
                            fontWeight: 600,
                          }}
                          title={t(`common.performance.${rating}`)}
                        >
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
