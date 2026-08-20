import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import SupportOutlinedIcon from "@mui/icons-material/SupportOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
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
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Evaluation, Paginated, UserRecord } from "@/api/types";
import LeadershipOverview from "@/components/LeadershipOverview";
import StatCard from "@/components/StatCard";
import { performanceColors } from "@/theme";
import { average, lastEvaluationByUser, ratingForAltitude } from "@/utils/performance";

/** Tableau de bord du manager : même lecture que celui du CEO — organigramme,
 * indicateurs de tête, puis tableau détaillé cliquable — mais à l'échelle du
 * département. Les deux API appelées sont déjà restreintes côté serveur à
 * l'équipe du manager, la page ne peut donc rien montrer d'autre. */
export default function ManagerDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  const departmentName = managerRecord?.department_name ?? "";

  // La liste contient toutes les campagnes : sans ce tri, une ancienne
  // évaluation pouvait être présentée comme la situation actuelle.
  const lastByUser = useMemo(() => lastEvaluationByUser(evaluations), [evaluations]);

  const rows = members.map((m) => ({ member: m, evaluation: lastByUser.get(m.id) ?? null }));
  // Les indicateurs portent sur l'équipe encadrée. La ligne du manager reste
  // dans le tableau comme repère, mais sa propre note ne se mélange pas à la
  // performance de son équipe : les quatre cartes décrivent la même population.
  const evaluated = rows.filter((r) => r.evaluation !== null && r.member.id !== user?.id);
  const avgAltitude = average(evaluated.map((r) => Number(r.evaluation!.altitude_percentage)));
  // Sous 90 %, les objectifs ne sont pas atteints : c'est la file de travail du
  // manager, celle qui appelle un plan d'action.
  const toSupport = evaluated.filter((r) => Number(r.evaluation!.altitude_percentage) < 90).length;

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h5" fontWeight={700}>
          {t("dashboard.manager.title")}
        </Typography>
        {departmentName && (
          <Chip label={departmentName} color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
        )}
      </Stack>

      {managerRecord && (
        <LeadershipOverview
          root={managerRecord}
          people={directReports}
          titleKey="dashboard.manager.overviewTitle"
          lastEvaluationByUser={lastByUser}
        />
      )}

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <StatCard label={t("dashboard.manager.headcount")} value={directReports.length} icon={<GroupsOutlinedIcon />} />
        <StatCard
          label={t("dashboard.companyAdmin.evaluatedMembers")}
          value={evaluated.length}
          color="#B23FA0"
          icon={<InsightsOutlinedIcon />}
          onClick={() => navigate("/evaluations")}
        />
        <StatCard
          label={t("dashboard.manager.avgPerformance")}
          value={evaluated.length ? `${avgAltitude.toFixed(0)}%` : "—"}
          color="#0ca30c"
          icon={<TrendingUpOutlinedIcon />}
        />
        <StatCard
          label={t("dashboard.manager.toSupport")}
          value={toSupport}
          color={performanceColors.AVERAGE}
          icon={<SupportOutlinedIcon />}
          onClick={() => navigate("/action-plans")}
        />
      </Stack>

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
              {rows.map(({ member, evaluation }) => {
                // Ouvrir la fiche d'évaluation depuis la ligne, comme le CEO
                // ouvre le détail d'un département depuis la sienne.
                const open = evaluation ? () => navigate(`/evaluations/${evaluation.id}`) : undefined;
                const rating = evaluation
                  ? ratingForAltitude(Number(evaluation.altitude_percentage))
                  : null;
                return (
                  <TableRow
                    key={member.id}
                    hover
                    sx={{ cursor: open ? "pointer" : "default" }}
                    onClick={open}
                    tabIndex={open ? 0 : -1}
                    role={open ? "button" : undefined}
                    aria-label={member.full_name || member.email}
                    onKeyDown={(e) => {
                      if (open && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        open();
                      }
                    }}
                  >
                    <TableCell sx={{ fontWeight: member.id === user?.id ? 700 : 400 }}>
                      {member.full_name || member.email}
                    </TableCell>
                    <TableCell>{member.position}</TableCell>
                    <TableCell align="right">{evaluation?.hsi ?? "—"}</TableCell>
                    <TableCell align="right">{evaluation?.ssi ?? "—"}</TableCell>
                    <TableCell align="right">
                      {evaluation && rating ? (
                        <span style={{ color: performanceColors[rating], fontWeight: 600 }}>
                          {evaluation.altitude_percentage}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {evaluation ? (
                        <Chip
                          size="small"
                          label={t(`common.performance.${evaluation.performance_rating}`)}
                          sx={{
                            bgcolor: performanceColors[evaluation.performance_rating] + "22",
                            color: performanceColors[evaluation.performance_rating],
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
