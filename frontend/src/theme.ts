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
