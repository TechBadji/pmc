import { useAppSelector } from "@/app/hooks";
import { ALWAYS_SHOWN_PATH, VIEWS_BY_PATH, type ScopedPath, type ScopedView } from "./displayCatalog";

export type { ScopedView } from "./displayCatalog";

export interface DisplayScope {
  /** Par rôle, les seules entrées de menu montrées (leur chemin). Rôle absent : tout le menu. */
  nav?: Record<string, string[]>;
  /** Vues retirées pour tous les rôles. */
  hidden_views?: string[];
  /** Vues retirées pour un rôle seulement, en plus de `hidden_views`. */
  hidden_views_by_role?: Record<string, string[]>;
  /** Réglage propre à une fonction (clé : `normalizePosition`) : il remplace celui du rôle.
   * Résolu par le serveur — un utilisateur ne reçoit que le sien. */
  by_position?: Record<string, ScopeProfile>;
  /** Réglage propre à une personne (clé : son id) : il l'emporte sur sa fonction et son rôle. */
  by_user?: Record<string, ScopeProfile>;
}

/** Réglage d'une fonction ou d'une personne. Sans `nav`, tout le menu du rôle est montré. */
export interface ScopeProfile {
  nav?: string[];
  hidden_views: string[];
}

/** Même règle que le serveur : sans casse ni espaces superflus. */
export const normalizePosition = (name: string) => name.split(/\s+/).filter(Boolean).join(" ").toLowerCase();

/** Vues masquées pour un rôle : celles de tous, plus les siennes. */
export function hiddenViewsFor(scope: DisplayScope, role: string | undefined): Set<string> {
  return new Set([...(scope.hidden_views ?? []), ...((role && scope.hidden_views_by_role?.[role]) || [])]);
}

/** Périmètre affiché pour l'entreprise connectée (réglage `Company.display_scope`) :
 * une démonstration sur quelques rubriques masque les autres. Ce n'est qu'un
 * affichage — les droits restent ceux du rôle. */
export function useDisplayScope() {
  const scope = (useAppSelector((s) => s.auth.user?.company_display_scope) ?? {}) as DisplayScope;
  const role = useAppSelector((s) => s.auth.user?.role);
  const hidden = hiddenViewsFor(scope, role);
  const allowed = role ? scope.nav?.[role] : undefined;
  const viewHidden = (view: ScopedView) => hidden.has(view);
  return {
    viewHidden,
    /** Première vue encore affichée parmi `views`, dans l'ordre donné : la vue d'ouverture d'une page. */
    firstShown: <V extends string>(prefix: string, views: readonly V[]): V =>
      views.find((v) => !hidden.has(`${prefix}.${v}`)) ?? views[0],
    /** Une rubrique du menu est montrée si elle est dans le périmètre du rôle
     * et qu'il lui reste au moins une vue. */
    navShown: (path: string) => {
      if (path !== ALWAYS_SHOWN_PATH && allowed && !allowed.includes(path)) return false;
      const views = VIEWS_BY_PATH[path as ScopedPath];
      return !views || views.some((v) => !hidden.has(v.key));
    },
  };
}
