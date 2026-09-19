import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import InlineApiError from "@/components/feedback/InlineApiError";
import ValidationSummary from "@/components/feedback/ValidationSummary";
import { describeApiError, type ApiErrorInfo } from "@/utils/apiError";
import { useIssues } from "@/utils/validation";
import { fetchMe } from "./authSlice";

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const { issues, check, clear, has, messageFor } = useIssues();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const ok = check([
      [oldPassword === "", t("validation.changePassword.currentRequired"), "old"],
      [newPassword === "", t("validation.changePassword.newRequired"), "new"],
      [newPassword !== "" && newPassword.length < 8, t("validation.changePassword.tooShort", { count: newPassword.length }), "new"],
      [newPassword.length >= 8 && /^\d+$/.test(newPassword), t("validation.changePassword.digitsOnly"), "new"],
      [newPassword !== "" && newPassword === oldPassword, t("validation.changePassword.sameAsOld"), "new"],
      [newPassword !== "" && confirmPassword === "", t("validation.changePassword.confirmRequired"), "confirm"],
      [confirmPassword !== "" && newPassword !== confirmPassword, t("validation.changePassword.mismatch"), "confirm"],
    ]);
    if (!ok) return;
    setLoading(true);
    try {
      await apiClient.post(
        "/auth/change-password/",
        { old_password: oldPassword, new_password: newPassword },
        { silent: true }
      );
      await dispatch(fetchMe());
      navigate("/", { replace: true });
    } catch (err) {
      setError(describeApiError(err, t("changePassword.failed")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Paper elevation={0} sx={{ p: 4, width: 420, border: "1px solid", borderColor: "divider" }}>
        <Stack spacing={1} alignItems="center" sx={{ mb: 3 }}>
          <Box component="img" src="/pmc-logo.png" alt="ID-PMC" sx={{ height: 56, mb: 1 }} />
          <Typography variant="h6" fontWeight={700} color="primary.main">
            {t("changePassword.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t("changePassword.greeting", { name: user?.full_name || user?.email })}
          </Typography>
        </Stack>
        <form onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <InlineApiError info={error} onClose={() => setError(null)} />
            <TextField
              label={t("changePassword.current")}
              type="password"
              value={oldPassword}
              onChange={(e) => {
                setOldPassword(e.target.value);
                clear();
              }}
              error={has("old")}
              autoFocus
              required
              fullWidth
            />
            <TextField
              label={t("changePassword.new")}
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                clear();
              }}
              error={has("new")}
              helperText={messageFor("new") ?? t("changePassword.newHelper")}
              required
              fullWidth
            />
            <TextField
              label={t("changePassword.confirm")}
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clear();
              }}
              error={has("confirm")}
              required
              fullWidth
            />
            <ValidationSummary issues={issues} onClose={clear} />
            <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
              {loading ? t("changePassword.saving") : t("changePassword.submit")}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
