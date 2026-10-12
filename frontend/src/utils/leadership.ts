import type { UserRecord } from "@/api/types";

/** Chiffres de l'« Aperçu de l'Équipe Dirigeante », dans l'ordre des lignes du tableau. */
export const LEADERSHIP_STAT_KEYS = ["age", "years_in_role", "years_in_company", "total_experience", "team_managers"] as const;
export type LeadershipStatKey = (typeof LEADERSHIP_STAT_KEYS)[number];

export const LEADERSHIP_STAT_LABELS: Record<LeadershipStatKey, string> = {
  age: "dashboard.companyAdmin.age",
  years_in_role: "dashboard.companyAdmin.yearsInRole",
  years_in_company: "dashboard.companyAdmin.yearsInCompany",
  total_experience: "dashboard.companyAdmin.totalExperience",
  team_managers: "dashboard.companyAdmin.teamHeadcount",
};

/** Ligne dirigeante d'une entreprise : celle qu'elle a fixée elle-même
 * (`leadership_rank`), sinon tous ses managers. Le rang 0 désigne ceux qui se
 * tiennent au côté du dirigeant, sur la ligne du haut. */
export function leadershipLine(members: UserRecord[], rootId: number | undefined) {
  const ranked = members
    .filter((m) => m.id !== rootId && m.leadership_rank != null)
    .sort((a, b) => a.leadership_rank! - b.leadership_rank!);
  return {
    partners: ranked.filter((m) => m.leadership_rank === 0),
    directors: ranked.length ? ranked.filter((m) => m.leadership_rank! > 0) : members.filter((m) => m.role === "MANAGER"),
  };
}

/** Valeur affichée : celle saisie par le dirigeant quand elle existe, sinon
 * celle calculée depuis les dates de carrière ou l'effectif de l'équipe. */
export function leadershipStat(person: UserRecord, key: LeadershipStatKey, headcount?: number | null): number | null {
  const typed = person.leadership_stats?.[key];
  if (typed != null) return typed;
  switch (key) {
    case "age":
      return person.age;
    case "years_in_role":
      return person.years_in_current_role;
    case "years_in_company":
      return person.years_in_company;
    case "total_experience":
      return person.total_experience_years;
    default:
      return headcount ?? null;
  }
}
