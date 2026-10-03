import { GlobalStyles } from "@mui/material";

/**
 * Règles d'impression d'une fiche faite pour être remise : A4 paysage, sans le
 * cadre de l'application — menu, barre, et tout ce qui porte `pmc-no-print` —
 * et avec les aplats de couleur, que les navigateurs suppriment par défaut.
 *
 * Elles ne valent que tant que le composant est monté : chaque écran doté d'un
 * bouton Imprimer le pose lui-même, les autres s'impriment comme avant.
 */
export default function PrintStyles() {
  return (
    <GlobalStyles
      styles={{
        "@media print": {
          "@page": { size: "A4 landscape", margin: "8mm" },
          ".MuiDrawer-root, .MuiAppBar-root, .pmc-no-print": { display: "none !important" },
          "main.MuiBox-root": { padding: "0 !important" },
          "*": { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" },
        },
      }}
    />
  );
}
