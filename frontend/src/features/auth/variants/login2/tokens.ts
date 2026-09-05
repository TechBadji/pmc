/* ---------------------------------------------------------------------------
 * Login2 — jetons de la variante. Voir l'en-tête de LoginPage2.tsx.
 * ------------------------------------------------------------------------- */

export const C = {
  /** Le mortier entre les briques, et le texte sur fond clair. */
  ink: "#08262A",
  surface: "#FFFFFF",
  muted: "#46605F",
  /** Seule couleur saturée de la page : l'orange du wordmark, sur le CTA. */
  orange: "#E08D3C",
  orangeDeep: "#C9781F",
  focusOnBoard: "#FFD166",
} as const;

export const TILE = {
  lit: "#3FAAB4",
  top: "#247881",
  bottom: "#12464C",
  hoverLit: "#55C4CD",
  hoverTop: "#2E939D",
  hoverBottom: "#175860",
  numeral: "rgba(255,255,255,0.5)",
} as const;

export const tileSurface = (hover = false) =>
  `radial-gradient(125% 95% at 50% -18%, ${hover ? TILE.hoverLit : TILE.lit} 0%, ${
    hover ? TILE.hoverTop : TILE.top
  } 42%, ${hover ? TILE.hoverBottom : TILE.bottom} 100%)`;

/** Le relief embossé de la marque : lumière au bord haut, ombre interne basse. */
export const TILE_EMBOSS =
  "inset 0 1.5px 0 rgba(255,255,255,0.5), inset 0 -22px 40px rgba(0,0,0,0.20), inset 0 0 0 1px rgba(255,255,255,0.08)";

export const DISPLAY = `"Bricolage Grotesque", system-ui, sans-serif`;
export const TEXT = `"Instrument Sans", system-ui, -apple-system, sans-serif`;

/** Largeur de la carte une fois retournée — sert aussi au calcul de l'échelle. */
export const CARD_WIDTH = 452;
