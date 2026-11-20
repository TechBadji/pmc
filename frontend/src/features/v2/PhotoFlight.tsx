import { useEffect, useRef, useState } from "react";

/**
 * « Sur le terrain » : un couloir de photographies en 3D que l'on traverse au
 * défilement, en trois chapitres (Analyser, Planifier, Mettre en œuvre).
 * La section est épinglée sur quatre écrans ; la caméra avance dans la
 * profondeur, chaque photo arrive du fond, passe sur le côté et s'efface.
 *
 * Photographies : banque Unsplash (licence Unsplash, usage commercial libre),
 * provisoires — à remplacer par des photos des séances réelles.
 */
const PHOTOS = [
  { src: "/v2/photos/p1.jpg", alt: "Une équipe réunie autour d'une grande table, ordinateurs ouverts" },
  { src: "/v2/photos/p2.jpg", alt: "Trois collègues en discussion autour d'un ordinateur" },
  { src: "/v2/photos/p3.jpg", alt: "Trois collaboratrices échangent en réunion" },
  { src: "/v2/photos/p4.jpg", alt: "Un manager écoute son équipe autour d'une table" },
  { src: "/v2/photos/p5.jpg", alt: "Réunion d'équipe autour d'une table ronde" },
  { src: "/v2/photos/p6.jpg", alt: "Trois collègues font le point dans une salle de réunion" },
  { src: "/v2/photos/p7.jpg", alt: "Un manager accompagne un collaborateur sur son ordinateur" },
  { src: "/v2/photos/p8.jpg", alt: "Une collaboratrice souriante à son bureau" },
  { src: "/v2/photos/p9.jpg", alt: "Une grande équipe réunie dans une salle lumineuse" },
];

const CHAPTERS = [
  {
    color: "#E08D3C",
    title: "Analyser",
    text: "Cohésion, performances, profils ID-3A : l'équipe se regarde telle qu'elle est, sans filtre.",
    tag: "Phase 1 · modules 1 à 3",
  },
  {
    color: "#7FD6DD",
    title: "Planifier",
    text: "Les constats deviennent des choix partagés : qui accompagner, quels objectifs, dans quel ordre.",
    tag: "Phase 2 · modules 4 à 8",
  },
  {
    color: "#C079D4",
    title: "Mettre en œuvre",
    text: "Les plans passent au réel et se suivent campagne après campagne, jusqu'au résultat.",
    tag: "Phase 3 · modules 9 et 10",
  },
];

const GAP = 1100; // px de profondeur entre deux photos
const START = 500; // la première photo commence devant la caméra, un peu au fond

function reduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function PhotoFlight() {
  const sec = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const frames = useRef<(HTMLDivElement | null)[]>([]);
  const bar = useRef<HTMLSpanElement>(null);
  const [chapter, setChapter] = useState(0);
  const [still] = useState(reduced);

  useEffect(() => {
    if (still) return;
    let raf = 0;
    const depth = START + GAP * (PHOTOS.length - 1) + 600;
    const tick = () => {
      raf = 0;
      const el = sec.current;
      if (!el || !world.current) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / total));
      const camZ = p * depth;
      const sway = Math.sin(p * Math.PI * 2) * 3; // la caméra tourne doucement dans le couloir
      world.current.style.transform = `translateZ(${camZ}px) rotateY(${sway}deg)`;
      frames.current.forEach((f, i) => {
        if (!f) return;
        const z = -START - i * GAP + camZ; // position de la photo par rapport à la caméra
        // apparition depuis le fond, plein effet au milieu, effacement en passant la caméra
        const far = Math.min(1, Math.max(0, (z + 3600) / 1600));
        const near = Math.min(1, Math.max(0, (650 - z) / 500));
        f.style.opacity = String(far * near);
        f.style.visibility = far * near < 0.01 ? "hidden" : "visible";
      });
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      setChapter(Math.min(CHAPTERS.length - 1, Math.floor(p * CHAPTERS.length * 0.999)));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, [still]);

  if (still) {
    return (
      <section className="v2-flight-still" aria-labelledby="flight-title">
        <div className="v2-wrap">
          <h2 className="v2-h2" id="flight-title">Une méthode qui se vit en équipe.</h2>
          <div className="v2-flight-grid">
            {PHOTOS.map((p) => (
              <img key={p.src} src={p.src} alt={p.alt} loading="lazy" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const c = CHAPTERS[chapter];
  return (
    <section className="v2-flight" ref={sec} aria-labelledby="flight-title">
      <div className="v2-flight-pin">
        <div className="v2-flight-stage" aria-hidden="true">
          <div className="v2-flight-world" ref={world}>
            {PHOTOS.map((p, i) => {
              const side = i % 2 === 0 ? -1 : 1;
              const lane = i % 3 === 2 ? 0.25 : 1; // une photo sur trois passe plus près de l'axe
              return (
                <div
                  key={p.src}
                  ref={(el) => (frames.current[i] = el)}
                  className="v2-frame"
                  style={{
                    transform: `translate(-50%, -50%) translate3d(${side * lane * 26}vw, ${((i * 37) % 3) * 6 - 6}vh, ${-START - i * GAP}px) rotateY(${-side * lane * 22}deg)`,
                  }}
                >
                  <img src={p.src} alt="" loading={i < 3 ? "eager" : "lazy"} decoding="async" />
                </div>
              );
            })}
          </div>
        </div>
        <div className="v2-flight-copy">
          <div className="v2-wrap">
            <h2 className="v2-h2" id="flight-title">
              Une méthode qui se vit en équipe.
            </h2>
            <div className="v2-chapter" key={chapter}>
              <span className="v2-chapter-tag" style={{ color: c.color }}>
                {c.tag}
              </span>
              <b style={{ borderColor: c.color }}>{c.title}</b>
              <p>{c.text}</p>
            </div>
            <div className="v2-flight-steps" aria-hidden="true">
              {CHAPTERS.map((x, i) => (
                <span key={x.title} data-on={i === chapter} style={{ ["--c" as string]: x.color }}>
                  {x.title}
                </span>
              ))}
            </div>
          </div>
        </div>
        <span className="v2-flight-bar" aria-hidden="true">
          <span ref={bar} />
        </span>
        {/* Texte accessible : les trois chapitres, lisibles sans le défilement */}
        <ol className="v2-sr">
          {CHAPTERS.map((x) => (
            <li key={x.title}>
              {x.title} : {x.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
