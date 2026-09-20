export const PSI_DIMENSIONS = ["belonging", "learning", "contributing", "challenging"] as const;
export type PsiDimension = (typeof PSI_DIMENSIONS)[number];

/** Couleur de lecture d'un score /5, du plus fragile au plus solide. */
export type PsiReading = "strong" | "consolidate" | "watch" | "priority";

/** Seuils de lecture d'une dimension (échelle de 1 à 5). */
export function dimensionReading(score: number): PsiReading {
  if (score >= 4) return "strong";
  if (score >= 3.6) return "consolidate";
  if (score >= 3.1) return "watch";
  return "priority";
}

export function globalReading(score: number): "solid" | "improvable" | "fragile" {
  if (score >= 4.2) return "solid";
  if (score >= 3.5) return "improvable";
  return "fragile";
}

export const READING_COLORS: Record<PsiReading, string> = {
  strong: "#3F9142",
  consolidate: "#2E8FCB",
  watch: "#E08A34",
  priority: "#B23F3F",
};
