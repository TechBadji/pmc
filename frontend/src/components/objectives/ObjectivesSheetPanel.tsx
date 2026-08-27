import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Snackbar, Stack, TextField } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type {
  Department,
  Evaluation,
  EvaluationCampaign,
  Paginated,
  PerformanceObjective,
  UserRecord,
} from "@/api/types";
import AnnualObjectivesSheet, { blockPercent } from "./AnnualObjectivesSheet";

/**
 * Fiche annuelle d'objectifs, pour un employé ou pour une équipe.
 *
 * Les deux fiches ont la même forme et le même calcul ; seul l'ancrage change —
 * l'évaluation d'une personne d'un côté, le couple équipe/période de l'autre.
 * Un seul écran les sert donc, avec le sélecteur qui convient.
 *
 * Les lignes s'enregistrent au fil de la saisie plutôt qu'au clic d'un bouton :
 * une fiche annuelle se remplit en plusieurs fois, souvent à plusieurs, et un
 * enregistrement global perdrait le travail de qui n'a pas cliqué.
 */
export default function ObjectivesSheetPanel({
  mode,
  people,
  departments,
  campaigns,
  evaluations,
  canEdit,
  companyName,
}: {
  mode: "employee" | "team";
  people: UserRecord[];
  departments: Department[];
  campaigns: EvaluationCampaign[];
  evaluations: Evaluation[];
  canEdit: boolean;
  companyName: string;
}) {
  const { t } = useTranslation();
  const [personId, setPersonId] = useState<number | "">("");
  const [teamId, setTeamId] = useState<number | "">("");
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [rows, setRows] = useState<PerformanceObjective[]>([]);
  const [error, setError] = useState(false);
  // Témoin de sauvegarde : la fiche s'enregistre seule, encore faut-il le
  // montrer. Sans repère visible, l'absence de bouton inquiète à juste titre.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Période la plus récente par défaut : c'est celle qu'on ouvre en arrivant.
  useEffect(() => {
    if (campaignId === "" && campaigns.length) {
      const sorted = [...campaigns].sort((a, b) => a.start_date.localeCompare(b.start_date));
      setCampaignId(sorted[sorted.length - 1].id);
    }
  }, [campaigns, campaignId]);

  /** Évaluation de la personne pour la période — l'ancrage de sa fiche. */
  const evaluation = useMemo(
    () =>
      mode === "employee" && personId !== "" && campaignId !== ""
        ? evaluations.find((e) => e.user === personId && e.campaign === campaignId) ?? null
        : null,
    [mode, personId, campaignId, evaluations]
  );

  /** Évaluation précédente de la même personne : la fiche en rappelle la date
   * et le taux, comme le modèle le prévoit. */
  const previous = useMemo(() => {
    if (mode !== "employee" || personId === "" || !evaluation) return null;
    const own = evaluations
      .filter((e) => e.user === personId)
      .sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
    const index = own.findIndex((e) => e.id === evaluation.id);
    return index > 0 ? own[index - 1] : null;
  }, [mode, personId, evaluation, evaluations]);

  const load = useCallback(() => {
    const params =
      mode === "employee"
        ? evaluation
          ? { evaluation: evaluation.id, page_size: 100 }
          : null
        : teamId !== "" && campaignId !== ""
          ? { team: teamId, campaign: campaignId, page_size: 100 }
          : null;
    if (!params) {
      setRows([]);
      return;
    }
    apiClient
      .get<Paginated<PerformanceObjective>>("/performance-objectives/", { params })
      .then((r) => setRows(r.data.results))
      .catch(() => setError(true));
  }, [mode, evaluation, teamId, campaignId]);

  useEffect(load, [load]);

  async function addRow(category: PerformanceObjective["category"]) {
    const anchor =
      mode === "employee"
        ? evaluation
          ? { evaluation: evaluation.id }
          : null
        : teamId !== "" && campaignId !== ""
          ? { team: teamId, campaign: campaignId }
          : null;
    if (!anchor) return;
    const order = rows.filter((r) => r.category === category).length + 1;
    try {
      const { data } = await apiClient.post<PerformanceObjective>("/performance-objectives/", {
        ...anchor,
        category,
        order,
        label: "",
        indicator: "",
      });
      setRows((prev) => [...prev, data]);
    } catch {
      setError(true);
    }
  }

  /**
   * Enregistrement différé, la ligne étant déjà en base.
   *
   * La saisie s'affiche aussitôt, mais l'écriture attend 700 ms de silence et
   * regroupe les champs modifiés entre-temps. Sans cela chaque frappe partirait
   * en requête — et chacune fait recalculer la moyenne de la fiche puis
   * l'Altitude côté serveur. Le jour où une entreprise a des centaines de
   * collaborateurs saisis en parallèle, c'est la différence entre quelques
   * écritures par ligne et plusieurs dizaines.
   */
  const pending = useRef(new Map<number, Partial<PerformanceObjective>>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const flush = useCallback(async (id: number) => {
    const values = pending.current.get(id);
    pending.current.delete(id);
    timers.current.delete(id);
    if (!values || Object.keys(values).length === 0) return;
    setSaving(true);
    try {
      const { data } = await apiClient.patch<PerformanceObjective>(`/performance-objectives/${id}/`, values);
      // Le serveur renvoie le taux recalculé : on ne le devine pas côté client.
      setRows((prev) => prev.map((r) => (r.id === id ? data : r)));
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, []);

  function patchRow(id: number, values: Partial<PerformanceObjective>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...values } : r)));
    pending.current.set(id, { ...(pending.current.get(id) ?? {}), ...values });
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    timers.current.set(id, setTimeout(() => void flush(id), 700));
  }

  // Quitter la page ou changer de fiche ne doit pas emporter la dernière frappe.
  useEffect(() => {
    const timersMap = timers.current;
    const pendingMap = pending.current;
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer));
      timersMap.clear();
      pendingMap.forEach((values, id) => {
        if (Object.keys(values).length) {
          void apiClient.patch(`/performance-objectives/${id}/`, values);
        }
      });
      pendingMap.clear();
    };
  }, []);

  async function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      await apiClient.delete(`/performance-objectives/${id}/`);
    } catch {
      setError(true);
    }
  }

  /** Dates et visa de l'entête : ils appartiennent à l'évaluation. */
  async function patchHeader(field: string, value: string) {
    if (!evaluation) return;
    try {
      await apiClient.patch(`/evaluations/${evaluation.id}/`, { [field]: value || null });
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setError(true);
    }
  }

  const person = people.find((p) => p.id === personId) ?? null;
  const team = departments.find((d) => d.id === teamId) ?? null;
  const teamManager = team ? people.find((p) => p.id === team.manager) ?? null : null;

  /** Responsable direct : celui du département de la personne. Le champ
   * `manager` d'un compte ne suffit pas — il n'est pas toujours renseigné, et
   * la liste chargée ici ne contient pas forcément le responsable lui-même. */
  const personDepartment = departments.find((d) => d.id === person?.department) ?? null;
  const directManager =
    people.find((p) => p.id === person?.manager)?.full_name ?? personDepartment?.manager_name ?? "";

  const identity =
    mode === "employee"
      ? {
          photo: person?.avatar ?? null,
          name: person ? person.full_name || person.email : "",
          company: companyName,
          department: person?.department_name ?? "",
          position: person?.position ?? "",
          managerName: directManager,
        }
      : {
          photo: teamManager?.avatar ?? null,
          name: team?.name ?? "",
          company: "",
          department: team?.name ?? "",
          position: t("objectivesSheet.viewTeam"),
          managerName: team?.manager_name ?? "",
        };

  const ready = mode === "employee" ? Boolean(evaluation) : teamId !== "" && campaignId !== "";

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap className="pmc-no-print">
        {mode === "employee" ? (
          <TextField
            select
            size="small"
            label={t("talents.person")}
            value={personId}
            onChange={(e) => setPersonId(Number(e.target.value))}
            sx={{ minWidth: 260 }}
          >
            {people.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.full_name || p.email}
                {p.department_name ? ` — ${p.department_name}` : ""}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            select
            size="small"
            label={t("cohesion.team")}
            value={teamId}
            onChange={(e) => setTeamId(Number(e.target.value))}
            sx={{ minWidth: 260 }}
          >
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          select
          size="small"
          label={t("common.period")}
          value={campaignId}
          onChange={(e) => setCampaignId(Number(e.target.value))}
          sx={{ minWidth: 200 }}
        >
          {[...campaigns]
            .sort((a, b) => b.start_date.localeCompare(a.start_date))
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
        </TextField>

        {ready && (
          <Button size="small" onClick={() => window.print()}>
            {t("performanceId.print")}
          </Button>
        )}

        {/* La fiche n'a pas de bouton Enregistrer : chaque cellule part d'elle
          * même une seconde après la dernière frappe. Le témoin dit où on en
          * est, faute de quoi l'absence de bouton laisse un doute. */}
        {ready && canEdit && (
          <Chip
            size="small"
            icon={
              saving ? (
                <CircularProgress size={13} thickness={6} sx={{ color: "inherit !important" }} />
              ) : savedAt ? (
                <CheckCircleRoundedIcon />
              ) : (
                <CloudDoneOutlinedIcon />
              )
            }
            label={
              saving
                ? t("objectivesSheet.saving")
                : savedAt
                  ? t("objectivesSheet.savedAt", { time: savedAt })
                  : t("objectivesSheet.autoSave")
            }
            sx={{
              ml: "auto",
              height: 30,
              fontWeight: 700,
              fontSize: 12.5,
              px: 0.5,
              // Vert franc dès qu'une sauvegarde a eu lieu : c'est le signal
              // que l'utilisateur cherche, il doit se voir sans être cherché.
              bgcolor: saving ? "grey.200" : savedAt ? "#e7f5ea" : "grey.100",
              color: saving ? "text.secondary" : savedAt ? "#1b7f3b" : "text.secondary",
              border: "1px solid",
              borderColor: saving ? "grey.400" : savedAt ? "#1b7f3b" : "grey.300",
              "& .MuiChip-icon": { color: "inherit", fontSize: 17 },
              // Bref éclat au moment où l'enregistrement aboutit.
              animation: savedAt && !saving ? "tpdSaved 0.6s ease-out" : "none",
              "@keyframes tpdSaved": {
                "0%": { transform: "scale(0.94)", boxShadow: "0 0 0 0 rgba(27,127,59,0.45)" },
                "100%": { transform: "scale(1)", boxShadow: "0 0 0 10px rgba(27,127,59,0)" },
              },
            }}
          />
        )}
      </Stack>

      {!ready && (
        <Alert severity="info">
          {mode === "employee"
            ? personId !== "" && campaignId !== ""
              ? t("objectivesSheet.noEvaluation")
              : t("objectivesSheet.pickPerson")
            : t("objectivesSheet.pickTeam")}
        </Alert>
      )}

      {ready && (
        <Box sx={{ overflowX: "auto" }}>
          <AnnualObjectivesSheet
            identity={identity}
            rows={rows}
            readOnly={!canEdit}
            teamSheet={mode === "team"}
            dates={{
              objectives_set_on: evaluation?.objectives_set_on ?? "",
              evaluated_on: evaluation?.evaluated_on ?? "",
              next_evaluation_on: evaluation?.next_evaluation_on ?? "",
              manager_visa: evaluation?.manager_visa ?? "",
              previous_evaluated_on: previous?.evaluated_on ?? previous?.campaign_end_date ?? "",
            }}
            previousPercent={previous ? Number(previous.altitude_percentage) : null}
            onPatch={patchRow}
            onAdd={addRow}
            onRemove={removeRow}
            onDateChange={patchHeader}
          />
        </Box>
      )}

      <Snackbar open={error} autoHideDuration={4000} onClose={() => setError(false)} message={t("teamBoard.saveFailed")} />
    </Stack>
  );
}

export { blockPercent };
