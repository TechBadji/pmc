import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AnimatedLogo from "./AnimatedLogo";
import BikeFilm from "./BikeFilm";
import HeroTerrain from "./HeroTerrain";
import LogoStory from "./LogoStory";
import PhotoFlight from "./PhotoFlight";
import Id3aMatrixDemo from "./Id3aMatrixDemo";
import "./v2.css";

/**
 * Page d'accueil v2 — planche locale (/v2), non branchée sur « / » et non
 * déployée. Textes en dur en français le temps de valider la direction ;
 * ils passeront dans i18n si la page est retenue.
 */

const PHASES = [
  {
    title: "Analyser",
    color: "#E08D3C",
    text: "Avant de fixer un cap, on regarde l'équipe telle qu'elle est : sa cohésion, ses performances, ses profils.",
    modules: [
      [1, "Analyse Cohésion d'Équipe"],
      [2, "Analyse des Performances de l'Équipe"],
      [3, "Analyse ID-3A"],
    ],
  },
  {
    title: "Planifier",
    color: "#7FD6DD",
    text: "Les constats deviennent des choix : qui retenir, qui accompagner, quels objectifs pour l'année.",
    modules: [
      [4, "ID-Talent Perf Dashboard"],
      [5, "Carte d'Identité Performance"],
      [7, "Priorités & Objectifs de l'Équipe"],
      [8, "Plan d'Actions PMC"],
    ],
  },
  {
    title: "Mettre en œuvre",
    color: "#C079D4",
    text: "Les plans passent au réel et sont suivis dans la durée, campagne après campagne.",
    modules: [
      [9, "Implémentation"],
      [10, "Évaluation des Performances"],
    ],
  },
] as const;

const RUBRICS = [
  {
    name: "Matrice ID-3A",
    lead: "Aptitudes × Attitudes = Altitude. Chaque collaborateur est placé sur deux axes indépendants, et la lecture de l'équipe devient immédiate.",
    points: ["Quatre quadrants, du talent clé à la zone de vigilance", "Comparaison d'une période à l'autre et trajectoires", "Mode Objectifs avec projections"],
    who: "Pour les managers et la direction",
  },
  {
    name: "Cohésion d'équipe",
    lead: "Le regard de l'équipe et celui du manager, confrontés critère par critère, pour voir où l'équipe tient et où elle se fragilise.",
    points: ["Questionnaire d'équipe et d'organisation", "Écarts équipe / manager rendus visibles", "Actions de cohésion suivies jusqu'au bout"],
    who: "Pour les managers et les équipes",
  },
  {
    name: "Performance ID",
    lead: "La carte d'identité de chaque collaborateur : compétences évaluées, historique et points d'appui, sur une seule fiche.",
    points: ["Hard Skills et Soft Skills par poste", "Actuel, Objectif, Réalisé", "Paliers de performance lisibles d'un coup d'œil"],
    who: "Pour chaque collaborateur et son manager",
  },
  {
    name: "Sécurité psychologique",
    lead: "Mesurer si l'équipe ose parler, proposer, se tromper, avec des réponses protégées par l'anonymat.",
    points: ["Questionnaire individuel confidentiel", "Synthèse d'équipe sans exposition des personnes", "Lecture safe / non safe"],
    who: "Pour la direction et les RH",
  },
  {
    name: "360° Feedforward",
    lead: "Des retours tournés vers la suite plutôt que vers le passé, en deux rounds structurés.",
    points: ["Round 1 et Round 2 guidés", "Rapports individuels et globaux en PDF", "Anciens avis masqués"],
    who: "Pour les séances d'équipe",
  },
  {
    name: "9 Box & plans d'actions",
    lead: "Performance et trajectoire croisées, puis traduites en actions : qui fait quoi, pour quand, dans quel ordre.",
    points: ["ID-Talent Perf Dashboard", "Plans d'actions priorisés", "Rapports PDF pour chaque rubrique"],
    who: "Pour la direction",
  },
];

const ROLES = [
  {
    key: "dir",
    name: "Direction",
    short: "Piloter l'organisation",
    title: "Une vue d'ensemble, enfin fiable",
    text: "La direction voit les directions côte à côte, avec la même méthode partout, et décide sur des faits plutôt que sur des impressions.",
    points: ["Campagnes d'évaluation ouvertes et fermées à date", "Cohésion de l'organisation et équipes dirigeantes", "Rapports PDF prêts pour le comité de direction"],
  },
  {
    key: "mgr",
    name: "Managers",
    short: "Faire grandir son équipe",
    title: "Le canevas de son équipe, en un écran",
    text: "Le manager évalue, lit sa matrice, repère qui accompagner et transforme ses constats en plan d'actions.",
    points: ["Évaluations Hard Skills et Soft Skills par poste", "Matrice ID-3A et cohésion de l'équipe", "Plan d'actions avec priorités et échéances"],
  },
  {
    key: "emp",
    name: "Collaborateurs",
    short: "Savoir où l'on en est",
    title: "Sa performance, sans zone d'ombre",
    text: "Chaque collaborateur consulte sa fiche, comprend ses points d'appui et sait sur quoi progresser.",
    points: ["Sa Carte d'Identité Performance", "Ses forces et axes de progrès", "Ses réponses confidentielles protégées"],
  },
  {
    key: "rh",
    name: "RH",
    short: "Outiller la méthode",
    title: "Une méthode déployée en quelques jours",
    text: "Les RH créent l'organigramme, importent les comptes et règlent ce que chaque rôle voit.",
    points: ["Import des collaborateurs en masse", "Référentiels de compétences par poste", "Réinitialisation des accès sans email"],
  },
];

/** Titre révélé mot à mot derrière un masque (décalages courts et non uniformes). */
function Words({ text, from }: { text: string; from: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden="true">
          {i > 0 && " "}
          <span className="v2-w">
            <span style={{ animationDelay: `${80 + (from + i) * 55 + (from + i) * (from + i) * 2}ms` }}>{w}</span>
          </span>
        </span>
      ))}
    </>
  );
}

export default function LandingV2() {
  const [scrolled, setScrolled] = useState(false);
  const [rubric, setRubric] = useState(0);
  const [role, setRole] = useState(0);
  const rubricTabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    document.title = "ID-PMC · People Management Canvas";
  }, []);

  const r = RUBRICS[rubric];
  const ro = ROLES[role];

  return (
    <div className="v2">
      <header className={`v2-nav${scrolled ? " scrolled" : ""}`}>
        <div className="v2-wrap">
          <Link to="/v2" className="v2-logo" aria-label="ID-PMC, accueil">
            <AnimatedLogo height={42} />
          </Link>
          <nav className="v2-navlinks" aria-label="Sections">
            <a href="#methode">La méthode</a>
            <a href="#rubriques">Rubriques</a>
            <a href="#roles">Pour qui</a>
            <a href="#confiance">Confidentialité</a>
          </nav>
          <Link to="/login-v2" className="v2-btn v2-btn-primary">
            Se connecter
          </Link>
        </div>
      </header>

      <main>
        {/* Le film du cycliste (Modèle 3D) ouvre la page */}
        <BikeFilm />

        <section className="v2-hero">
          <HeroTerrain />
          <div className="v2-wrap">
            <div>
              <h1 className="v2-h1" aria-label="Voyez votre équipe telle qu'elle est. Faites-la grandir.">
                <Words text="Voyez votre équipe" from={0} />{" "}
                <mark>
                  <Words text="telle qu'elle est." from={3} />
                </mark>{" "}
                <Words text="Faites-la grandir." from={6} />
              </h1>
              <p className="v2-lead v2-after" style={{ animationDelay: "560ms" }}>
                ID-PMC réunit sur un même canevas la cohésion, les compétences et la performance de chaque
                collaborateur, pour que managers et direction décident sur des faits.
              </p>
              <div className="v2-ctas v2-after" style={{ animationDelay: "680ms" }}>
                <Link to="/login-v2" className="v2-btn v2-btn-primary">
                  Accéder à mon espace <ArrowForwardIcon className="arr" sx={{ fontSize: 18 }} />
                </Link>
                <a href="#methode" className="v2-btn v2-btn-ghost">
                  Découvrir la méthode
                </a>
              </div>
              <p className="v2-note v2-after" style={{ animationDelay: "800ms" }}>
                <LockOutlinedIcon sx={{ fontSize: 17 }} />
                Chaque entreprise dispose d'un espace isolé ; les réponses sensibles restent anonymes.
              </p>
            </div>
            <Id3aMatrixDemo />
          </div>
        </section>

        <LogoStory />

        <PhotoFlight />

        <section className="v2-sec alt" id="methode">
          <div className="v2-wrap">
            <div >
              <h2 className="v2-h2">Une méthode, pas une grille d'évaluation de plus.</h2>
              <p className="v2-sub">
                Le People Management Canvas enchaîne dix modules en trois temps. Chacun nourrit le suivant : rien
                n'est saisi pour être rangé.
              </p>
            </div>
            <div className="v2-flow">
              {PHASES.map((p) => (
                <div key={p.title} className="v2-stage" style={{ ["--c" as string]: p.color }}>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                  <ol>
                    {p.modules.map(([n, label]) => (
                      <li key={n}>
                        <span>{n}</span>
                        {label}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <div className="v2-core">
              <div className="ring">6</div>
              <div>
                <b>Vision, Missions, Valeurs</b>
                <p>Au cœur du canevas : le socle auquel les neuf autres modules se rattachent.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="v2-sec dark" id="rubriques">
          <div className="v2-wrap">
            <div >
              <h2 className="v2-h2">Tout ce qu'un manager doit voir, au même endroit.</h2>
              <p className="v2-sub">Chaque rubrique répond à une question précise sur l'équipe, et se termine par un rapport PDF.</p>
            </div>
            <div className="v2-rubrics">
              <ul className="v2-rlist" role="tablist" aria-label="Rubriques" aria-orientation="vertical">
                {RUBRICS.map((x, i) => (
                  <li key={x.name}>
                    <button
                      ref={(el) => (rubricTabs.current[i] = el)}
                      role="tab"
                      id={`rub-${i}`}
                      aria-selected={i === rubric}
                      aria-controls="rub-panel"
                      tabIndex={i === rubric ? 0 : -1}
                      onClick={() => setRubric(i)}
                      onMouseEnter={() => setRubric(i)}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                        e.preventDefault();
                        const n = (i + (e.key === "ArrowDown" ? 1 : RUBRICS.length - 1)) % RUBRICS.length;
                        setRubric(n);
                        rubricTabs.current[n]?.focus();
                      }}
                    >
                      {x.name}
                      <ChevronRightIcon />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="v2-rpanel" role="tabpanel" id="rub-panel" aria-labelledby={`rub-${rubric}`}>
                <div key={rubric} className="v2-swap">
                  <h3>{r.name}</h3>
                  <p>{r.lead}</p>
                  <ul>
                    {r.points.map((pt) => (
                      <li key={pt}>
                        <CheckIcon sx={{ fontSize: 18 }} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <div className="who">{r.who}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="v2-sec" id="roles">
          <div className="v2-wrap v2-roles">
            <div >
              <h2 className="v2-h2">Chacun voit ce qui le concerne.</h2>
              <p className="v2-sub">Les droits suivent l'organigramme : la direction, les managers et les collaborateurs n'ont pas le même écran.</p>
              <div className="v2-tabs" role="tablist" aria-label="Rôles">
                {ROLES.map((x, i) => (
                  <button
                    key={x.key}
                    role="tab"
                    className="v2-tab"
                    aria-selected={i === role}
                    aria-controls="role-panel"
                    onClick={() => setRole(i)}
                  >
                    <b>{x.name}</b>
                    {x.short}
                  </button>
                ))}
              </div>
            </div>
            <div className="v2-rolecard" role="tabpanel" id="role-panel">
              <div key={ro.key} className="v2-swap">
                <h3>{ro.title}</h3>
                <p>{ro.text}</p>
                <ul>
                  {ro.points.map((pt) => (
                    <li key={pt}>
                      <CheckIcon sx={{ fontSize: 20 }} />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="v2-sec alt" id="confiance">
          <div className="v2-wrap">
            <h2 className="v2-h2">Des données RH traitées comme des données RH.</h2>
            <div className="v2-safe">
              <div>
                <h3>Un espace par entreprise</h3>
                <p>Utilisateurs, départements, référentiels et campagnes sont cloisonnés : aucune entreprise ne voit celles des autres.</p>
              </div>
              <div>
                <h3>L'anonymat là où il compte</h3>
                <p>Cohésion et sécurité psychologique sont restituées en synthèse, sans exposer les réponses individuelles.</p>
              </div>
              <div>
                <h3>Des accès maîtrisés</h3>
                <p>Chaque rôle a ses droits, et la réinitialisation d'un mot de passe passe par l'administrateur de l'entreprise.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="v2-cta">
          <div className="v2-wrap">
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
              <AnimatedLogo height={96} />
            </div>
            <h2 className="v2-h2">Votre équipe vous attend sur le canevas.</h2>
            <p className="v2-sub">Connectez-vous avec l'identifiant fourni par votre entreprise.</p>
            <Link to="/login-v2" className="v2-btn v2-btn-primary">
              Se connecter <ArrowForwardIcon className="arr" sx={{ fontSize: 18 }} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="v2-foot">
        <div className="v2-wrap">
          <span>© 2026 ID-PMC · People Management Canvas</span>
          <span className="v2-credits">
            Photos : Christina Morillo (#WOCinTech), UK Black Tech, The Jopwell Collection, Vitaly Gariev, Amari Shutters · Unsplash
          </span>
          <span>Support DigitalMatis</span>
        </div>
      </footer>
    </div>
  );
}
