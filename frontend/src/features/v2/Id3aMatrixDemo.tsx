import ReplayIcon from "@mui/icons-material/Replay";
import { useEffect, useRef, useState } from "react";

/**
 * Matrice ID-3A de démonstration, avec de vraies vignettes photo cerclées de
 * la couleur du palier de performance (comme dans le produit).
 *
 * Axes fidèles au produit : Attitude (Soft Skills) en abscisse, Aptitudes
 * (Hard Skills) en ordonnée — libellés jamais traduits.
 *
 * Ouverture en quatre temps (une fois, rejouable) :
 *   1. l'équipe apparaît réunie au centre, en ligne ;
 *   2. les axes se tracent, puis chacun rejoint sa place d'un bond :
 *      onde à l'arrivée, note d'Altitude qui s'affiche ;
 *   3. les quadrants se teintent, toutes les trajectoires se dessinent un instant ;
 *   4. l'équipe se présente tour à tour, jusqu'à ce que le visiteur prenne la main.
 *
 * Photos : Unsplash (licence gratuite), personnes d'exemple — prénoms et notes fictifs.
 */
export interface DemoPerson {
  id: string;
  name: string;
  role: string;
  hard: number; // 0..100
  soft: number; // 0..100
  prevHard: number;
  prevSoft: number;
  photo: string;
}

export const DEMO_PEOPLE: DemoPerson[] = [
  { id: "a", name: "Awa", role: "Responsable commerciale", hard: 86, soft: 70, prevHard: 70, prevSoft: 58, photo: "/v2/team/a.jpg" },
  { id: "b", name: "Moussa", role: "Analyste risques", hard: 86, soft: 32, prevHard: 78, prevSoft: 28, photo: "/v2/team/b.jpg" },
  { id: "c", name: "Fatou", role: "Chargée de clientèle", hard: 40, soft: 86, prevHard: 34, prevSoft: 74, photo: "/v2/team/c.jpg" },
  { id: "d", name: "Yao", role: "Contrôleur de gestion", hard: 66, soft: 60, prevHard: 52, prevSoft: 48, photo: "/v2/team/d.jpg" },
  { id: "e", name: "Kodjo", role: "Assistant juridique", hard: 26, soft: 30, prevHard: 31, prevSoft: 38, photo: "/v2/team/e.jpg" },
  { id: "f", name: "Ndeye", role: "Cheffe de projet SI", hard: 74, soft: 92, prevHard: 70, prevSoft: 81, photo: "/v2/team/f.jpg" },
  { id: "g", name: "Aïcha", role: "Gestionnaire sinistres", hard: 55, soft: 44, prevHard: 44, prevSoft: 40, photo: "/v2/team/g.jpg" },
];

export const altitudeOf = (p: Pick<DemoPerson, "hard" | "soft">) => Math.round((p.hard + p.soft) / 2);

/** Palier de performance d'après l'Altitude : la couleur cerclant la vignette. */
export function tierOf(alt: number) {
  if (alt >= 80) return { label: "Palier Excellence", color: "#2F7A33" };
  if (alt >= 65) return { label: "Palier Performant", color: "#1F6E77" };
  if (alt >= 50) return { label: "Palier En progression", color: "#E08D3C" };
  return { label: "Palier À accompagner", color: "#C2410C" };
}

export function quadrantOf(p: Pick<DemoPerson, "hard" | "soft">) {
  if (p.hard >= 50 && p.soft >= 50) return "Talents clés";
  if (p.hard >= 50) return "Experts techniques";
  if (p.soft >= 50) return "Potentiel relationnel";
  return "Zone de vigilance";
}

const QUADS = ["Experts techniques", "Talents clés", "Zone de vigilance", "Potentiel relationnel"];
/** Ordre de la visite et ce que chaque case dit de la performance. */
const TOUR = ["Talents clés", "Experts techniques", "Potentiel relationnel", "Zone de vigilance"];
const QINFO: Record<string, { color: string; x: number; y: number; text: string; act: string }> = {
  "Talents clés": { color: "#2F7A33", x: 75, y: 25, text: "Aptitudes et attitudes au rendez-vous.", act: "À fidéliser et à faire grandir." },
  "Experts techniques": { color: "#2E5AAC", x: 25, y: 25, text: "Solides sur le métier, moins sur le collectif.", act: "À accompagner sur les Soft Skills." },
  "Potentiel relationnel": { color: "#9333A8", x: 75, y: 75, text: "Moteurs pour l'équipe, techniques à consolider.", act: "À renforcer sur les Hard Skills." },
  "Zone de vigilance": { color: "#C2410C", x: 25, y: 75, text: "Aptitudes et attitudes en dessous des attentes.", act: "Plan d'actions prioritaire." },
};
const ORDER = ["e", "g", "b", "c", "d", "a", "f"]; // arrivées : du bas vers le sommet
const T_AXES = 900; // les axes se tracent
const T_MOVE = 1500; // premier départ
const GAP = [0, 170, 320, 450, 560, 660, 750];
const MOVE_MS = 950;
const T_REVEAL = T_MOVE + GAP[GAP.length - 1] + MOVE_MS + 100;
const T_READY = T_REVEAL + 1600;

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Phase = "lineup" | "axes" | "moving" | "reveal" | "ready";

export default function Id3aMatrixDemo() {
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>("lineup");
  const [selected, setSelected] = useState("a");
  const [auto, setAuto] = useState(true);
  // l'ouverture attend que la matrice soit vraiment à l'écran (le film passe avant elle)
  const fig = useRef<HTMLElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = fig.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (reducedMotion()) {
      setPhase("ready");
      return;
    }
    setPhase("lineup");
    if (!seen) return;
    const ids = [
      window.setTimeout(() => setPhase("axes"), T_AXES),
      window.setTimeout(() => setPhase("moving"), T_MOVE - 30),
      window.setTimeout(() => setPhase("reveal"), T_REVEAL),
      window.setTimeout(() => setPhase("ready"), T_READY),
    ];
    return () => ids.forEach((i) => window.clearTimeout(i));
  }, [run, seen]);

  // Le plateau vit en 3D : il ondule lentement, suit un peu la souris, et se
  // redresse (presque à plat au départ) pendant que l'équipe prend place.
  useEffect(() => {
    const el = plot.current;
    if (!el || reducedMotion()) {
      el?.style.setProperty("--rx", "18deg");
      return;
    }
    let raf = 0;
    let rx = 62;
    let ry = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const settled = phase !== "lineup";
      let tx = settled ? 18 + Math.sin(t * 0.55) * 3.5 : 58;
      let ty = settled ? Math.sin(t * 0.37) * 9 : -6;
      const p = pointer.current;
      if (p && settled) {
        tx = 18 - (p.y - 0.5) * 14;
        ty = (p.x - 0.5) * 22;
      }
      rx += (tx - rx) * (settled ? 0.07 : 0.1);
      ry += (ty - ry) * 0.05;
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const ready = phase === "ready";
  const placed = phase === "moving" || phase === "reveal" || ready;

  // Visite guidée : le focus passe de case en case, chacune dans sa couleur,
  // avec une bulle qui explique ce que la case dit de la performance. La
  // fiche montre le meilleur profil de la case. Un clic arrête la visite.
  const [qi, setQi] = useState(0);
  useEffect(() => {
    if (!ready || !auto || reducedMotion()) return;
    const go = (n: number) => {
      const q = TOUR[n % TOUR.length];
      setQi(n % TOUR.length);
      const best = DEMO_PEOPLE.filter((p) => quadrantOf(p) === q).sort((a, b) => altitudeOf(b) - altitudeOf(a))[0];
      if (best) setSelected(best.id);
    };
    go(0);
    let n = 0;
    const id = window.setInterval(() => go(++n), 4200);
    return () => window.clearInterval(id);
  }, [ready, auto]);

  const pick = (id: string) => {
    setAuto(false);
    setSelected(id);
    const p = DEMO_PEOPLE.find((x) => x.id === id);
    if (p) setQi(TOUR.indexOf(quadrantOf(p)));
  };
  const focusQ = TOUR[qi];
  const info = QINFO[focusQ];
  const inFocus = DEMO_PEOPLE.filter((p) => quadrantOf(p) === focusQ).length;

  const current = DEMO_PEOPLE.find((p) => p.id === selected)!;
  const alt = altitudeOf(current);
  const delta = alt - altitudeOf({ hard: current.prevHard, soft: current.prevSoft });
  const tier = tierOf(alt);

  return (
    <figure ref={fig} className="v2-matrix v2-mx" key={`m-${run}`} data-phase={phase} data-seen={seen} style={{ margin: 0 }} aria-label="Exemple de Matrice ID-3A">
      <div className="v2-matrix-head">
        <b>Matrice ID-3A</b>
        <span>
          <span className="v2-mhint">Équipe d'exemple · 7 collaborateurs</span>
          <button
            type="button"
            className="v2-replay"
            onClick={() => {
              setAuto(true);
              setSelected("a");
              setRun((n) => n + 1);
            }}
            aria-label="Rejouer l'animation"
          >
            <ReplayIcon sx={{ fontSize: 15 }} />
          </button>
        </span>
      </div>

      <div
        className="v2-plot v2-mx-plot"
        ref={plot}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          pointer.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        }}
        onPointerLeave={() => (pointer.current = null)}
      >
        {/* relief : l'Altitude monte vers les Talents clés */}
        <svg className="v2-relief" viewBox="0 0 100 77" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id="v2-peak" cx="88%" cy="10%" r="95%">
              <stop offset="0" stopColor="#7FD6DD" stopOpacity=".5" />
              <stop offset=".45" stopColor="#7FD6DD" stopOpacity=".14" />
              <stop offset="1" stopColor="#E08D3C" stopOpacity=".08" />
            </radialGradient>
          </defs>
          <rect className="v2-relief-fill" width="100" height="77" fill="url(#v2-peak)" />
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} className="v2-contour" cx="88" cy="8" rx={12 + i * 13} ry={9 + i * 10.5} pathLength={1} style={{ animationDelay: `${300 + i * 50}ms` }} />
          ))}
        </svg>

        <div className="v2-quads" aria-hidden="true">
          {QUADS.map((q) => (
            <div key={q} className="v2-quad" data-q={q} data-on={ready && focusQ === q} style={{ ["--qc" as string]: QINFO[q].color }}>
              {q}
            </div>
          ))}
        </div>

        {/* le focus qui passe de case en case */}
        {ready && (
          <span
            className="v2-mx-focus"
            aria-hidden="true"
            style={{ left: `${info.x - 25}%`, top: `${info.y - 25}%`, ["--qc" as string]: info.color }}
          />
        )}
        {ready && (
          <div
            className="v2-mx-bubble-anchor"
            /* la bulle se pose dans la case voisine (estompée) et pointe vers la case éclairée */
            style={{ left: `${info.x < 50 ? 54 : 4}%`, top: `${info.y < 50 ? 10 : 58}%`, ["--qc" as string]: info.color }}
            data-side={info.x < 50 ? "left" : "right"}
            role="status"
          >
            <div className="v2-mx-bubble" key={focusQ}>
              <b>{focusQ}</b>
              <span>{info.text}</span>
              <em>
                {info.act} · {inFocus} collaborateur{inFocus > 1 ? "s" : ""}
              </em>
            </div>
          </div>
        )}

        {/* axes : la croix se trace depuis le centre */}
        <span className="v2-mx-axis h" aria-hidden="true" />
        <span className="v2-mx-axis v" aria-hidden="true" />

        {/* trajectoires : toutes pendant la lecture, puis celle du collaborateur choisi */}
        <svg className="v2-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {(phase === "reveal" || ready) &&
            DEMO_PEOPLE.filter((p) => phase === "reveal" || p.id === current.id).map((p) => (
              <line
                key={`${p.id}-${phase === "reveal" ? "all" : current.id}`}
                x1={p.prevSoft}
                y1={100 - p.prevHard}
                x2={p.soft}
                y2={100 - p.hard}
                pathLength={1}
                stroke={tierOf(altitudeOf(p)).color}
              />
            ))}
        </svg>
        {ready && (
          <span key={`g-${current.id}`} className="v2-mx-ghost" style={{ left: `${current.prevSoft}%`, top: `${100 - current.prevHard}%` }} aria-hidden="true">
            <img src={current.photo} alt="" />
          </span>
        )}

        {/* ombres au sol, sous chaque photo */}
        {DEMO_PEOPLE.map((p) => (
          <span
            key={`sh-${p.id}`}
            className="v2-mx-shadow"
            style={{ left: `${placed ? p.soft : 12 + ORDER.indexOf(p.id) * (76 / 6)}%`, top: `${placed ? 100 - p.hard : 50}%`, transitionDelay: placed && phase === "moving" ? `${GAP[ORDER.indexOf(p.id)]}ms` : "0ms" }}
            aria-hidden="true"
          />
        ))}

        {DEMO_PEOPLE.map((p) => {
          const k = ORDER.indexOf(p.id);
          const lift = placed ? Math.round(16 + (altitudeOf(p) - 25) * 0.95) : 10; // plus l'Altitude est haute, plus la photo flotte haut
          const lineX = 12 + k * (76 / (DEMO_PEOPLE.length - 1));
          const t = tierOf(altitudeOf(p));
          const on = p.id === selected && ready;
          return (
            <button
              key={p.id}
              type="button"
              className="v2-mx-node"
              data-on={on}
              data-dim={ready && quadrantOf(p) !== focusQ}
              aria-pressed={on}
              aria-label={`${p.name}, ${p.role} : Aptitudes ${p.hard}, Attitude ${p.soft}, Altitude ${altitudeOf(p)}`}
              onClick={() => pick(p.id)}
              onMouseEnter={() => ready && pick(p.id)}
              onFocus={() => pick(p.id)}
              style={{
                left: `${placed ? p.soft : lineX}%`,
                top: `${placed ? 100 - p.hard : 50}%`,
                transitionDelay: placed && phase === "moving" ? `${GAP[k]}ms` : "0ms",
                zIndex: on ? 6 : Math.round(p.hard / 10),
                ["--tier" as string]: t.color,
                ["--k" as string]: k,
                ["--hop" as string]: `${GAP[k]}ms`,
                ["--z" as string]: `${lift}px`,
              }}
            >
              <span className="v2-mx-stem" aria-hidden="true" />
              <span className="v2-mx-bill">
                <span className="v2-mx-face">
                  <img src={p.photo} alt="" loading="eager" />
                </span>
                <span className="v2-mx-wave" />
                <span className="v2-mx-score">{altitudeOf(p)}</span>
              </span>
            </button>
          );
        })}

        <span className="v2-ax y" style={{ color: "var(--hard)" }}>APTITUDES (HARD SKILLS)</span>
        <span className="v2-ax x" style={{ color: "var(--soft)" }}>ATTITUDE (SOFT SKILLS)</span>
      </div>

      <div className="v2-card-person" aria-live="polite" data-ready={ready} style={{ position: "relative" }}>
        {ready && auto && <span className="v2-autoplay" key={`a-${current.id}`} aria-hidden="true" />}
        <div className="av" style={{ boxShadow: `0 0 0 2.5px ${tier.color}` }}>
          <img src={current.photo} alt="" />
        </div>
        <div key={current.id} className="v2-swap">
          <b>
            {current.name} · {current.role}
          </b>
          <span>
            <em style={{ color: tier.color }}>{tier.label}</em>
            {" · "}
            {quadrantOf(current)}
            {" · "}
            <em className={delta >= 0 ? "up" : "down"}>
              {delta >= 0 ? "+" : ""}
              {delta} pts
            </em>
          </span>
        </div>
        <div className="v2-scores" key={`s-${current.id}`}>
          <div className="v2-swap"><strong>{current.hard}</strong>Aptitudes</div>
          <div className="v2-swap"><strong>{current.soft}</strong>Attitude</div>
          <div className="v2-swap"><strong>{alt}</strong>Altitude</div>
        </div>
      </div>
    </figure>
  );
}
