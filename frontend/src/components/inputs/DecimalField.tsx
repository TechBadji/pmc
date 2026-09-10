import { TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { useState } from "react";

/** Espaces de groupement des milliers : l'espace fine insécable et l'espace
 *  insécable arrivent tels quels d'un collage depuis un tableur, où
 *  « 1 250,5 » s'écrit avec l'une ou l'autre selon l'outil. */
const SPACES = /[\s\u00a0\u202f]/g;

/** Ce qu'on laisse taper : des chiffres et des espaces, un seul séparateur
 *  décimal. La règle est celle que le serveur applique à la réception, pour
 *  qu'aucune frappe acceptée ici ne soit refusée là-bas, et inversement. */
export const DECIMAL_INPUT = /^[\d\s\u00a0\u202f]*(?:[.,][\d\s\u00a0\u202f]*)?$/;

/** Une valeur saisie, virgule ou point. « 2,4 » est la forme naturelle en
 *  français et doit valoir « 2.4 ». */
export function parseDecimalInput(raw: string): number | "" {
  const normalized = raw.replace(SPACES, "").replace(",", ".");
  if (normalized === "" || normalized === ".") return "";
  const value = Number(normalized);
  return Number.isNaN(value) ? "" : value;
}

/**
 * Saisie d'un nombre décimal — note, coefficient, valeur cible ou réalisée.
 *
 * `type="number"` a été abandonné pour ces champs. Le navigateur y filtre
 * lui-même les caractères selon sa locale : une virgule tapée sur un poste
 * configuré en anglais ne parvenait jamais au code — `value` arrivait vide —
 * et la valeur se trouvait effacée sans que rien ne le signale. Un champ texte
 * laisse passer la frappe, et c'est nous qui décidons ce qui est un nombre.
 * `inputMode` conserve le pavé numérique sur mobile, et le filtre remplace les
 * flèches d'incrémentation qu'il fallait masquer en CSS.
 *
 * La chaîne en cours de frappe est conservée telle quelle : sans elle, « 2, »
 * repasserait par un nombre et redeviendrait « 2 » sous le doigt de
 * l'utilisateur, qui ne pourrait alors jamais saisir de décimale. Elle est
 * relâchée à la sortie du champ, où la valeur normalisée reprend la main.
 */
export function DecimalField({
  value,
  onChange,
  label,
  helperText,
  error,
  width,
  fullWidth,
  sx,
  ariaLabel,
}: {
  value: number | "" | null;
  onChange: (value: number | "") => void;
  label?: string;
  helperText?: string;
  error?: boolean;
  width?: number;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  ariaLabel?: string;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? (value === "" || value === null ? "" : String(value));
  return (
    <TextField
      size="small"
      label={label}
      value={shown}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
      inputProps={{ inputMode: "decimal", ...(ariaLabel ? { "aria-label": ariaLabel } : {}) }}
      onChange={(e) => {
        const raw = e.target.value;
        // Frappe refusée : l'état ne bouge pas, le champ reste ce qu'il était.
        if (!DECIMAL_INPUT.test(raw)) return;
        setTyping(raw);
        onChange(parseDecimalInput(raw));
      }}
      onBlur={() => setTyping(null)}
      sx={{ ...(width ? { width } : {}), ...sx }}
    />
  );
}
