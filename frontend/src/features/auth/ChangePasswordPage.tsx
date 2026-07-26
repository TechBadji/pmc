import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { fetchMe } from "./authSlice";

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError(t("changePassword.mismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("changePassword.tooShort"));
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/auth/change-password/", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      await dispatch(fetchMe());
      navigate("/", { replace: true });
    } catch (err: any) {
      const data = err.response?.data;
      setError(
        data?.old_password?.[0] ?? data?.new_password?.[0] ?? data?.detail ?? t("changePassword.failed")
      );
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
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t("changePassword.current")}
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoFocus
              required
              fullWidth
            />
            <TextField
              label={t("changePassword.new")}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText={t("changePassword.newHelper")}
              required
              fullWidth
            />
            <TextField
              label={t("changePassword.confirm")}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
              {loading ? t("changePassword.saving") : t("changePassword.submit")}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
