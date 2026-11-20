import { useState } from "react";

/**
 * Logo PMC animé, découpé dans l'image officielle (aucun redessin) :
 * le P, le M et le C se dressent l'un après l'autre en 3D, la tête du
 * personnage du M tombe à sa place avec un rebond, puis un reflet glisse sur
 * le logo, et repasse de loin en loin pour garder la page vivante.
 * Au survol, la séquence se rejoue.
 */
export const SRC = "/v2/pmc-logo-alpha.png"; // logo officiel, fond blanc rendu transparent

// Zones de l'image (en % de 986 × 498) : chaque lettre, et la tête du M à part.
export const PARTS = [
  { k: "p", clip: "inset(0 71% 0 0)", delay: 0 },
  { k: "m", clip: "polygon(26% 0, 45.5% 0, 45.5% 22%, 55.5% 22%, 55.5% 0, 73% 0, 73% 100%, 26% 100%)", delay: 110 },
  { k: "c", clip: "inset(0 0 0 68%)", delay: 220 },
];

export default function AnimatedLogo({ height = 32, sheen = true, label = "ID-PMC" }: { height?: number; sheen?: boolean; label?: string }) {
  const [run, setRun] = useState(0);
  return (
    <span
      className="v2-alogo"
      role="img"
      aria-label={label}
      style={{ height, width: (height * 986) / 498 }}
      onMouseEnter={() => setRun((n) => n + 1)}
    >
      <span className="v2-alogo-in" key={run}>
        {PARTS.map((p) => (
          <span
            key={p.k}
            className="v2-alogo-part"
            style={{ backgroundImage: `url(${SRC})`, clipPath: p.clip, animationDelay: `${p.delay}ms` }}
          />
        ))}
        <span
          className="v2-alogo-part v2-alogo-head"
          style={{ backgroundImage: `url(${SRC})`, clipPath: "inset(0 44.5% 78% 45.5%)" }}
        />
        {sheen && <span className="v2-alogo-sheen" style={{ WebkitMaskImage: `url(${SRC})`, maskImage: `url(${SRC})` }} />}
      </span>
    </span>
  );
}
