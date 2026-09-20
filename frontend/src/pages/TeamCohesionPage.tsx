import { Box, Paper, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import MyStrengthsPage from "./MyStrengthsPage";
import PsychologicalSafetyPage from "./PsychologicalSafetyPage";

/** Cohésion d'équipe côté collaborateur : un seul point d'entrée, deux
 * rubriques. Les deux restent montées (masquées quand inactives) pour qu'une
 * saisie PSI en cours ne soit pas perdue en passant sur l'autre onglet. */
export default function TeamCohesionPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        {t("nav.teamCohesion")}
      </Typography>
      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", mb: 2.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1 }}>
          <Tab label={t("nav.myStrengths").toUpperCase()} />
          <Tab label={t("nav.psychologicalSafety").toUpperCase()} />
        </Tabs>
      </Paper>
      <Box hidden={tab !== 0}>
        <MyStrengthsPage />
      </Box>
      <Box hidden={tab !== 1}>
        <PsychologicalSafetyPage />
      </Box>
    </Box>
  );
}
