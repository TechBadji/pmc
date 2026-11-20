import { useEffect, useRef, useState } from "react";

/**
 * « Le Modèle 3D » en film : la fiche « Formulation des Objectifs Individuels :
 * Modèle 3D » racontée comme l'histoire d'un homme à vélo.
 *   Le cycliste = 1. LEADERSHIP, il tient l'équilibre et donne le cap ;
 *   la roue arrière = PEOPLE / 2. TEAM, elle donne la puissance ;
 *   la roue avant  = BUSINESS / 3. BUSINESS, elle donne la direction.
 * La section est épinglée sur six écrans : le défilement fait avancer le
 * film (caméra, décor, roues, pédalage), une horloge le garde vivant.
 * Le cycliste, le vélo et le décor sont dessinés à la main (SVG).
 */

const TEAM = ["Cohésion", "Engagement", "Compétences", "Attitudes", "Talents", "Collaboration", "Team Performance", "TAP, TPR, ID-TPD"];
const BUSINESS = ["Résultats financiers", "Marge", "Croissance CA", "Part de marché", "Position marché", "SLA", "Digitalisation", "KPIs", "Résultats"];
const LEADERSHIP = ["Vision", "Leadership & Inspiration", "Développement des talents", "Exemplarité", "Team Performance", "Courage managérial", "Conduite du changement"];

type Scene = { title: string; kicker: string; text: string; color: string; cam: { s: number; x: number; y: number } };
// caméra : échelle et point visé (repère du dessin 800 × 520)
const SCENES: Scene[] = [
  { kicker: "Le Modèle 3D", title: "Un manager se met en route.", text: "Ses objectifs de l'année tiennent sur un vélo : deux roues et celui qui pédale.", color: "#E08D3C", cam: { s: 0.85, x: 400, y: 300 } },
  { kicker: "2. TEAM · roue arrière", title: "PEOPLE donne la puissance.", text: "Leadership, engagement, culture : sans l'équipe, la roue arrière ne pousse rien.", color: "#1E3A6E", cam: { s: 1.55, x: 215, y: 340 } },
  { kicker: "3. BUSINESS · roue avant", title: "BUSINESS donne la direction.", text: "Stratégie, exécution, résultats : la roue avant choisit où l'on va.", color: "#D69A12", cam: { s: 1.55, x: 590, y: 340 } },
  { kicker: "1. LEADERSHIP · le cycliste", title: "Le leadership tient l'équilibre.", text: "C'est lui qui pédale, regarde loin et garde les deux roues alignées.", color: "#9333A8", cam: { s: 1.45, x: 440, y: 170 } },
  { kicker: "Formulation des Objectifs Individuels", title: "Sans l'une des roues, on tombe.", text: "Chaque objectif individuel se formule sur les trois dimensions : Leadership, Team, Business.", color: "#1F6E77", cam: { s: 0.95, x: 400, y: 285 } },
];

// géométrie du vélo
const R = { x: 210, y: 370 }; // axe arrière
const F = { x: 590, y: 370 }; // axe avant
const BB = { x: 380, y: 392 }; // pédalier
const S = { x: 336, y: 238 }; // haut du tube de selle
const HT = { x: 548, y: 232 };
const HB = { x: 560, y: 282 };
const HIP = { x: 338, y: 214 };
const WHEEL = 104;
const CRANK = 40;
const THIGH = 128;
const SHIN = 130;

const HUBS = [
  { c: R, hub: "url(#bk-hub-p)", label: ["PEOPLE", "Leadership", "Engagement", "Culture"] },
  { c: F, hub: "url(#bk-hub-b)", label: ["BUSINESS", "Stratégie", "Exécution", "Résultats"] },
];

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function knee(hip: { x: number; y: number }, foot: { x: number; y: number }) {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 1);
  const base = Math.atan2(dy, dx);
  const off = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const a = { x: hip.x + THIGH * Math.cos(base - off), y: hip.y + THIGH * Math.sin(base - off) };
  const b = { x: hip.x + THIGH * Math.cos(base + off), y: hip.y + THIGH * Math.sin(base + off) };
  return a.x > b.x ? a : b; // le genou vers l'avant
}

function reduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Mots qui tournent en orbite autour d'une roue (ou du cycliste), en 3D simulée. */
function Orbit({ id, words, cx, cy, rx, ry, color }: { id: string; words: string[]; cx: number; cy: number; rx: number; ry: number; color: string }) {
  return (
    <g className="v2-orbit" data-orbit={id}>
      {words.map((w) => (
        <g key={w} className="v2-orbit-chip" data-cx={cx} data-cy={cy} data-rx={rx} data-ry={ry}>
          <rect rx={13} height={26} y={-13} fill="#fff" stroke={color} strokeWidth={1.5} />
          <text textAnchor="middle" dominantBaseline="central" fill="#10292c" fontSize={13} fontWeight={600}>
            {w}
          </text>
        </g>
      ))}
    </g>
  );
}

export default function BikeFilm() {
  const sec = useRef<HTMLElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const hills = useRef<(SVGGElement | null)[]>([]);
  const sky = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(0);
  const [still] = useState(reduced);

  useEffect(() => {
    const s = svg.current;
    if (!s) return;
    // mesure des étiquettes une fois rendues (largeur du texte)
    s.querySelectorAll<SVGGElement>(".v2-orbit-chip").forEach((g) => {
      const t = g.querySelector("text")!;
      const w = t.getComputedTextLength() + 26;
      const r = g.querySelector("rect")!;
      r.setAttribute("width", String(w));
      r.setAttribute("x", String(-w / 2));
    });

    const q = <T extends Element>(sel: string) => s.querySelector(sel) as T;
    const rearSpokes = q<SVGGElement>("#bk-rear-spokes");
    const frontSpokes = q<SVGGElement>("#bk-front-spokes");
    const crank = q<SVGGElement>("#bk-crank");
    const chain = q<SVGPathElement>("#bk-chain");
    const lane = q<SVGLineElement>("#bk-lane");
    const legs = [0, 1].map((i) => ({
      thigh: q<SVGLineElement>(`#bk-thigh-${i}`),
      shin: q<SVGLineElement>(`#bk-shin-${i}`),
      shoe: q<SVGGElement>(`#bk-shoe-${i}`),
    }));
    const orbits = [...s.querySelectorAll<SVGGElement>(".v2-orbit")];

    let raf = 0;
    let last = performance.now();
    const t0 = performance.now() + 250;
    let travel = 0; // distance parcourue (px du dessin)
    let lastScroll = 0;
    let p = 0;
    let visible = true;

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    if (sec.current) io.observe(sec.current);

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = sec.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = Math.max(1, r.height - window.innerHeight);
      p = still ? 1 : clamp(-r.top / total);
      const scrollDelta = Math.abs(p - lastScroll) * total;
      lastScroll = p;

      // vitesse : un roulage tranquille, accéléré par le défilement
      const speed = 70 + Math.min(900, (scrollDelta / Math.max(dt, 0.001)) * 0.6);
      if (!still) travel += speed * dt;

      // scène courante et caméra interpolée
      const f = p * (SCENES.length - 1);
      const i = Math.min(SCENES.length - 2, Math.floor(f));
      const t = smooth(clamp(f - i));
      const A = SCENES[i].cam;
      const B = SCENES[i + 1].cam;
      const cs = A.s + (B.s - A.s) * t;
      const cx = A.x + (B.x - A.x) * t;
      const cy = A.y + (B.y - A.y) * t;
      // arrivée du cycliste par la gauche, à l'ouverture de la page (il ouvre le film)
      const enter = still ? 0 : (1 - smooth(clamp((now - t0) / 2400))) * -720;
      if (cam.current) {
        const rot = Math.sin(p * Math.PI * 2) * 4; // la caméra tourne autour du vélo
        cam.current.style.transform = `translate(-50%, -50%) perspective(1200px) rotateY(${rot}deg) scale(${cs}) translate(${400 - cx + enter}px, ${300 - cy}px)`;
      }
      const sceneNow = Math.round(f);
      setScene(Math.min(SCENES.length - 1, sceneNow));

      // roues et pédalier
      const wheelDeg = (travel / (2 * Math.PI * WHEEL)) * 360;
      rearSpokes?.setAttribute("transform", `rotate(${wheelDeg} ${R.x} ${R.y})`);
      frontSpokes?.setAttribute("transform", `rotate(${wheelDeg} ${F.x} ${F.y})`);
      const th = ((wheelDeg / 2.4) * Math.PI) / 180;
      crank?.setAttribute("transform", `rotate(${(th * 180) / Math.PI} ${BB.x} ${BB.y})`);
      chain?.setAttribute("stroke-dashoffset", String(-travel * 0.4));
      legs.forEach((leg, k) => {
        const a = th + k * Math.PI;
        const foot = { x: BB.x + CRANK * Math.cos(a), y: BB.y + CRANK * Math.sin(a) };
        const kn = knee(HIP, foot);
        leg.thigh?.setAttribute("x2", String(kn.x));
        leg.thigh?.setAttribute("y2", String(kn.y));
        leg.shin?.setAttribute("x1", String(kn.x));
        leg.shin?.setAttribute("y1", String(kn.y));
        leg.shin?.setAttribute("x2", String(foot.x));
        leg.shin?.setAttribute("y2", String(foot.y));
        leg.shoe?.setAttribute("transform", `translate(${foot.x} ${foot.y})`);
      });

      // décor : la route défile en 3D, les collines en parallaxe
      lane?.setAttribute("stroke-dashoffset", String(travel));
      hills.current.forEach((h, k) => h?.setAttribute("transform", `translate(${-((travel * (0.08 + k * 0.12)) % 1600)} 0)`));
      if (sky.current) sky.current.style.setProperty("--day", String(clamp(p * 1.4)));

      // orbites : chaque scène allume la sienne, les mots tournent autour
      orbits.forEach((o) => {
        const id = o.dataset.orbit;
        const on = (id === "team" && sceneNow === 1) || (id === "business" && sceneNow === 2) || (id === "leadership" && sceneNow === 3) || sceneNow === 4;
        const fin = sceneNow === 4;
        o.style.opacity = on ? (fin ? "0.9" : "1") : "0";
        const chips = [...o.querySelectorAll<SVGGElement>(".v2-orbit-chip")];
        chips.forEach((c, n) => {
          const ox = +c.dataset.cx!;
          const oy = +c.dataset.cy!;
          const rx = +c.dataset.rx! * (fin ? 0.9 : 1);
          const ry = +c.dataset.ry!;
          const ang = now / 5200 + (n / chips.length) * Math.PI * 2;
          const z = Math.sin(ang); // -1 derrière, 1 devant
          const sc = (fin ? 0.62 : 0.78) + 0.22 * (z + 1) / 2;
          c.setAttribute("transform", `translate(${ox + Math.cos(ang) * rx} ${oy + z * ry}) scale(${sc})`);
          c.style.opacity = String(0.18 + 0.82 * Math.pow((z + 1) / 2, 1.6));
        });
      });

      if (visible && !still) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [still]);

  const sc = SCENES[scene];
  const spokes = (c: { x: number; y: number }, color: string) =>
    Array.from({ length: 18 }, (_, k) => {
      const a = (k / 18) * Math.PI * 2;
      return <line key={k} x1={c.x} y1={c.y} x2={c.x + Math.cos(a) * (WHEEL - 8)} y2={c.y + Math.sin(a) * (WHEEL - 8)} stroke={color} strokeWidth={1.6} />;
    });

  return (
    <section className="v2-film" ref={sec} aria-labelledby="film-title" data-still={still}>
      <div className="v2-film-pin">
        <div className="v2-film-sky" ref={sky} aria-hidden="true">
          <span className="v2-film-sun" />
        </div>
        <svg className="v2-film-hills" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          {[
            { d: "M0 190 C 160 120 300 160 420 130 S 700 90 820 140 S 1100 110 1240 150 S 1480 120 1600 170 V300 H0Z", c: "#9fc9c4" },
            { d: "M0 230 C 200 180 320 220 520 190 S 860 170 1000 210 S 1300 180 1600 220 V300 H0Z", c: "#6aa59f" },
            { d: "M0 260 C 180 240 380 270 560 245 S 900 240 1100 260 S 1400 250 1600 262 V300 H0Z", c: "#3f7f7a" },
          ].map((h, k) => (
            <g key={k} ref={(el) => (hills.current[k] = el)}>
              <path d={h.d} fill={h.c} />
              <path d={h.d} fill={h.c} transform="translate(1600 0)" />
            </g>
          ))}
        </svg>

        <div className="v2-film-cam" ref={cam}>
          <svg ref={svg} className="v2-film-bike" viewBox="0 0 800 520" role="img" aria-label="Un homme à vélo : le cycliste représente le Leadership, la roue arrière PEOPLE, la roue avant BUSINESS">
            <defs>
              <radialGradient id="bk-hub-p" cx="40%" cy="35%">
                <stop offset="0" stopColor="#3b5d9a" />
                <stop offset="1" stopColor="#14295a" />
              </radialGradient>
              <radialGradient id="bk-hub-b" cx="40%" cy="35%">
                <stop offset="0" stopColor="#f2bf3f" />
                <stop offset="1" stopColor="#b9800d" />
              </radialGradient>
            </defs>
            {/* la route, qui suit la caméra ; sa ligne centrale défile avec les roues */}
            <rect x={-3000} y={500} width={6800} height={3000} fill="#e6dcc4" />
            <rect x={-3000} y={440} width={6800} height={66} fill="#4b5356" />
            <rect x={-3000} y={438} width={6800} height={4} fill="#d8cfb8" />
            <rect x={-3000} y={504} width={6800} height={4} fill="#d8cfb8" />
            <line id="bk-lane" x1={-3000} y1={474} x2={3800} y2={474} stroke="#f4efe2" strokeWidth={4} strokeDasharray="46 34" />
            {/* ombre au sol */}
            <ellipse cx={400} cy={476} rx={300} ry={10} fill="rgba(0,0,0,.3)" />


            {/* jambe du fond */}
            <g opacity={0.82}>
              <line id="bk-thigh-1" x1={HIP.x} y1={HIP.y} x2={HIP.x} y2={HIP.y} stroke="#0b0f14" strokeWidth={30} strokeLinecap="round" />
              <line id="bk-shin-1" stroke="#0b0f14" strokeWidth={24} strokeLinecap="round" />
              <g id="bk-shoe-1">
                <ellipse cx={8} cy={4} rx={22} ry={10} fill="#d9dde3" />
              </g>
            </g>

            {/* roues */}
            {[
              { c: R, rim: "#1E3A6E", hub: "url(#bk-hub-p)", id: "bk-rear-spokes", label: ["PEOPLE", "Leadership", "Engagement", "Culture"], spoke: "#c8d3e6" },
              { c: F, rim: "#D69A12", hub: "url(#bk-hub-b)", id: "bk-front-spokes", label: ["BUSINESS", "Stratégie", "Exécution", "Résultats"], spoke: "#f3dfa8" },
            ].map((w) => (
              <g key={w.id}>
                <circle cx={w.c.x} cy={w.c.y} r={WHEEL + 4} fill="none" stroke="#1b1b1b" strokeWidth={10} />
                <circle cx={w.c.x} cy={w.c.y} r={WHEEL - 4} fill="none" stroke={w.rim} strokeWidth={9} />
                <g id={w.id}>{spokes(w.c, w.spoke)}</g>
              </g>
            ))}

            {/* cadre : triangle arrière bleu nuit (PEOPLE), avant doré (BUSINESS) */}
            <g strokeLinecap="round" fill="none">
              <path d={`M${R.x} ${R.y} L${BB.x} ${BB.y} M${R.x} ${R.y} L${S.x} ${S.y}`} stroke="#1E3A6E" strokeWidth={11} />
              <path d={`M${S.x} ${S.y - 6} L${BB.x} ${BB.y}`} stroke="#1E3A6E" strokeWidth={13} />
              <path d={`M${S.x} ${S.y} L${HT.x} ${HT.y} M${BB.x} ${BB.y} L${HB.x} ${HB.y}`} stroke="#E0A419" strokeWidth={13} />
              <path d={`M${HT.x} ${HT.y} L${HB.x} ${HB.y} L${F.x} ${F.y}`} stroke="#E0A419" strokeWidth={10} />
              <path id="bk-chain" d={`M${BB.x} ${BB.y - 26} L${R.x} ${R.y - 14} M${R.x} ${R.y + 14} L${BB.x} ${BB.y + 26}`} stroke="#3a3f47" strokeWidth={3.5} strokeDasharray="5 4" />
              {/* selle, potence, cintre */}
              <path d="M300 222 Q330 214 362 222" stroke="#111" strokeWidth={10} />
              <path d={`M${HT.x} ${HT.y} L552 206 L578 204`} stroke="#222" strokeWidth={8} />
              <path d="M578 204 Q592 206 588 220" stroke="#222" strokeWidth={7} />
            </g>
            {/* moyeux : PEOPLE et BUSINESS, au-dessus du cadre */}
            {HUBS.map((w) => (
              <g key={w.label[0]}>
                <circle cx={w.c.x} cy={w.c.y} r={50} fill={w.hub} stroke="#fff" strokeOpacity={0.5} strokeWidth={2} />
                <text x={w.c.x} y={w.c.y - 14} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={800} letterSpacing="0.04em">
                  {w.label[0]}
                </text>
                {w.label.slice(1).map((l, k) => (
                  <text key={l} x={w.c.x} y={w.c.y + 4 + k * 13} textAnchor="middle" fill="rgba(255,255,255,.9)" fontSize={10.5} fontWeight={600}>
                    {l}
                  </text>
                ))}
              </g>
            ))}
            {/* pédalier */}
            <g id="bk-crank">
              <circle cx={BB.x} cy={BB.y} r={26} fill="none" stroke="#3a3f47" strokeWidth={4} />
              <line x1={BB.x - CRANK} y1={BB.y} x2={BB.x + CRANK} y2={BB.y} stroke="#2a2f36" strokeWidth={7} strokeLinecap="round" />
            </g>

            {/* le cycliste */}
            <g className="v2-rider">
              {/* bras du fond */}
              <path d="M452 134 L503 178 L566 203" stroke="#15275a" strokeWidth={19} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {/* torse : veste bleu nuit */}
              <path d="M330 222 C 350 160 405 118 462 112 C 482 118 488 140 476 160 C 432 180 388 214 372 238 Z" fill="#1f3a78" />
              <path d="M400 150 C 420 140 440 132 462 128" stroke="#2c4c94" strokeWidth={3} fill="none" />
              {/* tête */}
              <rect x={474} y={92} width={16} height={22} rx={6} fill="#5a3721" transform="rotate(-20 482 103)" />
              <circle cx={500} cy={78} r={26} fill="#6b4127" />
              <path d="M476 72 C 478 52 498 46 514 52 C 524 56 528 64 526 70 C 514 64 496 64 476 72 Z" fill="#161616" />
              <path d="M482 88 C 488 102 506 108 520 96 C 522 104 512 112 498 110 C 488 108 482 100 482 88 Z" fill="#161616" />
              <rect x={502} y={72} width={24} height={9} rx={4} fill="#0d0d0d" />
              <path d="M492 76 L502 76" stroke="#0d0d0d" strokeWidth={2.5} />
              {/* bras de devant avec le brassard */}
              <path d="M458 130 L512 184 L572 206" stroke="#1f3a78" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <rect x={478} y={150} width={14} height={22} rx={3} fill="#2b2b2b" transform="rotate(42 485 161)" />
              <circle cx={576} cy={206} r={9} fill="#6b4127" />
            </g>

            {/* jambe de devant */}
            <line id="bk-thigh-0" x1={HIP.x} y1={HIP.y} x2={HIP.x} y2={HIP.y} stroke="#14171c" strokeWidth={32} strokeLinecap="round" />
            <line id="bk-shin-0" stroke="#14171c" strokeWidth={25} strokeLinecap="round" />
            <g id="bk-shoe-0">
              <ellipse cx={8} cy={4} rx={23} ry={11} fill="#f4f6f8" stroke="#c8ccd2" />
            </g>
            {/* les mots en orbite, au premier plan (ceux de derrière s'estompent) */}
            <Orbit id="team" words={TEAM} cx={R.x} cy={R.y} rx={190} ry={70} color="#1E3A6E" />
            <Orbit id="business" words={BUSINESS} cx={F.x} cy={F.y} rx={195} ry={70} color="#D69A12" />
            <Orbit id="leadership" words={LEADERSHIP} cx={440} cy={140} rx={210} ry={60} color="#9333A8" />
          </svg>
        </div>

        <div className="v2-film-copy">
          <div className="v2-film-card" key={scene} style={{ ["--c" as string]: sc.color }}>
            <span className="v2-film-kicker">{sc.kicker}</span>
            <h2 id="film-title">{sc.title}</h2>
            <p>{sc.text}</p>
            {scene === 4 && (
              <div className="v2-film-three">
                <span style={{ ["--c" as string]: "#9333A8" }}>1. Leadership</span>
                <span style={{ ["--c" as string]: "#1E3A6E" }}>2. Team</span>
                <span style={{ ["--c" as string]: "#D69A12" }}>3. Business</span>
              </div>
            )}
          </div>
          <div className="v2-film-steps" aria-hidden="true">
            {SCENES.map((_, k) => (
              <span key={k} data-on={k <= scene} />
            ))}
          </div>
        </div>
        {/* texte complet pour les lecteurs d'écran */}
        <div className="v2-sr">
          <p>1. Leadership : {LEADERSHIP.join(", ")}.</p>
          <p>2. Team : {TEAM.join(", ")}.</p>
          <p>3. Business : {BUSINESS.join(", ")}.</p>
        </div>
      </div>
    </section>
  );
}
