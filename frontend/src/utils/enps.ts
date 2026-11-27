export type EnpsCategory = "detractor" | "passive" | "promoter";

/** Couleurs de l'échelle eNPS : rouge 0-6, jaune 7-8, vert 9-10. */
export const ENPS_COLORS: Record<EnpsCategory, string> = {
  detractor: "#D7263D",
  passive: "#E3A008",
  promoter: "#2E9E44",
};

export function enpsCategory(score: number): EnpsCategory {
  return score <= 6 ? "detractor" : score <= 8 ? "passive" : "promoter";
}

/** Lecture usuelle d'un eNPS (−100 à +100). */
export function enpsReading(value: number): { key: "excellent" | "good" | "fragile" | "critical"; color: string } {
  if (value >= 40) return { key: "excellent", color: ENPS_COLORS.promoter };
  if (value >= 10) return { key: "good", color: "#17A89E" };
  if (value >= 0) return { key: "fragile", color: ENPS_COLORS.passive };
  return { key: "critical", color: ENPS_COLORS.detractor };
}

export interface EnpsSummary {
  respondents: number;
  headcount: number;
  published: boolean;
  min_respondents: number;
  counts?: Record<EnpsCategory, number>;
  percentages?: Record<EnpsCategory, number>;
  enps?: number;
  average?: number;
  distribution?: number[];
  comments?: { score: number; category: EnpsCategory; text: string }[];
  team?: number;
  team_name?: string;
}

export interface EnpsResults {
  teams: EnpsSummary[];
  company?: EnpsSummary;
}

export interface EnpsAnswer {
  id: number;
  campaign: number;
  score: number;
  reason: string;
  updated_at: string;
}
