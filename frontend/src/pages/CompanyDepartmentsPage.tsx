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

export default function CompanyDepartmentsPage() {
  const { t } = useTranslation();
  const { companyId } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiClient.get<Company>(`/companies/${companyId}/`).then((r) => setCompany(r.data));
    apiClient
      .get<Paginated<Department>>("/departments/", { params: { company: companyId } })
      .then((r) => setDepartments(r.data.results));
  }

  useEffect(load, [companyId]);

  async function handleCreate() {
    try {
      await apiClient.post("/departments/", { ...form, company: Number(companyId) });
      setOpen(false);
      setForm({ name: "", code: "" });
      setError(null);
      load();
    } catch (e: any) {
      setError(e.response?.data?.code?.[0] ?? e.response?.data?.name?.[0] ?? t("departments.createError"));
    }
  }

  async function handleDelete(dept: Department) {
    try {
      await apiClient.delete(`/departments/${dept.id}/`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? t("departments.deleteError"));
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

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setOpen(true)}>
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
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              fullWidth
            />
            <TextField
              label={t("departments.codeLabel")}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().slice(0, 4) })}
              helperText={t("departments.codeHelper")}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!form.name || !form.code}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
