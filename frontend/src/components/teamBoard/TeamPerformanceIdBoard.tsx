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
import type { Evaluation, Paginated, TeamBoard, TeamCohesionAnalysis, TeamRelationship, UserRecord } from "@/api/types";
import { performanceColors } from "@/theme";
import { BOARD_CREAM, BOARD_TEXT, BandTitle, BoardPanel, EditableList, TeamSpiderGraph } from "./BoardPieces";

const YEAR_COLORS = ["#5b8ac6", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6"];

/** Organigramme compact de l'équipe : le responsable, puis ses membres. */
function TeamOrgChart({ manager, members }: { manager: UserRecord | null; members: UserRecord[] }) {
  return (
    <Stack alignItems="center" spacing={0.5}>
      {manager && (
        <>
          <Avatar src={manager.avatar ?? undefined} sx={{ width: 44, height: 44, bgcolor: "primary.main" }}>
            {(manager.full_name || manager.email).charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ bgcolor: "#fdf6c8", border: "1px solid #d8d2a8", borderRadius: 0.5, px: 0.75 }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: BOARD_TEXT }}>
              {manager.full_name || manager.email}
            </Typography>
          </Box>
          <Box sx={{ width: 2, height: 12, bgcolor: "divider" }} />
        </>
      )}
      <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
        {members.map((m) => (
          <Stack key={m.id} alignItems="center" spacing={0.25} sx={{ width: 62 }}>
            <Avatar src={m.avatar ?? undefined} sx={{ width: 30, height: 30, fontSize: 13, bgcolor: "primary.light" }}>
              {(m.full_name || m.email).charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ bgcolor: "#fdf6c8", border: "1px solid #d8d2a8", borderRadius: 0.5, px: 0.4, width: "100%" }}>
              <Typography noWrap sx={{ fontSize: 9, fontWeight: 700, textAlign: "center", color: BOARD_TEXT }}>
                {(m.full_name || m.email).split(" ")[0]}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Stack>
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
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={data} margin={{ top: 26, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#e6e5df" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 12, fontWeight: 700, fill: "#3a3a3a" }} tickLine={false} axisLine={false} />
            <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
            <Legend verticalAlign="bottom" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="linear"
              dataKey="target"
              name={t("teamBoard.target")}
              stroke="#e02b20"
              strokeWidth={3}
              dot={{ r: 6, fill: "#e02b20", strokeWidth: 0 }}
            >
              <LabelList dataKey="target" position="top" style={{ fontSize: 13, fontWeight: 800, fill: "#1a1a1a" }} />
            </Line>
            <Line
              type="linear"
              dataKey="actual"
              name={t("teamBoard.actual")}
              stroke="#3d8fd0"
              strokeWidth={3}
              dot={{ r: 6, fill: "#3d8fd0", strokeWidth: 0 }}
            >
              <LabelList dataKey="actual" position="bottom" style={{ fontSize: 13, fontWeight: 800, fill: "#1a1a1a" }} />
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

  /** ID-TPD : performance de la dernière campagne et progression depuis la
   * précédente, par membre — le feu passe au vert au-delà des objectifs. */
  const tpdRows = useMemo(() => {
    const byUser = new Map<number, Evaluation[]>();
    teamEvaluations.forEach((e) => {
      if (!byUser.has(e.user)) byUser.set(e.user, []);
      byUser.get(e.user)!.push(e);
    });
    return Array.from(byUser.values())
      .map((list) => {
        const sorted = [...list].sort((a, b) => a.campaign_start_date.localeCompare(b.campaign_start_date));
        const last = sorted[sorted.length - 1];
        const before = sorted[sorted.length - 2];
        const performance = Number(last.altitude_percentage);
        const progression = before ? Math.round((performance - Number(before.altitude_percentage)) * 10) / 10 : null;
        return { id: last.user, name: last.user_name, avatar: last.user_avatar, performance, progression, rating: last.performance_rating };
      })
      .sort((a, b) => b.performance - a.performance);
  }, [teamEvaluations]);

  if (teamId === "") return <Alert severity="info">{t("teamBoard.noEntryHint")}</Alert>;
  if (!board) return <Alert severity="info">{t("teamBoard.noEntryHint")}</Alert>;

  const panel = { flex: 1, minWidth: 240 };

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
          gap: 1.5,
          mb: 1.5,
          alignItems: "stretch",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(5, minmax(0, 1fr))",
          },
        }}
      >
        <BoardPanel title={t("teamBoard.team")}>
          <TeamOrgChart manager={manager} members={others} />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.teamCohesion")}>
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

        <BoardPanel title={t("teamBoard.spider")}>
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
        <BoardPanel title={t("teamBoard.achievements")}>
          <EditableList items={board.achievements} onChange={(v) => patch({ achievements: v })} rows={5} readOnly={readOnly} dense hideEmpty asText={!editing} />
          <Box sx={{ mt: 1.25 }}>
            <BandTitle>{t("teamBoard.failures")}</BandTitle>
            <Box sx={{ mt: 0.75 }}>
              <EditableList items={board.failures_lessons} onChange={(v) => patch({ failures_lessons: v })} rows={4} readOnly={readOnly} dense hideEmpty asText={!editing} />
            </Box>
          </Box>
        </BoardPanel>

        <BoardPanel title={t("teamBoard.targetsVsActuals")}>
          <TargetsVsActuals
            rows={board.targets_vs_actuals}
            onChange={(v) => patch({ targets_vs_actuals: v })}
            readOnly={readOnly}
            title={t("teamBoard.targetsVsActuals")}
            editable={editing}
          />
        </BoardPanel>
      </Box>

      {/* ---- Bandeau 2 : forces, faiblesses, vision, valeurs, objectifs ---- */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="stretch" sx={{ mb: 1.5 }}>
        <BoardPanel title={t("teamBoard.strengths")} sx={panel}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2e7d32", mb: 0.5 }}>
            {t("teamBoard.people").toUpperCase()}
          </Typography>
          <EditableList items={board.people_strengths} onChange={(v) => patch({ people_strengths: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2f6bad", mt: 1, mb: 0.5 }}>
            {t("teamBoard.business").toUpperCase()}
          </Typography>
          <EditableList items={board.business_strengths} onChange={(v) => patch({ business_strengths: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.weaknesses")} sx={panel}>
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
            ...panel,
            p: 2,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "50% / 22%",
            bgcolor: "#f2f3f5",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 12.5, textAlign: "center", mb: 1 }}>
            {t("teamBoard.visionMissions").toUpperCase()}
          </Typography>
          <InputBase
            value={board.vision_missions}
            readOnly={readOnly || !editing}
            multiline
            minRows={5}
            onChange={(e) => patch({ vision_missions: e.target.value })}
            sx={{ width: "100%", fontSize: 12.5, textAlign: "center", "& textarea": { textAlign: "center" } }}
          />
        </Paper>

        <BoardPanel title={t("teamBoard.values")} sx={panel}>
          <EditableList items={board.values} onChange={(v) => patch({ values: v })} rows={4} readOnly={readOnly} dense hideEmpty asText={!editing} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#b3211f", mt: 1, mb: 0.5 }}>
            {t("teamBoard.counterValues").toUpperCase()}
          </Typography>
          <EditableList items={board.counter_values} onChange={(v) => patch({ counter_values: v })} rows={3} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>

        {/* Les objectifs se lisent aussi dans le temps : mêmes séries que
          * « Réalisations vs objectifs », sur les années à venir. */}
        <BoardPanel title={t("teamBoard.objectives")} sx={panel}>
          <TargetsVsActuals
            rows={board.objectives_plan}
            onChange={(v) => patch({ objectives_plan: v })}
            readOnly={readOnly}
            title={t("teamBoard.objectives")}
            editable={editing}
          />
        </BoardPanel>
      </Stack>

      {/* ---- Bandeau 3 : ID-3A équipe, ID-TPD, priorités ---- */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="stretch">
        <BoardPanel title={t("teamBoard.id3aTeam")} sx={{ ...panel, minWidth: 340 }}>
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

        <BoardPanel title={t("teamBoard.idTpd")} sx={panel}>
          <Stack spacing={0.5}>
            {tpdRows.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                {t("evaluations.notEvaluated")}
              </Typography>
            )}
            {tpdRows.map((row) => (
              <Stack key={row.id} direction="row" spacing={1} alignItems="center">
                <Avatar src={row.avatar ?? undefined} sx={{ width: 26, height: 26, fontSize: 12 }}>
                  {row.name.charAt(0).toUpperCase()}
                </Avatar>
                <Typography noWrap sx={{ fontSize: 11.5, flex: 1, minWidth: 0 }}>
                  {row.name}
                </Typography>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: performanceColors[row.rating] }}>
                  {row.performance}%
                </Typography>
                {row.progression !== null && (
                  <Typography
                    sx={{ fontSize: 11, fontWeight: 700, width: 44, textAlign: "right", color: row.progression >= 0 ? "#2e7d32" : "#c62828" }}
                  >
                    {row.progression >= 0 ? "▲" : "▼"} {Math.abs(row.progression)}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </BoardPanel>

        <BoardPanel title={t("teamBoard.prioritiesCohesion")} sx={panel}>
          <EditableList items={board.priorities_cohesion} onChange={(v) => patch({ priorities_cohesion: v })} rows={5} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.prioritiesBusiness")} sx={panel}>
          <EditableList items={board.priorities_business} onChange={(v) => patch({ priorities_business: v })} rows={5} readOnly={readOnly} dense hideEmpty asText={!editing} />
        </BoardPanel>
      </Stack>
    </Paper>
  );
}
