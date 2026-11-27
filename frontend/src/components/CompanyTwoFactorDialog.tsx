import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Company } from "@/api/types";
import InlineApiError from "@/components/feedback/InlineApiError";
import { describeApiError, type ApiErrorInfo } from "@/utils/apiError";

interface Account {
  id: number;
  full_name: string;
  login: string | null;
  email: string;
  role: string;
  is_active: boolean;
  has_real_email: boolean;
}

interface TwoFactorState {
  enabled: boolean;
  sending_ready: boolean;
  accounts: Account[];
}

interface Props {
  company: Company | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Super admin : active la double authentification par e-mail d'une
 *  entreprise et renseigne la vraie adresse des comptes qui n'en ont pas. */
export default function CompanyTwoFactorDialog({ company, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<TwoFactorState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    if (!company) return;
    setLoadFailed(false);
    apiClient
      .get<TwoFactorState>(`/companies/${company.id}/two-factor/`, { silent: true })
      .then((r) => setState(r.data))
      .catch(() => setLoadFailed(true));
  }

  useEffect(() => {
    setState(null);
    setDrafts({});
    setFieldErrors({});
    setQuery("");
    setOnlyMissing(true);
    setError(null);
    setNotice(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const missing = state?.accounts.filter((a) => !a.has_real_email).length ?? 0;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (state?.accounts ?? []).filter(
      (a) =>
        (!onlyMissing || !a.has_real_email) &&
        (!q || [a.full_name, a.login ?? "", a.email].some((v) => v.toLowerCase().includes(q))),
    );
  }, [state, onlyMissing, query]);

  async function toggle(enabled: boolean) {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post<TwoFactorState>(`/companies/${company.id}/two-factor/`, { enabled });
      setState(data);
      onDone(t(enabled ? "twoFactor.admin.enabled" : "twoFactor.admin.disabled", { company: company.name }));
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEmail(account: Account) {
    if (!company) return;
    const email = (drafts[account.id] ?? "").trim();
    if (!EMAIL_PATTERN.test(email) || /\.(local|pmc)$/i.test(email)) {
      setFieldErrors((e) => ({ ...e, [account.id]: t("twoFactor.admin.emailInvalid", { email }) }));
      return;
    }
    setBusy(true);
    setFieldErrors((e) => ({ ...e, [account.id]: "" }));
    try {
      const { data } = await apiClient.post<{ email: string; has_real_email: boolean }>(
        `/companies/${company.id}/account-email/`,
        { user: account.id, email },
        { silent: true },
      );
      setState((s) =>
        s && { ...s, accounts: s.accounts.map((a) => (a.id === account.id ? { ...a, ...data } : a)) },
      );
      setDrafts((d) => {
        const next = { ...d };
        delete next[account.id];
        return next;
      });
      setNotice(t("twoFactor.admin.saved", { login: account.login || account.full_name }));
    } catch (err) {
      const body = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
      const message = body?.email ?? body?.detail;
      setFieldErrors((e) => ({
        ...e,
        [account.id]: Array.isArray(message) ? String(message[0]) : typeof message === "string" ? message : (describeApiError(err).reasons[0] ?? describeApiError(err).title),
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!company} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t("twoFactor.admin.title", { company: company?.name ?? "" })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t("twoFactor.admin.intro")}
          </Typography>
          {loadFailed && (
            <Alert severity="error" action={<Button onClick={load}>OK</Button>}>
              {t("twoFactor.admin.loadFailed")}
            </Alert>
          )}
          {!state && !loadFailed && <CircularProgress size={24} />}
          {state && (
            <>
              <FormControlLabel
                control={
                  <Switch
                    checked={state.enabled}
                    disabled={busy || (!state.enabled && !state.sending_ready)}
                    onChange={(e) => toggle(e.target.checked)}
                  />
                }
                label={t("twoFactor.admin.switch")}
              />
              {!state.sending_ready && <Alert severity="warning">{t("twoFactor.admin.notReady")}</Alert>}
              <Alert severity={missing ? (state.enabled ? "error" : "warning") : "success"}>
                {missing ? t("twoFactor.admin.missing", { count: missing }) : t("twoFactor.admin.allSet")}{" "}
                {t("twoFactor.admin.loginHint")}
              </Alert>
              {notice && (
                <Alert severity="success" onClose={() => setNotice(null)}>
                  {notice}
                </Alert>
              )}
              {error && <InlineApiError info={error} onClose={() => setError(null)} />}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <TextField
                  size="small"
                  label={t("twoFactor.admin.search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <FormControlLabel
                  control={<Checkbox checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />}
                  label={t("twoFactor.admin.onlyMissing")}
                />
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("twoFactor.admin.login")}</TableCell>
                    <TableCell>{t("twoFactor.admin.name")}</TableCell>
                    <TableCell>{t("twoFactor.admin.email")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" color="text.secondary">
                          {t("twoFactor.admin.none")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {shown.map((a) => {
                    const draft = drafts[a.id];
                    const value = draft ?? (a.has_real_email ? a.email : "");
                    const changed = draft !== undefined && draft.trim() !== (a.has_real_email ? a.email : "");
                    return (
                      <TableRow key={a.id}>
                        <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>{a.login || "—"}</TableCell>
                        <TableCell>{a.full_name || "—"}</TableCell>
                        <TableCell sx={{ minWidth: 300 }}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <TextField
                              size="small"
                              type="email"
                              fullWidth
                              value={value}
                              placeholder={a.has_real_email ? undefined : t("twoFactor.admin.technical")}
                              error={!!fieldErrors[a.id]}
                              helperText={fieldErrors[a.id] || undefined}
                              onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && changed) saveEmail(a);
                              }}
                            />
                            <Button size="small" variant="outlined" disabled={busy || !changed} onClick={() => saveEmail(a)}>
                              {t("twoFactor.admin.save")}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("twoFactor.admin.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
