import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PageHeader from "@/components/layout/PageHeader";
import type { Company, EvaluationCampaign, Paginated } from "@/api/types";

type Archive = {
  id: number;
  company: number;
  company_name: string;
  campaign: number;
  campaign_name: string;
  status: "PENDING" | "READY" | "FAILED";
  filename: string;
  size: number;
  individual_count: number;
  skipped: string[];
  error: string;
  created_by_name: string;
  created_at: string;
  finished_at: string | null;
};

const STATUS_COLOR = { PENDING: "info", READY: "success", FAILED: "error" } as const;

/** Super administrateur : production et téléchargement des archives de
 * rapports 360° Feedforward (rapport global + tous les rapports individuels
 * d'une campagne). Les fichiers ne sortent que par l'API, jamais par une
 * adresse publique. */
export default function ReportArchivesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [archives, setArchives] = useState<Archive[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  const load = useCallback(() => {
    apiClient
      .get<Paginated<Archive>>("/report-archives/", { params: { page_size: 100 }, silent: true })
      .then((r) => setArchives(r.data.results))
      .catch(() => setError(t("reportArchives.loadFailed")));
  }, [t]);

  useEffect(() => {
    load();
    apiClient
      .get<Paginated<Company>>("/companies/", { params: { page_size: 200 } })
      .then((r) => setCompanies([...r.data.results].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setError(t("reportArchives.loadFailed")));
  }, [load, t]);

  useEffect(() => {
    setCampaigns([]);
    setCampaignId("");
    if (companyId === "") return;
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { company: companyId, page_size: 200 } })
      .then((r) => {
        const sorted = [...r.data.results].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setCampaigns(sorted);
        setCampaignId((sorted.find((c) => !c.is_closed) ?? sorted[0])?.id ?? "");
      })
      .catch(() => setError(t("reportArchives.loadFailed")));
  }, [companyId, t]);

  // Tant qu'une archive se construit, la liste se rafraîchit toute seule.
  const pending = archives.some((a) => a.status === "PENDING");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function generate() {
    setError(null);
    if (companyId === "" || campaignId === "") {
      setError(t("reportArchives.pickBoth"));
      return;
    }
    setBusy(true);
    try {
      await apiClient.post("/report-archives/", { company: companyId, campaign: campaignId }, { silent: true });
      load();
    } catch (err: any) {
      const d = err?.response?.data;
      setError((d && typeof d === "object" ? Object.values(d).flat().join(" ") : "") || t("reportArchives.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function download(archive: Archive) {
    setError(null);
    setDownloading(archive.id);
    try {
      const r = await apiClient.get(`/report-archives/${archive.id}/download/`, { responseType: "blob", silent: true });
      const url = window.URL.createObjectURL(new Blob([r.data], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = archive.filename || "rapports-360-feedforward.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError(t("reportArchives.downloadFailed"));
    } finally {
      setDownloading(null);
    }
  }

  async function remove(archive: Archive) {
    if (!window.confirm(t("reportArchives.confirmDelete", { file: archive.filename || archive.company_name }))) return;
    try {
      await apiClient.delete(`/report-archives/${archive.id}/`, { silent: true });
      load();
    } catch {
      setError(t("reportArchives.deleteFailed"));
    }
  }

  if (user?.role !== "SUPER_ADMIN") return <Alert severity="info">{t("reportArchives.adminOnly")}</Alert>;

  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" });
  const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`).replace(".", ",");

  return (
    <Stack spacing={2.5}>
      <PageHeader title={t("reportArchives.title")} subtitle={t("reportArchives.subtitle")} />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <TextField select size="small" label={t("reportArchives.company")} value={companyId} onChange={(e) => setCompanyId(Number(e.target.value))} sx={{ minWidth: 260 }}>
            {companies.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label={t("reportArchives.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))} sx={{ minWidth: 220 }} disabled={companyId === ""}>
            {campaigns.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <FolderZipOutlinedIcon />}
            onClick={generate}
            disabled={busy || companyId === "" || campaignId === ""}
          >
            {t("reportArchives.generate")}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.25 }}>
          {t("reportArchives.hint")}
        </Typography>
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
      {archives.length === 0 ? (
        <Alert severity="info">{t("reportArchives.none")}</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "primary.main" }}>
                {["company", "campaign", "content", "produced", "status", "actions"].map((k) => (
                  <TableCell key={k} sx={{ color: "#fff", fontWeight: 700 }} align={k === "actions" ? "right" : "left"}>
                    {t(`reportArchives.col.${k}`)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {archives.map((a) => (
                <TableRow key={a.id} hover sx={{ verticalAlign: "top" }}>
                  <TableCell sx={{ fontWeight: 700 }}>{a.company_name}</TableCell>
                  <TableCell>{a.campaign_name}</TableCell>
                  <TableCell>
                    {a.status === "READY" ? (
                      <Box>
                        <Typography variant="body2">{t("reportArchives.content", { count: a.individual_count })}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {a.filename} · {size(a.size)}
                        </Typography>
                        {a.skipped.length > 0 && (
                          <Tooltip title={a.skipped.join(", ")}>
                            <Typography variant="caption" color="text.secondary" sx={{ textDecoration: "underline dotted", cursor: "help" }}>
                              {t("reportArchives.skipped", { count: a.skipped.length })}
                            </Typography>
                          </Tooltip>
                        )}
                      </Box>
                    ) : a.status === "FAILED" ? (
                      <Typography variant="body2" color="error">
                        {a.error}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t("reportArchives.inProgress")}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{when(a.created_at)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {a.created_by_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={STATUS_COLOR[a.status]}
                      icon={a.status === "PENDING" ? <CircularProgress size={12} color="inherit" /> : undefined}
                      label={t(`reportArchives.status.${a.status}`)}
                      sx={{ fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={downloading === a.id ? <CircularProgress size={14} /> : <DownloadOutlinedIcon />}
                        disabled={a.status !== "READY" || downloading !== null}
                        onClick={() => download(a)}
                      >
                        {t("reportArchives.download")}
                      </Button>
                      <Tooltip title={t("reportArchives.delete")}>
                        <span>
                          <IconButton size="small" onClick={() => remove(a)} disabled={a.status === "PENDING"}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
