import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { apiClient, LAST_EMAIL_KEY } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { login } from "@/features/auth/authSlice";
import { forgotErrorText, LoginErrorText, loginProblems } from "@/features/auth/loginFeedback";
import AnimatedLogo from "./AnimatedLogo";
import { altitudeOf, DEMO_PEOPLE, tierOf } from "./Id3aMatrixDemo";
import { mount } from "./fx/fx.js";
import dotTerrain from "./fx/dot-terrain/effect.js";
import "./v2.css";

/**
 * Page de connexion v2 — planche locale (/login-v2). Même mécanique que
 * /login (même action, mêmes messages d'erreur, même demande de mot de passe
 * oublié) ; seule la mise en scène change. /login reste intacte.
 */
export default function LoginV2() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error, errorInfo } = useAppSelector((s) => s.auth);
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [formIssues, setFormIssues] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [success, setSuccess] = useState(false);
  // identifiant déjà mémorisé sur cet appareil : on accueille la personne
  const [known] = useState(() => email.trim());

  const loading = status === "loading";
  const hasError = formIssues.length > 0 || !!error;
  const rejected = error === "invalid_credentials";

  useEffect(() => {
    document.title = "Connexion · ID-PMC";
    // Identifiant déjà connu : on place directement le curseur sur le mot de passe.
    if (email) passwordRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!forgotOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setForgotOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forgotOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problems = loginProblems(t, email, password);
    setFormIssues(problems);
    setAttempt((n) => n + 1);
    if (problems.length) return;
    const result = await dispatch(login({ email, password, rememberMe }));
    if (login.fulfilled.match(result)) {
      // le bouton confirme la réussite un court instant avant d'ouvrir l'espace
      setSuccess(true);
      window.setTimeout(() => navigate("/", { replace: true }), 650);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      const { data } = await apiClient.post("/auth/forgot-password/", { email: forgotEmail });
      setForgotMessage(data.detail);
    } catch (err) {
      setForgotMessage(forgotErrorText(t, err));
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="v2 v2-login">
      <aside className="v2-login-art">
        <LoginStage />
        <Link to="/v2" className="v2-logo v2-logo-chip" aria-label="ID-PMC, accueil">
          <AnimatedLogo height={34} />
        </Link>
        <div className="v2-login-quote">
          <h2>Chaque équipe a une altitude. Elle se mesure, et elle se travaille.</h2>
          <p>Aptitudes × Attitudes = Altitude : la méthode ID-3A au cœur du People Management Canvas.</p>
          <div className="v2-phasebar" aria-hidden="true">
            <span style={{ borderColor: "#E08D3C" }}>Analyser</span>
            <span style={{ borderColor: "#7FD6DD" }}>Planifier</span>
            <span style={{ borderColor: "#C079D4" }}>Mettre en œuvre</span>
          </div>
        </div>
      </aside>

      <main className="v2-login-form">
        <div className="v2-form">
          <Link to="/v2" className="v2-back">
            <ArrowBackIcon sx={{ fontSize: 17 }} /> Retour à l'accueil
          </Link>
          <h1 className="v2-cascade" style={{ ["--i" as string]: 0 }}>{known ? "Bon retour parmi nous" : "Bienvenue sur ID-PMC"}</h1>
          <p className="v2-cascade" style={{ ["--i" as string]: 1 }}>
            {known ? (
              <>
                Content de vous revoir, <b className="v2-known">{known}</b>. Il ne manque que votre mot de passe.
              </>
            ) : (
              "Connectez-vous avec l'identifiant fourni par votre entreprise."
            )}
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {hasError && (
              <div className="v2-err" role="alert" key={attempt}>
                <LoginErrorText t={t} issues={formIssues} failure={errorInfo} />
              </div>
            )}
            <div className="v2-field v2-cascade" style={{ ["--i" as string]: 2 }}>
              <label htmlFor="v2-id">Identifiant ou email</label>
              <div className="v2-input">
                <input
                  id="v2-id"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={rejected || formIssues.some((x) => x === t("validation.login.identifierRequired"))}
                  autoFocus={!email}
                />
              </div>
            </div>
            <div className="v2-field v2-cascade" style={{ ["--i" as string]: 3 }}>
              <label htmlFor="v2-pw">Mot de passe</label>
              <div className="v2-input">
                <input
                  id="v2-pw"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                  onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                  onBlur={() => setCapsLock(false)}
                  aria-describedby={capsLock ? "v2-caps" : undefined}
                  aria-invalid={rejected || formIssues.some((x) => x === t("validation.login.passwordRequired"))}
                />
                <button
                  type="button"
                  className="v2-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                </button>
              </div>
              {capsLock && (
                <span id="v2-caps" className="v2-caps" role="status">
                  Majuscules verrouillées : votre mot de passe risque d'être mal saisi.
                </span>
              )}
            </div>
            <div className="v2-row v2-cascade" style={{ ["--i" as string]: 4 }}>
              <label className="v2-check">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                Se souvenir de moi
              </label>
              <button
                type="button"
                className="v2-link"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotMessage(null);
                  setForgotOpen(true);
                }}
              >
                Mot de passe oublié ?
              </button>
            </div>
            <button type="submit" className="v2-btn v2-btn-primary v2-submit" data-success={success} disabled={loading || success}>
              {success ? (
                <>
                  <CheckIcon sx={{ fontSize: 20 }} /> Connexion réussie
                </>
              ) : loading ? (
                <>
                  <span className="v2-spin" aria-hidden="true" /> Connexion…
                </>
              ) : (
                <>
                  Se connecter <ArrowForwardIcon className="arr" sx={{ fontSize: 18 }} />
                </>
              )}
            </button>
          </form>

          <div className="v2-meta">
            <span>
              <LockOutlinedIcon sx={{ fontSize: 15 }} /> Connexion chiffrée
            </span>
            <span>Support DigitalMatis</span>
          </div>
        </div>
      </main>

      {forgotOpen && (
        <div className="v2-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setForgotOpen(false)}>
          <form className="v2-modal" role="dialog" aria-modal="true" aria-labelledby="v2-forgot-title" onSubmit={handleForgot}>
            <h2 id="v2-forgot-title">Mot de passe oublié</h2>
            <p>{t("login.forgotExplanation")}</p>
            <div className="v2-field">
              <label htmlFor="v2-forgot">Identifiant ou email</label>
              <div className="v2-input">
                <input id="v2-forgot" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoFocus />
              </div>
            </div>
            {forgotMessage && <div className="v2-info" role="status">{forgotMessage}</div>}
            <div className="acts">
              <button type="button" className="v2-btn v2-btn-ghost" onClick={() => setForgotOpen(false)}>
                Fermer
              </button>
              <button type="submit" className="v2-btn v2-btn-primary" disabled={!forgotEmail.trim() || forgotLoading}>
                {forgotLoading ? "Envoi…" : "Envoyer la demande"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Scène du panneau : le relief en points (moteur de taste-skill, version
 * sombre) et une Matrice ID-3A posée comme sur une table qui tourne
 * lentement ; les vraies photos de l'équipe s'y tiennent debout, cerclées de
 * la couleur de leur palier, toujours face au visiteur.
 */
function LoginStage() {
  const terrain = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = terrain.current;
    if (!el) return;
    let ctrl: { destroy(): void } | null = null;
    let dead = false;
    mount(el, dotTerrain, {
      palette: { bg: "#0f3d42", surface: "#134a50", ink: "#7fd6dd", muted: "#4f8a8f", accent: "#e08d3c" },
      params: { horizon: 0.5, spacing: 15, dot: 2.4, amplitude: 0.2, waveScale: 0.75, speed: 0.07, opacity: 0.75, crest: 0.9, fog: 0.5, haze: 0.4, calm: 0.85, calmX: 0.3, calmY: 0.82 },
      seed: 11,
    })
      .then((c: { destroy(): void }) => (dead ? c.destroy() : (ctrl = c)))
      .catch(() => {});
    return () => {
      dead = true;
      ctrl?.destroy();
    };
  }, []);
  return (
    <div className="v2-stage" aria-hidden="true">
      <div className="v2-stage-terrain" ref={terrain} />
      <div className="v2-stage-scene">
        <div className="v2-stage-board">
          <span className="v2-stage-q" />
          <span className="v2-stage-q" />
          <span className="v2-stage-q" />
          <span className="v2-stage-q hi" />
          {DEMO_PEOPLE.map((p, i) => (
            <span
              key={p.id}
              className="v2-stage-pin"
              style={{ left: `${p.soft}%`, top: `${100 - p.hard}%`, ["--z" as string]: `${18 + (altitudeOf(p) - 25)}px`, ["--i" as string]: i }}
            >
              <span className="v2-stage-stem" />
              <span className="v2-stage-bill">
                <span className="v2-stage-face" style={{ boxShadow: `0 0 0 3px ${tierOf(altitudeOf(p)).color}, 0 0 0 5px #0f3d42` }}>
                  <img src={p.photo} alt="" />
                </span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
