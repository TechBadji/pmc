import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Avatar,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Department, Evaluation, Paginated, UserRecord } from "@/api/types";
import StatCard from "@/components/StatCard";

export default function TeamsPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [deptDialog, setDeptDialog] = useState(false);
  const [memberDialog, setMemberDialog] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [memberForm, setMemberForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    position: "",
  });
  const [loadError, setLoadError] = useState(false);

  function load() {
    setLoadError(false);
    Promise.all([
      apiClient.get<Paginated<Department>>("/departments/", { params: { page_size: 500 } }),
      apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } }),
      apiClient.get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } }),
    ])
      .then(([deptRes, usersRes, evalRes]) => {
        setDepartments(deptRes.data.results);
        setMembers(usersRes.data.results);
        setEvaluations(evalRes.data.results);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  // TAP/TPR/TOPR de l'équipe du manager (rubrique "Mon équipe") — dernière
  // évaluation connue de chaque membre, même définition que côté CEO.
  const teamKpis = useMemo(() => {
    if (user?.role !== "MANAGER") return null;
    const lastByUser = new Map<number, Evaluation>();
    evaluations.forEach((e) => {
      const current = lastByUser.get(e.user);
      if (!current || e.campaign_start_date > current.campaign_start_date) lastByUser.set(e.user, e);
    });
    const altitudes = Array.from(lastByUser.values()).map((e) => Number(e.altitude_percentage));
    if (!altitudes.length) return null;
    return {
      tap: altitudes.reduce((s, v) => s + v, 0) / altitudes.length,
      tpr: (altitudes.filter((v) => v >= 90).length / altitudes.length) * 100,
      topr: (altitudes.filter((v) => v > 100).length / altitudes.length) * 100,
    };
  }, [evaluations, user]);

  async function handleCreateDepartment() {
    await apiClient.post("/departments/", { name: deptName, code: deptCode });
    setDeptDialog(false);
    setDeptName("");
    setDeptCode("");
    load();
  }

  async function handleCreateMember() {
    if (!memberDialog) return;
    await apiClient.post("/users/", {
      ...memberForm,
      role: "MEMBER",
      department: memberDialog.id,
      manager: user?.id,
    });
    setMemberDialog(null);
    setMemberForm({ email: "", password: "", first_name: "", last_name: "", position: "" });
    load();
  }

  const canCreateDepartment = user?.role === "COMPANY_ADMIN";
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  function canManage(dept: Department, member: UserRecord) {
    if (!user || member.id === user.id) return false;
    if (user.role === "COMPANY_ADMIN") return member.role === "MANAGER" || member.role === "MEMBER";
    if (user.role === "MANAGER") return member.role === "MEMBER" && dept.manager === user.id;
    return false;
  }

  async function handleResetPassword(member: UserRecord) {
    await apiClient.post(`/users/${member.id}/reset-password/`);
    setActionMessage(
      t("passwordRequests.resolvedMessage", { name: member.full_name || member.email })
    );
    load();
  }

  async function handleToggleActive(member: UserRecord) {
    await apiClient.post(`/users/${member.id}/toggle-active/`);
    load();
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          {user?.role === "MANAGER" ? t("nav.myTeam") : t("nav.teams")}
        </Typography>
        {canCreateDepartment && (
          <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setDeptDialog(true)}>
            {t("departments.newDepartment")}
          </Button>
        )}
      </Stack>

      {teamKpis && (
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <StatCard label={t("id3aMatrix.tap")} value={`${teamKpis.tap.toFixed(0)}%`} color="#2E8FCB" />
          <StatCard label={t("id3aMatrix.tpr")} value={`${teamKpis.tpr.toFixed(0)}%`} color="#4caf50" />
          <StatCard label={t("id3aMatrix.topr")} value={`${teamKpis.topr.toFixed(0)}%`} color="#0ca30c" />
        </Stack>
      )}

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

      {departments.map((dept) => {
        const teamMembers = members.filter((m) => m.department === dept.id);
        return (
          <Accordion key={dept.id} elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ width: "100%" }}>
                <Typography fontWeight={600}>{dept.name}</Typography>
                <Chip size="small" label={`${t("common.manager")}: ${dept.manager_name ?? "—"}`} />
                <Chip size="small" label={t("teams.memberCount", { count: dept.member_count })} variant="outlined" />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("companies.name")}</TableCell>
                    <TableCell>{t("common.position")}</TableCell>
                    <TableCell align="right">{t("teams.age")}</TableCell>
                    <TableCell>{t("common.role")}</TableCell>
                    <TableCell>{t("common.email")}</TableCell>
                    <TableCell>{t("common.status")}</TableCell>
                    <TableCell align="right">{t("common.actions")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teamMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar src={m.avatar ?? undefined} sx={{ width: 32, height: 32, fontSize: 14, bgcolor: "primary.main" }}>
                            {(m.full_name || m.email).charAt(0).toUpperCase()}
                          </Avatar>
                          <span>{m.full_name || "—"}</span>
                        </Stack>
                      </TableCell>
                      <TableCell>{m.position}</TableCell>
                      <TableCell align="right">{m.age ?? "—"}</TableCell>
                      <TableCell>{t(`common.roles.${m.role}`)}</TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={m.is_active ? t("common.active") : t("common.blocked")}
                          color={m.is_active ? "success" : "default"}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {canManage(dept, m) && (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title={t("teams.resetPasswordTooltip")}>
                              <IconButton size="small" onClick={() => handleResetPassword(m)}>
                                <LockResetOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={m.is_active ? t("teams.block") : t("teams.unblock")}>
                              <IconButton size="small" onClick={() => handleToggleActive(m)}>
                                {m.is_active ? (
                                  <BlockOutlinedIcon fontSize="small" color="error" />
                                ) : (
                                  <CheckCircleOutlineIcon fontSize="small" color="success" />
                                )}
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {user?.role === "MANAGER" && dept.manager === user.id && (
                <Button
                  size="small"
                  startIcon={<AddOutlinedIcon />}
                  sx={{ mt: 1 }}
                  onClick={() => setMemberDialog(dept)}
                >
                  {t("teams.addMember")}
                </Button>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}

      <Dialog open={deptDialog} onClose={() => setDeptDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("departments.newDepartment")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("departments.departmentName")}
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              autoFocus
              fullWidth
            />
            <TextField
              label={t("departments.code")}
              value={deptCode}
              onChange={(e) => setDeptCode(e.target.value.toUpperCase().slice(0, 4))}
              helperText={t("departments.codeHelper")}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeptDialog(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreateDepartment} disabled={!deptName || !deptCode}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!memberDialog} onClose={() => setMemberDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {t("teams.addMember")} — {memberDialog?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t("common.firstName")}
              value={memberForm.first_name}
              onChange={(e) => setMemberForm({ ...memberForm, first_name: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("common.lastName")}
              value={memberForm.last_name}
              onChange={(e) => setMemberForm({ ...memberForm, last_name: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("common.position")}
              value={memberForm.position}
              onChange={(e) => setMemberForm({ ...memberForm, position: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("common.email")}
              type="email"
              value={memberForm.email}
              onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("teams.temporaryPassword")}
              type="password"
              value={memberForm.password}
              onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberDialog(null)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            onClick={handleCreateMember}
            disabled={!memberForm.email || memberForm.password.length < 8}
          >
            {t("common.add")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
