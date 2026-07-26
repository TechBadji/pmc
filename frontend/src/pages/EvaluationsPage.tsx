import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import TrendingFlatOutlinedIcon from "@mui/icons-material/TrendingFlatOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { Evaluation, Paginated, SkillScore, UserRecord } from "@/api/types";
import { performanceColors } from "@/theme";

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function DeltaBadge({ current, previous }: { current: number; previous: number | null }) {
  const { t } = useTranslation();
  if (previous === null) return null;
  const delta = Math.round((current - previous) * 10) / 10;
  if (delta > 0.05)
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "success.main" }}>
        <TrendingUpOutlinedIcon fontSize="small" />
        <Typography variant="body2" fontWeight={700}>
          +{delta} {t("evaluations.sincePrevious")}
        </Typography>
      </Stack>
    );
  if (delta < -0.05)
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "error.main" }}>
        <TrendingDownOutlinedIcon fontSize="small" />
        <Typography variant="body2" fontWeight={700}>
          {delta} {t("evaluations.sincePrevious")}
        </Typography>
      </Stack>
    );
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
      <TrendingFlatOutlinedIcon fontSize="small" />
      <Typography variant="body2">{t("evaluations.stable")}</Typography>
    </Stack>
  );
}

export default function EvaluationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loadError, setLoadError] = useState(false);

  function load() {
    setLoadError(false);
    Promise.all([
      apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500, role: "MEMBER" } }),
      apiClient.get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } }),
    ])
      .then(([membersRes, evaluationsRes]) => {
        setMembers(membersRes.data.results);
        setEvaluations(evaluationsRes.data.results);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  // Historique complet (trié chronologiquement) par collaborateur — permet de
  // retrouver aussi bien la dernière évaluation que celle d'avant, pour
  // calculer une tendance, sans requête supplémentaire.
  const historyByMember = useMemo(() => {
    const map = new Map<number, Evaluation[]>();
    evaluations.forEach((e) => {
      if (!map.has(e.user)) map.set(e.user, []);
      map.get(e.user)!.push(e);
    });
    map.forEach((list) => list.sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date)));
    return map;
  }, [evaluations]);

  const lastEvaluationByMember = useMemo(() => {
    const map = new Map<number, Evaluation>();
    historyByMember.forEach((list, userId) => map.set(userId, list[list.length - 1]));
    return map;
  }, [historyByMember]);

  const pagedMembers = members.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;
  const selectedHistory = selectedMemberId ? historyByMember.get(selectedMemberId) ?? [] : [];
  const selectedEvaluation = selectedHistory[selectedHistory.length - 1] ?? null;
  const previousEvaluation = selectedHistory.length > 1 ? selectedHistory[selectedHistory.length - 2] : null;

  const hardScores: SkillScore[] = selectedEvaluation?.skill_scores.filter((s) => s.skill_type === "HARD") ?? [];
  const softScores: SkillScore[] = selectedEvaluation?.skill_scores.filter((s) => s.skill_type === "SOFT") ?? [];

  const hso = average(hardScores.map((s) => s.objective_score).filter((v): v is string => v !== null).map(Number));
  const sso = average(softScores.map((s) => s.objective_score).filter((v): v is string => v !== null).map(Number));

  function handleNewEvaluation(member: UserRecord) {
    navigate(`/evaluations/new?user=${member.id}`);
  }

  function renderSkillTable(scores: SkillScore[], headerColor: string, title: string) {
    return (
      <TableContainer sx={{ flex: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: headerColor }}>
              <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{title}</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">
                {t("evaluationForm.current")}
              </TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">
                {t("evaluationForm.objective")}
              </TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">
                {t("evaluationForm.achieved")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {scores.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.skill_name}</TableCell>
                <TableCell align="right">{Number(s.score).toFixed(1)}</TableCell>
                <TableCell align="right">{s.objective_score ? Number(s.objective_score).toFixed(1) : "—"}</TableCell>
                <TableCell align="right">{s.achievement_rate ? Number(s.achievement_rate).toFixed(1) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {t("evaluations.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("evaluations.clickHint")}
        </Typography>
      </Box>

      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={load}>
              {t("common.retry")}
            </Button>
          }
        >
          {t("common.loadError")}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("dashboard.manager.member")}</TableCell>
                <TableCell>{t("common.position")}</TableCell>
                <TableCell>{t("common.period")}</TableCell>
                <TableCell align="center">HSI</TableCell>
                <TableCell align="center">SSI</TableCell>
                <TableCell align="right">{t("dashboard.manager.altitude")}</TableCell>
                <TableCell>{t("dashboard.companyAdmin.performance")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedMembers.map((m) => {
                const last = lastEvaluationByMember.get(m.id);
                return (
                  <TableRow
                    key={m.id}
                    hover
                    selected={selectedMemberId === m.id}
                    sx={{ cursor: "pointer" }}
                    onClick={() => setSelectedMemberId(m.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={m.full_name || m.email}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedMemberId(m.id);
                      }
                    }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar src={m.avatar ?? undefined} sx={{ width: 32, height: 32, fontSize: 14, bgcolor: "primary.main" }}>
                          {(m.full_name || m.email).charAt(0).toUpperCase()}
                        </Avatar>
                        <span>{m.full_name || "—"}</span>
                      </Stack>
                    </TableCell>
                    <TableCell>{m.position}</TableCell>
                    <TableCell>{last?.campaign_name ?? "—"}</TableCell>
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
        <TablePagination
          component="div"
          count={members.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage={t("evaluations.rowsPerPage")}
        />
      </Paper>

      {selectedMember && (
        <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider" }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            sx={{ mb: 2.5 }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                src={selectedMember.avatar ?? undefined}
                sx={{ width: 64, height: 64, fontSize: 24, bgcolor: "primary.main" }}
              >
                {(selectedMember.full_name || selectedMember.email).charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
                    {selectedMember.full_name}
                  </Typography>
                  {selectedEvaluation && (
                    <Chip
                      size="small"
                      label={t(`common.performance.${selectedEvaluation.performance_rating}`)}
                      sx={{
                        bgcolor: performanceColors[selectedEvaluation.performance_rating] + "22",
                        color: performanceColors[selectedEvaluation.performance_rating],
                        fontWeight: 600,
                      }}
                    />
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {selectedMember.position}
                </Typography>
                {selectedEvaluation && (
                  <Typography variant="caption" color="text.secondary">
                    {t("evaluations.lastPeriod", { period: selectedEvaluation.campaign_name })}
                  </Typography>
                )}
              </Box>
            </Stack>
            <Button
              variant="contained"
              startIcon={<AddOutlinedIcon />}
              onClick={() => handleNewEvaluation(selectedMember)}
            >
              {t("evaluations.newEvaluation")}
            </Button>
          </Stack>

          {selectedEvaluation ? (
            <>
              {/* Altitude — la métrique qui résume la performance globale,
                  mise en avant en priorité devant le détail HSI/SSI. */}
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  mb: 2,
                  border: "2px solid",
                  borderColor: performanceColors[selectedEvaluation.performance_rating],
                  borderRadius: 1,
                  bgcolor: performanceColors[selectedEvaluation.performance_rating] + "11",
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={3} alignItems="center">
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        {t("dashboard.manager.altitude")}
                      </Typography>
                      <Typography
                        variant="h3"
                        fontWeight={700}
                        sx={{ color: performanceColors[selectedEvaluation.performance_rating], lineHeight: 1 }}
                      >
                        {selectedEvaluation.altitude_percentage}%
                      </Typography>
                    </Box>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {t("evaluationForm.businessScore")}: <strong>{selectedEvaluation.business_objectives_score}%</strong>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("evaluationForm.peopleScore")}: <strong>{selectedEvaluation.people_objectives_score}%</strong>
                      </Typography>
                    </Stack>
                  </Stack>
                  {previousEvaluation && (
                    <DeltaBadge
                      current={Number(selectedEvaluation.altitude_percentage)}
                      previous={Number(previousEvaluation.altitude_percentage)}
                    />
                  )}
                </Stack>
              </Paper>

              {/* Indices Summary */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
                <Paper
                  sx={{
                    flex: 1,
                    p: 2,
                    bgcolor: "#E3F2FD",
                    border: "2px solid #2E5AAC",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ color: "#2E5AAC", fontWeight: 700 }} gutterBottom>
                    {t("evaluationForm.aptitudes")}
                  </Typography>
                  <Stack direction="row" spacing={3}>
                    <Box>
                      <Typography variant="caption" color="textSecondary">
                        HSI
                      </Typography>
                      <Typography variant="h6" fontWeight={700} sx={{ color: "#2E5AAC" }}>
                        {selectedEvaluation.hsi}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="textSecondary">
                        HSO
                      </Typography>
                      <Typography variant="h6" fontWeight={700} sx={{ color: "#2E5AAC" }}>
                        {hso !== null ? hso : "—"}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
                <Paper
                  sx={{
                    flex: 1,
                    p: 2,
                    bgcolor: "#F1F8E9",
                    border: "2px solid #3F9142",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ color: "#3F9142", fontWeight: 700 }} gutterBottom>
                    {t("evaluationForm.attitudes")}
                  </Typography>
                  <Stack direction="row" spacing={3}>
                    <Box>
                      <Typography variant="caption" color="textSecondary">
                        SSI
                      </Typography>
                      <Typography variant="h6" fontWeight={700} sx={{ color: "#3F9142" }}>
                        {selectedEvaluation.ssi}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="textSecondary">
                        SSO
                      </Typography>
                      <Typography variant="h6" fontWeight={700} sx={{ color: "#3F9142" }}>
                        {sso !== null ? sso : "—"}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                {renderSkillTable(hardScores, "#2E5AAC", t("evaluationForm.aptitudes"))}
                {renderSkillTable(softScores, "#3F9142", t("evaluationForm.attitudes"))}
              </Stack>
            </>
          ) : (
            <Typography color="text.secondary">
              {t("evaluations.noEvaluationYet", { name: selectedMember.full_name })}
            </Typography>
          )}
        </Paper>
      )}
    </Stack>
  );
}
