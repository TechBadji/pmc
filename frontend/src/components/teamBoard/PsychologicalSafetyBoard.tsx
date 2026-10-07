import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import { usePeerDirection } from "@/app/peerDirection";
import PsychologicalSafetyPage from "@/pages/PsychologicalSafetyPage";
import PsiDirectionsRadar from "./PsiDirectionsRadar";
import PsiOrganisationBars from "./PsiOrganisationBars";
import PsiOrganisationScorecard from "./PsiOrganisationScorecard";
import type { EvaluationCampaign, Paginated, PsiResults, PsiSummary } from "@/api/types";
import { dimensionReading, globalReading, PSI_DIMENSIONS, READING_COLORS } from "@/utils/psychologicalSafety";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

// Le graphique d'ensemble de l'entreprise existe en deux versions ; le choix
// se garde sur l'appareil. La version 2 est proposée d'office.
const ORG_VERSION_KEY = "pmc.psi.orgChartVersion";
type OrgVersion = 1 | 2;

function storedOrgVersion(): OrgVersion {
  try {
    return localStorage.getItem(ORG_VERSION_KEY) === "1" ? 1 : 2;
  } catch {
    return 2;
  }
}

/** Tableau de bord PSI d'une direction (ou de toute l'entreprise pour le CEO) :
 * score par dimension, lecture, indice global et graphique des 4 dimensions.
 * À l'échelle de l'entreprise (`orgView`), `byDirection` choisit entre la
 * lecture d'ensemble et la comparaison des directions entre elles. */
export default function PsychologicalSafetyBoard({
  teamId,
  orgView,
  byDirection = false,
}: {
  teamId: number | "";
  orgView: boolean;
  byDirection?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [data, setData] = useState<PsiResults | null>(null);
  const [error, setError] = useState(false);
  const { user } = useAppSelector((s) => s.auth);
  const { readOnly: peerReadOnly } = usePeerDirection();
  const [entryOpen, setEntryOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [orgVersion, setOrgVersion] = useState<OrgVersion>(storedOrgVersion);
  const [previous, setPrevious] = useState<{ summary: PsiSummary; name: string } | null>(null);

  useEffect(() => {
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 200 } })
      .then((r) => {
        const sorted = [...r.data.results].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setCampaigns(sorted);
        setCampaignId((prev) => (prev === "" ? sorted[0]?.id ?? "" : prev));
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (campaignId === "") return;
    setError(false);
    apiClient
      .get<PsiResults>("/psychological-safety-responses/results/", {
        params: { campaign: campaignId, ...(orgView || teamId === "" ? {} : { team: teamId }) },
      })
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, [campaignId, teamId, orgView, reloadKey]);

  // Résultats de l'entreprise sur la campagne précédente, pour les évolutions
  // de la fiche de synthèse. `campaigns` va de la plus récente à la plus
  // ancienne : la précédente est la suivante dans la liste.
  useEffect(() => {
    setPrevious(null);
    if (!orgView || byDirection || campaignId === "") return;
    const index = campaigns.findIndex((c) => c.id === campaignId);
    const before = index >= 0 ? campaigns[index + 1] : undefined;
    if (!before) return;
    let cancelled = false;
    apiClient
      .get<PsiResults>("/psychological-safety-responses/results/", { params: { campaign: before.id }, silent: true })
      .then((r) => {
        const company = r.data.company;
        if (!cancelled && company?.published && company.global != null) setPrevious({ summary: company, name: before.name });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgView, byDirection, campaignId, campaigns, reloadKey]);

  const chooseOrgVersion = (version: OrgVersion) => {
    setOrgVersion(version);
    try {
      localStorage.setItem(ORG_VERSION_KEY, String(version));
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la page ouverte.
    }
  };

  const summary: PsiSummary | undefined = orgView ? data?.company : data?.teams[0];

  const chart = summary?.published
    ? PSI_DIMENSIONS.map((k) => ({ dimension: t(`psi.dimension.${k}`), score: summary.dimensions?.find((d) => d.key === k)?.score ?? 0 }))
    : [];
  // Comparaison des directions (« Tous les directeurs ») : leurs radars se
  // superposent dès que deux directions au moins sont publiées. Sinon, à
  // l'échelle de l'entreprise, c'est la lecture d'ensemble qui s'affiche.
  const allTeams = orgView && byDirection ? data?.teams ?? [] : [];
  const stacked = allTeams.filter((team) => team.published && team.dimensions).length > 1;
  const organisation = orgView && !stacked;
  const sorted = summary?.dimensions ? [...summary.dimensions].sort((a, b) => b.score - a.score) : [];

  /**
   * Sommet du polygone : un point et, à côté, le score exact — celui du
   * tableau, au centième — pour lire le radar sans survoler ni compter les
   * graduations.
   *
   * Le chiffre se range de côté plutôt que dans le prolongement de l'axe : là,
   * il tomberait sur les graduations de l'axe du haut, et sur le nom de la
   * dimension dès que le score est élevé. À gauche du sommet du haut, à droite
   * de celui du bas, au-dessus de ceux des côtés — toujours hors du polygone.
   *
   * Sous le sommet du bas, le chiffre remonte quand le score approche de 5 :
   * il buterait sinon sur le nom de la dimension. L'arête voisine est alors
   * assez raide pour lui laisser la place.
   */
  const scoreDot = (props: any) => {
    const { cx, cy, index } = props;
    // La ligne est relue par son rang : `payload` est l'enveloppe du point
    // Recharts, qui porte en revanche le centre du radar.
    const row = chart[index];
    if (!row || typeof cx !== "number" || typeof cy !== "number") return <g key={index} />;
    const dx = cx - (typeof props.payload?.cx === "number" ? props.payload.cx : cx);
    const dy = cy - (typeof props.payload?.cy === "number" ? props.payload.cy : cy);
    const vertical = Math.abs(dy) > Math.abs(dx);
    const up = dy < 0;
    const right = dx > 0;
    const paper = theme.palette.background.paper;
    return (
      <g key={index} pointerEvents="none">
        <circle cx={cx} cy={cy} r={4} fill="#2E8FCB" stroke={paper} strokeWidth={2} />
        <text
          x={vertical ? cx + (up ? -9 : 9) : cx + (right ? 3 : -3)}
          y={vertical ? cy + (up ? 1 : row.score >= 4.5 ? 3 : 9) : cy - 12}
          textAnchor={(vertical ? up : !right) ? "end" : "start"}
          fontSize={13}
          fontWeight={800}
          fill={theme.palette.mode === "dark" ? "#7cc4ef" : "#1c5f8c"}
          stroke={paper}
          strokeWidth={3}
          paintOrder="stroke"
        >
          {fmt(row.score)}
        </text>
      </g>
    );
  };

  // La fiche de synthèse (version 2) occupe toute la largeur et reprend le
  // contenu du tableau des scores : elle s'affiche seule, sans le tableau.
  const scorecard = organisation && orgVersion === 2;
  // Titre à gauche, sélecteur de version à droite : les deux dessins du
  // graphique d'ensemble restent à portée de clic.
  const orgHeader = (
    <Stack direction="row" alignItems="center" justifyContent="space-between" columnGap={1} rowGap={0.5} flexWrap="wrap" sx={{ px: 0.5 }}>
      <Typography variant="subtitle2" fontWeight={800}>
        {t("psi.dash.orgChart")}
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={orgVersion}
        onChange={(_, v) => v && chooseOrgVersion(v)}
        className="pmc-no-print"
        sx={{ "& .MuiToggleButton-root": { py: 0.1, px: 1, fontSize: 11, fontWeight: 700, textTransform: "none" } }}
      >
        <ToggleButton value={1}>{t("psi.dash.v2.version", { n: 1 })}</ToggleButton>
        <ToggleButton value={2}>{t("psi.dash.v2.version", { n: 2 })}</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField select size="small" label={t("psi.campaign")} value={campaignId} onChange={(e) => setCampaignId(Number(e.target.value))} sx={{ minWidth: 260 }}>
          {campaigns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        {user?.role === "MANAGER" && !peerReadOnly && (
          <Button
            size="small"
            variant="contained"
            color="secondary"
            startIcon={<AddOutlinedIcon />}
            onClick={() => setEntryOpen(true)}
            sx={{ fontWeight: 700, px: 2, boxShadow: 3, "&:hover": { boxShadow: 6 } }}
          >
            {t("teamBoard.newEntry")}
          </Button>
        )}
        {summary && (
          <Typography variant="body2" color="text.secondary">
            {t("psi.dash.respondents", { n: summary.respondents, total: summary.headcount })}
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error">{t("psi.dash.loadFailed")}</Alert>}
      {summary && summary.respondents === 0 && <Alert severity="info">{t("psi.dash.noData")}</Alert>}
      {summary && summary.respondents > 0 && !summary.published && (
        <Alert severity="info">{t("psi.dash.notPublished", { min: summary.min_respondents, n: summary.respondents })}</Alert>
      )}

      {summary?.published && summary.dimensions && summary.global != null && (
        <>
          {scorecard ? (
            <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 } }}>
              <Stack spacing={2}>
                {orgHeader}
                <PsiOrganisationScorecard summary={summary} previous={previous?.summary ?? null} previousName={previous?.name ?? ""} />
              </Stack>
            </Paper>
          ) : (
          <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
            <Paper variant="outlined" sx={{ flex: 1, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "primary.main" }}>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{t("psi.dash.title")}</TableCell>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">{t("psi.dash.score")}</TableCell>
                    <TableCell sx={{ color: "#fff", fontWeight: 700 }}>{t("psi.dash.reading")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {PSI_DIMENSIONS.map((k) => {
                    const score = summary.dimensions!.find((d) => d.key === k)!.score;
                    const reading = dimensionReading(score);
                    return (
                      <TableRow key={k}>
                        <TableCell>{t(`psi.dimension.${k}`)}</TableCell>
                        <TableCell align="right">{fmt(score)}</TableCell>
                        <TableCell sx={{ color: READING_COLORS[reading], fontWeight: 700 }}>{t(`psi.readingDim.${reading}`)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ bgcolor: "action.hover" }}>
                    <TableCell sx={{ fontWeight: 800 }}>{t("psi.dash.global")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{fmt(summary.global)}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{t(`psi.readingGlobal.${globalReading(summary.global)}`)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>
            <Paper variant="outlined" sx={{ flex: 1, p: 1 }}>
              {organisation ? (
                orgHeader
              ) : (
                <Typography variant="subtitle2" fontWeight={800} align="center">
                  {t(stacked ? "psi.dash.radarAll" : "psi.dash.radar")}
                </Typography>
              )}
              {stacked ? (
                <PsiDirectionsRadar teams={allTeams} />
              ) : organisation ? (
                <PsiOrganisationBars summary={summary} />
              ) : (
              <ResponsiveContainer width="100%" height={300}>
                {/* Noms des dimensions écartés du polygone (tickSize), et rayon
                    réduit d'autant : un score proche de 5 garde la place de son
                    chiffre sans que les noms débordent davantage du cadre. */}
                <RadarChart data={chart} outerRadius="70%">
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fontWeight: 600 }} tickSize={18} tickLine={false} />
                  <PolarRadiusAxis domain={[0, 5]} tickCount={6} angle={90} />
                  <Radar dataKey="score" stroke="#2E8FCB" fill="#2E8FCB" fillOpacity={0.45} strokeWidth={2} dot={scoreDot} />
                  <RechartsTooltip formatter={(v: number) => fmt(v)} />
                </RadarChart>
              </ResponsiveContainer>
              )}
            </Paper>
          </Stack>
          )}
          {/* La fiche de synthèse (version 2) porte déjà sa phrase « À retenir ». */}
          {sorted.length > 1 && !scorecard && (
            <Alert severity="info">
              {t("psi.dash.insight", {
                high: t(`psi.dimension.${sorted[0].key}`),
                highScore: fmt(sorted[0].score),
                low: t(`psi.dimension.${sorted[sorted.length - 1].key}`),
                lowScore: fmt(sorted[sorted.length - 1].score),
              })}
            </Alert>
          )}
        </>
      )}
      <Dialog
        open={entryOpen}
        onClose={() => {
          setEntryOpen(false);
          setReloadKey((k) => k + 1);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t("psi.navLabel")}</DialogTitle>
        <DialogContent>
          <PsychologicalSafetyPage />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEntryOpen(false);
              setReloadKey((k) => k + 1);
            }}
          >
            {t("common.close")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
