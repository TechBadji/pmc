import { Alert, Avatar, Box, InputBase, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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

/** Réalisations vs objectifs : une ligne par année, saisie à la main puis
 * tracée — l'objectif d'une équipe n'est pas déductible des évaluations. */
function TargetsVsActuals({
  rows,
  onChange,
  readOnly,
}: {
  rows: TeamBoard["targets_vs_actuals"];
  onChange: (next: TeamBoard["targets_vs_actuals"]) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const data = rows.filter((r) => r.year);

  function setAt(i: number, patch: Partial<TeamBoard["targets_vs_actuals"][number]>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }

  return (
    <Stack spacing={1}>
      {data.length > 0 && (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e6e5df" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#6b6b66" }} tickLine={false} />
            <YAxis hide />
            <Line type="linear" dataKey="target" stroke="#d33a30" strokeWidth={2.5} dot={{ r: 5 }} name={t("teamBoard.target")}>
              <LabelList dataKey="target" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#d33a30" }} />
            </Line>
            <Line type="linear" dataKey="actual" stroke="#2f7fd0" strokeWidth={2.5} dot={{ r: 5 }} name={t("teamBoard.actual")}>
              <LabelList dataKey="actual" position="bottom" style={{ fontSize: 11, fontWeight: 700, fill: "#2f7fd0" }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      )}
      {!readOnly && (
        <Stack spacing={0.5}>
          {rows.map((row, i) => (
            <Stack key={i} direction="row" spacing={0.5}>
              <TextField
                size="small"
                value={row.year}
                placeholder={t("teamBoard.year")}
                onChange={(e) => setAt(i, { year: e.target.value })}
                sx={{ width: 84, "& .MuiInputBase-input": { fontSize: 12, py: 0.5 } }}
              />
              <TextField
                size="small"
                type="number"
                value={row.target ?? ""}
                placeholder={t("teamBoard.target")}
                onChange={(e) => setAt(i, { target: e.target.value === "" ? null : Number(e.target.value) })}
                sx={{ width: 96, "& .MuiInputBase-input": { fontSize: 12, py: 0.5 } }}
              />
              <TextField
                size="small"
                type="number"
                value={row.actual ?? ""}
                placeholder={t("teamBoard.actual")}
                onChange={(e) => setAt(i, { actual: e.target.value === "" ? null : Number(e.target.value) })}
                sx={{ width: 96, "& .MuiInputBase-input": { fontSize: 12, py: 0.5 } }}
              />
            </Stack>
          ))}
          <Typography
            component="button"
            onClick={() => onChange([...rows, { year: "", target: null, actual: null }])}
            sx={{ alignSelf: "flex-start", background: "none", border: 0, color: "primary.main", fontSize: 12, cursor: "pointer", p: 0 }}
          >
            + {t("teamBoard.addYear")}
          </Typography>
        </Stack>
      )}
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
}: {
  teamId: number | "";
  teamName: string;
  board: TeamBoard | null;
  patch: (values: Partial<TeamBoard>) => void;
  readOnly: boolean;
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

      {/* ---- Bandeau 1 : équipe, cohésion, relations, réalisations ---- */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="stretch" sx={{ mb: 1.5 }}>
        <BoardPanel title={t("teamBoard.team")} sx={panel}>
          <TeamOrgChart manager={manager} members={others} />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.teamCohesion")} sx={panel}>
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

        <BoardPanel title={t("teamBoard.spider")} sx={{ ...panel, minWidth: 300 }}>
          <TeamSpiderGraph
            members={members}
            relationships={relationships}
            size={300}
            centerId={manager?.id ?? null}
            showLegend={false}
          />
        </BoardPanel>

        {/* Réussites et échecs se lisent ensemble : un même bloc, deux
          * sections, comme sur la planche de référence. */}
        <BoardPanel title={t("teamBoard.achievements")} sx={panel}>
          <EditableList items={board.achievements} onChange={(v) => patch({ achievements: v })} rows={5} readOnly={readOnly} dense />
          <Box sx={{ mt: 1.25 }}>
            <BandTitle>{t("teamBoard.failures")}</BandTitle>
            <Box sx={{ mt: 0.75 }}>
              <EditableList items={board.failures_lessons} onChange={(v) => patch({ failures_lessons: v })} rows={4} readOnly={readOnly} dense />
            </Box>
          </Box>
        </BoardPanel>

        <BoardPanel title={t("teamBoard.targetsVsActuals")} sx={panel}>
          <TargetsVsActuals rows={board.targets_vs_actuals} onChange={(v) => patch({ targets_vs_actuals: v })} readOnly={readOnly} />
        </BoardPanel>
      </Stack>

      {/* ---- Bandeau 2 : forces, faiblesses, vision, valeurs, objectifs ---- */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="stretch" sx={{ mb: 1.5 }}>
        <BoardPanel title={t("teamBoard.strengths")} sx={panel}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2e7d32", mb: 0.5 }}>
            {t("teamBoard.people").toUpperCase()}
          </Typography>
          <EditableList items={board.people_strengths} onChange={(v) => patch({ people_strengths: v })} rows={3} readOnly={readOnly} dense />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2f6bad", mt: 1, mb: 0.5 }}>
            {t("teamBoard.business").toUpperCase()}
          </Typography>
          <EditableList items={board.business_strengths} onChange={(v) => patch({ business_strengths: v })} rows={3} readOnly={readOnly} dense />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.weaknesses")} sx={panel}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2e7d32", mb: 0.5 }}>
            {t("teamBoard.people").toUpperCase()}
          </Typography>
          <EditableList items={board.people_weaknesses} onChange={(v) => patch({ people_weaknesses: v })} rows={3} readOnly={readOnly} dense />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#2f6bad", mt: 1, mb: 0.5 }}>
            {t("teamBoard.business").toUpperCase()}
          </Typography>
          <EditableList items={board.business_weaknesses} onChange={(v) => patch({ business_weaknesses: v })} rows={3} readOnly={readOnly} dense />
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
            readOnly={readOnly}
            multiline
            minRows={5}
            onChange={(e) => patch({ vision_missions: e.target.value })}
            sx={{ width: "100%", fontSize: 12.5, textAlign: "center", "& textarea": { textAlign: "center" } }}
          />
        </Paper>

        <BoardPanel title={t("teamBoard.values")} sx={panel}>
          <EditableList items={board.values} onChange={(v) => patch({ values: v })} rows={4} readOnly={readOnly} dense />
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: "#b3211f", mt: 1, mb: 0.5 }}>
            {t("teamBoard.counterValues").toUpperCase()}
          </Typography>
          <EditableList items={board.counter_values} onChange={(v) => patch({ counter_values: v })} rows={3} readOnly={readOnly} dense />
        </BoardPanel>

        {/* Les objectifs se lisent aussi dans le temps : mêmes séries que
          * « Réalisations vs objectifs », sur les années à venir. */}
        <BoardPanel title={t("teamBoard.objectives")} sx={panel}>
          <TargetsVsActuals
            rows={board.objectives_plan}
            onChange={(v) => patch({ objectives_plan: v })}
            readOnly={readOnly}
          />
          <Box sx={{ mt: 1 }}>
            <EditableList items={board.objectives} onChange={(v) => patch({ objectives: v })} rows={3} readOnly={readOnly} dense />
          </Box>
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
          <EditableList items={board.priorities_cohesion} onChange={(v) => patch({ priorities_cohesion: v })} rows={5} readOnly={readOnly} dense />
        </BoardPanel>

        <BoardPanel title={t("teamBoard.prioritiesBusiness")} sx={panel}>
          <EditableList items={board.priorities_business} onChange={(v) => patch({ priorities_business: v })} rows={5} readOnly={readOnly} dense />
        </BoardPanel>
      </Stack>
    </Paper>
  );
}
