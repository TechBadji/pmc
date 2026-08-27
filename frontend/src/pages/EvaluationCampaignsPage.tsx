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
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import { apiClient } from "@/api/client";
import type { EvaluationCampaign, Paginated } from "@/api/types";

export default function EvaluationCampaignsPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EvaluationCampaign | null>(null);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });
  const [deleteTarget, setDeleteTarget] = useState<EvaluationCampaign | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setDialogOpen(true);
  }

  function openEditDialog(campaign: EvaluationCampaign) {
    setEditingCampaign(campaign);
    setForm({ name: campaign.name, start_date: campaign.start_date, end_date: campaign.end_date });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    setActionError(null);
    try {
      if (editingCampaign) {
        await apiClient.patch(`/evaluation-campaigns/${editingCampaign.id}/`, form);
      } else {
        await apiClient.post("/evaluation-campaigns/", form);
      }
      setDialogOpen(false);
      setEditingCampaign(null);
      setForm({ name: "", start_date: "", end_date: "" });
      load();
    } catch {
      setActionError(t("common.saveError"));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await apiClient.delete(`/evaluation-campaigns/${deleteTarget.id}/`);
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      setDeleteError(err.response?.data?.detail ?? t("common.saveError"));
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
          <PageHeader title={t("evaluationCampaigns.title")} />
          <Typography variant="body2" color="text.secondary">
            {t("evaluationCampaigns.subtitle")}
          </Typography>
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
                <TableRow key={c.id} hover>
                  <TableCell>{c.name}</TableCell>
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
                  <TableCell align="right">
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
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("evaluationCampaigns.namePlaceholder")}
              autoFocus
              fullWidth
            />
            <TextField
              label={t("evaluationCampaigns.startDate")}
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label={t("evaluationCampaigns.endDate")}
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!form.name || !form.start_date || !form.end_date}
          >
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
