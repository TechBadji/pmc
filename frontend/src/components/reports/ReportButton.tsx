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

/** Rapports qui portent sur une équipe sans pouvoir viser l'organisation entière. */
const TEAM_ONLY: ReportKind[] = ["team_id"];
const ORGANISATION = "org";

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
  const [perimeter, setPerimeter] = useState<number | typeof ORGANISATION | "">("");
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
      isMember || !kinds.includes("person_id") ? null : apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 }, silent: true }).catch(() => null),
    ]);
    const sorted = [...(c?.data.results ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const depts = d?.data.results ?? [];
    setCampaigns(sorted);
    setDepartments(depts);
    setPeople([...(p?.data.results ?? [])].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    setCampaignId(defaultCampaign !== "" ? defaultCampaign : sorted[0]?.id ?? "");
    const ownTeam = depts.find((x) => x.manager === user?.id)?.id ?? depts[0]?.id ?? "";
    setPerimeter(defaultTeam !== "" ? defaultTeam : isCompanyAdmin && !TEAM_ONLY.includes(startKind) ? ORGANISATION : ownTeam);
    setSubject(defaultSubject !== "" ? defaultSubject : isMember ? user?.id ?? "" : "");
  }

  function changeKind(next: ReportKind) {
    setKind(next);
    if (TEAM_ONLY.includes(next) && perimeter === ORGANISATION) setPerimeter(departments[0]?.id ?? "");
  }

  async function generate() {
    setError(null);
    const bySubject = kind === "person_id";
    if (campaignId === "") return setError(t("reports.pickCampaign"));
    if (bySubject && subject === "" && !isMember) return setError(t("reports.pickPerson"));
    if (!bySubject && perimeter === "") return setError(t("reports.pickTeam"));
    setBusy(true);
    try {
      const target = bySubject ? (subject === "" ? {} : { subject }) : perimeter === ORGANISATION ? {} : { team: perimeter };
      const r = await apiClient.get("/reports/pdf/", { params: { campaign: campaignId, kind, ...target }, responseType: "blob", silent: true });
      const header = String(r.headers["content-disposition"] ?? "");
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
      const plain = /filename="([^"]+)"/i.exec(header)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : plain ?? "rapport.pdf";
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
        const body = JSON.parse(await (err?.response?.data as Blob).text());
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
            {kind === "person_id" ? (
              !isMember && (
                <TextField select size="small" label={t("reports.person")} value={subject} onChange={(e) => setSubject(Number(e.target.value))}>
                  {people.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.full_name}
                      {p.position ? ` — ${p.position}` : ""}
                    </MenuItem>
                  ))}
                </TextField>
              )
            ) : (
              <TextField
                select
                size="small"
                label={t("reports.perimeter")}
                value={perimeter}
                onChange={(e) => setPerimeter(e.target.value === ORGANISATION ? ORGANISATION : Number(e.target.value))}
              >
                {isCompanyAdmin && !TEAM_ONLY.includes(kind) && (
                  <MenuItem value={ORGANISATION}>{t("reports.organisation", { company: user?.company_name ?? "" })}</MenuItem>
                )}
                {departments.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.name}
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
