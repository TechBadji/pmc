import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Alert, AlertTitle, Box, Collapse, IconButton, Link, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SESSION_EXPIRED_KEY } from "@/api/client";
import { describeApiError } from "@/utils/apiError";
import { feedbackBus, type FeedbackMessage } from "@/utils/feedbackBus";

const MAX_VISIBLE = 3;

function autoHideMs(message: FeedbackMessage) {
  const length = message.reasons.join(" ").length + (message.advice?.length ?? 0);
  return Math.min(30000, Math.max(9000, length * 60));
}

function MessageCard({ message, onClose }: { message: FeedbackMessage; onClose: () => void }) {
  const { t } = useTranslation();
  const [details, setDetails] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(onClose, autoHideMs(message));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Alert
      severity={message.severity}
      variant="filled"
      sx={{ width: "100%", alignItems: "flex-start", boxShadow: 6 }}
      action={
        <IconButton aria-label={t("errors.close")} color="inherit" size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      }
    >
      <AlertTitle sx={{ fontWeight: 700 }}>{message.title}</AlertTitle>
      {message.reasons.length === 1 ? (
        <Typography variant="body2">{message.reasons[0]}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {message.reasons.slice(0, 6).map((reason, index) => (
            <li key={index}>
              <Typography variant="body2">{reason}</Typography>
            </li>
          ))}
          {message.reasons.length > 6 && (
            <li>
              <Typography variant="body2">+ {message.reasons.length - 6}</Typography>
            </li>
          )}
        </Box>
      )}
      {message.advice && (
        <Typography variant="body2" sx={{ mt: 0.75, opacity: 0.95 }}>
          {message.advice}
        </Typography>
      )}
      {message.reference && (
        <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 700 }}>
          {t("errors.reference", { reference: message.reference })}
        </Typography>
      )}
      {message.technical && (
        <>
          <Link
            component="button"
            type="button"
            color="inherit"
            underline="always"
            onClick={() => setDetails((v) => !v)}
            sx={{ mt: 0.75, display: "inline-flex", alignItems: "center", fontSize: 12, opacity: 0.85 }}
          >
            {t("errors.technical")}
            <ExpandMoreIcon sx={{ fontSize: 16, transform: details ? "rotate(180deg)" : "none" }} />
          </Link>
          <Collapse in={details}>
            <Typography variant="caption" sx={{ display: "block", fontFamily: "monospace", opacity: 0.9 }}>
              {message.technical}
            </Typography>
          </Collapse>
        </>
      )}
    </Alert>
  );
}

/** Affiche, en bas de l'écran, chaque message publié sur le canal de retours
 * (erreurs d'API attrapées par le client HTTP, et messages émis par les écrans). */
export default function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);

  useEffect(
    () => feedbackBus.subscribe((message) => setMessages((prev) => [...prev, message].slice(-MAX_VISIBLE))),
    []
  );

  // Une session expirée renvoie vers /login : le message doit survivre à la
  // redirection, il est donc posé dans sessionStorage puis affiché ici.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
        sessionStorage.removeItem(SESSION_EXPIRED_KEY);
        feedbackBus.publish({ severity: "warning", title: t("errors.sessionExpired"), reasons: [] });
      }
    } catch {
      /* stockage indisponible : le message est simplement omis */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback((id: number) => setMessages((prev) => prev.filter((m) => m.id !== id)), []);

  return (
    <>
      {children}
      <Stack
        spacing={1}
        role="region"
        aria-live="assertive"
        sx={{
          position: "fixed",
          left: "50%",
          bottom: 16,
          transform: "translateX(-50%)",
          width: "min(600px, calc(100vw - 32px))",
          zIndex: (theme) => theme.zIndex.snackbar + 1,
          pointerEvents: "none",
          "& > *": { pointerEvents: "auto" },
        }}
      >
        {messages.map((message) => (
          <MessageCard key={message.id} message={message} onClose={() => dismiss(message.id)} />
        ))}
      </Stack>
    </>
  );
}

export { describeApiError };
