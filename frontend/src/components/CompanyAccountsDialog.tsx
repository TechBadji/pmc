import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import type { Company } from "@/api/types";
import InlineApiError from "@/components/feedback/InlineApiError";
import { describeApiError, type ApiErrorInfo } from "@/utils/apiError";

interface AccountsSummary {
  total: number;
  active: number;
  blocked: number;
}

interface Props {
  company: Company | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Actions groupées du Super Admin sur les comptes d'une entreprise :
 *  réinitialiser tous les mots de passe, bloquer ou débloquer tous les
 *  comptes — utiles avant et après une démo. */
export default function CompanyAccountsDialog({ company, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [includeAdmin, setIncludeAdmin] = useState(false);
  const [password, setPassword] = useState("123456");
  const [mustChange, setMustChange] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);

  function loadSummary() {
    if (!company) return;
    setSummaryError(false);
    apiClient
      .get<AccountsSummary>(`/companies/${company.id}/accounts-summary/`, { silent: true })
      .then((r) => setSummary(r.data))
      .catch(() => setSummaryError(true));
  }

  useEffect(() => {
    if (!company) return;
    setSummary(null);
    setIncludeAdmin(false);
    setPassword("123456");
    setMustChange(true);
    setConfirmReset(false);
    setError(null);
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  const passwordIssue =
    password.length < 6 ? t("companies.accounts.pwTooShort") : /\s/.test(password) ? t("companies.accounts.pwSpaces") : null;

  async function handleReset() {
    if (!company || passwordIssue) return;
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post<{ updated: number; password: string }>(
        `/companies/${company.id}/reset-passwords/`,
        { password, include_admin: includeAdmin, must_change_password: mustChange },
        { silent: true }
      );
      onDone(t("companies.accounts.resetDone", { count: data.updated, name: company.name, password: data.password }));
    } catch (err) {
      setError(describeApiError(err));
      setConfirmReset(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetActive(active: boolean) {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post<{ updated: number }>(
        `/companies/${company.id}/set-users-active/`,
        { is_active: active, include_admin: includeAdmin },
        { silent: true }
      );
      onDone(
        t(active ? "companies.accounts.unblockDone" : "companies.accounts.blockDone", {
          count: data.updated,
          name: company.name,
        })
      );
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!company} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {t("companies.accounts.title")} — {company?.name}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {summary && <Alert severity="info">{t("companies.accounts.summary", { ...summary })}</Alert>}
          {summaryError && <Alert severity="warning">{t("companies.accounts.loadError")}</Alert>}
          <FormControlLabel
            control={<Checkbox checked={includeAdmin} onChange={(e) => setIncludeAdmin(e.target.checked)} />}
            label={t("companies.accounts.includeAdmin")}
          />

          <Divider />
          <Typography variant="subtitle2">{t("companies.accounts.resetSection")}</Typography>
          <TextField
            label={t("companies.accounts.password")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setConfirmReset(false);
            }}
            error={!!passwordIssue}
            helperText={passwordIssue ?? t("companies.accounts.passwordHelp")}
            fullWidth
          />
          <FormControlLabel
            control={<Checkbox checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />}
            label={t("companies.accounts.mustChange")}
          />
          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              color={confirmReset ? "warning" : "primary"}
              onClick={handleReset}
              disabled={busy || !!passwordIssue}
            >
              {confirmReset ? t("companies.accounts.resetConfirm") : t("companies.accounts.resetButton")}
            </Button>
          </Stack>

          <Divider />
          <Typography variant="subtitle2">{t("companies.accounts.blockSection")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("companies.accounts.blockHelp")}
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="outlined" onClick={() => handleSetActive(true)} disabled={busy}>
              {t("companies.accounts.unblockAll")}
            </Button>
            <Button variant="contained" color="error" onClick={() => handleSetActive(false)} disabled={busy}>
              {t("companies.accounts.blockAll")}
            </Button>
          </Stack>

          {error && <InlineApiError info={error} onClose={() => setError(null)} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
