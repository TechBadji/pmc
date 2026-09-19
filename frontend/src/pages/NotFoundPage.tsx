import { Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";

/** Une adresse inconnue ne renvoie plus silencieusement à l'accueil : l'utilisateur
 * apprend que le lien est faux ou que son profil n'y donne pas accès. */
export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 10, textAlign: "center", maxWidth: 520, mx: "auto" }}>
      <Typography variant="h4" fontWeight={700}>
        {t("errors.notFoundPage.title")}
      </Typography>
      <Typography color="text.secondary">{t("errors.notFoundPage.text")}</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        {t("errors.notFoundPage.home")}
      </Button>
    </Stack>
  );
}
