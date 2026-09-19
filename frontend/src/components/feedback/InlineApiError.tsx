import { Alert, AlertTitle, Box } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ApiErrorInfo } from "@/utils/apiError";

/** Refus du serveur affiché dans l'écran (requête passée en `silent`) : ce qui a échoué, pourquoi, que faire. */
export default function InlineApiError({ info, onClose }: { info: ApiErrorInfo | null; onClose?: () => void }) {
  const { t } = useTranslation();
  if (!info) return null;
  return (
    <Alert severity="error" role="alert" onClose={onClose} sx={{ alignItems: "flex-start" }}>
      <AlertTitle sx={{ fontWeight: 700 }}>{info.title}</AlertTitle>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {info.reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </Box>
      <Box sx={{ mt: 0.5 }}>{info.advice}</Box>
      {info.reference && <Box sx={{ mt: 0.5, opacity: 0.8 }}>{t("errors.reference", { reference: info.reference })}</Box>}
    </Alert>
  );
}
