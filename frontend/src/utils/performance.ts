import type { PerformanceRating } from "@/api/types";

/** Palier de performance correspondant à une Altitude, avec les bornes du
 * barème ID-PMC. Partagé par les tableaux de bord : deux copies finiraient par
 * diverger, et un palier faux se voit à la couleur affichée au client. */
export function ratingForAltitude(pct: number): PerformanceRating {
  if (pct < 50) return "VERY_LOW";
  if (pct < 75) return "LOW";
  if (pct < 90) return "AVERAGE";
  if (pct <= 100) return "GOOD";
  return "OUTSTANDING";
}

export function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Dernière évaluation connue de chaque personne, par date de campagne — la
 * liste des évaluations en contient plusieurs par personne. */
export function lastEvaluationByUser<T extends { user: number; campaign_start_date: string }>(
  evaluations: T[]
): Map<number, T> {
  const byUser = new Map<number, T[]>();
  evaluations.forEach((e) => {
    if (!byUser.has(e.user)) byUser.set(e.user, []);
    byUser.get(e.user)!.push(e);
  });
  const last = new Map<number, T>();
  byUser.forEach((list, userId) => {
    const sorted = [...list].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
    last.set(userId, sorted[sorted.length - 1]);
  });
  return last;
}
