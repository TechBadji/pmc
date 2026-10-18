import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Department, EvaluationCampaign, Paginated, UserRecord } from "@/api/types";

export type ReportKind = "cohesion" | "relational" | "psi" | "strengths" | "team_id" | "id3a" | "ninebox" | "tpd" | "person_id";

type Scope = "org" | "group" | "team" | "person";
type Group = "leadership" | "directors" | "service_heads";
/** Périmètres acceptés par chaque rapport — mêmes règles que le serveur
 * (`report_views.KINDS`). Les rapports fondés sur des avis anonymes ne
 * descendent pas à la personne. */
const SCOPES: Record<ReportKind, Scope[]> = {
  cohesion: ["org", "team"],
  relational: ["org", "team"],
  psi: ["org", "team"],
  strengths: ["org", "group", "team"],
  team_id: ["team"],
  id3a: ["org", "group", "team", "person"],
  ninebox: ["org", "group", "team", "person"],
  tpd: ["org", "group", "team", "person"],
  person_id: ["person"],
};
const GROUPS: Group[] = ["leadership", "directors", "service_heads"];
interface ReportJob {
  id: number;
  status: "PENDING" | "READY" | "FAILED";
  filename: string;
  error: string;
  ai_written: boolean;
}
const ORGANISATION = "org";
const PERSON = "person";
/** Valeur du sélecteur de périmètre : "org", "person", "g:<groupe>" ou l'id d'une direction. */
type Perimeter = typeof ORGANISATION | typeof PERSON | `g:${Group}` | number | "";

/**
 * Bouton « Générer un rapport » commun à toutes les rubriques : chaque page
 * passe la liste des rapports qui la concernent (`kinds`), et le serveur
 * (`/api/reports/pdf/`) applique les mêmes droits que l'écran. Le composant
 * charge lui-même campagnes, directions et personnes à l'ouverture.
 */
export default function ReportButton({
  kinds,
  defaultKind,
  defaultTeam = "",
  defaultCampaign = "",
  defaultSubject = "",
}: {
  kinds: ReportKind[];
  defaultKind?: ReportKind;
  defaultTeam?: number | "";
  defaultCampaign?: number | "";
  defaultSubject?: number | "";
}) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.auth.user);
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const isMember = user?.role === "MEMBER";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind>(defaultKind ?? kinds[0]);
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [people, setPeople] = useState<UserRecord[]>([]);
  const [perimeter, setPerimeter] = useState<Perimeter>("");
  const [subject, setSubject] = useState<number | "">("");
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function openDialog() {
    setError(null);
    setDone(null);
    const startKind = defaultKind && kinds.includes(defaultKind) ? defaultKind : kinds[0];
    setKind(startKind);
    setOpen(true);
    const [c, d, p] = await Promise.all([
      apiClient.get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 500 }, silent: true }).catch(() => null),
      isMember ? null : apiClient.get<Paginated<Department>>("/departments/", { params: { page_size: 500 }, silent: true }).catch(() => null),
      isMember || !kinds.some((k) => SCOPES[k].includes("person")) ? null : apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 }, silent: true }).catch(() => null),
    ]);
    const sorted = [...(c?.data.results ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const depts = d?.data.results ?? [];
    setCampaigns(sorted);
    setDepartments(depts);
    setPeople([...(p?.data.results ?? [])].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    setCampaignId(defaultCampaign !== "" ? defaultCampaign : sorted[0]?.id ?? "");
    const ownTeam = depts.find((x) => x.manager === user?.id)?.id ?? depts[0]?.id ?? "";
    setPerimeter(initialPerimeter(startKind, defaultTeam !== "" ? defaultTeam : ownTeam, depts));
    setSubject(defaultSubject !== "" ? defaultSubject : isMember ? user?.id ?? "" : "");
  }

  function initialPerimeter(k: ReportKind, team: number | "", depts: Department[]): Perimeter {
    const scopes = SCOPES[k];
    if (scopes.length === 1 && scopes[0] === "person") return PERSON;
    // Pour le dirigeant, sa propre équipe (présélectionnée par la page) n'est pas un choix : l'organisation l'est.
    const ownTeam = depts.find((d) => d.id === team)?.manager === user?.id;
    if (team !== "" && scopes.includes("team") && !(isCompanyAdmin && ownTeam && scopes.includes("org"))) return team;
    if (isCompanyAdmin && scopes.includes("org")) return ORGANISATION;
    return scopes.includes("team") ? depts[0]?.id ?? "" : PERSON;
  }

  /** Le périmètre choisi reste s'il convient au nouveau rapport ; sinon on prend le premier qui convient. */
  function changeKind(next: ReportKind) {
    setKind(next);
    const scopes = SCOPES[next];
    const current: Scope | null =
      perimeter === ORGANISATION ? "org" : perimeter === PERSON ? "person" : typeof perimeter === "number" ? "team" : perimeter ? "group" : null;
    if (!current || !scopes.includes(current)) setPerimeter(initialPerimeter(next, typeof perimeter === "number" ? perimeter : "", departments));
  }

  /** Directions puis leurs services, en retrait. */
  const orderedDepartments = [...departments.filter((d) => d.parent === null)]
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) => [d, ...departments.filter((x) => x.parent === d.id).sort((a, b) => a.name.localeCompare(b.name))]);
  const orphanServices = departments.filter((d) => d.parent !== null && !departments.some((x) => x.id === d.parent));
  const hasServices = departments.some((d) => d.parent !== null);

  async function generate() {
    setError(null);
    const bySubject = perimeter === PERSON;
    if (campaignId === "") return setError(t("reports.pickCampaign"));
    if (bySubject && subject === "" && !isMember) return setError(t("reports.pickPerson"));
    if (perimeter === "") return setError(t("reports.pickTeam"));
    setBusy(true);
    try {
      const target = bySubject
        ? subject === ""
          ? {}
          : { subject }
        : perimeter === ORGANISATION
          ? {}
          : typeof perimeter === "string"
            ? { group: perimeter.slice(2) }
            : { team: perimeter };
      // Production en arrière-plan : la rédaction de la synthèse par Claude prend une à deux minutes.
      const started = await apiClient.post<ReportJob>("/reports/jobs/", { campaign: campaignId, kind, ...target }, { silent: true });
      let job = started.data;
      const deadline = Date.now() + 6 * 60 * 1000;
      while (job.status === "PENDING" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        job = (await apiClient.get<ReportJob>(`/reports/jobs/${job.id}/`, { silent: true })).data;
      }
      if (job.status !== "READY") {
        setError(job.error || t("reports.failed"));
        return;
      }
      const r = await apiClient.get(`/reports/jobs/${job.id}/download/`, { responseType: "blob", silent: true });
      const filename = job.filename || "rapport.pdf";
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setDone(filename);
      setOpen(false);
    } catch (err: any) {
      // La réponse d'erreur arrive elle aussi sous forme de fichier : on la relit pour en donner le motif.
      let detail = "";
      try {
        const raw = err?.response?.data;
        const body = raw instanceof Blob ? JSON.parse(await raw.text()) : raw ?? {};
        detail = Object.entries(body)
          .filter(([key]) => key !== "code")
          .map(([, value]) => value)
          .flat()
          .join(" ");
      } catch {
        detail = "";
      }
      setError(detail || t("reports.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="contained" startIcon={<PictureAsPdfOutlinedIcon />} onClick={openDialog} sx={{ height: 40, whiteSpace: "nowrap" }}>
        {t("reports.open")}
      </Button>
      {done && (
        <Alert severity="success" onClose={() => setDone(null)} sx={{ width: "100%" }}>
          {t("reports.done", { file: done })}
        </Alert>
      )}
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>{t("reports.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("reports.intro")}
            </Typography>
            {kinds.length > 1 && (
              <RadioGroup value={kind} onChange={(e) => changeKind(e.target.value as ReportKind)}>
                {kinds.map((k) => (
                  <FormControlLabel
                    key={k}
                    value={k}
                    control={<Radio />}
                    label={
                      <Box sx={{ py: 0.5 }}>
                        <Typography fontWeight={700}>{t(`reports.kind.${k}`)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t(`reports.hint.${k}`)}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            )}
            {kinds.length === 1 && (
              <Box>
                <Typography fontWeight={700}>{t(`reports.kind.${kind}`)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t(`reports.hint.${kind}`)}
                </Typography>
              </Box>
            )}
            {!(kind === "person_id" && isMember) && SCOPES[kind].join() !== "person" && (
              <TextField
                select
                size="small"
                label={t("reports.perimeter")}
                value={perimeter}
                onChange={(e) => {
                  const v = e.target.value as string | number;
                  setPerimeter(v === ORGANISATION || v === PERSON || (typeof v === "string" && v.startsWith("g:")) ? (v as Perimeter) : Number(v));
                }}
              >
                {isCompanyAdmin && SCOPES[kind].includes("org") && (
                  <MenuItem value={ORGANISATION}>{t("reports.organisation", { company: user?.company_name ?? "" })}</MenuItem>
                )}
                {isCompanyAdmin &&
                  SCOPES[kind].includes("group") &&
                  GROUPS.filter((g) => g !== "service_heads" || hasServices).map((g) => (
                    <MenuItem key={g} value={`g:${g}`}>
                      {t(`reports.group.${g}`)}
                    </MenuItem>
                  ))}
                {SCOPES[kind].includes("team") &&
                  [...orderedDepartments, ...orphanServices].map((d) => (
                    <MenuItem key={d.id} value={d.id} sx={d.parent !== null ? { pl: 4, fontSize: 14 } : undefined}>
                      {d.manager === user?.id && isCompanyAdmin ? t("reports.ownTeam", { name: d.name }) : d.name}
                    </MenuItem>
                  ))}
                {SCOPES[kind].includes("person") && <MenuItem value={PERSON}>{t("reports.onePerson")}</MenuItem>}
              </TextField>
            )}
            {perimeter === PERSON && !isMember && (
              <TextField select size="small" label={t("reports.person")} value={subject} onChange={(e) => setSubject(Number(e.target.value))}>
                {people.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.full_name}
                    {p.position ? ` — ${p.position}` : ""}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField select size="small" label={t("reports.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))}>
              {campaigns.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            {busy && (
              <Alert severity="info" icon={<CircularProgress size={18} />}>
                {t("reports.writing")}
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            {t("reports.cancel")}
          </Button>
          <Button variant="contained" onClick={generate} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfOutlinedIcon />}>
            {t(busy ? "reports.busy" : "reports.generate")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
