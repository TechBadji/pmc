import type { PaletteMode } from "@mui/material";
import { createTheme } from "@mui/material/styles";

/**
 * Palette calée sur le logo ID-PMC (orange / bleu / magenta) et sur la
 * palette de statuts validée (accessibilité CVD) pour les 5 paliers de
 * performance ID-3A.
 */
export const performanceColors = {
  VERY_LOW: "#d03b3b",
  LOW: "#ec835a",
  AVERAGE: "#898781",
  GOOD: "#4caf50",
  OUTSTANDING: "#0ca30c",
} as const;

export const performanceLabels: Record<keyof typeof performanceColors, string> = {
  VERY_LOW: "Très faible (<50%)",
  LOW: "Faible (50-74%)",
  AVERAGE: "Moyenne (75-89%)",
  GOOD: "Bonne (90-100%)",
  OUTSTANDING: "Exceptionnelle (>100%)",
};

// Distinguent systématiquement les deux volets Aptitudes/Attitudes de la
// méthodologie ID-3A (en-têtes de tableau, vignettes, graphiques) — jamais
// interchangés, jamais réutilisés hors de ce rôle (voir DESIGN.md).
export const HARD_SKILLS_COLOR = "#2E5AAC";
export const SOFT_SKILLS_COLOR = "#3F9142";

// Chrome neutre de la Matrice ID-3A (halos, connecteurs, axes, quadrants) —
// gris/blancs cassés au même titre que chart-grid/chart-ink, réservés au
// dessin du graphique lui-même (jamais un signal de statut).
export const CHART_NEUTRALS = {
  halo: "#fcfcfb",
  connectorArrow: "#8a95a3",
  quadrantLabel: "#b3b2aa",
  plotAxisLine: "#cfcec6",
  trailMarker: "#b7b6b0",
  axisTitle: "#52514e",
} as const;

// Barème 1-5 de la Fiche de Cohésion d'Équipe (ICE/OCE/Réalisé) — même
// palette à 5 paliers que performanceColors (rouge → orange → gris → vert
// clair → vert foncé), réutilisée telle quelle : c'est le même langage visuel
// "note sur 5" que l'Altitude ID-3A, pas un sens concurrent (voir DESIGN.md).
export const COHESION_TIER_COLORS = [
  performanceColors.VERY_LOW,
  performanceColors.LOW,
  performanceColors.AVERAGE,
  performanceColors.GOOD,
  performanceColors.OUTSTANDING,
] as const;

export function cohesionColor(score: number): string {
  const tier = Math.min(5, Math.max(1, Math.round(score)));
  return COHESION_TIER_COLORS[tier - 1];
}

// Accent "rang exécutif" — usage unique et volontairement hors de la palette
// de statut/marque : distingue le nœud CEO dans l'organigramme de l'équipe
// dirigeante, jamais réutilisé comme code de performance ou de catégorie.
export const EXECUTIVE_BADGE_COLOR = "#9C7A2E";

export function createAppTheme(mode: PaletteMode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: "#2E8FCB" }, // bleu du logo
      secondary: { main: "#B23FA0" }, // magenta du logo
      warning: { main: "#E08A34" }, // orange du logo
      background:
        mode === "light"
          ? { default: "#f9f9f7", paper: "#ffffff" }
          : { default: "#121212", paper: "#1a1a1a" },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: `system-ui, -apple-system, "Segoe UI", sans-serif`,
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 600 },
    },
    components: {
      MuiAppBar: { styleOverrides: { root: { boxShadow: "none" } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    },
  });
}
