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
import type { Department, EvaluationCampaign } from "@/api/types";

type Kind = "cohesion" | "relational";
const ORGANISATION = "org";

/**
 * Bouton « Générer un rapport » de la rubrique Cohésion d'équipe : rapport de
 * cohésion (avis des collaborateurs) ou de dynamique relationnelle, sur une
 * direction ou — pour le dirigeant — l'organisation entière. Le serveur
 * refuse, motif à l'appui, tant que le seuil d'avis n'est pas atteint.
 */
export default function CohesionReportButton({
  campaigns,
  departments,
  defaultKind,
  defaultTeam,
  defaultCampaign,
}: {
  campaigns: EvaluationCampaign[];
  departments: Department[];
  defaultKind: Kind;
  defaultTeam: number | "";
  defaultCampaign: number | "";
}) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.auth.user);
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [perimeter, setPerimeter] = useState<number | typeof ORGANISATION | "">("");
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function openDialog() {
    setError(null);
    setDone(null);
    setKind(defaultKind);
    setPerimeter(defaultTeam !== "" ? defaultTeam : isCompanyAdmin ? ORGANISATION : departments[0]?.id ?? "");
    setCampaignId(defaultCampaign !== "" ? defaultCampaign : campaigns[campaigns.length - 1]?.id ?? "");
    setOpen(true);
  }

  async function generate() {
    setError(null);
    if (campaignId === "") return setError(t("cohesionReport.pickCampaign"));
    if (perimeter === "") return setError(t("cohesionReport.pickTeam"));
    setBusy(true);
    try {
      const r = await apiClient.get("/cohesion-responses/report/", {
        params: { campaign: campaignId, kind, ...(perimeter === ORGANISATION ? {} : { team: perimeter }) },
        responseType: "blob",
        silent: true,
      });
      const header = String(r.headers["content-disposition"] ?? "");
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
      const plain = /filename="([^"]+)"/i.exec(header)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : plain ?? "rapport-cohesion.pdf";
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
        detail = Object.values(body).flat().filter((v) => v !== "invalid").join(" ");
      } catch {
        detail = "";
      }
      setError(detail || t("cohesionReport.failed"));
    } finally {
      setBusy(false);
    }
  }

  const option = (value: Kind) => (
    <FormControlLabel
      value={value}
      control={<Radio />}
      label={
        <Box sx={{ py: 0.5 }}>
          <Typography fontWeight={700}>{t(`cohesionReport.${value}`)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t(`cohesionReport.${value}Hint`)}
          </Typography>
        </Box>
      }
    />
  );

  return (
    <>
      <Button variant="contained" startIcon={<PictureAsPdfOutlinedIcon />} onClick={openDialog} disabled={!campaigns.length} sx={{ height: 40 }}>
        {t("cohesionReport.open")}
      </Button>
      {done && (
        <Alert severity="success" onClose={() => setDone(null)} sx={{ width: "100%" }}>
          {t("cohesionReport.done", { file: done })}
        </Alert>
      )}
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>{t("cohesionReport.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t("cohesionReport.intro")}
            </Typography>
            <RadioGroup value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {option("cohesion")}
              {option("relational")}
            </RadioGroup>
            <TextField select size="small" label={t("cohesionReport.perimeter")} value={perimeter} onChange={(e) => setPerimeter(e.target.value === ORGANISATION ? ORGANISATION : Number(e.target.value))}>
              {isCompanyAdmin && <MenuItem value={ORGANISATION}>{t("cohesionReport.organisation", { company: user?.company_name ?? "" })}</MenuItem>}
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label={t("cohesionReport.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))}>
              {[...campaigns]
                .sort((a, b) => b.start_date.localeCompare(a.start_date))
                .map((c) => (
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
            {t("cohesionReport.cancel")}
          </Button>
          <Button variant="contained" onClick={generate} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfOutlinedIcon />}>
            {t(busy ? "cohesionReport.busy" : "cohesionReport.generate")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
