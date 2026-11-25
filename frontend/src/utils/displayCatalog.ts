import { NAV_BY_ROLE } from "@/components/layout/navConfig";
import type { Role } from "@/api/types";

/** Rôles d'une entreprise dont l'affichage se règle (le super administrateur n'en fait pas partie). */
export const SCOPED_ROLES = ["COMPANY_ADMIN", "MANAGER", "MEMBER"] as const satisfies readonly Role[];
export type ScopedRole = (typeof SCOPED_ROLES)[number];

/** Sous-rubriques (vues) d'une rubrique du menu, avec le libellé de leur bouton.
 * Toute vue ajoutée à une page se déclare ici : c'est ce catalogue que
 * présente l'écran de réglage, et que consultent les pages pour se masquer. */
export const VIEWS_BY_PATH = {
  "/cohesion": [
    { key: "cohesion.sheet", labelKey: "cohesion.viewSheet" },
    { key: "cohesion.relationship", labelKey: "cohesion.viewRelationship" },
    { key: "cohesion.strengths", labelKey: "cohesion.viewStrengths" },
    { key: "cohesion.opinion", labelKey: "cohesion.viewOpinion" },
    { key: "cohesion.psi", labelKey: "cohesion.viewPsi" },
  ],
  "/team-cohesion": [
    { key: "cohesion.strengths", labelKey: "nav.myStrengths" },
    { key: "cohesion.psi", labelKey: "nav.psychologicalSafety" },
  ],
  "/evaluations": [
    { key: "evaluations.id3a", labelKey: "objectivesSheet.viewId3a" },
    { key: "evaluations.employee", labelKey: "objectivesSheet.viewEmployee" },
    { key: "evaluations.team", labelKey: "objectivesSheet.viewTeam" },
    { key: "evaluations.managerial", labelKey: "objectivesSheet.viewManagerial" },
    { key: "evaluations.monkey", labelKey: "objectivesSheet.viewMonkeyManagement" },
    { key: "evaluations.feedback", labelKey: "feedback360.feedbackTitle" },
    { key: "evaluations.forward", labelKey: "feedback360.forwardTitle" },
  ],
  "/id3a-matrix": [
    { key: "matrix.matrix", labelKey: "id3aMatrix.matrixTab" },
    { key: "matrix.objectives", labelKey: "id3aMatrix.objectivesTab" },
  ],
  "/talents-dashboard": [
    { key: "talents.boxes", labelKey: "talents.viewBoxes" },
    { key: "talents.trajectory", labelKey: "talents.viewTrajectory" },
    { key: "talents.visio", labelKey: "talents.viewVisio" },
  ],
  "/action-plans": [
    { key: "actionplans.team", labelKey: "actionPlans.viewTeam" },
    { key: "actionplans.individual", labelKey: "displayScope.viewIndividualPlans" },
  ],
  "/performances": [
    { key: "performance.person", labelKey: "displayScope.viewPersonSheet" },
    { key: "performance.team", labelKey: "performanceId.viewTeam" },
    { key: "performance.entry", labelKey: "performanceEntry.toggleLabel" },
  ],
} as const;

export type ScopedPath = keyof typeof VIEWS_BY_PATH;
export type ScopedView = (typeof VIEWS_BY_PATH)[ScopedPath][number]["key"];

/** Le tableau de bord est la page d'arrivée : il ne se masque pas. */
export const ALWAYS_SHOWN_PATH = "/";

/** Rubriques du menu d'un rôle, chacune avec ses sous-rubriques. Les vues
 * réservées à l'encadrement ne sont pas proposées pour un collaborateur. */
export function catalogFor(role: ScopedRole) {
  return NAV_BY_ROLE[role].map((item) => ({
    path: item.path,
    labelKey: item.labelKey,
    views: (VIEWS_BY_PATH[item.path as ScopedPath] ?? []) as readonly { key: ScopedView; labelKey: string }[],
  }));
}

export type CatalogItem = ReturnType<typeof catalogFor>[number];

/** Menu réunissant ceux de plusieurs rôles (une fonction tenue par des
 * personnes de rôles différents), dans l'ordre du premier rôle. */
export function catalogForRoles(roles: readonly ScopedRole[]): CatalogItem[] {
  const seen = new Map<string, CatalogItem>();
  roles.forEach((role) =>
    catalogFor(role).forEach((item) => {
      const known = seen.get(item.path);
      if (!known) seen.set(item.path, item);
      else {
        const keys = new Set(known.views.map((v) => v.key));
        seen.set(item.path, { ...known, views: [...known.views, ...item.views.filter((v) => !keys.has(v.key))] });
      }
    })
  );
  return [...seen.values()];
}
