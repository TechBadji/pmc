import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import {
  Avatar,
  Chip,
  IconButton,
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
import { Link, useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { Department, Evaluation, Paginated, UserRecord } from "@/api/types";
import { performanceColors } from "@/theme";
import { lastEvaluationByUser as lastEvalOf } from "@/utils/performance";

export default function DepartmentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [department, setDepartment] = useState<Department | null>(null);
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  useEffect(() => {
    if (!id) return;
    apiClient.get<Department>(`/departments/${id}/`).then((r) => setDepartment(r.data));
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { department: id, page_size: 500 } })
      .then((r) => setMembers(r.data.results));
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => setEvaluations(r.data.results));
  }, [id]);

  const lastEvaluationByUser = useMemo(() => lastEvalOf(evaluations), [evaluations]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton component={Link} to="/" size="small" aria-label={t("common.back")}>
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Stack>
          <Typography variant="h5" fontWeight={700}>
            {department?.name ?? "…"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("common.manager")}: {department?.manager_name ?? "—"} · {t("teams.memberCount", { count: department?.member_count ?? 0 })}
          </Typography>
        </Stack>
      </Stack>

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("dashboard.manager.member")}</TableCell>
                <TableCell>{t("common.position")}</TableCell>
                <TableCell align="center">HSI</TableCell>
                <TableCell align="center">SSI</TableCell>
                <TableCell align="right">{t("dashboard.manager.altitude")}</TableCell>
                <TableCell>{t("dashboard.companyAdmin.performance")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((m) => {
                const last = lastEvaluationByUser.get(m.id);
                return (
                  <TableRow key={m.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar src={m.avatar ?? undefined} sx={{ width: 32, height: 32, fontSize: 14, bgcolor: "primary.main" }}>
                          {(m.full_name || m.email).charAt(0).toUpperCase()}
                        </Avatar>
                        <span>{m.full_name || "—"}</span>
                      </Stack>
                    </TableCell>
                    <TableCell>{m.position}</TableCell>
                    <TableCell align="center">{last?.hsi ?? "—"}</TableCell>
                    <TableCell align="center">{last?.ssi ?? "—"}</TableCell>
                    <TableCell align="right">{last ? `${last.altitude_percentage}%` : "—"}</TableCell>
                    <TableCell>
                      {last ? (
                        <Chip
                          size="small"
                          label={t(`common.performance.${last.performance_rating}`)}
                          sx={{
                            bgcolor: performanceColors[last.performance_rating] + "22",
                            color: performanceColors[last.performance_rating],
                            fontWeight: 600,
                          }}
                        />
                      ) : (
                        <Chip size="small" variant="outlined" label={t("evaluations.notEvaluated")} />
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
