import { useAppSelector } from "@/app/hooks";

/** Vues qu'une entreprise peut retirer à l'intérieur d'une rubrique. */
export type ScopedView =
  | "cohesion.psi"
  | "cohesion.strengths"
  | "evaluations.id3a"
  | "evaluations.employee"
  | "evaluations.team"
  | "evaluations.feedback"
  | "evaluations.managerial"
  | "evaluations.monkey";

export interface DisplayScope {
  /** Par rôle, les seules entrées de menu montrées (leur chemin). Rôle absent : tout le menu. */
  nav?: Record<string, string[]>;
  hidden_views?: string[];
  /** Vues retirées pour un rôle seulement, en plus de `hidden_views`. */
  hidden_views_by_role?: Record<string, string[]>;
}

/** Périmètre affiché pour l'entreprise connectée (réglage `Company.display_scope`) :
 * une démonstration sur quelques rubriques masque les autres. Ce n'est qu'un
 * affichage — les droits restent ceux du rôle. */
export function useDisplayScope() {
  const scope = (useAppSelector((s) => s.auth.user?.company_display_scope) ?? {}) as DisplayScope;
  const role = useAppSelector((s) => s.auth.user?.role);
  const hidden = new Set([...(scope.hidden_views ?? []), ...((role && scope.hidden_views_by_role?.[role]) || [])]);
  const allowed = role ? scope.nav?.[role] : undefined;
  return {
    viewHidden: (view: ScopedView) => hidden.has(view),
    navShown: (path: string) => !allowed || allowed.includes(path),
  };
}
