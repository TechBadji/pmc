/* ---------------------------------------------------------------------------
 * Login1 — instantané figé de la refonte de la page de connexion.
 *
 * Cette copie existe pour comparer plusieurs directions artistiques côte à côte
 * dans le navigateur (/login1, /login2, …) : elle est volontairement autonome.
 * Elle ne réutilise AUCUN composant de présentation partagé, sinon une
 * retouche du design en cours la ferait bouger et la comparaison n'aurait plus
 * de sens. Ce qui reste partagé est la plomberie applicative (client API,
 * store, traductions) et les textes : ce sont ceux du produit, pas ceux d'une
 * maquette.
 *
 * Ne pas modifier — pour faire évoluer le design, éditer
 * `src/features/auth/LoginPage.tsx`, servi sur /login.
 * ------------------------------------------------------------------------- */

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
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
import { memo, useCallback, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient, LAST_EMAIL_KEY } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { setAppLanguage } from "@/i18n";
import { login } from "@/features/auth/authSlice";
import CanvasMotif from "./CanvasMotif1";
import { PHASE_COLORS, moduleByNumber } from "./pmcModules";

const FAILED_ATTEMPTS_BEFORE_FORGOT_LINK = 3;

/**
 * Palette du parcours de connexion, calée sur les assets de marque ID-PMC
 * (canevas turquoise, wordmark orange/bleu/violet) plutôt que sur la palette
 * applicative — c'est le seul écran où la marque parle avant les données.
 *
 * Les valeurs sont choisies pour tenir WCAG AA sur toute la surface :
 * le dégradé du panneau ne dépasse jamais `#257A83` (blanc = 5,0:1), l'orange
 * de marque n'y porte donc jamais de texte (2,6:1 sur blanc) et reste cantonné
 * aux filets et aux accents graphiques ; le violet, lui, passe à 6,4:1 sur
 * blanc et sert les liens secondaires.
 */
const BRAND = {
  gradient: "linear-gradient(155deg, #17545C 0%, #1F6E77 52%, #257A83 100%)",
  turquoise: "#1F6E77",
  turquoiseDark: "#123F46",
  orange: "#E08D3C",
  violet: "#9333A8",
  navy: "#1E3A6E",
  canvas: "#F8FAFC",
  onBrand: "rgba(255,255,255,0.92)",
  focusRing: "#3B82F6",
} as const;

const DISPLAY_FONT = `"Baloo 2", system-ui, -apple-system, "Segoe UI", sans-serif`;

const focusable = {
  "&:focus-visible": {
    outline: `2px solid ${BRAND.focusRing}`,
    outlineOffset: 2,
  },
} as const;

/** Le wordmark officiel est fourni sur fond blanc : on l'assume en plaque. */
const LogoPlate = memo(function LogoPlate({ height = 64 }: { height?: number }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        bgcolor: "#FFFFFF",
        borderRadius: "12px",
        px: 2,
        py: 1.25,
        boxShadow: "0 8px 24px rgba(9,44,49,0.28)",
      }}
    >
      <Box
        component="img"
        src="/pmc-logo.png"
        alt="ID-PMC — People Management Canvas"
        sx={{ height, width: "auto", objectFit: "contain", display: "block" }}
      />
    </Box>
  );
});

/** Filigrane hexagonal — écho discret au cadrage « PERFORM TECH » de la marque. */
const HexWatermark = memo(function HexWatermark() {
  return (
    <Box
      aria-hidden
      component="svg"
      viewBox="0 0 200 200"
      sx={{
        position: "absolute",
        right: "-14%",
        top: "-8%",
        width: { md: 380, lg: 460 },
        opacity: 0.09,
        pointerEvents: "none",
      }}
    >
      <path
        d="M100 4 173 47 173 133 100 176 27 133 27 47Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={4}
      />
      <path
        d="M100 34 147 61 147 115 100 142 53 115 53 61Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={4}
      />
    </Box>
  );
});

const BrandPanel = memo(function BrandPanel() {
  const { t } = useTranslation();
  const [activeModule, setActiveModule] = useState<number | null>(null);
  // `useCallback` indispensable ici : CanvasMotif est mémoïsé et notifie le
  // parent depuis un effet — une nouvelle fonction à chaque rendu le ferait
  // boucler.
  const handleActiveChange = useCallback((n: number | null) => setActiveModule(n), []);
  return (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 4,
        width: { md: "40%", lg: "50%" },
        flexShrink: 0,
        px: { md: 5, lg: 8 },
        py: { md: 4.5, lg: 5 },
        position: "relative",
        overflow: "hidden",
        background: BRAND.gradient,
        color: "#FFFFFF",
      }}
    >
      <HexWatermark />

      <Box sx={{ position: "relative" }}>
        <LogoPlate />
      </Box>

      <Stack spacing={{ md: 3, lg: 4 }} sx={{ position: "relative", alignItems: "center" }}>
        <Stack spacing={1.5} sx={{ maxWidth: 460, width: "100%" }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: DISPLAY_FONT,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              fontSize: { md: "1.7rem", lg: "2.4rem" },
            }}
          >
            {t("login.brandHeadline")}
          </Typography>
        </Stack>

        {/* Le motif se règle aussi sur la hauteur : à 1280×800 il doit laisser
            passer le logo, le titre et la ligne de réassurance sans rogner. */}
        <Box
          sx={{
            width: {
              md: "min(100%, 420px, 24vh)",
              lg: "min(100%, 420px, 30vh)",
            },
            display: "flex",
          }}
        >
          <CanvasMotif onActiveChange={handleActiveChange} />
        </Box>
      </Stack>

      {/* Un seul bloc pour deux états : la légende du module actif remplace le
          message de réassurance, ce qui évite de faire grandir le panneau —
          `minHeight` fige la hauteur pour qu'il ne saute pas au survol. */}
      <Stack
        spacing={1}
        sx={{
          position: "relative",
          minHeight: { md: 150, lg: 118 },
          justifyContent: "flex-end",
          // Décolle la légende du bas du panneau : le module survolé se lit
          // comme une accroche, pas comme une mention de pied de page.
          mb: { md: 1.5, lg: 3 },
        }}
      >
        {activeModule === null ? (
          <>
            <Box
              sx={{ width: 56, height: 4, borderRadius: 2, bgcolor: BRAND.orange }}
              aria-hidden
            />
            <Typography variant="body2" sx={{ color: BRAND.onBrand, fontWeight: 600 }}>
              {t("login.reassurance")}
            </Typography>
            <Typography variant="caption" sx={{ color: BRAND.onBrand, opacity: 0.85 }}>
              {t("login.canvas.hint")}
            </Typography>
          </>
        ) : (
          // Décrit déjà par l'`aria-label` de la tuile : on évite la double annonce.
          <Box aria-hidden>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  bgcolor: PHASE_COLORS[moduleByNumber(activeModule).phase],
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="caption"
                sx={{ color: BRAND.onBrand, fontWeight: 700, letterSpacing: 0.8 }}
              >
                {t(`login.canvas.phase.${moduleByNumber(activeModule).phase}`)}
              </Typography>
            </Stack>
            <Typography
              sx={{
                fontFamily: DISPLAY_FONT,
                fontWeight: 800,
                // Le panneau est deux fois plus étroit sous 1200px : la même
                // taille y ferait passer les noms longs sur trois lignes.
                fontSize: { md: "1.3rem", lg: "1.65rem" },
                lineHeight: 1.2,
                mb: 0.75,
              }}
            >
              {activeModule} · {t(`login.canvas.m${activeModule}.name`)}
            </Typography>
            <Typography
              sx={{ color: BRAND.onBrand, fontSize: { md: "0.9rem", lg: "1.02rem" }, lineHeight: 1.5 }}
            >
              {t(`login.canvas.m${activeModule}.role`)}
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
});

export default function LoginPage1() {
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

  const loading = status === "loading";
  // `error` porte un code, pas une phrase : le message reste traduisible et ne
  // distingue jamais l'identifiant du mot de passe (pas d'énumération de comptes).
  const errorMessage = error
    ? t(error === "network" ? "login.networkError" : "login.invalidCredentials")
    : null;
  // Les deux champs sont marqués invalides ensemble : on refuse de dire lequel
  // est fautif. Une panne réseau, elle, n'invalide aucune saisie.
  const credentialsRejected = error === "invalid_credentials";

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
    <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: BRAND.canvas }}>
      <BrandPanel />

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* Bandeau de marque compact — remplace le panneau gauche sous 900px.
            Logo aligné à gauche pour dégager le sélecteur de langue en haut à droite. */}
        <Box
          sx={{
            display: { xs: "flex", md: "none" },
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
            px: { xs: 2.5, sm: 4 },
            py: 3,
            background: BRAND.gradient,
            color: "#FFFFFF",
          }}
        >
          <LogoPlate height={40} />
          <Typography
            component="h1"
            sx={{
              fontFamily: DISPLAY_FONT,
              fontWeight: 800,
              fontSize: "1.3rem",
              lineHeight: 1.2,
              maxWidth: 420,
            }}
          >
            {t("login.brandHeadline")}
          </Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            px: { xs: 2.5, sm: 4 },
            py: { xs: 4, md: 6 },
          }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={i18n.language}
            onChange={(_, v) => v && setAppLanguage(v)}
            aria-label={t("login.language")}
            sx={{ position: "absolute", top: 16, right: 16, bgcolor: "#FFFFFF", zIndex: 1 }}
          >
            <ToggleButton value="fr" sx={focusable}>
              FR
            </ToggleButton>
            <ToggleButton value="en" sx={focusable}>
              EN
            </ToggleButton>
          </ToggleButtonGroup>

          <Box
            sx={{
              width: "100%",
              maxWidth: 440,
              animation: "login-form-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
              "@keyframes login-form-in": {
                from: { opacity: 0, transform: "translateY(10px)" },
                to: { opacity: 1, transform: "translateY(0)" },
              },
              "@media (prefers-reduced-motion: reduce)": { animation: "none" },
            }}
          >
            <Stack spacing={1} sx={{ mb: 4 }}>
              <Box
                sx={{ width: 44, height: 4, borderRadius: 2, bgcolor: BRAND.orange, mb: 1.5 }}
                aria-hidden
              />
              <Typography
                component="h2"
                sx={{
                  fontFamily: DISPLAY_FONT,
                  fontWeight: 800,
                  fontSize: "1.85rem",
                  lineHeight: 1.2,
                  color: BRAND.navy,
                }}
              >
                {t("login.welcomeTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("login.welcomeSubtitle")}
              </Typography>
            </Stack>

            <form onSubmit={handleSubmit} noValidate>
              <Stack spacing={2.5}>
                {errorMessage && (
                  <Alert severity="error" role="alert" sx={{ borderRadius: "12px" }}>
                    {errorMessage}
                  </Alert>
                )}
                <TextField
                  label={t("login.identifier")}
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  fullWidth
                  error={credentialsRejected}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineOutlinedIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  }}
                  sx={fieldSx}
                />
                <TextField
                  label={t("login.password")}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  fullWidth
                  error={credentialsRejected}
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
                          aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")}
                          aria-pressed={showPassword}
                          sx={focusable}
                        >
                          {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={fieldSx}
                />
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  flexWrap="wrap"
                  sx={{ minHeight: 38 }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        size="small"
                        sx={{ color: BRAND.turquoise, "&.Mui-checked": { color: BRAND.turquoise } }}
                      />
                    }
                    label={<Typography variant="body2">{t("login.rememberMe")}</Typography>}
                  />
                  {failedAttempts >= FAILED_ATTEMPTS_BEFORE_FORGOT_LINK && (
                    <MuiLink
                      component="button"
                      type="button"
                      variant="body2"
                      onClick={openForgotDialog}
                      sx={{ color: BRAND.violet, fontWeight: 600, ...focusable }}
                    >
                      {t("login.forgotPassword")}
                    </MuiLink>
                  )}
                </Stack>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  fullWidth
                  disableElevation
                  startIcon={
                    loading ? <CircularProgress size={18} color="inherit" thickness={5} /> : undefined
                  }
                  endIcon={loading ? undefined : <ArrowForwardIcon />}
                  sx={{
                    borderRadius: "24px",
                    py: 1.4,
                    fontSize: "1rem",
                    fontWeight: 700,
                    textTransform: "none",
                    color: "#FFFFFF",
                    bgcolor: BRAND.turquoise,
                    boxShadow: "0 10px 22px rgba(31,110,119,0.30)",
                    transition: "background-color 150ms, transform 120ms, box-shadow 150ms",
                    "&:hover": { bgcolor: BRAND.turquoiseDark, boxShadow: "0 12px 26px rgba(31,110,119,0.38)" },
                    "&:active": { transform: "scale(0.98)" },
                    "&.Mui-disabled": { bgcolor: BRAND.turquoise, opacity: 0.6, color: "#FFFFFF" },
                    ...focusable,
                  }}
                >
                  {loading ? t("login.loggingIn") : t("login.submit")}
                </Button>
              </Stack>
            </form>

            <Stack spacing={1.5} sx={{ mt: 5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <ShieldOutlinedIcon sx={{ fontSize: 18, color: BRAND.turquoise }} />
                <Typography variant="caption" color="text.secondary">
                  {t("login.secureConnection")}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <MuiLink
                  href="#"
                  variant="caption"
                  sx={{ color: BRAND.violet, fontWeight: 600, ...focusable }}
                >
                  {t("login.support")}
                </MuiLink>
                <MuiLink
                  href="#"
                  variant="caption"
                  sx={{ color: BRAND.violet, fontWeight: 600, ...focusable }}
                >
                  {t("login.privacy")}
                </MuiLink>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t("login.copyright")}
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Box>

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, color: BRAND.navy }}>
          {t("login.forgotPassword")}
        </DialogTitle>
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
              sx={fieldSx}
            />
            {forgotMessage && <Alert severity="info">{forgotMessage}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgotOpen(false)} sx={{ textTransform: "none" }}>
            {t("common.close")}
          </Button>
          <Button
            variant="contained"
            onClick={handleForgotSubmit}
            disabled={!forgotEmail || forgotLoading}
            sx={{ borderRadius: "20px", textTransform: "none", bgcolor: BRAND.turquoise, "&:hover": { bgcolor: BRAND.turquoiseDark } }}
          >
            {forgotLoading ? t("login.sending") : t("login.sendRequest")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** Champs à 8px de rayon, bordure turquoise au focus (cf. §3 du brief). */
const fieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "8px",
    bgcolor: "#FFFFFF",
    "&:hover:not(.Mui-error) .MuiOutlinedInput-notchedOutline": { borderColor: BRAND.turquoise },
    "&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline": {
      borderColor: BRAND.turquoise,
      borderWidth: 2,
    },
  },
  "& .MuiInputLabel-root.Mui-focused:not(.Mui-error)": { color: BRAND.turquoise },
} as const;
