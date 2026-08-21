import { Stack, Typography } from "@mui/material";
import type { Department } from "@/api/types";

export interface PersonOptionData {
  id: number;
  name: string;
  position?: string;
}

/** Entrée d'un sélecteur de collaborateur : le nom, puis sa fonction en gris.
 * Deux homonymes se distinguent, et le rôle de chacun se lit sans quitter la
 * liste. */
export default function PersonOption({ person }: { person: PersonOptionData }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ minWidth: 0 }}>
      <Typography variant="body2">{person.name}</Typography>
      {person.position && (
        <Typography variant="caption" color="text.secondary" noWrap>
          {person.position}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Ordre hiérarchique d'une liste de collaborateurs : les directeurs d'abord,
 * puis les chefs de service, puis le reste — chaque groupe par ordre
 * alphabétique. Le rang se lit dans les départements : est directeur celui qui
 * dirige une direction, chef de service celui qui dirige un service.
 */
export function rankPeopleByHierarchy<T extends PersonOptionData>(
  people: T[],
  departments: Department[]
): T[] {
  const directors = new Set(
    departments.filter((d) => d.parent === null && d.manager !== null).map((d) => d.manager)
  );
  const heads = new Set(
    departments.filter((d) => d.parent !== null && d.manager !== null).map((d) => d.manager)
  );
  const rank = (id: number) => (directors.has(id) ? 0 : heads.has(id) ? 1 : 2);
  return [...people].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
}
