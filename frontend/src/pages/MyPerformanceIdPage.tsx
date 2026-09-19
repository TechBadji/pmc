import { Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/app/hooks";
import PersonPerformanceIdEntry from "@/components/PersonPerformanceIdEntry";

/** L'écran de saisie de l'employé : sa fiche Performance ID, sans éléments de calcul. */
export default function MyPerformanceIdPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  if (!user) return null;
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        {t("performanceEntry.pageTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("performanceEntry.pageIntro")}
      </Typography>
      <PersonPerformanceIdEntry person={user} />
    </Stack>
  );
}
