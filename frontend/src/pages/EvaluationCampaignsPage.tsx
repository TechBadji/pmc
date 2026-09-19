import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { apiClient } from "@/api/client";
import type { EvaluationCampaign, Paginated } from "@/api/types";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { apiMessage, fmtDate } from "@/utils/evaluationValidation";
import { isBlank, isRealDate, useIssues } from "@/utils/validation";

export default function EvaluationCampaignsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EvaluationCampaign | null>(null);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });
  const [deleteTarget, setDeleteTarget] = useState<EvaluationCampaign | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const { issues, check, clear, has, messageFor } = useIssues();

  function load() {
    setLoadError(false);
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 500 } })
      .then((r) => setCampaigns(r.data.results))
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  function openCreateDialog() {
    setEditingCampaign(null);
    setForm({ name: "", start_date: "", end_date: "" });
    clear();
    setDialogError(null);
    setDialogOpen(true);
  }

  function openEditDialog(campaign: EvaluationCampaign) {
    setEditingCampaign(campaign);
    setForm({ name: campaign.name, start_date: campaign.start_date, end_date: campaign.end_date });
    clear();
    setDialogError(null);
    setDialogOpen(true);
  }

  function updateForm(values: Partial<typeof form>) {
    if (issues.length) clear();
    setForm((current) => ({ ...current, ...values }));
  }

  async function handleSubmit() {
    const name = form.name.trim();
    const startOk = isRealDate(form.start_date);
    const endOk = isRealDate(form.end_date);
    const others = campaigns.filter((c) => c.id !== editingCampaign?.id);
    const ok = check([
      [isBlank(form.name), t("validation.campaigns.nameRequired"), "name"],
      [name.length > 100, t("validation.campaigns.nameTooLong", { count: name.length }), "name"],
      [
        !!name && others.some((c) => c.name.trim().toLowerCase() === name.toLowerCase()),
        t("validation.campaigns.nameDuplicate", { name }),
        "name",
      ],
      [!form.start_date, t("validation.campaigns.startRequired"), "start_date"],
      [!!form.start_date && !startOk, t("validation.campaigns.startInvalid"), "start_date"],
      [!form.end_date, t("validation.campaigns.endRequired"), "end_date"],
      [!!form.end_date && !endOk, t("validation.campaigns.endInvalid"), "end_date"],
      [
        startOk && endOk && form.end_date < form.start_date,
        t("validation.campaigns.endBeforeStart", { end: fmtDate(form.end_date), start: fmtDate(form.start_date) }),
        "end_date",
      ],
    ]);
    if (!ok) return;
    setActionError(null);
    setDialogError(null);
    setSaving(true);
    try {
      const payload = { ...form, name };
      // Le serveur refuse aussi un nom déjà pris : le motif s'affiche dans la fenêtre, pas en double.
      if (editingCampaign) {
        await apiClient.patch(`/evaluation-campaigns/${editingCampaign.id}/`, payload, { silent: true });
      } else {
        await apiClient.post("/evaluation-campaigns/", payload, { silent: true });
      }
      setDialogOpen(false);
      setEditingCampaign(null);
      setForm({ name: "", start_date: "", end_date: "" });
      load();
    } catch (err) {
      setDialogError(apiMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      // Motif affiché dans la fenêtre de confirmation : pas de bulle en plus.
      await apiClient.delete(`/evaluation-campaigns/${deleteTarget.id}/`, { silent: true });
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(apiMessage(err));
    }
  }

  async function handleToggleClosed(campaign: EvaluationCampaign) {
    setActionError(null);
    try {
      await apiClient.post(`/evaluation-campaigns/${campaign.id}/${campaign.is_closed ? "reopen" : "close"}/`);
      load();
    } catch {
      setActionError(t("common.saveError"));
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack>
          <PageHeader
            title={t("evaluationCampaigns.title")}
            subtitle={`${t("evaluationCampaigns.subtitle")} ${t("evaluationCampaigns.clickHint")}`}
          />
        </Stack>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openCreateDialog}>
          {t("evaluationCampaigns.newCampaign")}
        </Button>
      </Stack>

      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

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
                <TableCell>{t("evaluationCampaigns.name")}</TableCell>
                <TableCell>{t("evaluationCampaigns.startDate")}</TableCell>
                <TableCell>{t("evaluationCampaigns.endDate")}</TableCell>
                <TableCell align="right">{t("evaluationCampaigns.evaluationsCount")}</TableCell>
                <TableCell>{t("common.status")}</TableCell>
                <TableCell align="right">{t("common.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map((c) => (
                // La ligne entière ouvre les évaluations de la campagne : une
                // campagne close n'était jusqu'ici qu'une entrée d'archive,
                // alors que c'est là qu'on va chercher les périodes passées.
                <TableRow
                  key={c.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/evaluations?campaign=${c.id}`)}
                  tabIndex={0}
                  role="link"
                  aria-label={t("evaluationCampaigns.openEvaluations", { name: c.name })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/evaluations?campaign=${c.id}`);
                    }
                  }}
                >
                  <TableCell sx={{ fontWeight: 600, color: "primary.main" }}>{c.name}</TableCell>
                  <TableCell>{c.start_date}</TableCell>
                  <TableCell>{c.end_date}</TableCell>
                  <TableCell align="right">{c.evaluations_count}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={c.is_closed ? t("evaluationCampaigns.closed") : t("evaluationCampaigns.open")}
                      color={c.is_closed ? "default" : "success"}
                    />
                  </TableCell>
                  {/* Les actions restent des actions : sans cette coupure, un
                      clic sur « clôturer » ou « supprimer » emporterait aussi
                      la navigation de la ligne. */}
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip
                        title={c.is_closed ? t("evaluationCampaigns.reopenTooltip") : t("evaluationCampaigns.closeTooltip")}
                      >
                        <IconButton
                          size="small"
                          aria-label={c.is_closed ? t("evaluationCampaigns.reopenTooltip") : t("evaluationCampaigns.closeTooltip")}
                          onClick={() => handleToggleClosed(c)}
                        >
                          {c.is_closed ? <LockOpenOutlinedIcon fontSize="small" /> : <LockOutlinedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("common.edit")}>
                        <IconButton size="small" aria-label={t("common.edit")} onClick={() => openEditDialog(c)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip
                        title={
                          c.evaluations_count > 0
                            ? t("evaluationCampaigns.deleteBlockedTooltip")
                            : t("common.delete")
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            aria-label={t("common.delete")}
                            disabled={c.evaluations_count > 0}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(c);
                            }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>
          {editingCampaign ? t("evaluationCampaigns.editCampaign") : t("evaluationCampaigns.newCampaign")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("evaluationCampaigns.name")}
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder={t("evaluationCampaigns.namePlaceholder")}
              error={has("name")}
              helperText={messageFor("name")}
              autoFocus
              fullWidth
            />
            <TextField
              label={t("evaluationCampaigns.startDate")}
              type="date"
              value={form.start_date}
              onChange={(e) => updateForm({ start_date: e.target.value })}
              error={has("start_date")}
              helperText={messageFor("start_date")}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label={t("evaluationCampaigns.endDate")}
              type="date"
              value={form.end_date}
              onChange={(e) => updateForm({ end_date: e.target.value })}
              error={has("end_date")}
              helperText={messageFor("end_date")}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <ValidationSummary issues={issues} onClose={clear} />
            {dialogError && (
              <Alert severity="error" onClose={() => setDialogError(null)}>
                {dialogError}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={saving}>
            {editingCampaign ? t("common.save") : t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("evaluationCampaigns.deleteConfirmTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="error">
              {t("evaluationCampaigns.deleteConfirmMessage", { name: deleteTarget?.name })}
            </Alert>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
