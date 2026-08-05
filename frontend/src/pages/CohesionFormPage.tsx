import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
  Alert,
  Box,
  Button,
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
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { ActionPlan, Department, Paginated, TeamCohesionAnalysis } from "@/api/types";
import { cohesionColor } from "@/theme";

const ICE_COLOR = "#2E8FCB";
const OCE_COLOR = "#eb6834";
const TIERS = [1, 2, 3, 4, 5];

interface CriterionRow {
  criterion: string;
  score: number;
  objective_score: number | null;
  achieved_score: number | null;
}

function sixMonthsFromNow(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

const TIER_LABELS = ["cohesion.legend.1", "cohesion.legend.2", "cohesion.legend.3", "cohesion.legend.4", "cohesion.legend.5"];

/** Encadré valeur (ICE/OCE/Réalisé) — reprend le style "case Excel" de la
 * fiche ID-PMC de référence : boîte bordée avec la valeur en grand. */
function ValueBox({ label, value, bg, suffix }: { label: string; value: number | string | null; bg?: string; suffix?: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="subtitle2" fontWeight={700}>
        {label}
      </Typography>
      <Box
        sx={{
          minWidth: 64,
          px: 1.5,
          py: 0.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: bg ?? "background.paper",
          textAlign: "center",
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          {value !== null ? `${typeof value === "number" ? value.toFixed(1) : value}${suffix ?? ""}` : "—"}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Pastille ovale sélectionnable — une par palier (1 à 5), colorée quand
 * sélectionnée, grise sinon — reprend les boutons de la fiche Excel ID-PMC. */
function ScoreOval({ selected, color, onClick, ariaLabel }: { selected: boolean; color: string; onClick: () => void; ariaLabel: string }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      sx={{
        width: 40,
        height: 24,
        borderRadius: 12,
        border: "none",
        cursor: "pointer",
        bgcolor: selected ? color : "#d9d8d2",
        transition: "background-color 0.15s",
        "&:hover": { bgcolor: selected ? color : "#c3c2ba" },
      }}
    />
  );
}

export default function CohesionFormPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const criteria = t("cohesion.criteria", { returnObjects: true }) as string[];

  const [departments, setDepartments] = useState<Department[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");
  const [rows, setRows] = useState<CriterionRow[]>(
    criteria.map((c) => ({ criterion: c, score: 3, objective_score: null, achieved_score: null }))
  );
  const [history, setHistory] = useState<TeamCohesionAnalysis[]>([]);
  const [saved, setSaved] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [planDialog, setPlanDialog] = useState(false);
  const [planForm, setPlanForm] = useState({ priority: "", objective: "", due_date: "" });

  useEffect(() => {
    apiClient.get<Paginated<Department>>("/departments/", { params: { page_size: 500 } }).then((r) => {
      setDepartments(r.data.results);
      if (isCompanyAdmin) {
        const own = r.data.results.find((d) => d.manager === user!.id);
        if (own) setTeamId(own.id);
      } else if (r.data.results.length >= 1) {
        setTeamId(r.data.results[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Changer d'équipe repart d'une fiche vierge — sans ce reset, les scores
    // saisis (mais non enregistrés) pour l'équipe précédente restaient
    // affichés et risquaient d'être soumis par erreur pour la nouvelle équipe.
    setRows(criteria.map((c) => ({ criterion: c, score: 3, objective_score: null, achieved_score: null })));
    setSaved(false);
    if (!teamId) {
      setHistory([]);
      setPlans([]);
      return;
    }
    apiClient
      .get<Paginated<TeamCohesionAnalysis>>("/cohesion-analyses/", { params: { team: teamId } })
      .then((r) => setHistory(r.data.results));
    apiClient
      .get<Paginated<ActionPlan>>("/action-plans/", { params: { team: teamId } })
      .then((r) => setPlans(r.data.results));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const ownTeamExists = !isCompanyAdmin || departments.some((d) => d.manager === user!.id);
  const selectedDept = departments.find((d) => d.id === teamId);

  async function handleProvisionOwnTeam() {
    if (!user) return;
    setProvisioning(true);
    try {
      const r = await apiClient.post<Department>("/departments/", {
        name: t("cohesion.ceoTeamName"),
        code: "DIR",
        manager: user.id,
      });
      setDepartments((prev) => [...prev, r.data]);
      setTeamId(r.data.id);
    } finally {
      setProvisioning(false);
    }
  }

  const ice = rows.reduce((s, r) => s + r.score, 0) / rows.length;
  const objectiveValues = rows.map((r) => r.objective_score).filter((v): v is number => v !== null);
  const oce = objectiveValues.length ? objectiveValues.reduce((a, b) => a + b, 0) / objectiveValues.length : null;
  const achievedValues = rows.map((r) => r.achieved_score).filter((v): v is number => v !== null);
  const achieved = achievedValues.length ? achievedValues.reduce((a, b) => a + b, 0) / achievedValues.length : null;
  const tco = achieved !== null && oce ? Math.round((achieved / oce) * 1000) / 10 : null;

  function updateRow(i: number, patch: Partial<CriterionRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function handleSubmit() {
    if (!teamId) return;
    await apiClient.post("/cohesion-analyses/", {
      team: teamId,
      date: new Date().toISOString().slice(0, 10),
      criterion_scores: rows.map((r) => ({
        criterion: r.criterion,
        score: r.score,
        objective_score: r.objective_score,
        achieved_score: r.achieved_score,
      })),
    });
    setSaved(true);
    const r = await apiClient.get<Paginated<TeamCohesionAnalysis>>("/cohesion-analyses/", { params: { team: teamId } });
    setHistory(r.data.results);
  }

  async function handleCreatePlan() {
    if (!teamId) return;
    await apiClient.post("/action-plans/", {
      team: teamId,
      category: "SOFT_SKILLS",
      status: "TODO",
      ...planForm,
    });
    setPlanDialog(false);
    setPlanForm({ priority: "", objective: "", due_date: "" });
    const r = await apiClient.get<Paginated<ActionPlan>>("/action-plans/", { params: { team: teamId } });
    setPlans(r.data.results);
  }

  const chartData = useMemo(
    () =>
      [...history]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((h) => ({
          period: h.date,
          [t("cohesion.iceLabel")]: Number(h.ice_score),
          [t("cohesion.oceLabel")]: Number(h.oce_score),
        })),
    [history, t]
  );

  return (
    <Stack spacing={3} maxWidth={1180}>
      {/* Bandeau titre — reprend l'entête beige de la fiche ID-PMC de référence. */}
      <Paper elevation={0} sx={{ py: 1.5, textAlign: "center", bgcolor: "#e8dfc8", border: "1px solid", borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={700} sx={{ color: "#3a3a2e" }}>
          {t("cohesion.title").toUpperCase()}
        </Typography>
      </Paper>

      {isCompanyAdmin && !ownTeamExists && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={handleProvisionOwnTeam} disabled={provisioning}>
              {t("cohesion.provisionOwnTeam")}
            </Button>
          }
        >
          {t("cohesion.provisionHint")}
        </Alert>
      )}

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={3}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 90 }}>
              {t("cohesion.team")}
            </Typography>
            <TextField
              select
              value={teamId}
              onChange={(e) => {
                setTeamId(Number(e.target.value));
                setSaved(false);
              }}
              size="small"
              sx={{ minWidth: 260 }}
            >
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {selectedDept && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 90 }}>
                {t("cohesion.headcount")}
              </Typography>
              <Box sx={{ px: 1.5, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, minWidth: 60, textAlign: "center" }}>
                <Typography variant="body2" fontWeight={700}>
                  {selectedDept.member_count}
                </Typography>
              </Box>
            </Stack>
          )}
        </Stack>

        {teamId && (
          <Stack alignItems={{ xs: "flex-start", sm: "flex-end" }} spacing={1}>
            <Typography variant="subtitle1" fontWeight={700}>
              {t("cohesion.subtitle")}
            </Typography>
            <Stack direction="row" spacing={3} flexWrap="wrap">
              <ValueBox label={t("cohesion.iceLabel")} value={ice} />
              <ValueBox label={t("cohesion.oceLabel")} value={oce} bg="#fff4c2" />
              <ValueBox label={t("cohesion.achievedLabel")} value={achieved} bg="#dbeeff" />
              <ValueBox label={t("cohesion.tcoLabel")} value={tco} suffix="%" />
            </Stack>
          </Stack>
        )}
      </Stack>

      {teamId && (
        <>
          <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: "30%", bgcolor: "#dbe4ee", fontWeight: 700, fontSize: 12 }}>
                      {t("cohesion.criterionCol")}
                    </TableCell>
                    {TIERS.map((tier) => (
                      <TableCell
                        key={tier}
                        align="center"
                        sx={{ bgcolor: cohesionColor(tier), color: "#fff", fontWeight: 700, fontSize: 11, lineHeight: 1.2, minWidth: 72 }}
                      >
                        {t(TIER_LABELS[tier - 1]).toUpperCase()}
                        <br />
                        {tier}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12 }}>
                      {t("cohesion.totalCol")}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12, bgcolor: "#fff4c2" }}>
                      {t("cohesion.oceCol")}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12, bgcolor: "#dbeeff" }}>
                      {t("cohesion.achievedCol")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Typography variant="body2">
                          {i + 1}. {row.criterion}
                        </Typography>
                      </TableCell>
                      {TIERS.map((tier) => (
                        <TableCell key={tier} align="center">
                          <ScoreOval
                            selected={row.score === tier}
                            color={cohesionColor(tier)}
                            onClick={() => updateRow(i, { score: tier })}
                            ariaLabel={`${row.criterion} — ${tier}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell align="center">
                        <Box sx={{ px: 1, py: 0.25, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight={700}>
                            {row.score.toFixed(1)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={{ bgcolor: "#fffaf0" }}>
                        <TextField
                          select
                          size="small"
                          value={row.objective_score ?? ""}
                          onChange={(e) =>
                            updateRow(i, { objective_score: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          sx={{ minWidth: 64, bgcolor: "#fff4c2", borderRadius: 1 }}
                        >
                          <MenuItem value="">{t("cohesion.unset")}</MenuItem>
                          {TIERS.map((tier) => (
                            <MenuItem key={tier} value={tier}>
                              {tier}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell align="center" sx={{ bgcolor: "#f5faff" }}>
                        <TextField
                          select
                          size="small"
                          value={row.achieved_score ?? ""}
                          onChange={(e) =>
                            updateRow(i, { achieved_score: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          sx={{ minWidth: 64, bgcolor: "#dbeeff", borderRadius: 1 }}
                        >
                          <MenuItem value="">{t("cohesion.unset")}</MenuItem>
                          {TIERS.map((tier) => (
                            <MenuItem key={tier} value={tier}>
                              {tier}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Stack direction="row" justifyContent="flex-end">
            <Button variant="contained" onClick={handleSubmit} disabled={!teamId}>
              {t("cohesion.save")}
            </Button>
          </Stack>
          {saved && (
            <Alert severity="success" onClose={() => setSaved(false)}>
              {t("cohesion.saved")}
            </Alert>
          )}

          {history.length > 0 && (
            <>
              <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t("cohesion.date")}</TableCell>
                        <TableCell align="right">{t("cohesion.iceLabel")}</TableCell>
                        <TableCell align="right">{t("cohesion.oceLabel")}</TableCell>
                        <TableCell align="right">{t("cohesion.achievedLabel")}</TableCell>
                        <TableCell align="right">{t("cohesion.tcoLabel")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id} hover>
                          <TableCell>{h.date}</TableCell>
                          <TableCell align="right">{Number(h.ice_score).toFixed(1)}</TableCell>
                          <TableCell align="right">{Number(h.oce_score).toFixed(1)}</TableCell>
                          <TableCell align="right">{h.achieved_score ?? "—"}</TableCell>
                          <TableCell align="right">{h.tco !== null ? `${h.tco}%` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {chartData.length > 1 && (
                <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {t("cohesion.chartTitle")}
                  </Typography>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#e1e0d9" vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: "#898781", fontSize: 12 }} />
                      <YAxis domain={[0, 5]} tick={{ fill: "#898781", fontSize: 12 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey={t("cohesion.iceLabel")} fill={ICE_COLOR} radius={[4, 4, 0, 0]} />
                      <Bar dataKey={t("cohesion.oceLabel")} fill={OCE_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              )}
            </>
          )}

          <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                {t("cohesion.actionPlanTitle")}
              </Typography>
              <Button size="small" startIcon={<AddOutlinedIcon />} onClick={() => setPlanDialog(true)}>
                {t("actionPlans.newAction")}
              </Button>
            </Stack>
            {plans.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("cohesion.noActionPlan")}
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("actionPlans.priority")}</TableCell>
                    <TableCell>{t("actionPlans.dueDate")}</TableCell>
                    <TableCell>{t("common.status")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {p.priority}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {p.objective}
                        </Typography>
                      </TableCell>
                      <TableCell>{p.due_date ?? "—"}</TableCell>
                      <TableCell>{t(`actionPlans.status.${p.status}`)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </>
      )}

      <Dialog open={planDialog} onClose={() => setPlanDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("cohesion.actionPlanTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t("cohesion.actionPlanHorizon")}
            </Typography>
            <TextField
              label={t("actionPlans.priorityLabel")}
              value={planForm.priority}
              onChange={(e) => setPlanForm({ ...planForm, priority: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("actionPlans.actionToTake")}
              value={planForm.objective}
              onChange={(e) => setPlanForm({ ...planForm, objective: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              label={t("actionPlans.dueDate")}
              type="date"
              value={planForm.due_date}
              onChange={(e) => setPlanForm({ ...planForm, due_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: sixMonthsFromNow() }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialog(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreatePlan} disabled={!planForm.priority}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
