import ReplayIcon from "@mui/icons-material/Replay";
import { useCallback, useEffect, useRef, useState } from "react";
import { PARTS, SRC } from "./AnimatedLogo";
import { toMap, WORLD_DOTS } from "./worldDots";

/**
 * L'histoire du logo, racontée en une dizaine de secondes, au ralenti :
 * des équipes, partout dans le monde, avancent chacune de leur côté. Le P
 * (People) part d'Afrique, le M (Management) des Amériques, le C (Canvas)
 * d'Asie : chaque lettre monte dans le ciel puis redescend lentement se
 * poser à sa place. En dernier, au centre, l'humain tombe du ciel. Un reflet
 * scelle le tout. Jouée une fois à l'entrée dans l'écran, rejouable.
 */
type Flight = {
  k: string;
  clip: string;
  from: [number, number] | null; // lon, lat — null : tombe du ciel, à la verticale
  cx: number; // centre de la lettre dans le logo (%)
  cy: number;
  at: number; // départ (ms)
  dur: number;
  color: string;
  spin: number;
};

const HEAD_CLIP = "inset(0 44.5% 78% 45.5%)";
const FLIGHTS: Flight[] = [
  { k: "p", clip: PARTS[0].clip, from: [3.4, 6.5], cx: 15, cy: 56, at: 1700, dur: 3400, color: "#E08D3C", spin: -28 },
  { k: "m", clip: PARTS[1].clip, from: [-60, 2], cx: 49, cy: 60, at: 3500, dur: 3400, color: "#4A97D0", spin: 22 },
  { k: "c", clip: PARTS[2].clip, from: [106, 25], cx: 84, cy: 52, at: 5300, dur: 3400, color: "#B12FB5", spin: -18 },
  { k: "h", clip: HEAD_CLIP, from: null, cx: 50, cy: 11, at: 8900, dur: 2300, color: "#4A97D0", spin: 0 },
];

const CAPTIONS = [
  { at: 0, text: "Partout dans le monde, des équipes avancent chacune de leur côté." },
  { at: 1700, text: "P comme People : les personnes d'abord, depuis l'Afrique." },
  { at: 3500, text: "M comme Management : l'art de les faire grandir, depuis les Amériques." },
  { at: 5300, text: "C comme Canvas : une méthode commune, depuis l'Asie." },
  { at: 8900, text: "Et au centre, toujours : l'humain." },
  { at: 11400, text: "Un seul canevas pour faire grandir toutes les équipes." },
];
const END = 11400;

function reduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function LogoStory() {
  const sec = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const parts = useRef<Record<string, HTMLSpanElement | null>>({});
  const [size, setSize] = useState({ w: 1440, h: 860 });
  const [paths, setPaths] = useState<{ k: string; d: string; color: string; ox: number; oy: number; at: number; dur: number }[]>([]);
  const [step, setStep] = useState(-1); // -1 : pas encore joué
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0); // remonte les tracés et les ondes à chaque lecture
  const timers = useRef<number[]>([]);
  const anims = useRef<Animation[]>([]);

  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    anims.current.forEach((a) => a.cancel());
    anims.current = [];
  };

  const play = useCallback(() => {
    const s = sec.current;
    const b = box.current;
    if (!s || !b) return;
    stop();
    setDone(false);
    const W = s.clientWidth;
    const H = s.clientHeight;
    setSize({ w: W, h: H });
    if (reduced()) {
      setStep(CAPTIONS.length - 1);
      setDone(true);
      return;
    }
    // la carte est posée en « slice » : même calcul que le navigateur
    const k = Math.max(W / 1000, H / 500);
    const offX = (W - 1000 * k) / 2;
    const offY = (H - 500 * k) / 2;
    const sr = s.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const bx = br.left - sr.left;
    const by = br.top - sr.top;

    const next: typeof paths = [];
    FLIGHTS.forEach((f) => {
      const el = parts.current[f.k];
      if (!el) return;
      const tx = bx + (f.cx / 100) * br.width; // où la lettre se pose
      const ty = by + (f.cy / 100) * br.height;
      let ox: number;
      let oy: number;
      if (f.from) {
        const m = toMap(f.from[0], f.from[1]);
        ox = offX + m.x * k;
        oy = offY + m.y * k;
      } else {
        ox = tx;
        oy = -260;
      }
      const skyX = ox + (tx - ox) * 0.55;
      const skyY = -Math.max(220, ty * 0.6); // au-dessus du cadre
      const dx = ox - tx;
      const dy = oy - ty;
      const sx = skyX - tx;
      const sy = skyY - ty;
      el.style.transformOrigin = `${f.cx}% ${f.cy}%`;
      const frames: Keyframe[] = f.from
        ? [
            { offset: 0, opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.06)`, filter: "blur(0px)" },
            { offset: 0.1, opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(0.14)`, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
            { offset: 0.42, opacity: 1, transform: `translate(${sx}px, ${sy}px) scale(0.5) rotate(${f.spin}deg)`, filter: "blur(1.5px)", easing: "cubic-bezier(0.25, 0, 0.05, 1)" },
            { offset: 0.9, transform: "translate(0px, 6px) scale(1.04, 0.95) rotate(0deg)", filter: "blur(0px)", easing: "cubic-bezier(0.34, 1.5, 0.64, 1)" },
            { offset: 1, opacity: 1, transform: "none", filter: "blur(0px)" },
          ]
        : [
            { offset: 0, opacity: 0, transform: `translate(0px, ${sy - 120}px) scale(0.7)`, easing: "cubic-bezier(0.3, 0, 0.1, 1)" },
            { offset: 0.15, opacity: 1 },
            { offset: 0.8, transform: "translate(0px, 4px) scale(1.06, 0.93)", easing: "cubic-bezier(0.34, 1.6, 0.64, 1)" },
            { offset: 1, opacity: 1, transform: "none" },
          ];
      const a = el.animate(frames, { duration: f.dur, delay: f.at, fill: "both" });
      anims.current.push(a);
      if (f.from) {
        next.push({
          k: f.k,
          color: f.color,
          ox,
          oy,
          at: f.at,
          dur: f.dur,
          d: `M ${ox} ${oy} Q ${ox + (skyX - ox) * 0.2} ${skyY} ${skyX} ${skyY * 0.6} T ${tx} ${ty}`,
        });
      }
    });
    setPaths(next);
    setRun((n) => n + 1);
    setStep(0);
    CAPTIONS.forEach((c, i) => timers.current.push(window.setTimeout(() => setStep(i), c.at)));
    timers.current.push(window.setTimeout(() => setDone(true), END));
  }, []);

  // joue une fois, quand la section est bien à l'écran
  useEffect(() => {
    const s = sec.current;
    if (!s) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.55 },
    );
    io.observe(s);
    return () => {
      io.disconnect();
      stop();
    };
  }, [play]);

  const playing = step >= 0;
  return (
    <section className="v2-story" ref={sec} aria-labelledby="story-title" data-playing={playing} data-done={done}>
      <svg className="v2-story-map" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {Array.from({ length: WORLD_DOTS.length / 2 }, (_, i) => (
          <circle key={i} cx={WORLD_DOTS[i * 2]} cy={WORLD_DOTS[i * 2 + 1]} r={1.5} />
        ))}
      </svg>

      <svg className="v2-story-trails" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true" key={`t-${run}`}>
        {paths.map((p) => (
          <g key={p.k}>
            <circle cx={p.ox} cy={p.oy} r={34} className="v2-story-pulse" style={{ stroke: p.color, animationDelay: `${p.at - 500}ms` }} />
            <circle cx={p.ox} cy={p.oy} r={6} className="v2-story-origin" style={{ fill: p.color, animationDelay: `${p.at - 500}ms` }} />
            <path
              d={p.d}
              pathLength={1}
              className="v2-story-trail"
              style={{ stroke: p.color, animationDelay: `${p.at + p.dur * 0.08}ms`, animationDuration: `${p.dur * 0.86}ms` }}
            />
          </g>
        ))}
      </svg>

      <div className="v2-story-center">
        <div className="v2-story-logo" ref={box} role="img" aria-label="Logo PMC">
          {/* le canevas : la feuille commune sur laquelle les lettres viennent se poser */}
          <span key={`c-${run}`} className="v2-story-canvas" aria-hidden="true" />
          {FLIGHTS.map((f) => (
            <span
              key={f.k}
              ref={(el) => (parts.current[f.k] = el)}
              className="v2-story-part"
              style={{ backgroundImage: `url(${SRC})`, clipPath: f.clip, opacity: playing || done ? undefined : 0 }}
            />
          ))}
          {FLIGHTS.filter((f) => f.from).map((f) => (
            <span
              key={`r-${f.k}-${run}`}
              className="v2-story-ring"
              style={{ left: `${f.cx}%`, top: `${f.cy + 30}%`, borderColor: f.color, animationDelay: `${f.at + f.dur * 0.9}ms` }}
            />
          ))}
          <span key={`s-${run}`} className="v2-story-sheen" style={{ WebkitMaskImage: `url(${SRC})`, maskImage: `url(${SRC})` }} />
        </div>
        <h2 className="v2-sr" id="story-title">
          L'histoire du logo PMC
        </h2>
        <p className="v2-story-caption" aria-live="polite" key={step}>
          {CAPTIONS[Math.max(0, step)].text}
        </p>
        <div className="v2-story-dots" aria-hidden="true">
          {CAPTIONS.map((c, i) => (
            <span key={c.at} data-on={i <= step} />
          ))}
        </div>
        <button type="button" className="v2-story-replay" onClick={play}>
          <ReplayIcon sx={{ fontSize: 16 }} /> Revoir l'histoire
        </button>
      </div>
    </section>
  );
}
