/* ---------------------------------------------------------------------------
 * Login2 — les pictogrammes des dix modules.
 *
 * Redessinés au trait dans le style de la planche ID-PMC : contour blanc fin,
 * bouts arrondis, aucun aplat. Chacun dit ce que fait son module — c'est ce qui
 * remplit la brique, et ce qui rend la planche lisible avant même de lire les
 * libellés. Dessins originaux : la planche source n'est pas vectorielle.
 * ------------------------------------------------------------------------- */

import type { ReactNode } from "react";

/** Tête + épaules, la silhouette qui revient dans la moitié des modules. */
function Person(props: { cx: number; cy: number; r?: number; spread?: number }) {
  const { cx, cy, r = 2.1, spread = 3 } = props;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} />
      <path d={`M${cx - spread},${cy + spread + 1.4} a${spread},${spread} 0 0 1 ${spread * 2},0`} />
    </>
  );
}

/** Roue dentée : le pivot graphique des modules d'analyse et d'évaluation. */
function Gear(props: { cx: number; cy: number; r: number; teeth?: number }) {
  const { cx, cy, r, teeth = 8 } = props;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} />
      {Array.from({ length: teeth }, (_, i) => {
        const a = (i * 2 * Math.PI) / teeth;
        const c = Math.cos(a);
        const s = Math.sin(a);
        return (
          <path
            key={i}
            d={`M${(cx + c * (r + 0.7)).toFixed(2)},${(cy + s * (r + 0.7)).toFixed(2)} L${(
              cx + c * (r + 2.1)
            ).toFixed(2)},${(cy + s * (r + 2.1)).toFixed(2)}`}
          />
        );
      })}
    </>
  );
}

/** Pictogramme de chaque module, sur une grille 24 × 24. */
export const TILE_ICONS: Record<number, ReactNode> = {
  // 1 — Cohésion : deux personnes et la boucle d'échange entre elles.
  1: (
    <>
      <Person cx={6} cy={6} r={2.1} spread={2.8} />
      <Person cx={18} cy={6} r={2.1} spread={2.8} />
      <path d="M6.5,16.5 C9,14 15,14 17.5,16.5" />
      <path d="M17.5,16.5 L14.6,16.1 M17.5,16.5 L17.1,13.6" />
      <path d="M17.5,20 C15,22.5 9,22.5 6.5,20" />
      <path d="M6.5,20 L9.4,20.4 M6.5,20 L6.9,22.9" />
    </>
  ),
  // 2 — Performances de l'équipe : un rouage relié à ses quatre satellites.
  2: (
    <>
      <Gear cx={12} cy={12} r={3.2} teeth={8} />
      <circle cx={4} cy={4} r={1.5} />
      <circle cx={20} cy={4} r={1.5} />
      <circle cx={4} cy={20} r={1.5} />
      <circle cx={20} cy={20} r={1.5} />
      <path d="M5.4,5.4 L9.2,9.2 M18.6,5.4 L14.8,9.2 M5.4,18.6 L9.2,14.8 M18.6,18.6 L14.8,14.8" />
    </>
  ),
  // 3 — ID-3A : le paperboard d'analyse et ses trois barres.
  3: (
    <>
      <rect x="2.5" y="2.5" width="19" height="13.5" rx="1.2" />
      <path d="M7,13 V9.5 M12,13 V7 M17,13 V10.5" />
      <path d="M12,16 V19" />
      <path d="M8,22 L12,19 L16,22" />
    </>
  ),
  // 4 — Talent Perf Dashboard : l'écran, ses barres et son camembert.
  4: (
    <>
      <rect x="2" y="3.5" width="20" height="13.5" rx="1.4" />
      <path d="M9.5,21 H14.5 M12,17 V21" />
      <path d="M5.6,14 V10.5 M8.4,14 V7.8" />
      <circle cx="16.4" cy="10.4" r="3.3" />
      <path d="M16.4,10.4 V7.1 M16.4,10.4 L19.3,11.9" />
    </>
  ),
  // 5 — Carte d'Identité Performance : l'équipe, et la loupe posée dessus.
  5: (
    <>
      <Person cx={6} cy={5.5} r={1.8} spread={2.4} />
      <Person cx={12} cy={4.6} r={1.8} spread={2.4} />
      <Person cx={18} cy={5.5} r={1.8} spread={2.4} />
      <circle cx="10" cy="16.5" r="4.2" />
      <path d="M13.1,19.5 L16.8,22.4" />
      <path d="M8.2,16.5 H11.8 M10,14.7 V18.3" />
    </>
  ),
  // 7 — Priorités & Objectifs : le porte-voix et sa portée.
  7: (
    <>
      <path d="M3,10 L13,5.6 V18.4 L3,14 Z" />
      <path d="M3,10 H2 A1.4,1.4 0 0 0 0.6,11.4 V12.6 A1.4,1.4 0 0 0 2,14 H3" />
      <path d="M6.5,15.2 V19.5" />
      <path d="M16.2,8.6 A5.2,5.2 0 0 1 16.2,15.4" />
      <path d="M19,6 A9,9 0 0 1 19,18" />
    </>
  ),
  // 8 — Plan d'actions : la trajectoire, ses obstacles et son but.
  8: (
    <>
      <path d="M2.5,20 C6.5,20 7.5,9.5 12.5,9.5 C16.5,9.5 17.5,13.5 20.5,6.5" />
      <path d="M20.5,6.5 L17.4,7.6 M20.5,6.5 L21.2,9.7" />
      <path d="M6.4,5.4 L9.2,8.2 M9.2,5.4 L6.4,8.2" />
      <path d="M15.4,16.6 L18.2,19.4 M18.2,16.6 L15.4,19.4" />
    </>
  ),
  // 9 — Implémentation : le document, et l'organisation qu'il met en place.
  9: (
    <>
      <path d="M4.5,2.5 H14 L19.5,8 V20.4 A1.1,1.1 0 0 1 18.4,21.5 H4.5 A1.1,1.1 0 0 1 3.4,20.4 V3.6 A1.1,1.1 0 0 1 4.5,2.5 Z" />
      <path d="M14,2.5 V8 H19.5" />
      <rect x="9.6" y="10" width="4.2" height="2.4" rx="0.6" />
      <path d="M11.7,12.4 V14.2 M7,14.2 H16.4 M7,14.2 V15.8 M16.4,14.2 V15.8" />
      <rect x="5.6" y="15.8" width="2.8" height="2.2" rx="0.6" />
      <rect x="15" y="15.8" width="2.8" height="2.2" rx="0.6" />
    </>
  ),
  // 10 — Évaluation : le réglage appliqué à toute l'équipe.
  10: (
    <>
      <Gear cx={12} cy={5} r={2.3} teeth={8} />
      <path d="M12,9.4 V11.4 M4.5,11.4 H19.5 M4.5,11.4 V13.4 M12,11.4 V13.4 M19.5,11.4 V13.4" />
      <Person cx={4.5} cy={15.6} r={1.7} spread={2.3} />
      <Person cx={12} cy={15.6} r={1.7} spread={2.3} />
      <Person cx={19.5} cy={15.6} r={1.7} spread={2.3} />
    </>
  ),
};
