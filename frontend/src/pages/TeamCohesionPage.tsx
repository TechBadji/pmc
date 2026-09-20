import { Box, Paper, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
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
      <Box sx={{ mb: 2 }}>
        <PageHeader
          title={t("nav.teamCohesion")}
          view={t(tab === 0 ? "nav.myStrengths" : "nav.psychologicalSafety")}
        />
      </Box>
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
