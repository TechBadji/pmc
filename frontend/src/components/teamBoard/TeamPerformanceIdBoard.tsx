import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputBase,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { apiClient } from "@/api/client";
import type {
  Evaluation,
  Paginated,
  PerformanceRating,
  TeamBoard,
  TeamCohesionAnalysis,
  TeamRelationship,
  UserRecord,
} from "@/api/types";
import { performanceColors } from "@/theme";
import { BOARD_CREAM, BOARD_TEXT, BandTitle, BoardPanel, EditableList, TeamSpiderGraph } from "./BoardPieces";

/** Performance de référence : au-delà, les objectifs sont tenus. */
const TPD_TARGET = 90;

/** Les quatre quadrants, dans l'ordre de lecture de la planche. */
const QUADRANTS = [
  { key: "tl", above: false, rising: true, light: "orange" as const, tone: "#ed9c28", lightSide: "left" as const },
  { key: "tr", above: true, rising: true, light: "green" as const, tone: "#2e9e4f", lightSide: "right" as const },
  { key: "bl", above: false, rising: false, light: "red" as const, tone: "#d32f2f", lightSide: "left" as const },
  { key: "br", above: true, rising: false, light: "green" as const, tone: "#2e9e4f", lightSide: "right" as const },
];

const YEAR_COLORS = ["#5b8ac6", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6"];

/**
 * Organigramme de l'équipe, tel que la planche le présente : le responsable en
 * tête, une barre de distribution, puis une flèche descendant vers chaque
 * membre. Dessiné en SVG — les flèches et la barre demandent un tracé, et le
 * dessin doit se réduire à la largeur de sa colonne sans se déformer.
 */
function TeamOrgChart({ manager, members }: { manager: UserRecord | null; members: UserRecord[] }) {
  // Survol : la vignette grossit et le nom complet s'affiche. Sur une planche
  // qui n'affiche que le prénom, c'est le seul moyen de lever une homonymie
  // sans encombrer le dessin.
  const [hovered, setHovered] = useState<number | null>(null);
  const R_MANAGER = 26;
  const R_MEMBER = 21;
  const COL = 78; // pas horizontal entre deux membres
  const width = Math.max(COL * Math.max(members.length, 1), 220);
  const height = 250;
  const centerX = width / 2;
  const managerY = 40;
  const busY = 132;
  const memberY = 186;
  const firstX = centerX - ((members.length - 1) * COL) / 2;

  /** Vignette ronde + étiquette jaune, comme sur la planche. */
  function Node({ person, x, y, r: baseR }: { person: UserRecord; x: number; y: number; r: number }) {
    const name = person.full_name || person.email;
    const isHovered = hovered === person.id;
    const r = isHovered ? baseR * 1.45 : baseR;
    const label = isHovered ? name : name.split(" ")[0];
    const labelWidth = Math.max(48, label.length * (isHovered ? 6.8 : 6.4) + 14);
    return (
      <g
        onMouseEnter={() => setHovered(person.id)}
        onMouseLeave={() => setHovered((current) => (current === person.id ? null : current))}
        style={{ cursor: "default" }}
      >
        {/* Zone de survol stable : sans elle, l'agrandissement ferait fuir le
          * curseur hors de la vignette et provoquerait un clignotement. */}
        <circle cx={x} cy={y} r={baseR * 1.5} fill="transparent" />
        <circle cx={x} cy={y} r={r} fill="#eef1f6" stroke="#9aa4b2" strokeWidth={1.5} />
        {person.avatar ? (
          <>
            <clipPath id={`org-clip-${person.id}`}>
              <circle cx={x} cy={y} r={r - 1.5} />
            </clipPath>
            <image
              href={person.avatar}
              x={x - r + 1.5}
              y={y - r + 1.5}
              width={(r - 1.5) * 2}
              height={(r - 1.5) * 2}
              clipPath={`url(#org-clip-${person.id})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </>
        ) : (
          <text x={x} y={y + r / 3} textAnchor="middle" fontSize={r} fontWeight={800} fill="#5b6472">
            {name.charAt(0).toUpperCase()}
          </text>
        )}
        <rect
          x={x - labelWidth / 2}
          y={y + r + 4}
          width={labelWidth}
          height={isHovered ? 18 : 15}
          rx={2}
          fill="#ffff66"
          stroke="#d9d33f"
        />
        <text
          x={x}
          y={y + r + (isHovered ? 17 : 15)}
          textAnchor="middle"
          fontSize={isHovered ? 11 : 9.5}
          fontWeight={800}
          fill="#20242e"
        >
          {label}
        </text>
      </g>
    );
  }

  if (!manager && members.length === 0) return null;

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", height: "auto" }}>
        <defs>
          {/* Pointe dessinée vers la droite : `orient="auto"` la fait pivoter
            * dans le sens du trait, donc vers le bas. Dessinée vers le bas,
            * elle subissait la rotation en plus et partait de travers. */}
          <marker id="org-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a1a1a" />
          </marker>
        </defs>

        {manager && (
          <>
            <Node person={manager} x={centerX} y={managerY} r={R_MANAGER} />
            {/* descente du responsable vers la barre de distribution */}
            <line x1={centerX} y1={managerY + R_MANAGER + 20} x2={centerX} y2={busY} stroke="#1a1a1a" strokeWidth={2} />
          </>
        )}

        {members.length > 0 && (
          <line
            x1={members.length === 1 ? centerX : firstX}
            y1={busY}
            x2={members.length === 1 ? centerX : firstX + (members.length - 1) * COL}
            y2={busY}
            stroke="#1a1a1a"
            strokeWidth={2}
          />
        )}

        {[...members]
          .map((person, i) => ({ person, x: members.length === 1 ? centerX : firstX + i * COL }))
          // Le survolé se dessine en dernier : agrandi, il doit passer
          // au-dessus de ses voisins et non se faire recouvrir.
          .sort((a, b) => Number(a.person.id === hovered) - Number(b.person.id === hovered))
          .map(({ person, x }) => {
          return (
            <g key={person.id}>
              <line
                x1={x}
                y1={busY}
                x2={x}
                y2={memberY - R_MEMBER - 4}
                stroke="#1a1a1a"
                strokeWidth={2}
                markerEnd="url(#org-arrow)"
              />
              <Node person={person} x={x} y={memberY} r={R_MEMBER} />
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

/**
 * Réalisations vs objectifs : la courbe seule, comme sur la planche — deux
 * séries, les valeurs au-dessus de chaque point et la légende dessous.
 *
 * La saisie des années passe par une boîte de dialogue plutôt que par des
 * champs sous le graphe : la planche est faite pour être projetée et remise au
 * client, un formulaire y ferait tache. Le crayon n'apparaît qu'en édition et
 * disparaît à l'impression.
 */
function TargetsVsActuals({
  rows,
  onChange,
  readOnly,
  title,
  editable,
}: {
  rows: TeamBoard["targets_vs_actuals"];
  onChange: (next: TeamBoard["targets_vs_actuals"]) => void;
  readOnly: boolean;
  title: string;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const data = rows.filter((r) => r.year);

  function setAt(i: number, patch: Partial<TeamBoard["targets_vs_actuals"][number]>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <Box sx={{ position: "relative" }}>
      {!readOnly && editable && (
        <IconButton
          size="small"
          className="pmc-no-print"
          onClick={() => setOpen(true)}
          sx={{ position: "absolute", top: -6, right: -4 }}
          aria-label={t("common.edit")}
        >
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      )}

      {data.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t("teamBoard.noSeries")}
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height={196}>
          {/* Domaine élargi de part et d'autre : sans cette réserve, les
            * valeurs des points extrêmes sortent du cadre et se coupent. Les
            * chiffres reprennent la couleur de leur série, seul moyen de les
            * rattacher sans hésitation quand les deux courbes se croisent. */}
          {/* Marges latérales : l'étiquette d'un point extrême déborde du
            * tracé de la moitié de sa largeur — sans cette réserve, la valeur
            * de la première et de la dernière année se fait rogner. */}
          <LineChart data={data} margin={{ top: 22, right: 26, left: 26, bottom: 0 }}>
            <CartesianGrid stroke="#d9d9d9" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 13, fontWeight: 800, fill: "#1a1a1a" }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              padding={{ left: 14, right: 14 }}
            />
            <YAxis hide domain={[(min: number) => min - 6, (max: number) => max + 6]} />
            <Legend
              verticalAlign="bottom"
              height={24}
              iconType="plainline"
              iconSize={26}
              wrapperStyle={{ fontSize: 12.5, fontWeight: 600, color: "#3a3a3a", paddingTop: 6 }}
            />
            <Line
              type="linear"
              dataKey="target"
              name={t("teamBoard.target")}
              stroke="#e8342a"
              strokeWidth={4}
              dot={{ r: 7, fill: "#e8342a", strokeWidth: 0 }}
              activeDot={{ r: 8 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="target"
                position="top"
                offset={11}
                style={{ fontSize: 14, fontWeight: 800, fill: "#1a1a1a" }}
              />
            </Line>
            <Line
              type="linear"
              dataKey="actual"
              name={t("teamBoard.actual")}
              stroke="#4a9bd8"
              strokeWidth={4}
              dot={{ r: 7, fill: "#4a9bd8", strokeWidth: 0 }}
              activeDot={{ r: 8 }}
              connectNulls
              isAnimationActive={false}
            >
              <LabelList
                dataKey="actual"
                position="top"
                offset={11}
                style={{ fontSize: 14, fontWeight: 800, fill: "#1a1a1a" }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {rows.map((row, i) => (
              <Stack key={i} direction="row" spacing={1}>
                <TextField
                  size="small"
                  label={t("teamBoard.year")}
                  value={row.year}
                  onChange={(e) => setAt(i, { year: e.target.value })}
                  sx={{ width: 110 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label={t("teamBoard.target")}
                  value={row.target ?? ""}
                  onChange={(e) => setAt(i, { target: e.target.value === "" ? null : Number(e.target.value) })}
                  sx={{ width: 120 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label={t("teamBoard.actual")}
                  value={row.actual ?? ""}
                  onChange={(e) => setAt(i, { actual: e.target.value === "" ? null : Number(e.target.value) })}
                  sx={{ width: 120 }}
                />
              </Stack>
            ))}
            <Button
              size="small"
              startIcon={<AddOutlinedIcon />}
              onClick={() => onChange([...rows, { year: "", target: null, actual: null }])}
              sx={{ alignSelf: "flex-start" }}
            >
              {t("teamBoard.addYear")}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** Feu tricolore d'un quadrant : vert au-dessus de l'objectif et en
 * progression, rouge en dessous et en recul, orange entre les deux. */
function TrafficLight({ color }: { color: "green" | "orange" | "red" }) {
  const lamps: { key: "red" | "orange" | "green"; fill: string }[] = [
    { key: "red", fill: "#d32f2f" },
    { key: "orange", fill: "#ed9c28" },
    { key: "green", fill: "#2e9e4f" },
  ];
  return (
    <svg width={14} height={30} viewBox="0 0 14 30">
      <rect x="0.5" y="0.5" width="13" height="29" rx="3" fill="#3b3b3b" stroke="#2a2a2a" />
      {lamps.map((lamp, i) => (
        <circle
          key={lamp.key}
          cx={7}
          cy={6.5 + i * 8.5}
          r={3.1}
          fill={lamp.key === color ? lamp.fill : "#5c5c5c"}
          opacity={lamp.key === color ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}

/** Vignette d'une personne sur la planche ID-TPD : photo, nom sur bandeau
 * coloré, écart et performance à droite — la lecture de la capture. */
function TpdPerson({
  row,
  tone,
}: {
  row: { id: number; name: string; avatar: string | null; performance: number; progression: number | null; rating: PerformanceRating };
  tone: string;
}) {
  const up = (row.progression ?? 0) >= 0;
  return (
    <Stack direction="row" spacing={0.5} alignItems="flex-start">
      <Stack alignItems="center" spacing={0.25} sx={{ width: 52 }}>
        <Avatar
          src={row.avatar ?? undefined}
          variant="rounded"
          sx={{ width: 38, height: 38, fontSize: 15, border: "1px solid", borderColor: "divider" }}
        >
          {row.name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ bgcolor: tone, borderRadius: 0.5, px: 0.5, maxWidth: "100%" }}>
          <Typography noWrap sx={{ fontSize: 8.5, fontWeight: 700, color: "#fff" }}>
            {row.name.split(" ")[0]}
          </Typography>
        </Box>
      </Stack>
      <Stack spacing={0} sx={{ pt: 0.25 }}>
        {row.progression !== null && (
          <Typography sx={{ fontSize: 9.5, fontWeight: 800, color: up ? "#2e9e4f" : "#d32f2f", lineHeight: 1.2 }}>
            {up ? "▲" : "▼"}
            {up ? "+" : ""}
            {row.progression}
          </Typography>
        )}
        <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: performanceColors[row.rating], lineHeight: 1.2 }}>
          {row.performance}%
        </Typography>
      </Stack>
    </Stack>
  );
}

/**
 * Matrice ID-3A de l'équipe pour une campagne, conforme à la planche : une
 * bulle par personne, colorée selon son palier, portant son prénom et l'année ;
 * Attitudes (SSI) en abscisse, Aptitudes (HSI) en ordonnée, graduées de 0 à 5
 * par demi-points ; le TPR de la période encadré sous le repère.
 */
function Id3aTeamChart({
  points,
  title,
  tpr,
  year,
}: {
  points: { id: number; x: number; y: number; label: string; color: string }[];
  title: string;
  tpr: number | null;
  year: string;
}) {
  const { t } = useTranslation();
  const SIZE = { w: 460, h: 330 };
  const PAD = { left: 46, right: 18, top: 16, bottom: 44 };
  const plotW = SIZE.w - PAD.left - PAD.right;
  const plotH = SIZE.h - PAD.top - PAD.bottom;
  const X = (v: number) => PAD.left + (v / 5) * plotW;
  const Y = (v: number) => PAD.top + plotH - (v / 5) * plotH;
  const ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

  return (
    <Stack spacing={0.5}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, textAlign: "center", color: BOARD_TEXT }}>{title}</Typography>
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${SIZE.w} ${SIZE.h}`} width="100%" style={{ display: "block" }}>
          {/* Trame fine, comme sur la planche */}
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="#f4f8fd" stroke="#c9d6e6" />
          {ticks.map((v) => (
            <line key={`gx-${v}`} x1={X(v)} y1={PAD.top} x2={X(v)} y2={PAD.top + plotH} stroke="#dbe6f2" strokeWidth={1} />
          ))}
          {ticks.map((v) => (
            <line key={`gy-${v}`} x1={PAD.left} y1={Y(v)} x2={PAD.left + plotW} y2={Y(v)} stroke="#dbe6f2" strokeWidth={1} />
          ))}
          {ticks.map((v) => (
            <text key={`ty-${v}`} x={PAD.left - 8} y={Y(v) + 4} textAnchor="end" fontSize={10} fontWeight={700} fill="#2f6bad">
              {v % 1 === 0 ? v : v.toFixed(1)}
            </text>
          ))}
          {[0, 1, 2, 3, 4, 5].map((v) => (
            <text key={`tx-${v}`} x={X(v)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={10} fontWeight={700} fill="#2e7d32">
              {v}
            </text>
          ))}

          {/* Bulles : la personne, son prénom et l'année, comme sur la planche */}
          {points.map((p) => (
            <g key={p.id}>
              <circle cx={X(p.x)} cy={Y(p.y)} r={26} fill={p.color} opacity={0.92} />
              <circle cx={X(p.x) - 8} cy={Y(p.y) - 9} r={7} fill="#ffffff" opacity={0.28} />
              <text x={X(p.x)} y={Y(p.y) - 1} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">
                {p.label.toUpperCase().slice(0, 9)}
              </text>
              <text x={X(p.x)} y={Y(p.y) + 10} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#fff">
                {year}
              </text>
            </g>
          ))}

          {/* Intitulés des axes */}
          <g transform={`translate(14 ${PAD.top + plotH / 2}) rotate(-90)`}>
            <rect x={-42} y={-9} width={84} height={18} rx={2} fill="#3b5aa0" />
            <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">
              {t("evaluationForm.aptitudes").toUpperCase()}
            </text>
          </g>
          <g transform={`translate(${PAD.left + plotW / 2} ${SIZE.h - 8})`}>
            <rect x={-46} y={-14} width={92} height={18} rx={2} fill="#4a9a52" />
            <text x={0} y={-1} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">
              {t("evaluationForm.attitudes").toUpperCase()}
            </text>
          </g>
        </svg>
      </Box>
      {tpr !== null && (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 0.5, py: 0.5, textAlign: "center", bgcolor: "#fff" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: BOARD_TEXT }}>
            {t("teamBoard.tpr")} {year} = {tpr.toFixed(0)}%
          </Typography>
        </Box>
      )}
    </Stack>
  );
}

/**
 * « ID-PMC Team Performance ID » — la carte d'identité de la performance d'une
 * équipe, reprise de la planche de référence.
 *
 * Trois natures d'information s'y croisent, et c'est ce qui gouverne la
 * lecture : ce qui se calcule (cohésion mesurée, ID-3A, ID-TPD, organigramme),
 * ce qui se saisit à l'atelier (vision, valeurs, réalisations, priorités), et
 * ce qui se déduit d'autres écrans (toile relationnelle, forces et faiblesses
 * partagées avec la planche du même nom). Rien n'est ressaisi deux fois.
 */
export default function TeamPerformanceIdBoard({
  teamId,
  teamName,
  board,
  patch,
  readOnly,
  editing,
}: {
  teamId: number | "";
  teamName: string;
  board: TeamBoard | null;
  patch: (values: Partial<TeamBoard>) => void;
  readOnly: boolean;
  /** Vrai pendant une saisie : hors de ce cas la planche se lit en texte. */
  editing: boolean;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<UserRecord[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [cohesion, setCohesion] = useState<TeamCohesionAnalysis[]>([]);
  const [relationships, setRelationships] = useState<TeamRelationship[]>([]);

  useEffect(() => {
    if (teamId === "") return;
    apiClient
      .get<Paginated<UserRecord>>("/users/", { params: { department: teamId, page_size: 200 } })
      .then((r) => setMembers(r.data.results));
    apiClient
      .get<Paginated<Evaluation>>("/evaluations/", { params: { page_size: 500 } })
      .then((r) => setEvaluations(r.data.results));
    apiClient
      .get<Paginated<TeamCohesionAnalysis>>("/cohesion-analyses/", { params: { team: teamId, page_size: 100 } })
      .then((r) => setCohesion(r.data.results));
    apiClient
      .get<Paginated<TeamRelationship>>("/team-relationships/", { params: { team: teamId, page_size: 500 } })
      .then((r) => setRelationships(r.data.results));
  }, [teamId]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const teamEvaluations = useMemo(() => evaluations.filter((e) => memberIds.has(e.user)), [evaluations, memberIds]);
  const manager = members.find((m) => m.role === "MANAGER") ?? null;
  const others = members.filter((m) => m.id !== manager?.id);

  /** Cohésion mesurée, une barre par année. */
  const cohesionByYear = useMemo(
    () =>
      [...cohesion]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => ({ year: c.date.slice(0, 4), ice: Number(c.ice_score) })),
    [cohesion]
  );
  const latestIce = cohesionByYear.length ? cohesionByYear[cohesionByYear.length - 1] : null;

  /** ID-3A de l'équipe sur les deux dernières campagnes disponibles. */
  const campaigns = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; start: string }>();
    teamEvaluations.forEach((e) => byId.set(e.campaign, { id: e.campaign, name: e.campaign_name, start: e.campaign_start_date }));
    return Array.from(byId.values()).sort((a, b) => a.start.localeCompare(b.start));
  }, [teamEvaluations]);

  function id3aFor(campaignId: number | undefined) {
    if (campaignId === undefined) return { points: [], tpr: null as number | null };
    const rows = teamEvaluations.filter((e) => e.campaign === campaignId);
    const points = rows.map((e) => ({
      id: e.id,
      x: Number(e.ssi),
      y: Number(e.hsi),
      label: (e.user_name || "").split(" ")[0],
      color: performanceColors[e.performance_rating],
    }));
    const tpr = rows.length
      ? (rows.filter((e) => Number(e.altitude_percentage) >= 90).length / rows.length) * 100
      : null;
    return { points, tpr };
  }

  const previous = id3aFor(campaigns[campaigns.length - 2]?.id);
  const current = id3aFor(campaigns[campaigns.length - 1]?.id);

  /** Période de lecture de l'ID-TPD : la planche situe une équipe à un moment
   * donné, elle ne vaut donc que rapportée à une campagne. La plus récente
   * s'ouvre par défaut. */
  const [tpdCampaignId, setTpdCampaignId] = useState<number | "">("");
  const tpdCampaign = campaigns.find((c) => c.id === tpdCampaignId) ?? campaigns[campaigns.length - 1] ?? null;

  /** ID-TPD : performance de la période choisie et progression depuis la
   * précédente, par membre — le feu passe au vert au-delà des objectifs. */
  const tpdRows = useMemo(() => {
    if (!tpdCampaign) return [];
    const byUser = new Map<number, Evaluation[]>();
    teamEvaluations.forEach((e) => {
      if (!byUser.has(e.user)) byUser.set(e.user, []);
      byUser.get(e.user)!.push(e);
    });
    return Array.from(byUser.values())
      .map((list) => {
        const sorted = [...list].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
        const index = sorted.findIndex((e) => e.campaign === tpdCampaign.id);
        if (index === -1) return null;
        const current = sorted[index];
        const before = index > 0 ? sorted[index - 1] : undefined;
        const performance = Number(current.altitude_percentage);
        const progression = before
          ? Math.round((performance - Number(before.altitude_percentage)) * 10) / 10
          : null;
        return {
          id: current.user,
          name: current.user_name,
          avatar: current.user_avatar,
          performance,
          progression,
          rating: current.performance_rating,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.performance - a.performance);
  }, [teamEvaluations, tpdCampaign]);

  if (teamId === "") return <Alert severity="info">{t("teamBoard.noEntryHint")}</Alert>;
  if (!board) return <Alert severity="info">{t("teamBoard.noEntryHint")}</Alert>;


  return (
    <Paper elevation={0} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", bgcolor: "#fbfbfa", color: BOARD_TEXT }}>
      <Box sx={{ bgcolor: BOARD_CREAM, borderRadius: 0.5, py: 1, mb: 1.5, textAlign: "center" }}>
        <Typography sx={{ fontWeight: 800, fontSize: 17, color: BOARD_TEXT }}>
          {`${t("teamBoard.teamIdTitle").toUpperCase()} — ${teamName || "—"}`}
        </Typography>
      </Box>

      {/* ---- Bandeau 1 : équipe, cohésion, relations, réalisations ----
          Cinq colonnes de même largeur et de même hauteur, comme sur la
          planche. La grille remplace l'empilement souple : celui-ci laissait
          chaque bloc prendre sa largeur propre et rompait l'alignement. */}
      <Box
        sx={{
          display: "grid",
          // Cinq blocs de même largeur, côte à côte en toutes circonstances :
          // sur écran étroit la ligne défile plutôt que de se replier, un
          // repliement casserait la lecture d'ensemble de la planche.
          gap: 1,
          mb: 1,
          alignItems: "stretch",
          gridTemplateColumns: "repeat(5, minmax(250px, 1fr))",
          overflowX: "auto",
          pb: 0.5,
        }}
      >
        {/* Bandeau jaune et texte sombre : l'entête « ÉQUIPE : » de la planche. */}
        <BoardPanel
          title={`${t("teamBoard.team").toUpperCase()} :`}
          bg="#ffff66"
          titleColor={BOARD_TEXT}
          titleAlign="left"
        >
          <TeamOrgChart manager={manager} members={others} />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.teamCohesion").toUpperCase()}>
          {cohesionByYear.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t("cohesion.noHistory")}
            </Typography>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={cohesionByYear} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#6b6b66" }} tickLine={false} />
                  <YAxis hide domain={[0, 5]} />
                  <Bar dataKey="ice" radius={[2, 2, 0, 0]}>
                    {cohesionByYear.map((_, i) => (
                      <Cell key={i} fill={YEAR_COLORS[i % YEAR_COLORS.length]} />
                    ))}
                    <LabelList dataKey="ice" position="top" style={{ fontSize: 12, fontWeight: 700, fill: BOARD_TEXT }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {latestIce && (
                <Typography sx={{ textAlign: "center", fontWeight: 800, fontSize: 13 }}>
                  {t("teamBoard.ice")} {latestIce.year} = {latestIce.ice.toFixed(1)}
                </Typography>
              )}
            </>
          )}
        </BoardPanel>

        <BoardPanel title={t("teamBoard.spider").toUpperCase()}>
          {/* Remontée mesurée : assez pour ne pas flotter bas dans le cadre,
            * pas au point de venir buter contre le bandeau du titre. */}
          <Box sx={{ mt: 0.5 }}>
            <TeamSpiderGraph
              members={members}
              relationships={relationships}
              size={300}
              centerId={manager?.id ?? null}
              showLegend={false}
            />
          </Box>
        </BoardPanel>

        {/* Réussites et échecs se lisent ensemble : un même bloc, deux
          * sections, comme sur la planche de référence. */}
        <BoardPanel title={t("teamBoard.achievements").toUpperCase()}>
          <EditableList items={board.achievements} onChange={(v) => patch({ achievements: v })} rows={5} readOnly={readOnly} dense hideEmpty asText={!editing} />
          <Box sx={{ mt: 1.25 }}>
            <BandTitle>{t("teamBoard.failures").toUpperCase()}</BandTitle>
            <Box sx={{ mt: 0.75 }}>
              <EditableList items={board.failures_lessons} onChange={(v) => patch({ failures_lessons: v })} rows={4} readOnly={readOnly} dense hideEmpty asText={!editing} />
            </Box>
          </Box>
        </BoardPanel>

        <BoardPanel title={t("teamBoard.targetsVsActuals").toUpperCase()}>
          <TargetsVsActuals
            rows={board.targets_vs_actuals}
            onChange={(v) => patch({ targets_vs_actuals: v })}
            readOnly={readOnly}
            title={t("teamBoard.targetsVsActuals").toUpperCase()}
            editable={editing}
          />
        </BoardPanel>
      </Box>

      {/* ---- Bandeau 2 : forces, faiblesses, vision, valeurs, objectifs ----
          Même grille serrée que la première ligne : les blocs gagnent en
          largeur ce que les écarts leur rendent. */}
      <Box
        sx={{
          display: "grid",
          gap: 1,
          mb: 1,
          alignItems: "stretch",
          gridTemplateColumns: "repeat(5, minmax(250px, 1fr))",
          overflowX: "auto",
          pb: 0.5,
        }}
      >
        <BoardPanel title={t("teamBoard.strengths").toUpperCase()}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2e7d32", mb: 0.5 }}>
            {t("teamBoard.people").toUpperCase()}
          </Typography>
          <EditableList items={board.people_strengths} onChange={(v) => patch({ people_strengths: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2f6bad", mt: 1, mb: 0.5 }}>
            {t("teamBoard.business").toUpperCase()}
          </Typography>
          <EditableList items={board.business_strengths} onChange={(v) => patch({ business_strengths: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.weaknesses").toUpperCase()}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2e7d32", mb: 0.5 }}>
            {t("teamBoard.people").toUpperCase()}
          </Typography>
          <EditableList items={board.people_weaknesses} onChange={(v) => patch({ people_weaknesses: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2f6bad", mt: 1, mb: 0.5 }}>
            {t("teamBoard.business").toUpperCase()}
          </Typography>
          <EditableList items={board.business_weaknesses} onChange={(v) => patch({ business_weaknesses: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>

        {/* La vision au centre de la planche, comme sur la fiche de référence. */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "50% / 18%",
            bgcolor: "#f2f3f5",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            alignSelf: "flex-start",
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 12, textAlign: "center", mb: 0.75 }}>
            {t("teamBoard.visionMissions").toUpperCase()}
          </Typography>
          <InputBase
            value={board.vision_missions}
            readOnly={readOnly || !editing}
            multiline
            minRows={editing ? 3 : 1}
            onChange={(e) => patch({ vision_missions: e.target.value })}
            sx={{
              width: "100%",
              fontSize: 12,
              lineHeight: 1.35,
              textAlign: "center",
              "& textarea": { textAlign: "center" },
            }}
          />
        </Paper>

        <BoardPanel title={t("teamBoard.values").toUpperCase()}>
          <EditableList items={board.values} onChange={(v) => patch({ values: v })} rows={4} readOnly={readOnly} dense hideEmpty asText={!editing} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#b3211f", mt: 1, mb: 0.5 }}>
            {t("teamBoard.counterValues").toUpperCase()}
          </Typography>
          <EditableList items={board.counter_values} onChange={(v) => patch({ counter_values: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>

        {/* Les objectifs se lisent aussi dans le temps : mêmes séries que
          * « Réalisations vs objectifs », sur les années à venir. */}
        <BoardPanel title={t("teamBoard.objectives").toUpperCase()}>
          <TargetsVsActuals
            rows={board.objectives_plan}
            onChange={(v) => patch({ objectives_plan: v })}
            readOnly={readOnly}
            title={t("teamBoard.objectives").toUpperCase()}
            editable={editing}
          />
        </BoardPanel>
      </Box>

      {/* ---- Bandeau 3 : ID-3A équipe, ID-TPD, priorités ----
          L'ID-3A porte deux repères côte à côte : il lui faut une colonne et
          demie, les trois autres se partageant le reste à parts égales. */}
      <Box
        sx={{
          display: "grid",
          gap: 1,
          alignItems: "stretch",
          gridTemplateColumns: "minmax(420px, 1.7fr) repeat(3, minmax(230px, 1fr))",
          overflowX: "auto",
          pb: 0.5,
        }}
      >
        <BoardPanel title={t("teamBoard.id3aTeam").toUpperCase()}>
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Id3aTeamChart
                points={previous.points}
                tpr={previous.tpr}
                title={`ID 3A — ${campaigns[campaigns.length - 2]?.name ?? "—"}`}
                year={(campaigns[campaigns.length - 2]?.start ?? "").slice(0, 4)}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Id3aTeamChart
                points={current.points}
                tpr={current.tpr}
                title={`ID 3A — ${campaigns[campaigns.length - 1]?.name ?? "—"}`}
                year={(campaigns[campaigns.length - 1]?.start ?? "").slice(0, 4)}
              />
            </Box>
          </Stack>
        </BoardPanel>

        {/* ID-TPD : quatre quadrants, l'objectif en abscisse et la progression
            en ordonnée, un feu par quadrant — la planche de référence. */}
        <BoardPanel title={`${t("teamBoard.idTpd")}${tpdCampaign ? ` ${tpdCampaign.name}` : ""}`.toUpperCase()}>
          {campaigns.length > 1 && (
            <TextField
              select
              size="small"
              className="pmc-no-print"
              value={tpdCampaign?.id ?? ""}
              onChange={(e) => setTpdCampaignId(Number(e.target.value))}
              sx={{ mb: 1, width: "100%", "& .MuiInputBase-input": { fontSize: 11.5, py: 0.5 } }}
            >
              {[...campaigns].reverse().map((c) => (
                <MenuItem key={c.id} value={c.id} sx={{ fontSize: 12 }}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {tpdRows.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t("evaluations.notEvaluated")}
            </Typography>
          ) : (
            <Box>
              <Typography sx={{ fontSize: 10.5, fontWeight: 800, textAlign: "center", mb: 0.5 }}>
                {t("teamBoard.target")}
              </Typography>
              <Box sx={{ position: "relative" }}>
                {/* Axes, en arrière-plan des quadrants */}
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    "&::before, &::after": {
                      content: '""',
                      position: "absolute",
                      bgcolor: "#c7d0dd",
                    },
                    "&::before": { left: "50%", top: 0, bottom: 0, width: "2px", ml: "-1px" },
                    "&::after": { top: "50%", left: 0, right: 0, height: "2px", mt: "-1px" },
                  }}
                />
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 1,
                    position: "relative",
                  }}
                >
                  {QUADRANTS.map((quadrant) => {
                    const people = tpdRows.filter(
                      (r) =>
                        (r.performance >= TPD_TARGET) === quadrant.above &&
                        ((r.progression ?? 0) >= 0) === quadrant.rising
                    );
                    return (
                      <Box
                        key={quadrant.key}
                        sx={{
                          position: "relative",
                          border: "1.5px dashed",
                          borderColor: "#9fb3d1",
                          borderRadius: 1.5,
                          bgcolor: "#fdfdfd",
                          minHeight: 96,
                          p: 0.75,
                          pt: 1,
                        }}
                      >
                        <Box sx={{ position: "absolute", top: 4, [quadrant.lightSide]: 4 }}>
                          <TrafficLight color={quadrant.light} />
                        </Box>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          flexWrap="wrap"
                          useFlexGap
                          justifyContent="center"
                          sx={{ pl: quadrant.lightSide === "left" ? 2 : 0, pr: quadrant.lightSide === "right" ? 2 : 0 }}
                        >
                          {people.map((row) => (
                            <TpdPerson key={row.id} row={row} tone={quadrant.tone} />
                          ))}
                        </Stack>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          )}
        </BoardPanel>

        <BoardPanel title={t("teamBoard.prioritiesCohesion").toUpperCase()}>
          <EditableList items={board.priorities_cohesion} onChange={(v) => patch({ priorities_cohesion: v })} rows={5} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.prioritiesBusiness").toUpperCase()}>
          <EditableList items={board.priorities_business} onChange={(v) => patch({ priorities_business: v })} rows={5} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>
      </Box>
    </Paper>
  );
}
