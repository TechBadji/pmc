import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import UpgradeOutlinedIcon from "@mui/icons-material/UpgradeOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { Company, Paginated, Plan } from "@/api/types";

const PLAN_COLOR: Record<Plan, "default" | "info" | "success"> = {
  DEMO: "default",
  STANDARD: "info",
  PREMIUM: "success",
};

const PLAN_ORDER: Plan[] = ["DEMO", "STANDARD", "PREMIUM"];

const emptyForm = {
  name: "",
  sector: "",
  employee_count: 0,
  plan: "DEMO" as Plan,
  admin_first_name: "",
  admin_last_name: "",
};

function nextPlan(current: Plan): Plan {
  const idx = PLAN_ORDER.indexOf(current);
  return PLAN_ORDER[Math.min(idx + 1, PLAN_ORDER.length - 1)];
}

export default function CompaniesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [credentials, setCredentials] = useState<Company | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [planDialogCompany, setPlanDialogCompany] = useState<Company | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>("DEMO");
  const [deleteDialogCompany, setDeleteDialogCompany] = useState<Company | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState(false);

  function load() {
    setLoadError(false);
    apiClient
      .get<Paginated<Company>>("/companies/")
      .then((r) => setCompanies(r.data.results))
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  async function handleCreate() {
    const { data } = await apiClient.post<Company>("/companies/", form);
    setOpen(false);
    setForm(emptyForm);
    setCredentials(data);
    load();
  }

  async function handleResetAdminPassword(company: Company) {
    if (!company.admin_user) return;
    await apiClient.post(`/users/${company.admin_user}/reset-password/`);
    setActionMessage(t("companies.adminPasswordReset", { email: company.admin_email }));
    load();
  }

  async function handleToggleCompanyActive(company: Company) {
    await apiClient.post(`/companies/${company.id}/toggle-active/`);
    setActionMessage(
      t(company.is_active ? "companies.blockedMessage" : "companies.unblockedMessage", {
        name: company.name,
      })
    );
    load();
  }

  function openPlanDialog(company: Company) {
    setPlanDialogCompany(company);
    setSelectedPlan(nextPlan(company.plan));
  }

  async function handleChangePlan() {
    if (!planDialogCompany) return;
    await apiClient.patch(`/companies/${planDialogCompany.id}/`, { plan: selectedPlan });
    setActionMessage(
      t("companies.planChanged", {
        name: planDialogCompany.name,
        plan: t(`common.plans.${selectedPlan}`),
      })
    );
    setPlanDialogCompany(null);
    load();
  }

  function stopRowClick(e: MouseEvent) {
    e.stopPropagation();
  }

  function openDeleteDialog(company: Company) {
    setDeleteDialogCompany(company);
    setDeleteConfirmText("");
  }

  async function handleDeleteCompany() {
    if (!deleteDialogCompany || deleteConfirmText !== deleteDialogCompany.name) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/companies/${deleteDialogCompany.id}/`);
      setActionMessage(t("companies.deletedMessage", { name: deleteDialogCompany.name }));
      setDeleteDialogCompany(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          {t("companies.title")}
        </Typography>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setOpen(true)}>
          {t("companies.newCompany")}
        </Button>
      </Stack>

      {actionMessage && (
        <Alert severity="success" onClose={() => setActionMessage(null)}>
          {actionMessage}
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

      <Typography variant="caption" color="text.secondary">
        {t("companies.clickHint")}
      </Typography>

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("companies.name")}</TableCell>
                <TableCell>{t("companies.plan")}</TableCell>
                <TableCell>{t("companies.ceoAdmin")}</TableCell>
                <TableCell align="right">{t("companies.users")}</TableCell>
                <TableCell>{t("common.status")}</TableCell>
                <TableCell align="right">{t("common.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {companies.map((c) => (
                <TableRow
                  key={c.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/companies/${c.id}/departments`)}
                  tabIndex={0}
                  role="button"
                  aria-label={c.name}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/companies/${c.id}/departments`);
                    }
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {c.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.sector}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={t(`common.plans.${c.plan}`)} color={PLAN_COLOR[c.plan]} />
                  </TableCell>
                  <TableCell>
                    {c.admin_email ? (
                      <>
                        <Typography variant="body2">
                          {c.admin_first_name} {c.admin_last_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.admin_login} ·{" "}
                          {c.admin_is_active ? t("common.active") : t("common.blocked")}
                          {c.admin_must_change_password ? ` · ${t("companies.mustChangePassword")}` : ""}
                        </Typography>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell align="right">{c.user_count}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={c.is_active ? t("common.active") : t("common.inactive")}
                      color={c.is_active ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell align="right" onClick={stopRowClick}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title={t("companies.bulkUploadTooltip")}>
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/companies/${c.id}/upload`)}
                        >
                          <UploadFileOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("companies.changePlanTooltip")}>
                        <IconButton size="small" onClick={() => openPlanDialog(c)}>
                          <UpgradeOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("companies.resetAdminPasswordTooltip")}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={!c.admin_user}
                            onClick={() => handleResetAdminPassword(c)}
                          >
                            <LockResetOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip
                        title={
                          c.is_active
                            ? c.is_compliant
                              ? t("companies.compliantBlockTooltip")
                              : t("companies.nonCompliantBlockTooltip")
                            : t("companies.unblockTooltip")
                        }
                      >
                        <IconButton size="small" onClick={() => handleToggleCompanyActive(c)}>
                          {c.is_compliant ? (
                            <CheckCircleOutlineIcon fontSize="small" color="success" />
                          ) : (
                            <BlockOutlinedIcon fontSize="small" color="error" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("companies.deleteTooltip")}>
                        <IconButton size="small" onClick={() => openDeleteDialog(c)}>
                          <DeleteOutlineIcon fontSize="small" color="error" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t("companies.newCompany")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("companies.companyName")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              fullWidth
            />
            <TextField
              label={t("companies.sector")}
              value={form.sector}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("companies.employeeCount")}
              type="number"
              value={form.employee_count}
              onChange={(e) => setForm({ ...form, employee_count: Number(e.target.value) })}
              fullWidth
            />
            <TextField
              select
              label={t("companies.plan")}
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as Plan })}
              fullWidth
            >
              {PLAN_ORDER.map((p) => (
                <MenuItem key={p} value={p}>
                  {t(`common.plans.${p}`)}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="subtitle2" sx={{ pt: 1 }}>
              {t("companies.ceoAdmin")}
            </Typography>
            <Stack direction="row" spacing={2}>
              <TextField
                label={t("common.firstName")}
                value={form.admin_first_name}
                onChange={(e) => setForm({ ...form, admin_first_name: e.target.value })}
                fullWidth
              />
              <TextField
                label={t("common.lastName")}
                value={form.admin_last_name}
                onChange={(e) => setForm({ ...form, admin_last_name: e.target.value })}
                fullWidth
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {t("companies.creationHint")}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!form.name}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!credentials} onClose={() => setCredentials(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("companies.created")}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2">
              {t("companies.createdSummary", {
                name: credentials?.name,
                plan: credentials?.plan_features?.label,
              })}
            </Typography>
            {credentials?.admin_email && (
              <Alert severity="info">
                {t("companies.ceoAccessLogin")} <strong>{credentials.admin_login}</strong>
                <br />
                {t("common.email")}: <strong>{credentials.admin_email}</strong>
                <br />
                {t("companies.defaultPassword")} <strong>123456</strong> ({t("companies.mustChangeOnFirstLogin")})
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCredentials(null)}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!planDialogCompany} onClose={() => setPlanDialogCompany(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {t("companies.changePlan")} — {planDialogCompany?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("companies.currentPlan")}{" "}
              <strong>{planDialogCompany && t(`common.plans.${planDialogCompany.plan}`)}</strong>
            </Typography>
            <TextField
              select
              label={t("companies.newPlan")}
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as Plan)}
              fullWidth
            >
              {PLAN_ORDER.map((p) => (
                <MenuItem key={p} value={p}>
                  {t(`common.plans.${p}`)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialogCompany(null)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            onClick={handleChangePlan}
            disabled={!!planDialogCompany && selectedPlan === planDialogCompany.plan}
          >
            {t("common.confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteDialogCompany} onClose={() => setDeleteDialogCompany(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ color: "error.main" }}>{t("companies.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="error">{t("companies.deleteWarning", { name: deleteDialogCompany?.name })}</Alert>
            <Typography variant="body2">
              {t("companies.deleteConfirmPrompt", { name: deleteDialogCompany?.name })}
            </Typography>
            <TextField
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteDialogCompany?.name}
              autoFocus
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogCompany(null)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteCompany}
            disabled={deleting || !deleteDialogCompany || deleteConfirmText !== deleteDialogCompany.name}
          >
            {t("companies.deleteConfirmButton")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
