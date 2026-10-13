import { Box, Paper, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import MyStrengthsPage from "./MyStrengthsPage";
import PsychologicalSafetyPage from "./PsychologicalSafetyPage";
import { useDisplayScope } from "@/utils/displayScope";

/** Cohésion d'équipe côté collaborateur : un seul point d'entrée, deux
 * rubriques. Les deux restent montées (masquées quand inactives) pour qu'une
 * saisie PSI en cours ne soit pas perdue en passant sur l'autre onglet. */
export default function TeamCohesionPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const scope = useDisplayScope();
  // Vues retirées du périmètre affiché de l'entreprise : leur onglet disparaît.
  const showStrengths = !scope.viewHidden("cohesion.strengths");
  const showPsi = !scope.viewHidden("cohesion.psi");
  const shown = !showStrengths && showPsi ? 1 : !showPsi && showStrengths ? 0 : tab;
  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <PageHeader
          title={t("nav.teamCohesion")}
          view={t(shown === 0 ? "nav.myStrengths" : "nav.psychologicalSafety")}
        />
      </Box>
      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", mb: 2.5 }}>
        <Tabs value={shown} onChange={(_, v) => setTab(v)} sx={{ px: 1 }}>
          {showStrengths && <Tab value={0} label={t("nav.myStrengths").toUpperCase()} />}
          {showPsi && <Tab value={1} label={t("nav.psychologicalSafety").toUpperCase()} />}
        </Tabs>
      </Paper>
      <Box hidden={shown !== 0 || !showStrengths}>
        <MyStrengthsPage />
      </Box>
      <Box hidden={shown !== 1 || !showPsi}>
        <PsychologicalSafetyPage />
      </Box>
    </Box>
  );
}
