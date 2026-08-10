import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
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
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import ManagerDevelopmentPlan from "@/components/ManagerDevelopmentPlan";
import type { ActionPlan, Department, Paginated, UserRecord } from "@/api/types";

const STATUS_COLOR: Record<ActionPlan["status"], "default" | "info" | "success"> = {
  TODO: "default",
  IN_PROGRESS: "info",
  DONE: "success",
};

export default function ActionPlansPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<UserRecord[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<number | "">("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    team: "" as number | "",
    category: "SOFT_SKILLS" as ActionPlan["category"],
    priority: "",
    objective: "",
    due_date: "",
  });

  function load() {
    apiClient.get<Paginated<ActionPlan>>("/action-plans/").then((r) => setPlans(r.data.results));
    apiClient.get<Paginated<Department>>("/departments/").then((r) => setDepartments(r.data.results));
  }

  useEffect(load, []);

  useEffect(() => {
    if (user?.role === "COMPANY_ADMIN") {
      apiClient
        .get<Paginated<UserRecord>>("/users/", { params: { role: "MANAGER", page_size: 500 } })
        .then((r) => setManagers(r.data.results));
    }
  }, [user?.role]);

  async function handleCreate() {
    await apiClient.post("/action-plans/", { ...form, status: "TODO" });
    setOpen(false);
    setForm({ team: "", category: "SOFT_SKILLS", priority: "", objective: "", due_date: "" });
    load();
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          {t("actionPlans.title")}
        </Typography>
        {(user?.role === "MANAGER" || user?.role === "COMPANY_ADMIN") && (
          <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setOpen(true)}>
            {t("actionPlans.newAction")}
          </Button>
        )}
      </Stack>

      {user?.role === "COMPANY_ADMIN" && (
        <>
          <TextField
            select
            size="small"
            label={t("managerDevPlan.selectManager")}
            value={selectedManagerId}
            onChange={(e) => setSelectedManagerId(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 280 }}
          >
            {managers.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.full_name || m.email}
              </MenuItem>
            ))}
          </TextField>
          {selectedManagerId !== "" && (
            <ManagerDevelopmentPlan
              managerId={selectedManagerId}
              managerName={managers.find((m) => m.id === selectedManagerId)?.full_name ?? ""}
            />
          )}
        </>
      )}

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("actionPlans.priority")}</TableCell>
                <TableCell>{t("cohesion.team")}</TableCell>
                <TableCell>{t("actionPlans.category")}</TableCell>
                <TableCell>{t("actionPlans.dueDate")}</TableCell>
                <TableCell>{t("common.status")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {p.priority}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.objective}
                    </Typography>
                  </TableCell>
                  <TableCell>{p.team_name}</TableCell>
                  <TableCell>{p.category === "HARD_SKILLS" ? "Hard Skills" : "Soft Skills"}</TableCell>
                  <TableCell>{p.due_date ?? "—"}</TableCell>
                  <TableCell>
                    <Chip size="small" label={t(`actionPlans.status.${p.status}`)} color={STATUS_COLOR[p.status]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t("actionPlans.newPlan")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label={t("cohesion.team")}
              value={form.team}
              onChange={(e) => setForm({ ...form, team: Number(e.target.value) })}
            >
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t("actionPlans.category")}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ActionPlan["category"] })}
            >
              <MenuItem value="SOFT_SKILLS">Soft Skills</MenuItem>
              <MenuItem value="HARD_SKILLS">Hard Skills</MenuItem>
            </TextField>
            <TextField
              label={t("actionPlans.priorityLabel")}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("actionPlans.actionToTake")}
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              label={t("actionPlans.dueDate")}
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!form.team || !form.priority}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
