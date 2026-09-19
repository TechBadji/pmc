import { Alert, AlertTitle, Box } from "@mui/material";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ValidationIssue } from "@/utils/validation";

/** Les points à corriger avant d'enregistrer, en clair et au bon endroit : l'écran
 * défile jusqu'à eux, pour que le refus ne passe jamais inaperçu. */
export default function ValidationSummary({ issues, onClose }: { issues: ValidationIssue[]; onClose?: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (issues.length) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [issues]);

  if (!issues.length) return null;
  return (
    <Alert ref={ref} severity="error" role="alert" onClose={onClose} sx={{ alignItems: "flex-start" }}>
      <AlertTitle sx={{ fontWeight: 700 }}>
        {t(issues.length === 1 ? "errors.validationTitleOne" : "errors.validationTitle")}
      </AlertTitle>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {issues.map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </Box>
    </Alert>
  );
}
