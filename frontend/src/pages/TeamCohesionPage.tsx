import { Box, Paper, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import MyStrengthsPage from "./MyStrengthsPage";
import PsychologicalSafetyPage from "./PsychologicalSafetyPage";
import EnpsPage from "./EnpsPage";
import { useDisplayScope } from "@/utils/displayScope";

/** Cohésion d'équipe côté collaborateur : un seul point d'entrée, trois
 * rubriques. Les deux restent montées (masquées quand inactives) pour qu'une
 * saisie PSI en cours ne soit pas perdue en passant sur l'autre onglet. */
export default function TeamCohesionPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const scope = useDisplayScope();
  // Vues retirées du périmètre affiché de l'entreprise : leur onglet disparaît.
  const showStrengths = !scope.viewHidden("cohesion.strengths");
  const showPsi = !scope.viewHidden("cohesion.psi");
  const showEnps = !scope.viewHidden("cohesion.enps");
  const visible = [showStrengths && 0, showPsi && 1, showEnps && 2].filter((v): v is number => v !== false);
  const shown = visible.includes(tab) ? tab : visible[0] ?? 0;
  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <PageHeader
          title={t("nav.teamCohesion")}
          view={t(shown === 0 ? "nav.myStrengths" : shown === 1 ? "nav.psychologicalSafety" : "enps.tab")}
        />
      </Box>
      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", mb: 2.5 }}>
        <Tabs value={shown} onChange={(_, v) => setTab(v)} sx={{ px: 1 }}>
          {showStrengths && <Tab value={0} label={t("nav.myStrengths").toUpperCase()} />}
          {showPsi && <Tab value={1} label={t("nav.psychologicalSafety").toUpperCase()} />}
          {showEnps && <Tab value={2} label={t("enps.tab")} />}
        </Tabs>
      </Paper>
      <Box hidden={shown !== 0 || !showStrengths}>
        <MyStrengthsPage />
      </Box>
      <Box hidden={shown !== 1 || !showPsi}>
        <PsychologicalSafetyPage />
      </Box>
      <Box hidden={shown !== 2 || !showEnps}>
        <EnpsPage />
      </Box>
    </Box>
  );
}
