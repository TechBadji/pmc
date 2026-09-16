import { useTranslation } from "react-i18next";
import type { ManagerialAssessmentCategory } from "@/api/types";

export type ManagerialAssessmentScale = "frequency" | "level";

interface CategoryConfig {
  key: ManagerialAssessmentCategory;
  scale: ManagerialAssessmentScale;
}

// Ordre et barème de la fiche ID-PMC : quatre fiches notées sur une échelle
// de fréquence (Jamais..Toujours), la dernière (gestion du temps) sur une
// échelle de niveau (Très faible..Très élevé).
export const MANAGERIAL_ASSESSMENT_CATEGORIES: CategoryConfig[] = [
  { key: "COMMUNICATION", scale: "frequency" },
  { key: "ECOUTE", scale: "frequency" },
  { key: "MOTIVATION", scale: "frequency" },
  { key: "DELEGATION", scale: "frequency" },
  { key: "TEMPS_PRIORITES", scale: "level" },
];

export interface ManagerialAssessmentCategoryContent extends CategoryConfig {
  label: string;
  items: string[];
}

/**
 * Les 5 fiches et leurs 10 questions, traduites.
 *
 * Fixes et dupliquées côté i18n comme les critères de cohésion
 * (`useCohesionCriteria`), mais sans substitution de nom d'entreprise : ces
 * questions ne nomment jamais l'entreprise, un simple rang (1-10) suffit
 * donc comme clé de rapprochement côté API plutôt que le libellé complet.
 */
export function useManagerialAssessmentCategories(): ManagerialAssessmentCategoryContent[] {
  const { t } = useTranslation();
  return MANAGERIAL_ASSESSMENT_CATEGORIES.map((c) => ({
    ...c,
    label: t(`managerialSelfAssessment.categories.${c.key}.label`),
    items: t(`managerialSelfAssessment.categories.${c.key}.items`, { returnObjects: true }) as string[],
  }));
}
