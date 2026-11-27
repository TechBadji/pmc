import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { cancelTwoFactor, twoFactorResent, verifyLoginCode } from "./authSlice";

/**
 * Deuxième étape de la connexion quand l'entreprise exige un code envoyé par
 * e-mail. Montée une seule fois dans l'application : elle sert toutes les
 * pages de connexion, qui n'ont qu'à envoyer l'identifiant et le mot de passe.
 */
export default function TwoFactorDialog() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const pending = useAppSelector((s) => s.auth.twoFactor);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    setCode("");
    setError(null);
    setInfo(null);
    setWait(pending?.resendAfter ?? 0);
  }, [pending?.challenge]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  if (!pending) return null;

  function explain(reason: string | undefined) {
    if (reason === "network") return t("twoFactor.network");
    if (reason === "throttled") return t("twoFactor.throttled");
    if (reason === "expired") return t("twoFactor.expired");
    return reason ?? t("twoFactor.network");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(t("twoFactor.codeFormat"));
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await dispatch(verifyLoginCode({ code }));
    setBusy(false);
    if (verifyLoginCode.fulfilled.match(result)) {
      navigate("/", { replace: true });
    } else {
      setCode("");
      setError(explain(result.payload));
    }
  }

  async function resend() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data } = await apiClient.post(
        "/auth/login/code/",
        { challenge: pending.challenge, action: "resend" },
        { silent: true },
      );
      dispatch(twoFactorResent({ challenge: data.challenge, expiresIn: data.expires_in, resendAfter: data.resend_after }));
      setWait(data.resend_after);
      setCode("");
      setInfo(t("twoFactor.resent", { email: pending.emailHint }));
    } catch (err) {
      const body = axios.isAxiosError(err) ? (err.response?.data as Record<string, unknown> | undefined) : undefined;
      if (typeof body?.retry_after === "number") setWait(body.retry_after);
      setError(typeof body?.detail === "string" ? body.detail : t("twoFactor.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={() => dispatch(cancelTwoFactor())} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <MarkEmailReadOutlinedIcon color="primary" />
            <span>{t("twoFactor.title")}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2">{t("twoFactor.intro", { email: pending.emailHint })}</Typography>
            <TextField
              autoFocus
              label={t("twoFactor.codeLabel")}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              error={!!error}
              inputProps={{
                inputMode: "numeric",
                autoComplete: "one-time-code",
                maxLength: 6,
                style: { letterSpacing: "0.5em", fontSize: "1.4rem", textAlign: "center" },
              }}
            />
            {error && <Alert severity="error">{error}</Alert>}
            {info && <Alert severity="success">{info}</Alert>}
            <Typography variant="caption" color="text.secondary">
              {t("twoFactor.validity", { minutes: Math.round(pending.expiresIn / 60) })}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
          <Button onClick={resend} disabled={busy || wait > 0} size="small">
            {wait > 0 ? t("twoFactor.resendIn", { seconds: wait }) : t("twoFactor.resend")}
          </Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => dispatch(cancelTwoFactor())} disabled={busy}>
              {t("twoFactor.cancel")}
            </Button>
            <Button type="submit" variant="contained" disabled={busy}>
              {t("twoFactor.submit")}
            </Button>
          </Stack>
        </DialogActions>
      </form>
    </Dialog>
  );
}
