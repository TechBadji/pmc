import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PsiSummary } from "@/api/types";
import { dimensionReading, PSI_DIMENSIONS } from "@/utils/psychologicalSafety";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

// Géométrie, dans le repère du dessin (il se met à l'échelle de la carte) :
// un cadre arrondi, puis une barre par ligne. Une barre pleine (5 sur 5)
// s'arrête avant le bord pour laisser la place du score, écrit à sa droite.
const WIDTH = 560;
const FRAME_INSET = 4;
const PAD_Y = 26;
const BAR_X = 34;
const BAR_HEIGHT = 36;
const BAR_GAP = 16;
const BAR_MAX = 434;
const LABEL_INSET = 20;
const VALUE_GAP = 10;
// Largeur approchée d'un caractère gras de 15 px, pour savoir si le nom tient
// dans sa barre sans avoir à mesurer le texte une fois dessiné.
const CHAR_WIDTH = 8.8;
const VALUE_WIDTH = 36;

/**
 * Lecture d'ensemble du PSI de l'entreprise en barres horizontales arrondies :
 * l'indice global en tête (« Total PSI »), puis les quatre dimensions de la
 * plus forte à la plus faible. La longueur d'une barre est son score sur 5,
 * le nom est écrit dedans et le score à son extrémité. Le dessin reprend un
 * modèle fourni : cadre arrondi à fond pêche, barres en dégradé du blanc au
 * bleu clair cernées de bleu nuit.
 */
export default function PsiOrganisationBars({ summary }: { summary: PsiSummary }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const gradientId = `psi-bars-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [active, setActive] = useState<string | null>(null);
  const dark = theme.palette.mode === "dark";
  const accent = theme.palette.primary.main;
  const outline = dark ? "#9cc4f5" : "#1f3c88";
  // Fond pêche du cadre, comme sur le modèle ; en thème sombre, la même
  // teinte en voile léger, pour ne pas poser un pavé clair dans la page.
  const panel = dark ? "rgba(224, 138, 52, 0.16)" : "#fde8c6";
  // Scores plus soutenus que le bleu du logo : sur le fond pêche, celui-ci
  // manquerait de contraste.
  const valueInk = dark ? theme.palette.primary.light : theme.palette.primary.dark;

  const dimensions = PSI_DIMENSIONS.map((key, order) => {
    const score = summary.dimensions?.find((d) => d.key === key)?.score ?? 0;
    const name = t(`psi.dimension.${key}`);
    // Nom court dans la barre (« Belonging ») ; le nom entier reste dans le
    // tableau voisin et dans l'infobulle.
    return { key, order, score, label: name.split(" ")[0], hint: `${name} — ${fmt(score)} / 5 — ${t(`psi.readingDim.${dimensionReading(score)}`)}` };
  }).sort((a, b) => b.score - a.score || a.order - b.order);
  const global = summary.global ?? 0;
  const rows = [{ key: "global", score: global, label: t("psi.dash.total"), hint: `${t("psi.dash.total")} — ${fmt(global)} / 5` }, ...dimensions];
  const height = FRAME_INSET * 2 + PAD_Y * 2 + rows.length * BAR_HEIGHT + (rows.length - 1) * BAR_GAP;

  return (
    <Box sx={{ width: "100%", maxWidth: 600, mx: "auto", py: 0.5 }}>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" role="img" aria-label={t("psi.dash.orgChart")} style={{ display: "block" }}>
        <defs>
          {/* Du blanc au bleu clair, d'un bout à l'autre de chaque barre. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="38%" stopColor="#eef5ff" />
            <stop offset="100%" stopColor="#9ccafc" />
          </linearGradient>
        </defs>
        <rect
          x={FRAME_INSET}
          y={FRAME_INSET}
          width={WIDTH - FRAME_INSET * 2}
          height={height - FRAME_INSET * 2}
          rx={38}
          fill={panel}
          stroke={accent}
          strokeWidth={1.5}
        />
        {rows.map((row, index) => {
          const y = FRAME_INSET + PAD_Y + index * (BAR_HEIGHT + BAR_GAP);
          // Jamais plus court qu'un rond : en deçà la barre ne serait plus une barre.
          const width = Math.max(BAR_HEIGHT, (BAR_MAX * Math.max(0, Math.min(5, row.score))) / 5);
          const end = BAR_X + width;
          const inside = row.label.length * CHAR_WIDTH + LABEL_INSET * 2 <= width;
          const faded = active !== null && active !== row.key;
          return (
            <g
              key={row.key}
              opacity={faded ? 0.4 : 1}
              style={{ transition: "opacity 120ms", cursor: "default" }}
              onMouseEnter={() => setActive(row.key)}
              onMouseLeave={() => setActive(null)}
            >
              <title>{row.hint}</title>
              <rect x={BAR_X} y={y} width={width} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill={`url(#${gradientId})`} stroke={outline} strokeWidth={1.5} />
              <text x={end + VALUE_GAP} y={y + BAR_HEIGHT / 2 + 5.5} fontSize={16} fontWeight={600} fill={valueInk}>
                {fmt(row.score)}
              </text>
              {/* Le nom s'écrit dans la barre, en sombre sur son fond clair ;
                  si la barre est trop courte pour lui, il passe après le score. */}
              <text
                x={inside ? BAR_X + LABEL_INSET : end + VALUE_GAP + VALUE_WIDTH + 10}
                y={y + BAR_HEIGHT / 2 + 5.5}
                fontSize={15}
                fontWeight={800}
                fill={inside ? "#111418" : theme.palette.text.primary}
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
