import type { Department } from "@/api/types";

export interface DepartmentOption {
  /** Nom du département, tel que porté par les évaluations. */
  name: string;
  /** Vrai pour un service : l'option est décalée sous sa direction. */
  isService: boolean;
}

/**
 * Options du filtre Département : chaque direction, immédiatement suivie de
 * ses services. Tant qu'aucun service n'existe, la liste est exactement celle
 * d'avant — les directions par ordre alphabétique.
 *
 * `names` reste la source de vérité de ce qui est proposé (les départements
 * réellement présents dans les données affichées) ; les enregistrements ne
 * servent qu'à en donner l'ordre et la hiérarchie.
 */
export function orderedDepartmentOptions(records: Department[], names: string[]): DepartmentOption[] {
  const present = new Set(names);
  const byName = new Map(records.map((d) => [d.name, d]));
  const directions = records
    .filter((d) => d.parent === null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const ordered: DepartmentOption[] = [];
  const seen = new Set<string>();
  directions.forEach((direction) => {
    const services = records
      .filter((d) => d.parent === direction.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    // Une direction vide de collaborateurs reste affichée si l'un de ses
    // services en a : sans elle, le service apparaîtrait décalé sous rien.
    const hasContent = present.has(direction.name) || services.some((s) => present.has(s.name));
    if (!hasContent) return;
    ordered.push({ name: direction.name, isService: false });
    seen.add(direction.name);
    services.forEach((s) => {
      if (!present.has(s.name)) return;
      ordered.push({ name: s.name, isService: true });
      seen.add(s.name);
    });
  });

  // Départements présents dans les données mais absents des enregistrements
  // (chargement partiel, département supprimé depuis) : jamais escamotés.
  names
    .filter((n) => !seen.has(n))
    .sort((a, b) => a.localeCompare(b))
    .forEach((n) => ordered.push({ name: n, isService: byName.get(n)?.parent != null }));

  return ordered;
}

/**
 * Départements couverts par un choix : une direction entraîne ses services,
 * un service ne couvre que lui-même. Sans service, la portée se réduit au
 * département choisi — le comportement d'origine.
 */
export function departmentScopeNames(records: Department[], selected: string): string[] {
  if (!selected) return [];
  const record = records.find((d) => d.name === selected);
  if (!record || record.parent !== null) return [selected];
  const services = records.filter((d) => d.parent === record.id).map((d) => d.name);
  return [selected, ...services];
}
