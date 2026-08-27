import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
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
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Department, Evaluation, Paginated, UserRecord } from "@/api/types";
import LeadershipOverview from "@/components/LeadershipOverview";
import StatCard from "@/components/StatCard";
import { EXECUTIVE_BADGE_COLOR, performanceColors } from "@/theme";
import { SUPPORT_THRESHOLD, average, lastEvaluationByUser, ratingForAltitude } from "@/utils/performance";

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
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } })
      .then((r) => setMembers(r.data.results));
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => setEvaluations(r.data.results));
    // Départements encadrés : la direction et, le cas échéant, ses services.
    apiClient
      .get<Paginated<Department>>("/departments/", { params: { page_size: 500 } })
      .then((r) => setDepartments(r.data.results))
      .catch(() => setDepartments([]));
  }, []);

  const managerRecord = members.find((m) => m.id === user?.id);
  const directReports = members.filter((m) => m.id !== user?.id);
  const departmentName = managerRecord?.department_name ?? "";

  /** Services de la direction encadrée. Vide tant qu'aucun service n'existe :
   * la page reste alors exactement celle d'aujourd'hui. */
  const myDirection = departments.find((d) => d.manager === user?.id && d.parent === null) ?? null;
  const services = myDirection ? departments.filter((d) => d.parent === myDirection.id) : [];

  // La liste contient toutes les campagnes : sans ce tri, une ancienne
  // évaluation pouvait être présentée comme la situation actuelle.
  const lastByUser = useMemo(() => lastEvaluationByUser(evaluations), [evaluations]);

  /** Colonnes de l'organigramme : les chefs de service et les rattachés
   * directs dès qu'il existe des services — sinon toute l'équipe, comme
   * aujourd'hui. C'est la même lecture que chez le CEO, qui montre ses
   * directeurs et non l'ensemble des collaborateurs. */
  const serviceHeadIds = new Set(services.map((s) => s.manager).filter((id): id is number => id !== null));
  const overviewPeople =
    services.length === 0
      ? directReports
      : directReports.filter((m) => serviceHeadIds.has(m.id) || m.department === myDirection?.id);
  /** Effectif encadré par chaque chef de service : remplit la dernière ligne
   * du tableau des parcours, vide en l'absence de service. */
  const headcountByHead = new Map<number, number>();
  services.forEach((s) => {
    if (s.manager !== null) headcountByHead.set(s.manager, s.member_count);
  });

  const rows = members.map((m) => ({ member: m, evaluation: lastByUser.get(m.id) ?? null }));
  // Les indicateurs portent sur l'équipe encadrée. La ligne du manager reste
  // dans le tableau comme repère, mais sa propre note ne se mélange pas à la
  // performance de son équipe : les quatre cartes décrivent la même population.
  const evaluated = rows.filter((r) => r.evaluation !== null && r.member.id !== user?.id);
  const avgAltitude = average(evaluated.map((r) => Number(r.evaluation!.altitude_percentage)));
  // Même seuil que la liste "à accompagner" de la page Plans d'action, vers
  // laquelle mène la carte : les deux doivent compter les mêmes personnes.
  const toSupport = evaluated.filter(
    (r) => Number(r.evaluation!.altitude_percentage) < SUPPORT_THRESHOLD
  ).length;

  return (
    <Stack spacing={3}>
      <PageHeader title={departmentName ? `${t("dashboard.manager.title")} — ${departmentName}` : t("dashboard.manager.title")} />

      {managerRecord && (
        <LeadershipOverview
          root={managerRecord}
          people={overviewPeople}
          headcountById={headcountByHead}
          titleKey="dashboard.manager.overviewTitle"
          lastEvaluationByUser={lastByUser}
        />
      )}

      {/* Consolidation par service : la même lecture que le tableau du CEO sur
        * ses directions. Rien ne s'affiche tant que la direction n'a pas de
        * service. */}
      {services.length > 0 && (
        <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ px: 2, pt: 2 }}>
            {t("dashboard.manager.servicesTitle", { count: services.length })}
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("dashboard.manager.service")}</TableCell>
                  <TableCell>{t("departments.serviceHead")}</TableCell>
                  <TableCell align="right">{t("dashboard.companyAdmin.headcount")}</TableCell>
                  <TableCell align="right">HSI</TableCell>
                  <TableCell align="right">SSI</TableCell>
                  <TableCell align="right">{t("dashboard.companyAdmin.performance")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.map((service) => {
                  const serviceEvals = members
                    .filter((m) => m.department === service.id)
                    .map((m) => lastByUser.get(m.id))
                    .filter((e): e is Evaluation => e !== undefined);
                  const avg = average(serviceEvals.map((e) => Number(e.altitude_percentage)));
                  const rating = serviceEvals.length ? ratingForAltitude(avg) : null;
                  const open = () => navigate(`/departments/${service.id}`);
                  return (
                    <TableRow
                      key={service.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={open}
                      tabIndex={0}
                      role="button"
                      aria-label={service.name}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open();
                        }
                      }}
                    >
                      <TableCell>{service.name}</TableCell>
                      <TableCell>{service.manager_name ?? "—"}</TableCell>
                      <TableCell align="right">{service.member_count}</TableCell>
                      <TableCell align="right">
                        {serviceEvals.length ? average(serviceEvals.map((e) => Number(e.hsi))).toFixed(2) : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {serviceEvals.length ? average(serviceEvals.map((e) => Number(e.ssi))).toFixed(2) : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {rating ? (
                          <span style={{ color: performanceColors[rating], fontWeight: 600 }}>{avg.toFixed(0)}%</span>
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
      )}

      {/* Quatre indicateurs chiffrés, du constat (évalués, performance) à
        * l'action (revue, accompagnement). */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <StatCard
          label={t("dashboard.companyAdmin.evaluatedMembers")}
          value={evaluated.length}
          color="#B23FA0"
          icon={<InsightsOutlinedIcon />}
          onClick={() => navigate("/evaluations")}
        />
        <StatCard
          label={t("dashboard.manager.reviewTeam")}
          value={directReports.length}
          color={EXECUTIVE_BADGE_COLOR}
          icon={<RateReviewOutlinedIcon />}
          onClick={() => navigate("/directors-performance-review")}
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
          onClick={() => navigate("/action-plans?focus=support")}
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
