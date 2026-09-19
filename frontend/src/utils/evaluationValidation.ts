import { describeApiError } from "@/utils/apiError";

/** AAAA-MM-JJ -> JJ/MM/AAAA pour les messages (la date brute déroute l'utilisateur). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Un nombre tel qu'on l'écrit en français : « 3,5 ». */
export function fmtNum(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

/** Hors de l'intervalle [min, max] — faux pour une saisie vide ou non numérique. */
export function outOfRange(value: number | "" | null | undefined, min: number, max: number): boolean {
  return typeof value === "number" && !Number.isNaN(value) && (value < min || value > max);
}

/** Motif lisible d'un échec d'API, pour les écrans qui l'affichent eux-mêmes. */
export function apiMessage(err: unknown): string {
  const info = describeApiError(err);
  return `${info.title} : ${info.reasons.join(" ")}`;
}

/** Liste de noms pour un message : les premiers, puis « et N autres ». */
export function nameList(names: string[], others: (n: number) => string, max = 4): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} ${others(names.length - max)}`;
}

/** Plus d'une décimale (les notes et scores sont stockés au dixième). */
export function hasExtraDecimals(value: number, decimals = 1): boolean {
  const factor = 10 ** decimals;
  return Math.abs(value * factor - Math.round(value * factor)) > 1e-9;
}
