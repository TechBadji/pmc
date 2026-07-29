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
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { AuditLog, Paginated } from "@/api/types";

const POLL_MS = 8000;

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
  const pageRef = useRef(page);
  pageRef.current = page;
  const knownIdsRef = useRef<Set<number> | null>(null);

  function load() {
    setLoadError(false);
    apiClient
      .get<Paginated<AuditLog>>("/audit-logs/", {
        params: { page: page + 1, page_size: rowsPerPage },
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

  useEffect(load, [page, rowsPerPage]);

  // Actualisation automatique — seulement sur la première page (les plus
  // récents événements), pour ne pas perturber la pagination d'un
  // utilisateur en train de consulter l'historique plus ancien.
  useEffect(() => {
    const interval = setInterval(() => {
      if (pageRef.current === 0) load();
    }, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsPerPage]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t("logs.title")}
          </Typography>
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
