import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link as MuiLink,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient, LAST_EMAIL_KEY } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { setAppLanguage } from "@/i18n";
import { login } from "./authSlice";

const FAILED_ATTEMPTS_BEFORE_FORGOT_LINK = 3;

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((s) => s.auth);
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await dispatch(login({ email, password, rememberMe }));
    if (login.fulfilled.match(result)) {
      navigate("/", { replace: true });
    } else {
      setFailedAttempts((n) => n + 1);
    }
  }

  function openForgotDialog() {
    setForgotEmail(email);
    setForgotMessage(null);
    setForgotOpen(true);
  }

  async function handleForgotSubmit() {
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      const { data } = await apiClient.post("/auth/forgot-password/", { email: forgotEmail });
      setForgotMessage(data.detail);
    } catch {
      setForgotMessage(t("login.forgotError"));
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: "background.default" }}>
      {/* Panneau de marque — masqué sur mobile, priorité au formulaire */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          width: { md: "42%", lg: "38%" },
          p: { md: 5, lg: 7 },
          bgcolor: "primary.main",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          backgroundImage: "url(/images/login-brand.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(170deg, rgba(46,143,203,0.96) 0%, rgba(46,143,203,0.90) 40%, rgba(46,143,203,0.60) 100%)",
          }}
        />
        <Stack spacing={0.5} sx={{ position: "relative" }}>
          <Typography variant="h5" fontWeight={700} letterSpacing={0.5}>
            ID-PMC
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            {t("login.subtitle")}
          </Typography>
        </Stack>

        <Stack spacing={3} sx={{ position: "relative", maxWidth: 420 }}>
          <Typography
            fontWeight={700}
            lineHeight={1.2}
            letterSpacing={-0.5}
            sx={{ fontSize: { md: "2.1rem", lg: "2.5rem" } }}
          >
            {t("login.brandHeadline")}
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85 }}>
            {t("login.brandBody")}
          </Typography>
          <Box
            sx={{
              alignSelf: "flex-start",
              border: "1px solid",
              borderColor: "rgba(255,255,255,0.35)",
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
            }}
          >
            <Typography variant="caption" fontWeight={600} letterSpacing={1}>
              APTITUDES × ATTITUDES = ALTITUDE
            </Typography>
          </Box>
        </Stack>

        <Typography variant="caption" sx={{ position: "relative", opacity: 0.7 }}>
          {t("login.brandFooter")}
        </Typography>
      </Box>

      {/* Panneau formulaire */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          px: 2,
          py: 6,
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={i18n.language}
          onChange={(_, v) => v && setAppLanguage(v)}
          sx={{ position: "absolute", top: 16, right: 16 }}
        >
          <ToggleButton value="fr">FR</ToggleButton>
          <ToggleButton value="en">EN</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        <Box
          sx={{
            width: "100%",
            maxWidth: 420,
            animation: "login-form-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
            "@keyframes login-form-in": {
              from: { opacity: 0, transform: "translateY(12px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          <Stack spacing={0.5} sx={{ mb: 4 }}>
            <Box
              component="img"
              src="/pmc-logo.png"
              alt="ID-PMC"
              sx={{ height: 48, width: "auto", alignSelf: "flex-start", objectFit: "contain", mb: 1.5 }}
            />
            <Typography variant="body2" color="text.secondary">
              {t("login.welcomeSubtitle")}
            </Typography>
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label={t("login.identifier")}
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineOutlinedIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label={t("login.password")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        tabIndex={-1}
                        aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")}
                      >
                        {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">{t("login.rememberMe")}</Typography>}
                />
                {failedAttempts >= FAILED_ATTEMPTS_BEFORE_FORGOT_LINK && (
                  <MuiLink component="button" type="button" variant="body2" onClick={openForgotDialog}>
                    {t("login.forgotPassword")}
                  </MuiLink>
                )}
              </Stack>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={status === "loading"}
                fullWidth
                endIcon={status === "loading" ? undefined : <ArrowForwardIcon />}
              >
                {status === "loading" ? t("login.loggingIn") : t("login.submit")}
              </Button>
            </Stack>
          </form>
        </Box>

        <Stack sx={{ flex: 1 }} justifyContent="flex-end" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {t("login.copyright")}
          </Typography>
        </Stack>
      </Box>

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("login.forgotPassword")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("login.forgotExplanation")}
            </Typography>
            <TextField
              label={t("login.identifier")}
              type="text"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              autoFocus
              fullWidth
            />
            {forgotMessage && <Alert severity="info">{forgotMessage}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgotOpen(false)}>{t("common.close")}</Button>
          <Button
            variant="contained"
            onClick={handleForgotSubmit}
            disabled={!forgotEmail || forgotLoading}
          >
            {forgotLoading ? t("login.sending") : t("login.sendRequest")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
