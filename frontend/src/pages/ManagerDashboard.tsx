import {
  Avatar,
  Box,
  Chip,
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
import type { Evaluation, Paginated, UserRecord } from "@/api/types";
import { performanceColors } from "@/theme";

function OrgChartCard({ user, root }: { user: UserRecord; root?: boolean }) {
  const size = root ? 64 : 48;
  return (
    <Stack alignItems="center" spacing={0.75} sx={{ width: 140 }}>
      <Avatar
        src={user.avatar ?? undefined}
        sx={{ width: size, height: size, bgcolor: "primary.main", fontSize: root ? 22 : 16 }}
      >
        {(user.full_name || user.email).charAt(0).toUpperCase()}
      </Avatar>
      <Paper
        elevation={0}
        sx={{ px: 1.5, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, textAlign: "center", width: "100%" }}
      >
        <Typography variant="body2" fontWeight={700} noWrap>
          {user.full_name || user.email}
        </Typography>
      </Paper>
      <Typography variant="caption" color="text.secondary" textAlign="center" noWrap sx={{ maxWidth: "100%" }}>
        {user.position}
      </Typography>
    </Stack>
  );
}

function OrgChart({ manager, reports }: { manager: UserRecord; reports: UserRecord[] }) {
  return (
    <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider" }}>
      <Stack alignItems="center" spacing={0}>
        <OrgChartCard user={manager} root />
        {reports.length > 0 && (
          <>
            <Box sx={{ width: 2, height: 20, bgcolor: "divider" }} />
            <Box sx={{ height: 2, bgcolor: "divider", width: "90%", maxWidth: 700 }} />
            <Stack direction="row" spacing={3} flexWrap="wrap" justifyContent="center" sx={{ mt: 0, pt: 0 }}>
              {reports.map((r) => (
                <Stack key={r.id} alignItems="center" spacing={0}>
                  <Box sx={{ width: 2, height: 16, bgcolor: "divider" }} />
                  <OrgChartCard user={r} />
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}

export default function ManagerDashboard() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  useEffect(() => {
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } })
      .then((r) => setMembers(r.data.results));
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => setEvaluations(r.data.results));
  }, []);

  const managerRecord = members.find((m) => m.id === user?.id);
  const directReports = members.filter((m) => m.id !== user?.id);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("nav.myTeam")}
      </Typography>

      {managerRecord && <OrgChart manager={managerRecord} reports={directReports} />}

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("dashboard.manager.member")}</TableCell>
                <TableCell>{t("common.position")}</TableCell>
                <TableCell align="right">HSI</TableCell>
                <TableCell align="right">SSI</TableCell>
                <TableCell align="right">{t("dashboard.manager.altitude")}</TableCell>
                <TableCell>{t("dashboard.companyAdmin.performance")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((m) => {
                const evalRow = evaluations.find((e) => e.user === m.id);
                return (
                  <TableRow key={m.id} hover>
                    <TableCell>{m.full_name || m.email}</TableCell>
                    <TableCell>{m.position}</TableCell>
                    <TableCell align="right">{evalRow?.hsi ?? "—"}</TableCell>
                    <TableCell align="right">{evalRow?.ssi ?? "—"}</TableCell>
                    <TableCell align="right">
                      {evalRow ? `${evalRow.altitude_percentage}%` : "—"}
                    </TableCell>
                    <TableCell>
                      {evalRow ? (
                        <Chip
                          size="small"
                          label={t(`common.performance.${evalRow.performance_rating}`)}
                          sx={{
                            bgcolor: performanceColors[evalRow.performance_rating] + "22",
                            color: performanceColors[evalRow.performance_rating],
                            fontWeight: 600,
                          }}
                        />
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
