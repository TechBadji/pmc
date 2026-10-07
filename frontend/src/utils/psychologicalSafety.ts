import type { PsiVerdict } from "@/api/types";

export const PSI_DIMENSIONS = ["belonging", "learning", "contributing", "challenging"] as const;
export type PsiDimension = (typeof PSI_DIMENSIONS)[number];

/** Couleur de lecture d'un score /5, du plus fragile au plus solide. */
export type PsiReading = "strong" | "consolidate" | "watch" | "priority";

/** Seuils de lecture d'une dimension (échelle de 1 à 5) : à partir de la
 * valeur indiquée, la dimension prend cette lecture ; en dessous du dernier
 * seuil, elle est en « priorité ». */
export const DIMENSION_THRESHOLDS = { strong: 4, consolidate: 3.6, watch: 3.1 } as const;

export function dimensionReading(score: number): PsiReading {
  if (score >= DIMENSION_THRESHOLDS.strong) return "strong";
  if (score >= DIMENSION_THRESHOLDS.consolidate) return "consolidate";
  if (score >= DIMENSION_THRESHOLDS.watch) return "watch";
  return "priority";
}

/** Seuils de lecture de l'indice global : en dessous du dernier, « fragile ». */
export const GLOBAL_THRESHOLDS = { solid: 4.2, improvable: 3.5 } as const;

export function globalReading(score: number): "solid" | "improvable" | "fragile" {
  if (score >= GLOBAL_THRESHOLDS.solid) return "solid";
  if (score >= GLOBAL_THRESHOLDS.improvable) return "improvable";
  return "fragile";
}

export const READING_COLORS: Record<PsiReading, string> = {
  strong: "#3F9142",
  consolidate: "#2E8FCB",
  watch: "#E08A34",
  priority: "#B23F3F",
};

/** Couleur de la lecture globale : mêmes teintes que celles des dimensions. */
export const GLOBAL_READING_COLORS: Record<ReturnType<typeof globalReading>, string> = {
  solid: READING_COLORS.strong,
  improvable: READING_COLORS.watch,
  fragile: READING_COLORS.priority,
};

export const VERDICT_COLORS: Record<PsiVerdict, string> = {
  SAFE: READING_COLORS.strong,
  WATCH: READING_COLORS.watch,
  UNSAFE: READING_COLORS.priority,
};

/** Appréciation que suggèrent les notes : le consultant la confirme ou la corrige. */
export function suggestedVerdict(globalScore: number): PsiVerdict {
  const reading = globalReading(globalScore);
  return reading === "solid" ? "SAFE" : reading === "improvable" ? "WATCH" : "UNSAFE";
}

/** Note /5 à la française (deux décimales, virgule). */
export const fmtPsi = (n: number) => n.toFixed(2).replace(".", ",");
