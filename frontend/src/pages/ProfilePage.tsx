import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { fetchMe } from "@/features/auth/authSlice";
import type { AppLanguage, ThemePreference } from "@/api/types";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Garde synchrone anti double-soumission : un double-clic avant que React
  // ne re-rende le bouton désactivé peut déclencher deux PATCH quasi
  // simultanés. Le second, parti d'une copie du profil chargée avant la fin
  // du premier, écrasait alors la photo qui venait d'être enregistrée
  // (perte de mise à jour). `useState`/`disabled` seuls ne suffisent pas
  // car leur mise à jour n'est pas synchrone avec le clic.
  const submittingRef = useRef(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    position: "",
    phone: "",
    theme_preference: "SYSTEM" as ThemePreference,
    language: "fr" as AppLanguage,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      first_name: user.first_name,
      last_name: user.last_name,
      position: user.position,
      phone: user.phone,
      theme_preference: user.theme_preference,
      language: user.language,
    });
  }, [user]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("first_name", form.first_name);
      formData.append("last_name", form.last_name);
      formData.append("position", form.position);
      formData.append("phone", form.phone);
      formData.append("theme_preference", form.theme_preference);
      formData.append("language", form.language);
      if (avatarFile) formData.append("avatar", avatarFile);

      await apiClient.patch("/auth/me/", formData);
      await dispatch(fetchMe());
      setMessage(t("profile.updated"));
      // On garde volontairement l'aperçu local (déjà chargé en mémoire) au
      // lieu de le vider : afficher immédiatement `user.avatar` obligerait
      // le navigateur à re-télécharger l'image depuis le serveur, ce qui
      // peut créer un flash "sans photo" le temps du chargement réseau.
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("profile.updateFailed"));
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  if (!user) return null;

  const displayedAvatar = avatarPreview ?? user.avatar ?? undefined;
  const initial = (user.full_name || user.email).charAt(0).toUpperCase();

  return (
    <Stack spacing={3} maxWidth={640}>
      <Typography variant="h5" fontWeight={700}>
        {t("profile.title")}
      </Typography>

      {message && (
        <Alert severity="success" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider" }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={3} alignItems="center">
            <Box sx={{ position: "relative" }}>
              <Avatar
                key={displayedAvatar ?? "no-avatar"}
                src={displayedAvatar}
                alt={initial}
                sx={{ width: 96, height: 96, fontSize: 36, bgcolor: "primary.main" }}
              >
                {initial}
              </Avatar>
              <IconButton
                size="small"
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  bgcolor: "background.paper",
                  border: "1px solid",
                  borderColor: "divider",
                  "&:hover": { bgcolor: "background.paper" },
                }}
              >
                <PhotoCameraOutlinedIcon fontSize="small" />
              </IconButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatarChange}
              />
            </Box>
            <Stack>
              <Typography variant="subtitle1" fontWeight={600}>
                {user.full_name || user.email}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user.email}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t(`common.roles.${user.role}`)}
                {user.company_name ? ` · ${user.company_name}` : ""}
              </Typography>
            </Stack>
          </Stack>

          <Divider />

          <Stack direction="row" spacing={2}>
            <TextField
              label={t("common.firstName")}
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("common.lastName")}
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              fullWidth
            />
          </Stack>
          <TextField
            label={t("common.position")}
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
            fullWidth
          />
          <TextField
            label={t("common.phone")}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            fullWidth
          />

          <Divider />

          <Typography variant="subtitle2">{t("profile.environmentSettings")}</Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <TextField
              select
              label={t("profile.theme")}
              value={form.theme_preference}
              onChange={(e) =>
                setForm({ ...form, theme_preference: e.target.value as ThemePreference })
              }
              helperText={t("profile.themeHelper")}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="LIGHT">{t("profile.themeLight")}</MenuItem>
              <MenuItem value="DARK">{t("profile.themeDark")}</MenuItem>
              <MenuItem value="SYSTEM">{t("profile.themeSystem")}</MenuItem>
            </TextField>
            <TextField
              select
              label={t("profile.language")}
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value as AppLanguage })}
              helperText={t("profile.languageHelper")}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="fr">Français</MenuItem>
              <MenuItem value="en">English</MenuItem>
            </TextField>
          </Stack>

          <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
            <Button onClick={() => navigate("/change-password")}>{t("profile.changePassword")}</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={saving}>
              {saving ? t("changePassword.saving") : t("common.save")}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
