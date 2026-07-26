import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import type { Paginated, PasswordResetRequest } from "@/api/types";

export default function PasswordResetRequestsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const locale = i18n.language === "en" ? "en-US" : "fr-FR";

  function load() {
    apiClient
      .get<Paginated<PasswordResetRequest>>("/password-reset-requests/")
      .then((r) => setRequests(r.data.results));
  }

  useEffect(load, []);

  async function handleResolve(req: PasswordResetRequest) {
    await apiClient.post(`/password-reset-requests/${req.id}/resolve/`);
    setMessage(t("passwordRequests.resolvedMessage", { name: req.user_name || req.user_email }));
    load();
  }

  const pending = requests.filter((r) => !r.resolved);
  const resolved = requests.filter((r) => r.resolved);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("passwordRequests.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {user?.role === "SUPER_ADMIN"
          ? t("passwordRequests.subtitleSuperAdmin")
          : t("passwordRequests.subtitleCompanyAdmin")}
      </Typography>

      {message && (
        <Alert severity="success" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("passwordRequests.user")}</TableCell>
                <TableCell>{t("common.role")}</TableCell>
                {user?.role === "SUPER_ADMIN" && <TableCell>{t("bulkUpload.company")}</TableCell>}
                <TableCell>{t("passwordRequests.requestedOn")}</TableCell>
                <TableCell align="right">{t("common.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((req) => (
                <TableRow key={req.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {req.user_name || "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {req.user_email}
                    </Typography>
                  </TableCell>
                  <TableCell>{t(`common.roles.${req.user_role}`)}</TableCell>
                  {user?.role === "SUPER_ADMIN" && <TableCell>{req.company_name}</TableCell>}
                  <TableCell>{new Date(req.requested_at).toLocaleString(locale)}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<LockResetOutlinedIcon />}
                      onClick={() => handleResolve(req)}
                    >
                      {t("passwordRequests.resolve")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pending.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      {t("passwordRequests.noPending")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {resolved.length > 0 && (
        <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("passwordRequests.user")}</TableCell>
                  <TableCell>{t("passwordRequests.resolvedOn")}</TableCell>
                  <TableCell>{t("passwordRequests.by")}</TableCell>
                  <TableCell align="right">{t("common.status")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resolved.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>{req.user_name || req.user_email}</TableCell>
                    <TableCell>
                      {req.resolved_at ? new Date(req.resolved_at).toLocaleString(locale) : "—"}
                    </TableCell>
                    <TableCell>{req.resolved_by_name ?? "—"}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" label={t("passwordRequests.resolved")} color="success" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}
