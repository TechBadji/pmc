/* ---------------------------------------------------------------------------
 * Login1 — instantané figé de la refonte de la page de connexion.
 *
 * Cette copie existe pour comparer plusieurs directions artistiques côte à côte
 * dans le navigateur (/login1, /login2, …) : elle est volontairement autonome.
 * Elle ne réutilise AUCUN composant de présentation partagé, sinon une
 * retouche du design en cours la ferait bouger et la comparaison n'aurait plus
 * de sens. Ce qui reste partagé est la plomberie applicative (client API,
 * store, traductions) et les textes : ce sont ceux du produit, pas ceux d'une
 * maquette.
 *
 * Ne pas modifier — pour faire évoluer le design, éditer
 * `src/features/auth/LoginPage.tsx`, servi sur /login.
 * ------------------------------------------------------------------------- */

/**
 * Les dix modules du canevas ID-PMC, dans l'ordre de la méthode.
 *
 * Le 6 (« Vision, Missions, Valeurs ») occupe le cercle central du canevas
 * original : il n'est pas une étape de plus mais le socle auquel les neuf
 * autres se rattachent. La couronne ne porte donc que neuf tuiles.
 *
 * Les libellés et les rôles vivent dans les fichiers de traduction
 * (`login.canvas.mN.name` / `.role`) ; ce fichier ne porte que la structure.
 */

export type PmcPhase = "analysis" | "planning" | "implementation";

export interface PmcModule {
  /** Numéro affiché sur la tuile — c'est aussi l'identifiant du module. */
  n: number;
  /** Position dans la couronne, ou `null` pour le noyau central. */
  ringIndex: number | null;
  phase: PmcPhase;
}

export const PMC_MODULES: PmcModule[] = [
  { n: 1, ringIndex: 0, phase: "analysis" },
  { n: 2, ringIndex: 1, phase: "analysis" },
  { n: 3, ringIndex: 2, phase: "analysis" },
  { n: 4, ringIndex: 3, phase: "planning" },
  { n: 5, ringIndex: 4, phase: "planning" },
  { n: 6, ringIndex: null, phase: "planning" },
  { n: 7, ringIndex: 5, phase: "planning" },
  { n: 8, ringIndex: 6, phase: "planning" },
  { n: 9, ringIndex: 7, phase: "implementation" },
  { n: 10, ringIndex: 8, phase: "implementation" },
];

/** Couleur d'arc de chaque phase — reprise du bandeau de la plaquette ID-PMC. */
export const PHASE_COLORS: Record<PmcPhase, string> = {
  analysis: "#E08D3C",
  planning: "#7FD6DD",
  implementation: "#C079D4",
};

export function moduleByNumber(n: number): PmcModule {
  const found = PMC_MODULES.find((m) => m.n === n);
  if (!found) throw new Error(`Module ID-PMC inconnu : ${n}`);
  return found;
}
