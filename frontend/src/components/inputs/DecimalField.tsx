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
  placeholder,
  error,
  width,
  fullWidth,
  sx,
  ariaLabel,
  min,
  max,
  decimals,
  disabled,
}: {
  value: number | "" | null;
  onChange: (value: number | "") => void;
  label?: string;
  helperText?: string;
  placeholder?: string;
  error?: boolean;
  width?: number;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  ariaLabel?: string;
  disabled?: boolean;
  /** Bornes de saisie. Une frappe qui en sortirait n'est pas prise : le champ
   *  reste ce qu'il était, plutôt que d'accepter une valeur que le serveur
   *  refusera. Ce refus au clavier ne convient qu'à un intervalle dont aucune
   *  valeur valide ne commence par un nombre hors bornes — c'est le cas d'un
   *  barème 1 à 5, où rien de valide ne débute par 0. */
  min?: number;
  max?: number;
  /** Nombre maximal de décimales, à accorder avec la colonne : au-delà, le
   *  serveur refuse l'enregistrement. */
  decimals?: number;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  // Avec un nombre de décimales imposé, la valeur relâchée garde ses zéros :
  // « 4.0 » ne doit pas redevenir « 4 » quand on quitte la cellule.
  const formatted =
    value === "" || value === null ? "" : decimals !== undefined ? value.toFixed(decimals) : String(value);
  const shown = typing ?? formatted;
  return (
    <TextField
      size="small"
      label={label}
      value={shown}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
      disabled={disabled}
      inputProps={{ inputMode: "decimal", ...(ariaLabel ? { "aria-label": ariaLabel } : {}) }}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        // Frappe refusée : l'état ne bouge pas, le champ reste ce qu'il était.
        if (!DECIMAL_INPUT.test(raw)) return;
        if (decimals !== undefined) {
          const frac = raw.replace(SPACES, "").replace(",", ".").split(".")[1] ?? "";
          if (frac.length > decimals) return;
        }
        const parsed = parseDecimalInput(raw);
        if (
          typeof parsed === "number" &&
          ((min !== undefined && parsed < min) || (max !== undefined && parsed > max))
        ) {
          return;
        }
        setTyping(raw);
        onChange(parsed);
      }}
      onBlur={() => setTyping(null)}
      sx={{ ...(width ? { width } : {}), ...sx }}
    />
  );
}
