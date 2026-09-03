import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import { apiClient } from "@/api/client";
import type { AuditLog, Paginated } from "@/api/types";

const POLL_MS = 8000;
// Laisse l'utilisateur finir de taper avant d'interroger l'API — évite une
// requête par frappe sur les champs Entreprise/Recherche.
const DEBOUNCE_MS = 400;

export default function LogsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-US" : "fr-FR";
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loadError, setLoadError] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [newEventsAnnouncement, setNewEventsAnnouncement] = useState("");
  const [exporting, setExporting] = useState(false);

  // Champs de saisie affichés (mise à jour immédiate) vs filtres réellement
  // appliqués à la requête (mise à jour après un court silence de frappe
  // pour Entreprise/Recherche, immédiate pour les dates).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedCompany, setAppliedCompany] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const pageRef = useRef(page);
  pageRef.current = page;
  const knownIdsRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAppliedCompany(companyInput);
      setPage(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [companyInput]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAppliedSearch(searchInput);
      setPage(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  function filterParams() {
    return {
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(appliedCompany ? { company_name: appliedCompany } : {}),
      ...(appliedSearch ? { search: appliedSearch } : {}),
    };
  }

  function load() {
    setLoadError(false);
    apiClient
      .get<Paginated<AuditLog>>("/audit-logs/", {
        params: { page: page + 1, page_size: rowsPerPage, ...filterParams() },
      })
      .then((r) => {
        setLogs(r.data.results);
        setCount(r.data.count);
        setLastRefreshed(new Date());

        // N'annonce (lecteur d'écran) que si de VRAIS nouveaux événements
        // sont apparus depuis le dernier chargement — jamais à chaque poll
        // silencieux, sous peine de spammer les utilisateurs non-voyants.
        if (pageRef.current === 0) {
          const currentIds = new Set(r.data.results.map((log) => log.id));
          if (knownIdsRef.current) {
            const newCount = [...currentIds].filter((id) => !knownIdsRef.current!.has(id)).length;
            if (newCount > 0) {
              setNewEventsAnnouncement(t("logs.newEventsAnnouncement", { count: newCount }));
            }
          }
          knownIdsRef.current = currentIds;
        }
      })
      .catch(() => setLoadError(true));
  }

  useEffect(load, [page, rowsPerPage, dateFrom, dateTo, appliedCompany, appliedSearch]);

  // Actualisation automatique — seulement sur la première page (les plus
  // récents événements), pour ne pas perturber la pagination d'un
  // utilisateur en train de consulter l'historique plus ancien.
  useEffect(() => {
    const interval = setInterval(() => {
      if (pageRef.current === 0) load();
    }, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsPerPage, dateFrom, dateTo, appliedCompany, appliedSearch]);

  async function handleExport() {
    setExporting(true);
    try {
      const r = await apiClient.get("/audit-logs/export/", {
        params: filterParams(),
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = "journal-activite.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setLoadError(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
        <Box>
          <PageHeader title={t("logs.title")} />
          <Typography variant="body2" color="text.secondary">
            {t("logs.subtitle")}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {lastRefreshed && (
            <Typography variant="caption" color="text.secondary">
              {t("logs.lastRefreshed", { time: lastRefreshed.toLocaleTimeString(locale) })}
            </Typography>
          )}
          <Button size="small" startIcon={<HistoryOutlinedIcon />} onClick={load}>
            {t("common.refresh")}
          </Button>
        </Stack>
      </Stack>

      {/* Zone d'annonce dédiée aux lecteurs d'écran : le tableau se
          rafraîchit tout seul (polling) sans qu'un utilisateur non-voyant
          en soit autrement informé — on annonce uniquement quand de
          nouveaux événements sont réellement arrivés, jamais à chaque
          poll silencieux, pour ne pas noyer l'utilisateur d'annonces. */}
      <Box
        role="status"
        aria-live="polite"
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {newEventsAnnouncement}
      </Box>

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

      <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center" useFlexGap>
          <TextField
            size="small"
            type="date"
            label={t("logs.dateFrom")}
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />
          <TextField
            size="small"
            type="date"
            label={t("logs.dateTo")}
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />
          <TextField
            size="small"
            label={t("logs.companyFilter")}
            value={companyInput}
            onChange={(e) => setCompanyInput(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <TextField
            size="small"
            label={t("logs.searchFilter")}
            placeholder={t("logs.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ minWidth: 240, flexGrow: 1 }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleExport}
            disabled={exporting}
          >
            {t("logs.exportCsv")}
          </Button>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("logs.timestamp")}</TableCell>
                <TableCell>{t("logs.event")}</TableCell>
                <TableCell>{t("logs.company")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => {
                const category = log.action.split(".")[0];
                return (
                  <TableRow key={log.id}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Typography variant="body2">
                        {new Date(log.created_at).toLocaleString(locale)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          size="small"
                          label={t(`logs.categories.${category}`, category)}
                          variant="outlined"
                        />
                        <Typography variant="body2">
                          <strong>{log.actor_name}</strong> {log.description}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {log.company_name || "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 && !loadError && (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      {t("logs.noEvents")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={count}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Paper>
    </Stack>
  );
}
