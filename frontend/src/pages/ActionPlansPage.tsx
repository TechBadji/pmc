import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
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
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import ManagerDevelopmentPlan from "@/components/ManagerDevelopmentPlan";
import type { ActionPlan, Department, Evaluation, Paginated, UserRecord } from "@/api/types";
import { performanceColors } from "@/theme";
import { SUPPORT_THRESHOLD, lastEvaluationByUser, ratingForAltitude } from "@/utils/performance";

const STATUS_COLOR: Record<ActionPlan["status"], "default" | "info" | "success"> = {
  TODO: "default",
  IN_PROGRESS: "info",
  DONE: "success",
};

const EMPTY_FORM = {
  team: "" as number | "",
  target_user: "" as number | "",
  category: "SOFT_SKILLS" as ActionPlan["category"],
  priority: "",
  objective: "",
  start_date: "",
  due_date: "",
};

export default function ActionPlansPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [searchParams, setSearchParams] = useSearchParams();
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [people, setPeople] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [managers, setManagers] = useState<UserRecord[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<number | "">("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const supportRef = useRef<HTMLDivElement>(null);

  function load() {
    // page_size explicite : sans lui, la pagination par défaut tronquait la
    // liste dès qu'une équipe accumulait des actions.
    apiClient
      .get<Paginated<ActionPlan>>("/action-plans/", { params: { page_size: 500 } })
      .then((r) => setPlans(r.data.results));
    apiClient.get<Paginated<Department>>("/departments/").then((r) => setDepartments(r.data.results));
    // Collaborateurs : alimentent le sélecteur "Collaborateur concerné" et,
    // pour un manager, la liste des personnes à accompagner. Les deux API sont
    // déjà restreintes côté serveur à son équipe.
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } })
      .then((r) => setPeople(r.data.results));
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => setEvaluations(r.data.results));
  }

  useEffect(load, []);

  const lastByUser = useMemo(() => lastEvaluationByUser(evaluations), [evaluations]);

  /** Collaborateurs dont la dernière Altitude reste sous le seuil : c'est la
   * file de travail annoncée par le tableau de bord du manager. Le plus en
   * difficulté d'abord, avec les actions déjà ouvertes pour lui. */
  const toSupport = useMemo(() => {
    if (user?.role !== "MANAGER") return [];
    return people
      .filter((m) => m.id !== user.id)
      .map((member) => ({ member, evaluation: lastByUser.get(member.id) ?? null }))
      .filter(
        (row) =>
          row.evaluation !== null && Number(row.evaluation.altitude_percentage) < SUPPORT_THRESHOLD
      )
      .map((row) => ({
        ...row,
        openPlans: plans.filter((p) => p.target_user === row.member.id && p.status !== "DONE").length,
      }))
      .sort(
        (a, b) => Number(a.evaluation!.altitude_percentage) - Number(b.evaluation!.altitude_percentage)
      );
  }, [people, plans, lastByUser, user]);

  // Arrivée depuis la carte "Collaborateurs à accompagner" du tableau de bord :
  // la liste est amenée sous les yeux plutôt que laissée à chercher dans la page.
  useEffect(() => {
    if (searchParams.get("focus") === "support" && toSupport.length > 0) {
      supportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      searchParams.delete("focus");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, toSupport.length]);

  /** Ouvre le formulaire prérempli pour un collaborateur : son équipe, la
   * catégorie de son indice le plus faible, et une priorité chiffrée qui
   * rappelle l'écart à combler — tout reste modifiable. */
  function openForMember(member: UserRecord, evaluation: Evaluation) {
    setForm({
      ...EMPTY_FORM,
      team: member.department ?? "",
      target_user: member.id,
      category: Number(evaluation.hsi) <= Number(evaluation.ssi) ? "HARD_SKILLS" : "SOFT_SKILLS",
      priority: t("actionPlans.suggestedPriority", {
        current: evaluation.altitude_percentage,
        target: SUPPORT_THRESHOLD,
      }),
    });
    setOpen(true);
  }

  useEffect(() => {
    if (user?.role === "COMPANY_ADMIN") {
      apiClient
        .get<Paginated<UserRecord>>("/users/", { params: { role: "MANAGER", page_size: 500 } })
        .then((r) => setManagers(r.data.results));
    }
  }, [user?.role]);

  async function handleCreate() {
    // Les dates vides doivent partir en null : "" n'est pas une date valide
    // pour un DateField côté API. Idem pour le collaborateur, facultatif :
    // vide signifie "toute l'équipe".
    await apiClient.post("/action-plans/", {
      ...form,
      target_user: form.target_user === "" ? null : form.target_user,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      status: "TODO",
    });
    setOpen(false);
    setForm(EMPTY_FORM);
    load();
  }

  // Membres proposés au formulaire : ceux de l'équipe choisie.
  const teamMembers = people.filter((m) => form.team !== "" && m.department === form.team && m.id !== user?.id);

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
            // Même largeur compacte que le sélecteur de la fiche Performance :
            // sans alignSelf, le Stack l'étire sur toute la page.
            sx={{ width: 240, alignSelf: "flex-start" }}
          >
            {managers.map((m) => (
              // Département suffixé au nom, comme le sélecteur de la fiche
              // Performance : deux managers homonymes restent distinguables.
              <MenuItem key={m.id} value={m.id}>
                {m.full_name || m.email}
                {m.department_name ? ` — ${m.department_name}` : ""}
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

      {user?.role === "MANAGER" && (
        <Box ref={supportRef}>
          {toSupport.length === 0 ? (
            <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
              {t("actionPlans.supportNone", { threshold: SUPPORT_THRESHOLD })}
            </Alert>
          ) : (
            <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "warning.light" }}>
              <Typography variant="subtitle1" fontWeight={700}>
                {t("actionPlans.supportTitle", { count: toSupport.length })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("actionPlans.supportHint", { threshold: SUPPORT_THRESHOLD })}
              </Typography>
              <Stack spacing={1} sx={{ mt: 1.5 }}>
                {toSupport.map(({ member, evaluation, openPlans }) => {
                  const rating = ratingForAltitude(Number(evaluation!.altitude_percentage));
                  return (
                    <Stack
                      key={member.id}
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ p: 1, borderRadius: 1, bgcolor: "action.hover" }}
                    >
                      <Avatar src={member.avatar ?? undefined} sx={{ width: 34, height: 34, bgcolor: "primary.main" }}>
                        {(member.full_name || member.email).charAt(0).toUpperCase()}
                      </Avatar>
                      <Stack sx={{ minWidth: 160, flexGrow: 1 }}>
                        <Typography variant="body2" fontWeight={700}>
                          {member.full_name || member.email}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {member.position}
                        </Typography>
                      </Stack>
                      <Typography sx={{ color: performanceColors[rating], fontWeight: 700, minWidth: 60 }}>
                        {evaluation!.altitude_percentage}%
                      </Typography>
                      <Chip
                        size="small"
                        label={t(`common.performance.${rating}`)}
                        sx={{ bgcolor: performanceColors[rating] + "22", color: performanceColors[rating], fontWeight: 600 }}
                      />
                      <Typography variant="caption" color={openPlans ? "text.secondary" : "warning.main"} sx={{ minWidth: 130 }}>
                        {openPlans
                          ? t("actionPlans.supportOpenPlans", { count: openPlans })
                          : t("actionPlans.supportNoPlan")}
                      </Typography>
                      <Button
                        size="small"
                        variant={openPlans ? "outlined" : "contained"}
                        startIcon={<AddOutlinedIcon />}
                        onClick={() => openForMember(member, evaluation!)}
                      >
                        {t("actionPlans.supportCreate")}
                      </Button>
                    </Stack>
                  );
                })}
              </Stack>
            </Paper>
          )}
        </Box>
      )}

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("actionPlans.priority")}</TableCell>
                <TableCell>{t("cohesion.team")}</TableCell>
                <TableCell>{t("actionPlans.targetUser")}</TableCell>
                <TableCell>{t("actionPlans.category")}</TableCell>
                <TableCell>{t("actionPlans.startDate")}</TableCell>
                <TableCell>{t("actionPlans.endDate")}</TableCell>
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
                  <TableCell>{p.target_user_name ?? t("actionPlans.wholeTeam")}</TableCell>
                  <TableCell>{p.category === "HARD_SKILLS" ? "Hard Skills" : "Soft Skills"}</TableCell>
                  <TableCell>{p.start_date ?? "—"}</TableCell>
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
          {/* Champs courts (listes, dates) volontairement bornés en largeur :
           * étirés sur toute la boîte de dialogue, ils déséquilibraient le
           * formulaire face aux champs texte. */}
          <Stack spacing={2} alignItems="flex-start" sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <TextField
                select
                size="small"
                label={t("cohesion.team")}
                value={form.team}
                // Changer d'équipe invalide le collaborateur déjà choisi :
                // il n'appartient pas forcément à la nouvelle.
                onChange={(e) => setForm({ ...form, team: Number(e.target.value), target_user: "" })}
                sx={{ width: 240 }}
              >
                {departments.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.name}
                  </MenuItem>
                ))}
              </TextField>
              {/* Une action peut viser toute l'équipe ou un collaborateur
                * précis — la base le prévoyait déjà, le formulaire ne le
                * proposait pas. */}
              <TextField
                select
                size="small"
                label={t("actionPlans.targetUser")}
                value={form.target_user}
                onChange={(e) => setForm({ ...form, target_user: e.target.value === "" ? "" : Number(e.target.value) })}
                disabled={form.team === ""}
                helperText={form.team === "" ? t("actionPlans.targetUserHelper") : undefined}
                sx={{ width: 240 }}
              >
                <MenuItem value="">{t("actionPlans.wholeTeam")}</MenuItem>
                {teamMembers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label={t("actionPlans.category")}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ActionPlan["category"] })}
                sx={{ width: 180 }}
              >
                <MenuItem value="SOFT_SKILLS">Soft Skills</MenuItem>
                <MenuItem value="HARD_SKILLS">Hard Skills</MenuItem>
              </TextField>
            </Stack>
            <TextField
              size="small"
              label={t("actionPlans.priorityLabel")}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label={t("actionPlans.actionToTake")}
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <TextField
                size="small"
                label={t("actionPlans.startDate")}
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 180 }}
              />
              <TextField
                size="small"
                label={t("actionPlans.endDate")}
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 180 }}
              />
            </Stack>
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
