import { Box } from "@mui/material";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PHASE_COLORS, PMC_MODULES, type PmcModule } from "./pmcModules";

/**
 * Illustration interactive du panneau de connexion : relecture abstraite du
 * canevas ID-PMC. Survoler (ou parcourir aux flèches) une tuile en révèle le
 * nom et le rôle — c'est le seul endroit du produit où la méthode se présente
 * avant que l'utilisateur soit entré.
 *
 * Ce n'est volontairement pas une reprise du visuel source : la grille 4×3 y
 * devient une couronne de neuf tuiles autour du noyau 6, et les trois phases
 * de la méthode sont portées par les arcs extérieurs au lieu du bandeau
 * horizontal de la plaquette. Le rendu « glossy » des tuiles (dégradé vertical
 * + reflet supérieur + ombre portée) reprend en revanche fidèlement
 * l'esthétique embossée de la marque.
 */

const CENTER = 210;
const RING_COUNT = 9;
const STEP = 360 / RING_COUNT;
const TILE_RADIUS = 148; // distance centre → centre de tuile
const TILE_SIZE = 62;
const CORE_RADIUS = 86;
const ARC_RADIUS = 198;

/** Tuile i à midi + i × 40°, gardée droite pour que les chiffres restent lisibles. */
function tilePosition(index: number) {
  const angle = ((-90 + index * STEP) * Math.PI) / 180;
  return {
    x: CENTER + TILE_RADIUS * Math.cos(angle) - TILE_SIZE / 2,
    y: CENTER + TILE_RADIUS * Math.sin(angle) - TILE_SIZE / 2,
  };
}

function polar(degrees: number, radius: number) {
  const a = (degrees * Math.PI) / 180;
  return `${(CENTER + radius * Math.cos(a)).toFixed(2)} ${(CENTER + radius * Math.sin(a)).toFixed(2)}`;
}

function arc(from: number, to: number) {
  const large = to - from > 180 ? 1 : 0;
  return `M ${polar(from, ARC_RADIUS)} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${large} 1 ${polar(to, ARC_RADIUS)}`;
}

/** Les trois phases, cadrées sur les tuiles qu'elles couvrent (1-3, 4-8, 9-10). */
const PHASE_ARCS = [
  { d: arc(-108, 6), color: PHASE_COLORS.analysis },
  { d: arc(14, 166), color: PHASE_COLORS.planning },
  { d: arc(174, 248), color: PHASE_COLORS.implementation },
];

/** Tuile mise en avant — écho du surlignage jaune « ID-Talent Perf Dashboard ». */
const FEATURED = 4;

export interface CanvasMotifProps {
  /** Numéro du module survolé ou focalisé, `null` quand rien n'est actif. */
  onActiveChange?: (moduleNumber: number | null) => void;
}

function CanvasMotifBase({ onActiveChange }: CanvasMotifProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  /** Module épinglé au clic / à Entrée : la légende y reste après la souris. */
  const [pinned, setPinned] = useState<number | null>(null);
  // Tabindex tournant : le groupe ne prend qu'un seul arrêt de tabulation,
  // la navigation entre modules se fait ensuite aux flèches.
  const [rovingIndex, setRovingIndex] = useState(0);
  const itemRefs = useRef<(SVGGElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  const active = hovered ?? focused ?? pinned;

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  // Le focus est posé *après* le rendu : appelé dans le gestionnaire, il
  // viserait un élément qui porte encore `tabindex="-1"` et le navigateur
  // laisserait le focus retomber sur le body.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    itemRefs.current[target]?.focus();
  }, [rovingIndex]);

  const focusItem = useCallback((index: number) => {
    const next = (index + PMC_MODULES.length) % PMC_MODULES.length;
    pendingFocus.current = next;
    setRovingIndex(next);
  }, []);

  const togglePinned = useCallback((moduleNumber: number) => {
    setPinned((current) => (current === moduleNumber ? null : moduleNumber));
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGGElement>, module: PmcModule, index: number) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        togglePinned(module.n);
        return;
      }
      const moves: Record<string, number> = {
        ArrowRight: index + 1,
        ArrowDown: index + 1,
        ArrowLeft: index - 1,
        ArrowUp: index - 1,
        Home: 0,
        End: PMC_MODULES.length - 1,
      };
      const target = moves[event.key];
      if (target === undefined) return;
      event.preventDefault();
      focusItem(target);
    },
    [focusItem, togglePinned]
  );

  /** Attributs communs aux dix cibles (neuf tuiles + le noyau). */
  function interactiveProps(module: PmcModule, index: number) {
    const classes = ["pmc-item"];
    if (active === module.n) classes.push("pmc-item-active");
    if (pinned === module.n) classes.push("pmc-item-pinned");
    return {
      ref: (el: SVGGElement | null) => {
        itemRefs.current[index] = el;
      },
      role: "button",
      tabIndex: index === rovingIndex ? 0 : -1,
      "aria-pressed": pinned === module.n,
      "aria-label": `${module.n} · ${t(`login.canvas.m${module.n}.name`)}. ${t(
        `login.canvas.m${module.n}.role`
      )}`,
      onMouseEnter: () => setHovered(module.n),
      onMouseLeave: () => setHovered(null),
      onFocus: () => {
        setFocused(module.n);
        setRovingIndex(index);
      },
      onBlur: () => setFocused(null),
      onClick: () => togglePinned(module.n),
      onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => handleKeyDown(e, module, index),
      className: classes.join(" "),
    };
  }

  return (
    <Box
      component="svg"
      viewBox="0 0 420 420"
      role="group"
      aria-label={t("login.canvas.groupLabel")}
      sx={{
        width: "100%",
        height: "auto",
        maxWidth: 420,
        overflow: "visible",
        "@keyframes pmc-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "@keyframes pmc-pulse": {
          "0%, 100%": { opacity: 0.55 },
          "50%": { opacity: 1 },
        },
        "& .pmc-orbit": {
          transformOrigin: "210px 210px",
          animation: "pmc-spin 90s linear infinite",
        },
        "& .pmc-featured": { animation: "pmc-pulse 3.2s ease-in-out infinite" },
        "& .pmc-item": {
          cursor: "pointer",
          transformBox: "fill-box",
          transformOrigin: "center",
          transition: "transform 160ms cubic-bezier(0.16, 1, 0.3, 1)",
          outline: "none",
        },
        "& .pmc-item-active": { transform: "scale(1.08)" },
        // Anneau de focus dessiné en SVG : `outline` ne suit pas la forme des tuiles.
        "& .pmc-item:focus-visible .pmc-ring, & .pmc-item-pinned .pmc-ring": { opacity: 1 },
        "& .pmc-item-active .pmc-edge": { stroke: "#FFFFFF", strokeOpacity: 1 },
        "@media (prefers-reduced-motion: reduce)": {
          "& .pmc-orbit, & .pmc-featured": { animation: "none" },
          "& .pmc-item": { transition: "none" },
        },
      }}
    >
      <defs>
        <linearGradient id="pmcTile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5CC4CC" />
          <stop offset="55%" stopColor="#3FA3AC" />
          <stop offset="100%" stopColor="#26808A" />
        </linearGradient>
        <radialGradient id="pmcCore" cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#69CDD4" />
          <stop offset="60%" stopColor="#3FA3AC" />
          <stop offset="100%" stopColor="#1F6E77" />
        </radialGradient>
        <linearGradient id="pmcGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id="pmcLift" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0B3B41" floodOpacity="0.42" />
        </filter>
      </defs>

      {/* Arcs de phase — la seule information portée par la couleur ici */}
      {PHASE_ARCS.map((phase) => (
        <path
          key={phase.d}
          d={phase.d}
          fill="none"
          stroke={phase.color}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}

      {/* Couronne en rotation très lente autour du noyau */}
      <circle
        className="pmc-orbit"
        cx={CENTER}
        cy={CENTER}
        r={104}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.3}
        strokeWidth={2}
        strokeDasharray="3 14"
        strokeLinecap="round"
      />

      {PMC_MODULES.map((module, index) => {
        if (module.ringIndex === null) {
          // Module 6 — le noyau « Vision, Missions, Valeurs »
          return (
            <g key={module.n} {...interactiveProps(module, index)}>
              <g filter="url(#pmcLift)">
                <circle cx={CENTER} cy={CENTER} r={CORE_RADIUS} fill="url(#pmcCore)" />
                <circle
                  className="pmc-edge"
                  cx={CENTER}
                  cy={CENTER}
                  r={CORE_RADIUS - 1}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                />
              </g>
              <circle
                className="pmc-ring"
                cx={CENTER}
                cy={CENTER}
                r={CORE_RADIUS + 6}
                fill="none"
                stroke="#FCE83A"
                strokeWidth={3}
                opacity={0}
              />
              <g
                fill="#FFFFFF"
                textAnchor="middle"
                fontSize={19}
                fontWeight={700}
                fontFamily="inherit"
                pointerEvents="none"
              >
                <text x={CENTER} y={CENTER - 18}>
                  {t("login.canvas.m6.line1")}
                </text>
                <text x={CENTER} y={CENTER + 6}>
                  {t("login.canvas.m6.line2")}
                </text>
                <text x={CENTER} y={CENTER + 30}>
                  {t("login.canvas.m6.line3")}
                </text>
              </g>
            </g>
          );
        }

        const { x, y } = tilePosition(module.ringIndex);
        return (
          <g key={module.n} {...interactiveProps(module, index)}>
            <g filter="url(#pmcLift)">
              <rect x={x} y={y} width={TILE_SIZE} height={TILE_SIZE} rx={16} fill="url(#pmcTile)" />
              <rect
                className="pmc-edge"
                x={x + 1}
                y={y + 1}
                width={TILE_SIZE - 2}
                height={TILE_SIZE - 2}
                rx={15}
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity={0.45}
                strokeWidth={1.2}
              />
              <rect
                x={x + 4}
                y={y + 4}
                width={TILE_SIZE - 8}
                height={TILE_SIZE * 0.42}
                rx={12}
                fill="url(#pmcGloss)"
              />
            </g>
            <rect
              className="pmc-ring"
              x={x - 5}
              y={y - 5}
              width={TILE_SIZE + 10}
              height={TILE_SIZE + 10}
              rx={20}
              fill="none"
              stroke="#FCE83A"
              strokeWidth={3}
              opacity={0}
            />
            <text
              x={x + TILE_SIZE / 2}
              y={y + TILE_SIZE / 2 + 8}
              textAnchor="middle"
              fontSize={23}
              fontWeight={800}
              fontFamily="inherit"
              fill="#FFFFFF"
              fillOpacity={0.92}
              pointerEvents="none"
            >
              {module.n}
            </text>
            {module.n === FEATURED && (
              <rect
                className="pmc-featured"
                x={x + TILE_SIZE / 2 - 11}
                y={y + TILE_SIZE - 13}
                width={22}
                height={4}
                rx={2}
                fill="#FCE83A"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
    </Box>
  );
}

export default memo(CanvasMotifBase);
