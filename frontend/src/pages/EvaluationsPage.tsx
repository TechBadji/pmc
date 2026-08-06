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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Evaluation, Paginated, SkillScore, UserRecord } from "@/api/types";
import StatCard from "@/components/StatCard";
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
  const { user } = useAppSelector((s) => s.auth);
  // Un manager évalue les membres de son équipe ; l'Admin Entreprise évalue
  // ses directeurs (rôle MANAGER) — même page, même parcours, scope différent.
  const evaluatedRole = user?.role === "COMPANY_ADMIN" ? "MANAGER" : "MEMBER";
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | "">("");
  const [skillDialog, setSkillDialog] = useState<{ skillItem: number; name: string; type: "HARD" | "SOFT" } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loadError, setLoadError] = useState(false);

  function load() {
    setLoadError(false);
    Promise.all([
      apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500, role: evaluatedRole } }),
      apiClient.get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } }),
    ])
      .then(([membersRes, evaluationsRes]) => {
        setMembers(membersRes.data.results);
        setEvaluations(evaluationsRes.data.results);
        const sorted = [...evaluationsRes.data.results].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
        if (sorted.length) setSelectedCampaignId((prev) => (prev === "" ? sorted[sorted.length - 1].campaign : prev));
      })
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  // Campagnes distinctes disponibles, triées chronologiquement — alimente le
  // sélecteur de période global (remplace l'ancienne colonne "Période" par
  // ligne, qui n'affichait toujours que la dernière évaluation connue).
  const campaignOptions = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; start_date: string }>();
    evaluations.forEach((e) => byId.set(e.campaign, { id: e.campaign, name: e.campaign_name, start_date: e.campaign_start_date }));
    return Array.from(byId.values()).sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [evaluations]);

  // Historique complet (trié chronologiquement) par collaborateur — permet de
  // retrouver l'évaluation de n'importe quelle période sélectionnée ainsi que
  // celle qui la précède, pour calculer une tendance, sans requête supplémentaire.
  const historyByMember = useMemo(() => {
    const map = new Map<number, Evaluation[]>();
    evaluations.forEach((e) => {
      if (!map.has(e.user)) map.set(e.user, []);
      map.get(e.user)!.push(e);
    });
    map.forEach((list) => list.sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date)));
    return map;
  }, [evaluations]);

  const evaluationForSelectedCampaign = useMemo(() => {
    const map = new Map<number, Evaluation>();
    if (selectedCampaignId !== "") {
      evaluations.forEach((e) => {
        if (e.campaign === selectedCampaignId) map.set(e.user, e);
      });
    }
    return map;
  }, [evaluations, selectedCampaignId]);

  // Moyennes d'équipe sur la période sélectionnée — THSI/TSI (indices moyens)
  // et TPPR/TOSPR (taux d'équipe >= 90 % / > 100 %), même définition que
  // TAP/TPR/TOPR côté CEO mais restreinte à l'équipe du manager.
  const teamAverages = useMemo(() => {
    const evals = Array.from(evaluationForSelectedCampaign.values());
    if (!evals.length) return null;
    const altitudes = evals.map((e) => Number(e.altitude_percentage));
    return {
      thsi: average(evals.map((e) => Number(e.hsi))),
      tsi: average(evals.map((e) => Number(e.ssi))),
      tppr: (altitudes.filter((v) => v >= 90).length / altitudes.length) * 100,
      tospr: (altitudes.filter((v) => v > 100).length / altitudes.length) * 100,
    };
  }, [evaluationForSelectedCampaign]);

  const pagedMembers = members.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;
  const selectedHistory = selectedMemberId ? historyByMember.get(selectedMemberId) ?? [] : [];
  const selectedEvaluation = selectedHistory.find((e) => e.campaign === selectedCampaignId) ?? null;
  const selectedIndex = selectedEvaluation ? selectedHistory.indexOf(selectedEvaluation) : -1;
  const previousEvaluation = selectedIndex > 0 ? selectedHistory[selectedIndex - 1] : null;

  const hardScores: SkillScore[] = selectedEvaluation?.skill_scores.filter((s) => s.skill_type === "HARD") ?? [];
  const softScores: SkillScore[] = selectedEvaluation?.skill_scores.filter((s) => s.skill_type === "SOFT") ?? [];

  const hso = average(hardScores.map((s) => s.objective_score).filter((v): v is string => v !== null).map(Number));
  const sso = average(softScores.map((s) => s.objective_score).filter((v): v is string => v !== null).map(Number));

  const skillHistory = useMemo(() => {
    if (!skillDialog) return [];
    return selectedHistory
      .map((e) => ({
        period: e.campaign_name,
        score: e.skill_scores.find((s) => s.skill_item === skillDialog.skillItem) ?? null,
      }))
      .filter((row) => row.score !== null) as { period: string; score: SkillScore }[];
  }, [skillDialog, selectedHistory]);

  function handleNewEvaluation(member: UserRecord) {
    navigate(`/evaluations/new?user=${member.id}`);
  }

  function renderSkillTable(scores: SkillScore[], headerColor: string, title: string) {
    return (
      <TableContainer
        sx={{
          flex: 1,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          "& .MuiTableCell-root": { fontSize: 12, py: 0.5 },
        }}
      >
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
            {scores.map((s, i) => (
              <TableRow
                key={s.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => setSkillDialog({ skillItem: s.skill_item, name: s.skill_name, type: s.skill_type })}
              >
                <TableCell>
                  {i + 1}. {s.skill_name}
                </TableCell>
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
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t("evaluations.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("evaluations.clickHint")}
          </Typography>
        </Box>
        {campaignOptions.length > 0 && (
          <TextField
            select
            size="small"
            label={t("common.period")}
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(Number(e.target.value))}
            sx={{ minWidth: 200 }}
          >
            {campaignOptions.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

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

      {teamAverages && (
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <StatCard label="THSI" value={teamAverages.thsi ?? "—"} color="#2E5AAC" />
          <StatCard label="TSI" value={teamAverages.tsi ?? "—"} color="#3F9142" />
          <StatCard label={t("evaluations.tppr")} value={`${teamAverages.tppr.toFixed(0)}%`} color="#4caf50" />
          <StatCard label={t("evaluations.tospr")} value={`${teamAverages.tospr.toFixed(0)}%`} color="#0ca30c" />
        </Stack>
      )}

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
              {pagedMembers.map((m) => {
                const evalRow = evaluationForSelectedCampaign.get(m.id);
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
                    <TableCell align="center">{evalRow?.hsi ?? "—"}</TableCell>
                    <TableCell align="center">{evalRow?.ssi ?? "—"}</TableCell>
                    <TableCell align="right">{evalRow ? `${evalRow.altitude_percentage}%` : "—"}</TableCell>
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
                  p: 0.75,
                  mb: 1,
                  width: "fit-content",
                  maxWidth: "100%",
                  border: "2px solid",
                  borderColor: performanceColors[selectedEvaluation.performance_rating],
                  borderRadius: 1,
                  bgcolor: performanceColors[selectedEvaluation.performance_rating] + "11",
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                        {t("dashboard.manager.altitude")}
                      </Typography>
                      <Typography
                        variant="h6"
                        fontWeight={700}
                        sx={{ color: performanceColors[selectedEvaluation.performance_rating], lineHeight: 1 }}
                      >
                        {selectedEvaluation.altitude_percentage}%
                      </Typography>
                    </Box>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                        {t("evaluationForm.businessScore")}: <strong>{selectedEvaluation.business_objectives_score}%</strong>
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
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

              {/* Indices Summary — même structure à 3 zones que la ligne de
                  tableaux juste en dessous (Hard Skills flex:1 / photo
                  170px / Soft Skills flex:1), pour qu'Aptitudes se retrouve
                  au-dessus du tableau Hard Skills et Attitudes au-dessus,
                  à gauche, du tableau Soft Skills. */}
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 1 }}>
                <Box sx={{ flex: 1 }}>
                <Paper
                  sx={{
                    width: "fit-content",
                    maxWidth: "100%",
                    p: 0.5,
                    bgcolor: "#E3F2FD",
                    border: "2px solid #2E5AAC",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ color: "#2E5AAC", fontWeight: 700, fontSize: 10 }}>
                    {t("evaluationForm.aptitudes")}
                  </Typography>
                  <Stack direction="row" spacing={1.5}>
                    <Box>
                      <Typography variant="caption" color="textSecondary" sx={{ fontSize: 9 }}>
                        HSI
                      </Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: "#2E5AAC" }}>
                        {selectedEvaluation.hsi}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="textSecondary" sx={{ fontSize: 9 }}>
                        HSO
                      </Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: "#2E5AAC" }}>
                        {hso !== null ? hso : "—"}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
                </Box>
                {selectedMember.avatar_full_body && selectedMember.role === "MANAGER" && (
                  <Box sx={{ flexShrink: 0, width: { xs: 0, md: 110 } }} />
                )}
                <Box sx={{ flex: 1 }}>
                <Paper
                  sx={{
                    width: "fit-content",
                    maxWidth: "100%",
                    p: 0.5,
                    bgcolor: "#F1F8E9",
                    border: "2px solid #3F9142",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ color: "#3F9142", fontWeight: 700, fontSize: 10 }}>
                    {t("evaluationForm.attitudes")}
                  </Typography>
                  <Stack direction="row" spacing={1.5}>
                    <Box>
                      <Typography variant="caption" color="textSecondary" sx={{ fontSize: 9 }}>
                        SSI
                      </Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: "#3F9142" }}>
                        {selectedEvaluation.ssi}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="textSecondary" sx={{ fontSize: 9 }}>
                        SSO
                      </Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: "#3F9142" }}>
                        {sso !== null ? sso : "—"}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
                </Box>
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-start" }}>
                {renderSkillTable(hardScores, "#2E5AAC", t("evaluationForm.aptitudes"))}
                {selectedMember.avatar_full_body && selectedMember.role === "MANAGER" && (
                  <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0, width: { xs: "100%", md: 110 }, mx: "auto" }}>
                    <Avatar
                      src={selectedMember.avatar ?? undefined}
                      sx={{ width: 38, height: 38, border: "2px solid", borderColor: "divider" }}
                    >
                      {(selectedMember.full_name || selectedMember.email).charAt(0).toUpperCase()}
                    </Avatar>
                    <Paper elevation={0} sx={{ px: 1, py: 0.15, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                      <Typography variant="caption" fontWeight={700} noWrap sx={{ fontSize: 11 }}>
                        {selectedMember.full_name}
                      </Typography>
                    </Paper>
                    <Typography variant="caption" fontWeight={700} textAlign="center" sx={{ color: "text.secondary", fontSize: 9.5 }}>
                      {selectedMember.position}
                    </Typography>
                    <Box
                      component="img"
                      src={selectedMember.avatar_full_body}
                      alt={selectedMember.full_name}
                      sx={{ width: "100%", maxWidth: 110, height: 150, borderRadius: 1, objectFit: "cover", mt: 0.5 }}
                    />
                  </Stack>
                )}
                {renderSkillTable(softScores, "#3F9142", t("evaluationForm.attitudes"))}
              </Stack>
            </>
          ) : (
            <Typography color="text.secondary">
              {t("evaluations.noEvaluationForPeriod", { name: selectedMember.full_name })}
            </Typography>
          )}
        </Paper>
      )}

      <Dialog open={!!skillDialog} onClose={() => setSkillDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>{skillDialog?.name}</DialogTitle>
        <DialogContent>
          {skillHistory.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("evaluations.noSkillHistory")}
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("common.period")}</TableCell>
                  <TableCell align="right">{t("evaluationForm.current")}</TableCell>
                  <TableCell align="right">{t("evaluationForm.objective")}</TableCell>
                  <TableCell align="right">{t("evaluationForm.achieved")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {skillHistory.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.period}</TableCell>
                    <TableCell align="right">{Number(row.score.score).toFixed(1)}</TableCell>
                    <TableCell align="right">{row.score.objective_score ? Number(row.score.objective_score).toFixed(1) : "—"}</TableCell>
                    <TableCell align="right">{row.score.achievement_rate ? Number(row.score.achievement_rate).toFixed(1) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkillDialog(null)}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
