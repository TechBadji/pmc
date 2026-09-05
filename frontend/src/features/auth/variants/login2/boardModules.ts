/* ---------------------------------------------------------------------------
 * Login2 — la géométrie du plateau ID-PMC, reprise de la planche d'origine.
 *
 * Quatre colonnes : la première porte trois briques (1-2-3), les trois autres
 * en portent deux. Le cercle « Vision, Missions, Valeurs » est posé au croisement
 * exact des quatre briques centrales, qui sont donc échancrées d'un quart de
 * disque — c'est cet emboîtement, et pas une grille régulière, qui fait lire la
 * page comme LE canevas et pas comme une planche de cartes.
 * ------------------------------------------------------------------------- */

/** Coin échancré par le cercle central, en coordonnées de `radial-gradient`. */
export type Notch = "100% 100%" | "100% 0%" | "0% 100%" | "0% 0%" | null;

export interface BoardModule {
  n: number;
  area: string;
  notch: Notch;
  /** Coins libres : le chiffre, le nom et le pictogramme fuient l'échancrure. */
  numeral: "tr" | "tl";
  label: "bl" | "tl";
  icon: "tl" | "bl" | "br";
}

export const BOARD_MODULES: BoardModule[] = [
  { n: 1, area: "m1", notch: null, numeral: "tr", label: "bl", icon: "br" },
  { n: 2, area: "m2", notch: null, numeral: "tr", label: "bl", icon: "tl" },
  { n: 3, area: "m3", notch: null, numeral: "tr", label: "bl", icon: "tl" },
  // Les quatre briques du centre mordent sur le cercle.
  { n: 4, area: "m4", notch: "100% 100%", numeral: "tr", label: "tl", icon: "bl" },
  { n: 5, area: "m5", notch: "100% 0%", numeral: "tl", label: "bl", icon: "br" },
  { n: 7, area: "m7", notch: "0% 100%", numeral: "tr", label: "tl", icon: "br" },
  { n: 8, area: "m8", notch: "0% 0%", numeral: "tr", label: "bl", icon: "br" },
  { n: 9, area: "m9", notch: null, numeral: "tr", label: "bl", icon: "tl" },
  { n: 10, area: "m10", notch: null, numeral: "tr", label: "bl", icon: "tl" },
];

/** Le module 6 n'est pas une brique : c'est le cercle, traité à part. */
export const CORE_MODULE = 6;

/**
 * Plateau complet. Six rangées pour que la colonne de gauche en tienne trois
 * (2 rangées chacune) pendant que les autres en tiennent deux (3 rangées).
 */
export const AREAS_BOARD = `
  "m1 m4 m7 m9"
  "m1 m4 m7 m9"
  "m2 m4 m7 m9"
  "m2 m5 m8 m10"
  "m3 m5 m8 m10"
  "m3 m5 m8 m10"
`;

/**
 * Sous 900px, l'emboîtement n'est plus lisible : mur de briques à deux
 * colonnes, le cercle redevenu bandeau en tête — il reste la porte principale
 * et porte la consigne, qu'on ne peut pas se permettre de perdre sur mobile.
 */
export const AREAS_NARROW = `
  "core core"
  "m1  m2"
  "m3  m4"
  "m5  m7"
  "m8  m9"
  "m10 m10"
`;
