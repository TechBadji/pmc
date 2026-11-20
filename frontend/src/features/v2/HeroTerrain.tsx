import { useEffect, useRef } from "react";
// Moteur d'effets de taste-skill (copié tel quel, sans dépendance) et son relief en points.
import { mount } from "./fx/fx.js";
import dotTerrain from "./fx/dot-terrain/effect.js";

/**
 * Relief 3D en points derrière l'en-tête : la terre « scannée » ondule
 * lentement, crêtes à l'orange de marque. L'Altitude de la méthode, rendue
 * en paysage. Le moteur gère seul le repli CSS (pas de WebGL), la pause hors
 * écran et l'image fixe sous « réduire les animations ».
 */
export default function HeroTerrain() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ctrl: { destroy(): void } | null = null;
    let dead = false;
    mount(el, dotTerrain, {
      palette: { bg: "#f6f4ee", surface: "#edeae0", ink: "#1f6e77", muted: "#7c9295", accent: "#e08d3c" },
      params: {
        horizon: 0.42,
        spacing: 16,
        dot: 2.6,
        amplitude: 0.2,
        waveScale: 0.7,
        speed: 0.06,
        opacity: 0.85,
        crest: 0.9,
        fog: 0.55,
        haze: 0.5,
        calm: 0.92, // les points s'effacent sous le titre
        calmX: 0.22,
        calmY: 0.45,
      },
      seed: 7,
    })
      .then((c: { destroy(): void }) => {
        if (dead) c.destroy();
        else ctrl = c;
      })
      .catch(() => {});
    return () => {
      dead = true;
      ctrl?.destroy();
    };
  }, []);
  return <div ref={ref} className="v2-terrain" aria-hidden="true" />;
}
