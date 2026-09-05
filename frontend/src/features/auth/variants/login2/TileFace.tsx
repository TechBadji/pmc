/* ---------------------------------------------------------------------------
 * Login2 — la face d'une brique du canevas.
 *
 * Quatre éléments, comme sur la planche d'origine : le chiffre en contour avec
 * sa ligne de rappel, le pictogramme du module, le nom, et le rôle qui se
 * déplie au survol. Chacun se loge dans un coin libre — l'échancrure du cercle
 * en mange un sur les quatre briques centrales.
 *
 * Extraite parce qu'elle est rendue deux fois : dans le plateau, et à
 * l'endroit de la carte qui pivote.
 * ------------------------------------------------------------------------- */

import { Box, Typography } from "@mui/material";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { BoardModule } from "./boardModules";
import { TILE_ICONS } from "./tileIcons";
import { DISPLAY, TEXT, TILE } from "./tokens";

const EDGE_Y = "clamp(10px, 1.5vh, 18px)";
const EDGE_X = "clamp(12px, 1.4vw, 20px)";

/**
 * Sous 900px les briques ne font plus qu'une centaine de pixels de haut et
 * l'échancrure disparaît : chiffre en haut à droite, pictogramme en haut à
 * gauche pour tout le monde, et des tailles qui tiennent dans la brique. Les
 * coins calculés par module ne valent qu'à partir du plateau emboîté.
 */
function numeralCorner(corner: "tr" | "tl") {
  return {
    top: EDGE_Y,
    right: { xs: EDGE_X, md: corner === "tr" ? EDGE_X : "auto" },
    left: { xs: "auto", md: corner === "tl" ? EDGE_X : "auto" },
    alignItems: { xs: "flex-end", md: corner === "tr" ? "flex-end" : "flex-start" },
  };
}

function iconCorner(corner: "tl" | "bl" | "br", clearsLabel: boolean) {
  const raised = clearsLabel ? "clamp(52px, 7.4vh, 82px)" : EDGE_Y;
  return {
    top: { xs: EDGE_Y, md: corner === "tl" ? EDGE_Y : "auto" },
    bottom: { xs: "auto", md: corner === "tl" ? "auto" : raised },
    left: { xs: EDGE_X, md: corner === "br" ? "auto" : EDGE_X },
    right: { xs: "auto", md: corner === "br" ? EDGE_X : "auto" },
  };
}

/** Le nom passe en haut seulement quand l'échancrure lui prend le bas. */
function labelCorner(corner: "bl" | "tl") {
  return {
    top: { xs: "auto", md: corner === "tl" ? 0 : "auto" },
    bottom: { xs: 0, md: corner === "bl" ? 0 : "auto" },
    left: 0,
    right: 0,
  };
}

interface Props {
  module: Pick<BoardModule, "n" | "numeral" | "label" | "icon">;
  /** Le recto de la carte qui pivote n'affiche pas le rôle : il est déjà lu. */
  showRole?: boolean;
}

function TileFaceBase({ module, showRole = true }: Props) {
  const { t } = useTranslation();

  // Le pictogramme remonte au-dessus du nom quand celui-ci occupe le bas.
  const iconPosition = iconCorner(module.icon, module.label === "bl");

  return (
    <>
      {/* Le chiffre et sa ligne de rappel. La méthode ID-PMC est numérotée
          1→10 par son auteur : la séquence est réelle, pas décorative. */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          pointerEvents: "none",
          userSelect: "none",
          ...numeralCorner(module.numeral),
        }}
      >
        <Box
          sx={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontVariationSettings: `"wdth" 76`,
            fontSize: { xs: "2.3rem", md: "clamp(3rem, 12vh, 8.4rem)" },
            lineHeight: 0.76,
            color: "transparent",
            WebkitTextStroke: `2px ${TILE.numeral}`,
          }}
        >
          {module.n}
        </Box>
        <Box
          component="svg"
          viewBox="0 0 100 18"
          fill="none"
          stroke={TILE.numeral}
          strokeWidth={1.6}
          strokeLinecap="round"
          sx={{ display: { xs: "none", md: "block" }, width: "clamp(58px, 8vw, 104px)", height: "auto", mt: 0.6 }}
        >
          {module.numeral === "tr" ? (
            <>
              <path d="M97,1 V11 H9" />
              <circle cx="6" cy="11" r="2.6" fill={TILE.numeral} stroke="none" />
            </>
          ) : (
            <>
              <path d="M3,1 V11 H91" />
              <circle cx="94" cy="11" r="2.6" fill={TILE.numeral} stroke="none" />
            </>
          )}
        </Box>
      </Box>

      <Box
        className="l2-icon"
        component="svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={1.35}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        sx={{
          position: "absolute",
          ...iconPosition,
          width: { xs: 42, md: "clamp(62px, 12vh, 128px)" },
          height: "auto",
          opacity: 0.5,
          transition: "opacity 220ms ease",
          pointerEvents: "none",
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        }}
      >
        {TILE_ICONS[module.n]}
      </Box>

      <Box
        sx={{
          position: "absolute",
          ...labelCorner(module.label),
          p: "clamp(12px, 1.6vw, 20px)",
          pointerEvents: "none",
        }}
      >
        <Typography
          sx={{
            fontFamily: TEXT,
            fontWeight: 600,
            fontSize: "clamp(0.8rem, 1.02vw, 0.97rem)",
            lineHeight: 1.26,
            color: "#FFFFFF",
          }}
        >
          {t(`login.canvas.m${module.n}.name`)}
        </Typography>

        {showRole && (
          <Box
            className="l2-role"
            sx={{
              display: "grid",
              gridTemplateRows: "0fr",
              opacity: 0,
              transition: "grid-template-rows 260ms ease, opacity 220ms ease",
              "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
          >
            <Box sx={{ overflow: "hidden" }}>
              <Typography
                sx={{
                  fontFamily: TEXT,
                  fontSize: "clamp(0.72rem, 0.86vw, 0.81rem)",
                  lineHeight: 1.42,
                  color: "rgba(255,255,255,0.88)",
                  pt: 0.9,
                }}
              >
                {t(`login.canvas.m${module.n}.role`)}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
}

export default memo(TileFaceBase);
