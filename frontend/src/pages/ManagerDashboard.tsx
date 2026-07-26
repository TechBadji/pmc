import {
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
import type { Evaluation, Paginated, UserRecord } from "@/api/types";
import { performanceColors } from "@/theme";

export default function ManagerDashboard() {
  const { t } = useTranslation();
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

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("nav.myTeam")}
      </Typography>
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
