import { useCallback, useState } from "react";

/** Un point à corriger avant d'enregistrer. */
export interface ValidationIssue {
  message: string;
  /** Champ concerné, pour le mettre en évidence quand l'écran sait le faire. */
  field?: string;
}

/** `[problème constaté, message]` — le message est affiché quand le premier terme est vrai. */
export type Rule = readonly [boolean, string] | readonly [boolean, string, string] | null | false | undefined;

/** Convertit un décimal saisi à la française (« 3,5 ») ; NaN si le texte n'en est pas un. */
export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || String(value).trim() === "") return NaN;
  return Number(String(value).replace(/\s/g, "").replace(",", "."));
}

export function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/** Date au format AAAA-MM-JJ réellement existante (le 31/02 est refusé). */
export function isRealDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Contrôle d'un formulaire avant l'enregistrement : `check` évalue les règles,
 * retient celles qui échouent et dit s'il faut s'arrêter. Les points restent
 * affichés (avec `<ValidationSummary>`) jusqu'à la prochaine tentative. */
export function useIssues() {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const check = useCallback((rules: Rule[]): boolean => {
    const found: ValidationIssue[] = [];
    for (const rule of rules) {
      if (rule && rule[0]) found.push({ message: rule[1], field: rule[2] });
    }
    setIssues(found);
    return found.length === 0;
  }, []);

  const clear = useCallback(() => setIssues([]), []);
  const has = useCallback((field: string) => issues.some((i) => i.field === field), [issues]);
  const messageFor = useCallback((field: string) => issues.find((i) => i.field === field)?.message, [issues]);

  return { issues, check, clear, has, messageFor };
}
