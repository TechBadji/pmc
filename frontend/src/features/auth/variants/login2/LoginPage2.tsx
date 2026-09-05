/* ---------------------------------------------------------------------------
 * Login2 — le canevas est la page, et chaque brique est une porte.
 *
 * La planche ID-PMC est reconstruite telle quelle : quatre colonnes de briques
 * emboîtées, échancrées en quart de disque autour du cercle « Vision, Missions,
 * Valeurs » posé au croisement. Elle occupe le cadre entier, sans marge.
 *
 * Cliquer une brique (ou le cercle) la fait pivoter sur son axe vertical : elle
 * se soulève, grandit, se retourne, et son dos porte le formulaire. Le canevas
 * n'illustre plus la connexion, il la contient.
 *
 * Une seule couleur saturée sur toute la page — l'orange du wordmark, sur le
 * CTA : la Règle du Signal Unique interdit de lui donner un second sens.
 *
 * Variante figée, autonome : elle ne partage avec le reste de l'application que
 * la plomberie (client API, store, traductions). Pour faire évoluer le design
 * servi sur /login, éditer `src/features/auth/LoginPage.tsx`.
 * ------------------------------------------------------------------------- */

import CloseIcon from "@mui/icons-material/KeyboardBackspaceOutlined";
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
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient, LAST_EMAIL_KEY } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { setAppLanguage } from "@/i18n";
import { login } from "@/features/auth/authSlice";
import { AREAS_BOARD, AREAS_NARROW, BOARD_MODULES, CORE_MODULE } from "./boardModules";
import TileFace from "./TileFace";
import { C, CARD_WIDTH, DISPLAY, TEXT, TILE_EMBOSS, tileSurface } from "./tokens";

const FAILED_ATTEMPTS_BEFORE_FORGOT_LINK = 3;
const GAP = 8;

/**
 * L'ouverture ne joue qu'une fois par session : elle dure deux secondes, et
 * une page de connexion se traverse plusieurs fois par jour. `sessionStorage`
 * suffit — l'oubli à la fermeture de l'onglet est exactement le comportement
 * voulu, la prochaine session a droit au spectacle.
 */
const INTRO_KEY = "idpmc_login2_intro";

/** Diamètre du cercle central. Réglé pour que l'échancrure occupe 56 % de la
 *  largeur d'une colonne centrale — la proportion de la planche d'origine. */
const CORE = "min(27vw, 43vh)";
const NOTCH = `calc(${CORE} / 2 + ${GAP}px)`;

/** Ordre de parcours au clavier : les briques, puis le cercle. */
const NAV = [...BOARD_MODULES.map((m) => m.n), CORE_MODULE];

type Phase = "opening" | "open" | "closing";
interface Flip {
  n: number;
  tx: number;
  ty: number;
  s: number;
  r0: string;
  phase: Phase;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function LoginPage2() {
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

  const [flip, setFlip] = useState<Flip | null>(null);
  // Lecture au montage, écriture dans un effet : en StrictMode l'initialiseur
  // est appelé deux fois, l'écrire ici ferait sauter l'ouverture en dev.
  const [intro] = useState(() => {
    if (prefersReducedMotion()) return false;
    try {
      return !sessionStorage.getItem(INTRO_KEY);
    } catch {
      return true;
    }
  });
  const [rovingIndex, setRovingIndex] = useState(NAV.length - 1); // le cercle d'abord
  const doorRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const emailRef = useRef<HTMLInputElement | null>(null);
  const pendingFocus = useRef<number | null>(null);

  const loading = status === "loading";
  const errorMessage = error
    ? t(error === "network" ? "login.networkError" : "login.invalidCredentials")
    : null;
  const credentialsRejected = error === "invalid_credentials";
  const openModule = flip?.n ?? null;

  useEffect(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* navigation privée : l'ouverture rejouera, sans conséquence */
    }
  }, []);

  /* --- Le pivot ---------------------------------------------------------- */

  const openDoor = useCallback((n: number) => {
    const el = doorRefs.current[n];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = getComputedStyle(el).borderRadius.split(" ")[0];
    const cardW = Math.min(CARD_WIDTH, window.innerWidth * 0.92);
    setFlip({
      n,
      tx: r.left + r.width / 2 - window.innerWidth / 2,
      ty: r.top + r.height / 2 - window.innerHeight / 2,
      s: r.width / cardW,
      r0: radius,
      // Sans animation, la carte est simplement déjà retournée.
      phase: prefersReducedMotion() ? "open" : "opening",
    });
  }, []);

  const closeDoor = useCallback(() => {
    setFlip((current) => {
      if (!current || current.phase === "closing") return current;
      // La brique a pu bouger (redimensionnement) : on relit sa position pour
      // que la carte reparte se poser exactement dessus.
      const el = doorRefs.current[current.n];
      const cardW = Math.min(CARD_WIDTH, window.innerWidth * 0.92);
      const next = { ...current, phase: "closing" as Phase };
      if (el) {
        const r = el.getBoundingClientRect();
        next.tx = r.left + r.width / 2 - window.innerWidth / 2;
        next.ty = r.top + r.height / 2 - window.innerHeight / 2;
        next.s = r.width / cardW;
      }
      if (prefersReducedMotion()) return null;
      return next;
    });
  }, []);

  // Le focus entre dans la carte quand elle a fini de se retourner, et revient
  // sur la brique quand elle s'est reposée.
  useEffect(() => {
    if (flip?.phase === "open") emailRef.current?.focus();
    if (flip === null && pendingFocus.current !== null) {
      const n = pendingFocus.current;
      pendingFocus.current = null;
      doorRefs.current[n]?.focus();
    }
  }, [flip]);

  useEffect(() => {
    if (!flip) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") closeDoor();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, closeDoor]);

  function handleCardAnimationEnd() {
    setFlip((current) => {
      if (!current) return current;
      if (current.phase === "opening") return { ...current, phase: "open" };
      if (current.phase === "closing") return null;
      return current;
    });
  }

  /* --- Clavier sur le plateau -------------------------------------------- */

  function focusDoor(index: number) {
    const next = (index + NAV.length) % NAV.length;
    setRovingIndex(next);
    doorRefs.current[NAV[next]]?.focus();
  }

  function handleDoorKeyDown(e: KeyboardEvent<HTMLDivElement>, n: number, index: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pendingFocus.current = n;
      openDoor(n);
      return;
    }
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: NAV.length - 1,
    };
    const target = moves[e.key];
    if (target === undefined) return;
    e.preventDefault();
    focusDoor(target);
  }

  /* --- Authentification --------------------------------------------------- */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await dispatch(login({ email, password, rememberMe }));
    if (login.fulfilled.match(result)) {
      navigate("/", { replace: true });
    } else {
      setFailedAttempts((n) => n + 1);
    }
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

  const doorSx = {
    position: "relative" as const,
    overflow: "hidden" as const,
    cursor: "pointer",
    color: C.surface,
    background: tileSurface(),
    boxShadow: TILE_EMBOSS,
    transition: "background 220ms, filter 220ms, transform 220ms",
    outline: "none",
    "&:hover, &:focus-visible": { background: tileSurface(true) },
    "&:focus-visible": { boxShadow: `${TILE_EMBOSS}, inset 0 0 0 3px ${C.focusOnBoard}` },
    "&:hover .l2-role, &:focus-visible .l2-role": { gridTemplateRows: "1fr", opacity: 1 },
    "&:hover .l2-icon, &:focus-visible .l2-icon": { opacity: 0.85 },
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  };

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100dvh",
        height: { md: "100dvh" },
        overflow: { md: "hidden" },
        bgcolor: C.ink,
        p: `${GAP}px`,
        fontFamily: TEXT,
      }}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={i18n.language}
        onChange={(_, v) => v && setAppLanguage(v)}
        aria-label={t("login.language")}
        sx={{
          position: "absolute",
          top: { xs: "auto", md: 20 },
          bottom: { xs: 16, md: "auto" },
          left: 20,
          zIndex: 30,
          "& .MuiToggleButton-root": {
            fontFamily: TEXT,
            border: "none",
            color: "rgba(255,255,255,0.62)",
            px: 1.4,
            py: 0.3,
            borderRadius: "999px !important",
            "&.Mui-selected": { bgcolor: "rgba(255,255,255,0.92)", color: C.ink },
            "&.Mui-selected:hover": { bgcolor: "#fff" },
            "&:focus-visible": { outline: `2px solid ${C.focusOnBoard}`, outlineOffset: 2 },
          },
        }}
      >
        <ToggleButton value="fr">FR</ToggleButton>
        <ToggleButton value="en">EN</ToggleButton>
      </ToggleButtonGroup>

      {/* ---- Le plateau ---- */}
      <Box
        sx={{
          position: "relative",
          height: "100%",
          display: "grid",
          gap: `${GAP}px`,
          gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1.06fr 1.06fr 1fr" },
          gridTemplateRows: { xs: "auto repeat(5, minmax(134px, 1fr))", md: "repeat(6, 1fr)" },
          gridTemplateAreas: { xs: AREAS_NARROW, md: AREAS_BOARD },
          perspective: "1500px",
          transition: "transform 480ms cubic-bezier(0.22, 1, 0.28, 1), filter 480ms",
          transform: flip ? "scale(0.985)" : "none",
          filter: flip ? "saturate(0.65)" : "none",

          // L'ouverture : le plateau se redresse pendant que les briques se
          // posent une à une, dans l'ordre de la méthode. Deux mouvements
          // superposés, un seul geste.
          "@keyframes l2-lay-board": {
            "0%": { opacity: 0, transform: "rotateX(24deg) scale(0.88) translateY(5%)" },
            "55%": { opacity: 1 },
            "100%": { opacity: 1, transform: "rotateX(0deg) scale(1) translateY(0)" },
          },
          "@keyframes l2-brick": {
            "0%": { opacity: 0, transform: "translate3d(0, 30px, 110px) rotateX(-16deg)" },
            "100%": { opacity: 1, transform: "none" },
          },
          ...(intro && !flip
            ? {
                animation: "l2-lay-board 1150ms cubic-bezier(0.2, 1, 0.26, 1) both",
                "& .l2-door": {
                  animation: "l2-brick 560ms cubic-bezier(0.16, 1, 0.3, 1) both",
                },
              }
            : null),
          "@media (prefers-reduced-motion: reduce)": {
            transition: "none",
            animation: "none",
            "& .l2-door": { animation: "none" },
          },
        }}
      >
        {BOARD_MODULES.map((module, index) => (
          <Box
            key={module.n}
            className="l2-door"
            ref={(el: HTMLDivElement | null) => {
              doorRefs.current[module.n] = el;
            }}
            role="button"
            tabIndex={NAV[rovingIndex] === module.n ? 0 : -1}
            aria-label={`${t("login2.openWith")} ${module.n} · ${t(`login.canvas.m${module.n}.name`)}. ${t(
              `login.canvas.m${module.n}.role`
            )}`}
            onClick={() => openDoor(module.n)}
            onFocus={() => setRovingIndex(NAV.indexOf(module.n))}
            onKeyDown={(e) => handleDoorKeyDown(e, module.n, NAV.indexOf(module.n))}
            style={intro ? { animationDelay: `${140 + index * 70}ms` } : undefined}
            sx={{
              ...doorSx,
              gridArea: module.area,
              borderRadius: "18px",
              visibility: openModule === module.n ? "hidden" : "visible",
              // L'échancrure : c'est elle qui emboîte la brique dans le cercle.
              ...(module.notch
                ? {
                    maskImage: {
                      xs: "none",
                      md: `radial-gradient(circle at ${module.notch}, transparent 0 ${NOTCH}, #000 calc(${NOTCH} + 0.5px))`,
                    },
                    WebkitMaskImage: {
                      xs: "none",
                      md: `radial-gradient(circle at ${module.notch}, transparent 0 ${NOTCH}, #000 calc(${NOTCH} + 0.5px))`,
                    },
                  }
                : null),
            }}
          >
            <TileFace module={module} />
          </Box>
        ))}

        {/* ---- Le cercle : le cœur du canevas, et la porte principale ---- */}
        <Box
          ref={(el: HTMLDivElement | null) => {
            doorRefs.current[CORE_MODULE] = el;
          }}
          role="button"
          tabIndex={NAV[rovingIndex] === CORE_MODULE ? 0 : -1}
          aria-label={`${t("login2.openWith")} ${CORE_MODULE} · ${t("login.canvas.m6.name")}`}
          onClick={() => openDoor(CORE_MODULE)}
          onFocus={() => setRovingIndex(NAV.indexOf(CORE_MODULE))}
          onKeyDown={(e) => handleDoorKeyDown(e, CORE_MODULE, NAV.indexOf(CORE_MODULE))}
          sx={{
            ...doorSx,
            display: "flex",
            gridArea: { xs: "core", md: "auto" },
            position: { xs: "relative", md: "absolute" },
            top: { md: "50%" },
            left: { md: "50%" },
            transform: { md: "translate(-50%, -50%)" },
            width: { xs: "auto", md: CORE },
            height: { xs: "auto", md: CORE },
            borderRadius: { xs: "18px", md: "50%" },
            zIndex: 12,
            flexDirection: { xs: "row", md: "column" },
            alignItems: "center",
            justifyContent: "center",
            gap: { xs: 2, md: 0 },
            textAlign: { xs: "left", md: "center" },
            px: { xs: 2.5, md: "7%" },
            py: { xs: 2.5, md: 0 },
            visibility: openModule === CORE_MODULE ? "hidden" : "visible",
            // Une seule respiration sur la page, sur la cible principale.
            "@keyframes l2-breathe": {
              "0%, 100%": { boxShadow: `${TILE_EMBOSS}, 0 0 0 0 rgba(255,209,102,0.30)` },
              "50%": { boxShadow: `${TILE_EMBOSS}, 0 0 0 16px rgba(255,209,102,0)` },
            },
            // Le cœur se pose en dernier, une fois les briques en place. On
            // passe par la propriété `scale` seule : `transform` porte déjà le
            // recentrage, qui n'est pas le même selon le palier.
            "@keyframes l2-core-in": {
              "0%": { opacity: 0, scale: "0.34" },
              "68%": { opacity: 1, scale: "1.06" },
              "100%": { opacity: 1, scale: "1" },
            },
            animation: intro
              ? "l2-core-in 660ms cubic-bezier(0.2, 1.1, 0.3, 1) 840ms both, l2-breathe 3.6s ease-out infinite 2.4s"
              : "l2-breathe 3.6s ease-out infinite 1.4s",
            "&:hover, &:focus-visible": { background: tileSurface(true), animation: "none" },
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          <Box
            component="img"
            src="/pmc-logo.png"
            alt=""
            aria-hidden
            sx={{
              display: "block",
              width: { xs: 96, md: "clamp(104px, 56%, 176px)" },
              flexShrink: 0,
              height: "auto",
              mb: { xs: 0, md: 1.8 },
              // Le wordmark est fourni sur fond blanc : on le pose sur une plaque.
              bgcolor: "#fff",
              borderRadius: "10px",
              p: "8px 12px",
            }}
          />
          {/* Titre et consigne empilés : côte à côte sur mobile, le titre
              passait sur trois lignes. */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: { xs: "flex-start", md: "center" },
              minWidth: 0,
            }}
          >
            <Typography
              sx={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontVariationSettings: `"wdth" 92`,
                fontSize: "clamp(1.1rem, 2.05vw, 1.7rem)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              {t("login2.title")}
            </Typography>
            <Typography
              sx={{
                fontFamily: TEXT,
                fontSize: "clamp(0.74rem, 0.86vw, 0.84rem)",
                color: "rgba(255,255,255,0.82)",
                maxWidth: { md: "17ch" },
                mt: 1,
                lineHeight: 1.4,
              }}
            >
              {t("login2.hint")}
            </Typography>
          </Box>
        </Box>

        {/* Le reflet qui traverse la planche une fois, quand tout est posé :
            c'est la matière glossy des tuiles qui se signale, et la fin du
            geste d'ouverture. */}
        {intro && (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              pointerEvents: "none",
              overflow: "hidden",
              "@keyframes l2-sweep": {
                from: { transform: "translateX(-170%) skewX(-12deg)" },
                to: { transform: "translateX(340%) skewX(-12deg)" },
              },
              "&::after": {
                content: '""',
                position: "absolute",
                top: "-25%",
                bottom: "-25%",
                left: 0,
                width: "34%",
                background:
                  "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.15) 48%, rgba(255,255,255,0) 100%)",
                animation: "l2-sweep 950ms cubic-bezier(0.4, 0, 0.2, 1) 1200ms both",
              },
              "@media (prefers-reduced-motion: reduce)": { display: "none" },
            }}
          />
        )}
      </Box>

      {/* ---- Voile ---- */}
      <Box
        onClick={closeDoor}
        aria-hidden
        sx={{
          position: "fixed",
          inset: 0,
          bgcolor: "rgba(4,20,23,0.72)",
          zIndex: 35,
          opacity: flip ? 1 : 0,
          pointerEvents: flip ? "auto" : "none",
          transition: "opacity 420ms ease",
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        }}
      />

      {/* ---- La carte qui pivote ---- */}
      {flip && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            perspective: "1700px",
            zIndex: 40,
            pointerEvents: "none",
            p: 2,
          }}
        >
          <Box
            role="dialog"
            aria-modal="true"
            aria-label={t("login2.cardTitle")}
            onAnimationEnd={handleCardAnimationEnd}
            style={
              {
                "--tx": `${flip.tx}px`,
                "--ty": `${flip.ty}px`,
                "--s": `${flip.s}`,
                "--r0": flip.r0,
              } as React.CSSProperties
            }
            sx={{
              position: "relative",
              width: Math.min(CARD_WIDTH, typeof window !== "undefined" ? window.innerWidth * 0.92 : CARD_WIDTH),
              transformStyle: "preserve-3d",
              pointerEvents: flip.phase === "open" ? "auto" : "none",
              "@keyframes l2-flip": {
                "0%": {
                  transform: "translate3d(var(--tx), var(--ty), 0px) scale(var(--s)) rotateY(0deg)",
                },
                "48%": {
                  transform:
                    "translate3d(calc(var(--tx) * 0.3), calc(var(--ty) * 0.3), 170px) scale(calc((var(--s) + 1) / 2)) rotateY(90deg)",
                },
                "100%": {
                  transform: "translate3d(0px, 0px, 0px) scale(1) rotateY(180deg)",
                },
              },
              "@keyframes l2-face-open": {
                "0%": { borderRadius: "var(--r0)" },
                "100%": { borderRadius: "26px" },
              },
              transform:
                flip.phase === "open"
                  ? "translate3d(0px, 0px, 0px) scale(1) rotateY(180deg)"
                  : undefined,
              animation:
                flip.phase === "opening"
                  ? "l2-flip 920ms cubic-bezier(0.22, 1, 0.28, 1) both"
                  : flip.phase === "closing"
                    ? "l2-flip 720ms cubic-bezier(0.5, 0, 0.75, 0) reverse both"
                    : "none",
              "& .l2-face": {
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              },
            }}
          >
            {/* Dos : le formulaire. Il est dans le flux, c'est lui qui donne
                sa hauteur à la carte ; le recto se cale dessus. */}
            <Box
              className="l2-face"
              sx={{
                position: "relative",
                bgcolor: C.surface,
                borderRadius: "26px",
                transform: "rotateY(180deg)",
                px: { xs: 3, sm: 4.5 },
                py: 4,
                overflow: "hidden",
                // Le formulaire ne se contente pas d'être là quand la brique a
                // fini son quart de tour : il glisse en place, bloc par bloc,
                // à partir du moment où le dos devient visible (~480 ms).
                "@keyframes l2-slide-in": {
                  from: { opacity: 0, transform: "translateX(56px)" },
                  to: { opacity: 1, transform: "none" },
                },
                ...(flip.phase === "opening"
                  ? {
                      "& > *": {
                        animation: "l2-slide-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both",
                      },
                      // Départ à 470 ms : le dos de la brique vient de passer
                      // face caméra. 90 ms entre chaque bloc, assez pour que le
                      // glissé se lise sans faire attendre.
                      "& .l2-b1": { animationDelay: "470ms" },
                      "& .l2-b2": { animationDelay: "560ms" },
                      "& .l2-b3": { animationDelay: "650ms" },
                      "& .l2-b4": { animationDelay: "740ms" },
                      "& .l2-b5": { animationDelay: "830ms" },
                    }
                  : null),
                "@media (prefers-reduced-motion: reduce)": { "& > *": { animation: "none" } },
              }}
            >
              <Button
                className="l2-b1"
                onClick={closeDoor}
                startIcon={<CloseIcon sx={{ fontSize: 18 }} />}
                sx={{
                  fontFamily: TEXT,
                  fontSize: "0.8rem",
                  textTransform: "none",
                  color: C.muted,
                  px: 1,
                  ml: -1,
                  mb: 2,
                  "&:focus-visible": { outline: `2px solid ${C.ink}`, outlineOffset: 2 },
                }}
              >
                {t("login2.back")}
              </Button>

              <Typography
                className="l2-b2"
                component="h2"
                sx={{
                  fontFamily: DISPLAY,
                  fontWeight: 800,
                  fontVariationSettings: `"wdth" 92`,
                  fontSize: "2rem",
                  lineHeight: 1.02,
                  letterSpacing: "-0.025em",
                  color: C.ink,
                }}
              >
                {t("login2.cardTitle")}
              </Typography>
              <Typography
                className="l2-b3"
                sx={{ fontFamily: TEXT, color: C.muted, fontSize: "0.94rem", mt: 1, mb: 3 }}
              >
                {t("login2.cardSubtitle")}
              </Typography>

              <form className="l2-b4" onSubmit={handleSubmit} noValidate>
                <Stack spacing={2}>
                  {errorMessage && (
                    <Alert severity="error" role="alert" sx={{ borderRadius: "14px", fontFamily: TEXT }}>
                      {errorMessage}
                    </Alert>
                  )}
                  <TextField
                    inputRef={emailRef}
                    label={t("login.identifier")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                    fullWidth
                    error={credentialsRejected}
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
                    sx={fieldSx}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword((v) => !v)}
                            edge="end"
                            aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")}
                            aria-pressed={showPassword}
                            sx={{ "&:focus-visible": { outline: `2px solid ${C.ink}` } }}
                          >
                            {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />

                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 34 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          size="small"
                          sx={{ color: C.muted, "&.Mui-checked": { color: C.ink } }}
                        />
                      }
                      label={
                        <Typography sx={{ fontFamily: TEXT, fontSize: "0.86rem", color: C.muted }}>
                          {t("login.rememberMe")}
                        </Typography>
                      }
                    />
                    {failedAttempts >= FAILED_ATTEMPTS_BEFORE_FORGOT_LINK && (
                      <MuiLink
                        component="button"
                        type="button"
                        onClick={() => {
                          setForgotEmail(email);
                          setForgotMessage(null);
                          setForgotOpen(true);
                        }}
                        sx={{
                          fontFamily: TEXT,
                          fontSize: "0.86rem",
                          color: C.ink,
                          "&:focus-visible": { outline: `2px solid ${C.ink}`, outlineOffset: 2 },
                        }}
                      >
                        {t("login.forgotPassword")}
                      </MuiLink>
                    )}
                  </Stack>

                  <Button
                    type="submit"
                    disabled={loading}
                    fullWidth
                    disableElevation
                    startIcon={
                      loading ? <CircularProgress size={17} thickness={5} sx={{ color: C.ink }} /> : undefined
                    }
                    sx={{
                      fontFamily: DISPLAY,
                      fontWeight: 700,
                      fontSize: "1.02rem",
                      textTransform: "none",
                      letterSpacing: "-0.01em",
                      color: C.ink,
                      bgcolor: C.orange,
                      borderRadius: "14px",
                      py: 1.55,
                      transition: "background-color 140ms, transform 110ms",
                      "&:hover": { bgcolor: C.orangeDeep },
                      "&:active": { transform: "translateY(1px)" },
                      "&.Mui-disabled": { bgcolor: C.orange, opacity: 0.55, color: C.ink },
                      "&:focus-visible": { outline: `2px solid ${C.ink}`, outlineOffset: 3 },
                    }}
                  >
                    {loading ? t("login.loggingIn") : t("login.submit")}
                  </Button>
                </Stack>
              </form>

              <Stack className="l2-b5" spacing={1} sx={{ mt: 3 }}>
                <Typography sx={{ fontFamily: TEXT, fontSize: "0.77rem", color: C.muted }}>
                  {t("login2.secure")}
                </Typography>
                <Stack direction="row" spacing={2.5}>
                  {(["login.support", "login.privacy"] as const).map((key) => (
                    <MuiLink
                      key={key}
                      href="#"
                      sx={{
                        fontFamily: TEXT,
                        fontSize: "0.77rem",
                        color: C.ink,
                        "&:focus-visible": { outline: `2px solid ${C.ink}`, outlineOffset: 2 },
                      }}
                    >
                      {t(key)}
                    </MuiLink>
                  ))}
                </Stack>
              </Stack>
            </Box>

            {/* Recto : la brique elle-même, jusqu'à ce qu'elle passe le quart de tour. */}
            <Box
              className="l2-face"
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                background: tileSurface(true),
                boxShadow: TILE_EMBOSS,
                borderRadius: flip.phase === "open" ? "26px" : undefined,
                animation:
                  flip.phase === "opening"
                    ? "l2-face-open 920ms cubic-bezier(0.22, 1, 0.28, 1) both"
                    : flip.phase === "closing"
                      ? "l2-face-open 720ms cubic-bezier(0.5, 0, 0.75, 0) reverse both"
                      : "none",
              }}
            >
              {flip.n !== CORE_MODULE && (
                <TileFace
                  module={BOARD_MODULES.find((m) => m.n === flip.n) ?? BOARD_MODULES[0]}
                  showRole={false}
                />
              )}
            </Box>
          </Box>
        </Box>
      )}

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontFamily: DISPLAY, fontWeight: 700, color: C.ink }}>
          {t("login.forgotPassword")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography sx={{ fontFamily: TEXT, fontSize: "0.9rem", color: C.muted }}>
              {t("login.forgotExplanation")}
            </Typography>
            <TextField
              label={t("login.identifier")}
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
          <Button onClick={() => setForgotOpen(false)} sx={{ textTransform: "none", color: C.muted }}>
            {t("common.close")}
          </Button>
          <Button
            onClick={handleForgotSubmit}
            disabled={!forgotEmail || forgotLoading}
            sx={{ textTransform: "none", bgcolor: C.orange, color: C.ink, borderRadius: "12px", px: 2.5 }}
          >
            {forgotLoading ? t("login.sending") : t("login.sendRequest")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const fieldSx = {
  "& .MuiInputBase-root": { fontFamily: TEXT },
  "& .MuiInputLabel-root": { fontFamily: TEXT },
  "& .MuiOutlinedInput-root": {
    borderRadius: "14px",
    "&:hover:not(.Mui-error) .MuiOutlinedInput-notchedOutline": { borderColor: C.ink },
    "&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline": {
      borderColor: C.ink,
      borderWidth: 2,
    },
  },
  "& .MuiInputLabel-root.Mui-focused:not(.Mui-error)": { color: C.ink },
} as const;
