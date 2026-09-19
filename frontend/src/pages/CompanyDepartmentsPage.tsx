import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
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
import { Link, useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { Company, Department, Paginated } from "@/api/types";
import InlineApiError from "@/components/feedback/InlineApiError";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { describeApiError, type ApiErrorInfo } from "@/utils/apiError";
import { isBlank, useIssues } from "@/utils/validation";

export default function CompanyDepartmentsPage() {
  const { t } = useTranslation();
  const { companyId } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [createError, setCreateError] = useState<ApiErrorInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { issues, check, clear, has, messageFor } = useIssues();

  function load() {
    setLoadError(false);
    apiClient
      .get<Company>(`/companies/${companyId}/`)
      .then((r) => setCompany(r.data))
      .catch(() => setLoadError(true));
    apiClient
      .get<Paginated<Department>>("/departments/", { params: { company: companyId, page_size: 500 } })
      .then((r) => setDepartments(r.data.results))
      .catch(() => setLoadError(true));
  }

  useEffect(load, [companyId]);

  function openDialog() {
    clear();
    setCreateError(null);
    setOpen(true);
  }

  async function handleCreate() {
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const sameName = departments.find((d) => d.name.trim().toLowerCase() === name.toLowerCase());
    const sameCode = departments.find((d) => d.code.toUpperCase() === code);
    const ok = check([
      [isBlank(name), t("validation.departments.nameRequired"), "name"],
      [name.length > 255, t("validation.departments.nameTooLong", { count: name.length }), "name"],
      [!isBlank(name) && !!sameName, t("validation.departments.nameDuplicate", { name }), "name"],
      [code === "", t("validation.departments.codeRequired"), "code"],
      [/[\s,;]/.test(form.code), t("validation.departments.codeInvalidChars"), "code"],
      [code !== "" && !!sameCode, t("validation.departments.codeDuplicate", { code, owner: sameCode?.name }), "code"],
    ]);
    if (!ok) return;
    setSaving(true);
    setCreateError(null);
    try {
      await apiClient.post("/departments/", { name, code, company: Number(companyId) }, { silent: true });
      setOpen(false);
      setForm({ name: "", code: "" });
      setError(null);
      load();
    } catch (e) {
      setCreateError(describeApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dept: Department) {
    try {
      await apiClient.delete(`/departments/${dept.id}/`, { silent: true });
      setError(null);
      load();
    } catch (e) {
      setError(describeApiError(e, t("departments.deleteError")));
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton component={Link} to="/companies" size="small">
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Stack>
          <Typography variant="h5" fontWeight={700}>
            {t("departments.title")} — {company?.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("departments.planSummary", {
              plan: company?.plan_features?.label,
              max: company?.plan_features?.max_departments ?? "∞",
            })}
          </Typography>
        </Stack>
      </Stack>

      <InlineApiError info={error} onClose={() => setError(null)} />
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

      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={openDialog}>
          {t("departments.newDepartment")}
        </Button>
      </Stack>

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("departments.code")}</TableCell>
                <TableCell>{t("companies.name")}</TableCell>
                <TableCell>{t("common.manager")}</TableCell>
                <TableCell align="right">{t("departments.headcount")}</TableCell>
                <TableCell align="right">{t("common.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>
                    <Chip size="small" label={d.code} />
                  </TableCell>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>{d.manager_name ?? "—"}</TableCell>
                  <TableCell align="right">{d.member_count}</TableCell>
                  <TableCell align="right">
                    <Tooltip
                      title={
                        d.member_count > 0
                          ? t("departments.cannotDeleteWithMembers")
                          : t("common.delete")
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          disabled={d.member_count > 0}
                          onClick={() => handleDelete(d)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("departments.newDepartment")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("departments.departmentName")}
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                clear();
              }}
              error={has("name")}
              helperText={messageFor("name")}
              autoFocus
              fullWidth
            />
            <TextField
              label={t("departments.codeLabel")}
              value={form.code}
              onChange={(e) => {
                setForm({ ...form, code: e.target.value.toUpperCase().slice(0, 4) });
                clear();
              }}
              error={has("code")}
              helperText={messageFor("code") ?? t("departments.codeHelper")}
              fullWidth
            />
            <ValidationSummary issues={issues} onClose={clear} />
            <InlineApiError info={createError} onClose={() => setCreateError(null)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
