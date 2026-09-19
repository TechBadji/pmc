import { Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import PersonPerformanceId from "@/components/PersonPerformanceId";

/** Jeu de démo : la même fiche que « Manager Performance ID », à remplir pour un
 * collègue dont on saisit le nom et prénom, afin de voir si l'on connaît ses aspirations.
 * Rien n'est enregistré : la fiche du collègue n'est jamais modifiée. */
export default function MyPerformanceIdPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>
        {t("performanceEntry.pageTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("performanceEntry.pageIntro")}
      </Typography>
      <PersonPerformanceId people={[]} guess />
    </Stack>
  );
}
