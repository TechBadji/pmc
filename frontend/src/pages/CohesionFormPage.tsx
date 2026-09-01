import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiClient } from "@/api/client";
import { BoardPeriodBar } from "@/components/teamBoard/BoardPieces";
import TeamRelationshipBoard from "@/components/teamBoard/TeamRelationshipBoard";
import CohesionOpinionBoard from "@/components/teamBoard/CohesionOpinionBoard";
import TeamStrengthsBoard from "@/components/teamBoard/TeamStrengthsBoard";
import { today as boardToday, useTeamBoard } from "@/features/teamBoard";
import { useAppSelector } from "@/app/hooks";
import type {
  ActionPlan,
  CohesionAggregate,
  CohesionDirectionResult,
  Department,
  EvaluationCampaign,
  Paginated,
  TeamCohesionAnalysis,
  TeamRelationship,
  UserRecord,
} from "@/api/types";
import { cohesionColor } from "@/theme";
import { useCohesionCriteria } from "@/utils/cohesionCriteria";

type PlanStatus = ActionPlan["status"];
const PLAN_STATUSES: PlanStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
// Statuts : gris "à faire", bleu "en cours", vert "terminé" — repris de la
// page Plans d'action pour que le même statut se lise pareil partout.
const STATUS_COLOR: Record<PlanStatus, string> = {
  TODO: "#898781",
  IN_PROGRESS: "#2E8FCB",
  DONE: "#2E7D32",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const ICE_COLOR = "#2E8FCB";
const OCE_COLOR = "#eb6834";
const TIERS = [1, 2, 3, 4, 5];
/** Bleu clair du bandeau titre et de la colonne "Critères de cohésion" — les
 * entêtes de paliers, eux, gardent la couleur du barème 1-5. */
// Cases à fond clair imposé : leur texte doit l'être aussi, sinon il hérite du
// thème et vire au blanc sur fond crème en mode sombre.
const LIGHT_CELL_TEXT = "#20242e";
const HEADER_BLUE = "#dbe4ee";
const HEADER_TEXT = "#243747";

interface CriterionRow {
  criterion: string;
  /** `null` tant que personne n'a noté ce critère. Le défaut était 3, ce qui
   *  affichait dix pastilles « Moyen » présélectionnées sur une fiche vierge :
   *  l'écran donnait à lire une évaluation là où il n'y en avait aucune. */
  score: number | null;
  objective_score: number | null;
  achieved_score: number | null;
}

function sixMonthsFromNow(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

const TIER_LABELS = ["cohesion.legend.1", "cohesion.legend.2", "cohesion.legend.3", "cohesion.legend.4", "cohesion.legend.5"];

/** Encadré valeur (ICE/OCE/Réalisé) — reprend le style "case Excel" de la
 * fiche ID-PMC de référence : boîte bordée avec la valeur en grand. */
function ValueBox({ label, value, bg, suffix }: { label: string; value: number | string | null; bg?: string; suffix?: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="subtitle2" fontWeight={700}>
        {label}
      </Typography>
      <Box
        sx={{
          minWidth: 64,
          px: 1.5,
          py: 0.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: bg ?? "background.paper",
          textAlign: "center",
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          {value !== null ? `${typeof value === "number" ? value.toFixed(1) : value}${suffix ?? ""}` : "—"}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Pastille ovale sélectionnable — une par palier (1 à 5), colorée quand
 * sélectionnée ; sinon blanche avec un léger pourtour gris, comme la case
 * TOTAL — reprend les boutons de la fiche Excel ID-PMC. */
function ScoreOval({ selected, color, onClick, ariaLabel }: { selected: boolean; color: string; onClick: () => void; ariaLabel: string }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      sx={{
        width: 40,
        height: 24,
        borderRadius: 12,
        border: "1px solid",
        borderColor: selected ? color : "divider",
        cursor: "pointer",
        bgcolor: selected ? color : "background.paper",
        transition: "background-color 0.15s",
        "&:hover": { bgcolor: selected ? color : "action.hover" },
      }}
    />
  );
}

/** Option du sélecteur d'équipe : le CEO et ses directeurs, considérés comme
 *  une équipe à part entière. Le comité de direction porte le stockage — c'est
 *  le département dont le CEO est le manager — mais sa composition affichée est
 *  calculée : le CEO, puis ceux qui dirigent une direction. */
const DIRECTORS_TEAM = "__directors__";

export default function CohesionFormPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const criteria = useCohesionCriteria();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");
  // Trois lectures d'une même équipe, dans l'ordre où elles se travaillent :
  // la cohésion mesurée, la dynamique relationnelle qui l'explique, puis les
  // forces et faiblesses qui s'en déduisent.
  const [view, setView] = useState<"cohesion" | "strengths" | "relationship" | "opinion">("cohesion");
  const [aggregate, setAggregate] = useState<CohesionAggregate | null>(null);
  // La fiche se lit désormais par campagne : une campagne borne une période,
  // et tout avis déposé dans cette fenêtre lui appartient. Les collaborateurs
  // n'ont donc pas à répondre tous le même jour pour être comptés ensemble.
  const [campaigns, setCampaigns] = useState<EvaluationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | "">("");
  const [sheetOpinion, setSheetOpinion] = useState<CohesionDirectionResult | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserRecord[]>([]);
  // Vue « Tous les directeurs » : la planche reste celle du comité de
  // direction, seule sa composition change.
  const [directorsView, setDirectorsView] = useState(false);
  const [teamRelationships, setTeamRelationships] = useState<TeamRelationship[]>([]);
  const board = useTeamBoard(teamId);
  const [rows, setRows] = useState<CriterionRow[]>(
    criteria.map((c) => ({ criterion: c, score: null, objective_score: null, achieved_score: null }))
  );
  const [history, setHistory] = useState<TeamCohesionAnalysis[]>([]);
  // Analyse consultée : "" = nouvelle saisie, sinon une analyse déjà enregistrée.
  const [viewedAnalysisId, setViewedAnalysisId] = useState<number | "">("");
  const [saved, setSaved] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [planDialog, setPlanDialog] = useState(false);
  // Une action a deux personnes : celle qui en répond et celle qu'elle vise.
  // Le champ libre « responsable » laissait les deux dans la même case, sans
  // qu'on sache jamais laquelle était nommée.
  const [planForm, setPlanForm] = useState({
    priority: "",
    objective: "",
    due_date: "",
    responsible: "",
    target_user: "" as number | "",
  });
  const [planToDelete, setPlanToDelete] = useState<ActionPlan | null>(null);

  // Les avis agrégés : une seule requête, le serveur ayant déjà fait le calcul
  // et appliqué le seuil de publication.
  // Les avis agrégés, bornés à la campagne choisie. Sans cette borne, les avis
  // retenus étaient les derniers de chacun tandis que la note du directeur
  // était celle de sa fiche la plus récente : l'écart comparait alors deux
  // exercices distants de plusieurs mois, et affichait des écarts de deux
  // points qui ne voulaient rien dire.
  useEffect(() => {
    if (view !== "opinion" || campaignId === "") return;
    setAggregate(null);
    apiClient
      .get<CohesionAggregate>("/cohesion-responses/aggregate/", { params: { campaign: campaignId } })
      .then((r) => setAggregate(r.data))
      .catch(() => setAggregate({ directions: [], company_score: null }));
  }, [view, campaignId]);

  useEffect(() => {
    apiClient
      .get<Paginated<EvaluationCampaign>>("/evaluation-campaigns/", { params: { page_size: 500 } })
      .then((r) => {
        const sorted = [...r.data.results].sort((a, b) => a.start_date.localeCompare(b.start_date));
        setCampaigns(sorted);
        if (sorted.length) setCampaignId((prev) => (prev === "" ? sorted[sorted.length - 1].id : prev));
      });
  }, []);

  // Avis des collaborateurs pour la direction et la campagne affichées : c'est
  // ce qui met, en face de la note de l'encadrant, ce que son équipe a répondu.
  useEffect(() => {
    if (teamId === "" || campaignId === "") {
      setSheetOpinion(null);
      return;
    }
    apiClient
      .get<CohesionAggregate>("/cohesion-responses/aggregate/", {
        params: { team: teamId, campaign: campaignId },
      })
      .then((r) => setSheetOpinion(r.data.directions[0] ?? null))
      .catch(() => setSheetOpinion(null));
  }, [teamId, campaignId]);

  // Changer de campagne, c'est changer d'exercice : on affiche la fiche que
  // l'encadrant a enregistrée dans cette fenêtre, ou une fiche vierge s'il n'y
  // en a pas encore.
  useEffect(() => {
    if (campaignId === "") return;
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    const inWindow = history.find(
      (h) => h.date >= campaign.start_date && h.date <= campaign.end_date
    );
    showAnalysis(inWindow ? inWindow.id : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, history, campaigns]);

  useEffect(() => {
    apiClient.get<Paginated<Department>>("/departments/", { params: { page_size: 500 } }).then((r) => {
      setDepartments(r.data.results);
      // L'encadrant arrive sur sa propre équipe, il n'en a qu'une. Le CEO,
      // lui, en a autant que de directions : en choisir une à sa place, c'était
      // lui présenter une fiche vide en lui laissant croire qu'elle était
      // renseignée. Il choisit.
      if (!isCompanyAdmin && r.data.results.length >= 1) {
        setTeamId(r.data.results[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Changer d'équipe repart d'une fiche vierge — sans ce reset, les scores
    // saisis (mais non enregistrés) pour l'équipe précédente restaient
    // affichés et risquaient d'être soumis par erreur pour la nouvelle équipe.
    setRows(criteria.map((c) => ({ criterion: c, score: null, objective_score: null, achieved_score: null })));
    setSaved(false);
    setViewedAnalysisId("");
    if (!teamId) {
      setHistory([]);
      setPlans([]);
      return;
    }
    apiClient
      .get<Paginated<TeamCohesionAnalysis>>("/cohesion-analyses/", { params: { team: teamId } })
      .then((r) => setHistory(r.data.results));
    apiClient
      .get<Paginated<ActionPlan>>("/action-plans/", { params: { team: teamId } })
      .then((r) => setPlans(r.data.results));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  /** Consultation d'une analyse antérieure : ses notes remplissent la grille,
   * en lecture seule — la fiche sert alors d'archive de la période choisie,
   * sans risque d'écraser une mesure passée. */
  function showAnalysis(id: number | "") {
    setViewedAnalysisId(id);
    setSaved(false);
    if (id === "") {
      setRows(criteria.map((c) => ({ criterion: c, score: null, objective_score: null, achieved_score: null })));
      return;
    }
    const analysis = history.find((h) => h.id === id);
    if (!analysis) return;
    setRows(
      criteria.map((criterion, index) => {
        // Rapprochement par texte, puis par rang. Le libellé d'un critère est
        // sa clé de stockage : le jour où il change — il nomme désormais
        // l'entreprise — les fiches déjà enregistrées cesseraient d'être
        // reconnues et se rouvriraient vierges. Le rang, lui, ne bouge pas.
        const saved =
          analysis.criterion_scores.find((cs) => cs.criterion === criterion) ??
          analysis.criterion_scores[index];
        return {
          criterion,
          score: saved ? Number(saved.score) : 3,
          objective_score: saved?.objective_score ?? null,
          achieved_score: saved?.achieved_score ?? null,
        };
      })
    );
  }

  useEffect(() => {
    if (teamId === "") {
      setTeamMembers([]);
      setTeamRelationships([]);
      return;
    }
    if (directorsView) {
      // Un directeur n'est pas *membre* du comité : il appartient à sa propre
      // direction et n'est rattaché au CEO que par son responsable
      // hiérarchique. Lire les membres du département ne donnerait donc que
      // l'équipe rapprochée du CEO, jamais ses directeurs.
      //
      // Le critère retenu est ce rattachement hiérarchique. S'y ajoutent ceux
      // qui dirigent une direction, au cas où le lien n'aurait pas été saisi :
      // les deux conventions coexistent selon le paramétrage de l'entreprise,
      // et aucun directeur ne doit manquer à la planche.
      Promise.all([
        apiClient.get<Paginated<UserRecord>>("/users/", { params: { role: "MANAGER", page_size: 200 } }),
        apiClient.get<Paginated<UserRecord>>("/users/", { params: { role: "COMPANY_ADMIN", page_size: 50 } }),
      ]).then(([managers, admins]) => {
        const headsOfDirection = new Set(
          departments.filter((d) => d.parent === null).map((d) => d.manager)
        );
        const directors = managers.data.results.filter(
          (m) => m.manager === user?.id || headsOfDirection.has(m.id)
        );
        const ceo = admins.data.results.find((a) => a.id === user?.id);
        setTeamMembers(ceo ? [ceo, ...directors] : directors);
      });
    } else {
      apiClient
        .get<Paginated<UserRecord>>("/users/", { params: { department: teamId, page_size: 200 } })
        .then((r) => setTeamMembers(r.data.results));
    }
    loadRelationships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, directorsView, departments]);

  /** Relit les relations : la matrice de saisie écrit directement en base. */
  function loadRelationships() {
    if (teamId === "") return;
    apiClient
      .get<Paginated<TeamRelationship>>("/team-relationships/", { params: { team: teamId, page_size: 500 } })
      .then((r) => setTeamRelationships(r.data.results));
  }

  // La fiche se remplit par l'encadrant de l'équipe. Côté CEO elle se consulte :
  // la note de la direction vient de son directeur, et l'avis des équipes de
  // leurs réponses — il n'y a rien que le CEO ait à y saisir. La grille est
  // donc figée pour lui, faute de quoi il cliquerait des pastilles sans avoir
  // de quoi les enregistrer.
  const readOnly = viewedAnalysisId !== "" || isCompanyAdmin;
  // Une planche archivée se relit ; seule la saisie courante s'édite, et
  // seulement par le CEO ou l'encadrant de l'équipe.
  const canEditBoard = (isCompanyAdmin || user?.role === "MANAGER") && board.draft !== null;

  // Le comité de direction : le département dont le CEO est le manager. Il
  // porte la planche « Tous les directeurs ».
  const ownTeam = isCompanyAdmin ? departments.find((d) => d.manager === user!.id) : undefined;
  const ownTeamExists = !isCompanyAdmin || Boolean(ownTeam);
  const selectedDept = departments.find((d) => d.id === teamId);
  /**
   * Avis de l'équipe sur un critère : la moyenne, et le nombre de réponses qui
   * la porte. Rien n'est montré tant que la direction n'a pas atteint le seuil
   * de publication — la moyenne de deux personnes désignerait ses auteurs.
   */
  function opinionFor(criterion: string) {
    if (!sheetOpinion || !sheetOpinion.published) {
      return (
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          {sheetOpinion
            ? t("cohesion.opinionTooFew", { min: sheetOpinion.min_respondents })
            : "—"}
        </Typography>
      );
    }
    const entry = sheetOpinion.criteria.find((c) => c.criterion === criterion);
    if (!entry || entry.score === null) return <Typography variant="caption">—</Typography>;
    const low = entry.low_share !== null && entry.low_share > 0.2;
    return (
      <Stack spacing={0} alignItems="center">
        <Typography sx={{ fontWeight: 800, color: cohesionColor(entry.score) }}>
          {entry.score.toFixed(2)}
        </Typography>
        <Typography variant="caption" sx={{ color: low ? "#c62828" : "text.secondary" }}>
          {low
            ? t("cohesion.opinionLow", { share: Math.round((entry.low_share as number) * 100) })
            : t("cohesion.opinionAnswers", { count: entry.answers })}
        </Typography>
      </Stack>
    );
  }

  const boardTeamName = directorsView ? t("cohesion.allDirectors") : selectedDept?.name ?? "";

  async function handleProvisionOwnTeam() {
    if (!user) return;
    setProvisioning(true);
    try {
      const r = await apiClient.post<Department>("/departments/", {
        name: t("cohesion.ceoTeamName"),
        code: "DIR",
        manager: user.id,
      });
      setDepartments((prev) => [...prev, r.data]);
      setTeamId(r.data.id);
    } finally {
      setProvisioning(false);
    }
  }

  // Sur les seuls critères notés : diviser par dix alors que trois sont
  // renseignés donnerait un indice artificiellement bas.
  const scoredValues = rows.map((r) => r.score).filter((v): v is number => v !== null);
  const ice = scoredValues.length ? scoredValues.reduce((a, b) => a + b, 0) / scoredValues.length : null;
  const objectiveValues = rows.map((r) => r.objective_score).filter((v): v is number => v !== null);
  const oce = objectiveValues.length ? objectiveValues.reduce((a, b) => a + b, 0) / objectiveValues.length : null;
  const achievedValues = rows.map((r) => r.achieved_score).filter((v): v is number => v !== null);
  const achieved = achievedValues.length ? achievedValues.reduce((a, b) => a + b, 0) / achievedValues.length : null;
  const tco = achieved !== null && oce ? Math.round((achieved / oce) * 1000) / 10 : null;

  function updateRow(i: number, patch: Partial<CriterionRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function handleSubmit() {
    if (!teamId) return;
    await apiClient.post("/cohesion-analyses/", {
      team: teamId,
      date: new Date().toISOString().slice(0, 10),
      criterion_scores: rows
        .filter((r): r is CriterionRow & { score: number } => r.score !== null)
        .map((r) => ({
          criterion: r.criterion,
          score: r.score,
          objective_score: r.objective_score,
          achieved_score: r.achieved_score,
        })),
    });
    setSaved(true);
    const r = await apiClient.get<Paginated<TeamCohesionAnalysis>>("/cohesion-analyses/", { params: { team: teamId } });
    setHistory(r.data.results);
  }

  async function handleCreatePlan() {
    if (!teamId) return;
    await apiClient.post("/action-plans/", {
      team: teamId,
      category: "SOFT_SKILLS",
      status: "TODO",
      ...planForm,
      // Vide = l'action concerne toute l'équipe.
      target_user: planForm.target_user === "" ? null : planForm.target_user,
      due_date: planForm.due_date || null,
    });
    setPlanDialog(false);
    setPlanForm({ priority: "", objective: "", due_date: "", responsible: "", target_user: "" });
    await reloadPlans();
  }

  async function reloadPlans() {
    if (!teamId) return;
    const r = await apiClient.get<Paginated<ActionPlan>>("/action-plans/", { params: { team: teamId } });
    setPlans(r.data.results);
  }

  /** Statut modifiable directement dans le tableau : l'écriture est optimiste
   * puis rejouée depuis l'API, pour que la barre d'avancement suive le clic
   * sans attendre l'aller-retour réseau. */
  async function handleStatusChange(plan: ActionPlan, status: PlanStatus) {
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status } : p)));
    try {
      await apiClient.patch(`/action-plans/${plan.id}/`, { status });
    } finally {
      await reloadPlans();
    }
  }

  async function handleDeletePlan() {
    if (!planToDelete) return;
    await apiClient.delete(`/action-plans/${planToDelete.id}/`);
    setPlanToDelete(null);
    await reloadPlans();
  }

  /** Actions de cohésion de l'équipe : les lignes de la grille du Plan de
   * développement du manager (order renseigné) partagent la même table et le
   * même département — elles n'ont rien à faire dans ce plan-ci. Les actions
   * non terminées remontent en tête, puis les échéances les plus proches. */
  const cohesionPlans = useMemo(() => {
    const rank: Record<PlanStatus, number> = { TODO: 0, IN_PROGRESS: 1, DONE: 2 };
    return plans
      .filter((p) => p.order === null)
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31")
      );
  }, [plans]);

  const doneCount = cohesionPlans.filter((p) => p.status === "DONE").length;
  const overdueCount = cohesionPlans.filter((p) => p.status !== "DONE" && p.due_date !== null && p.due_date < today()).length;

  const chartData = useMemo(
    () =>
      [...history]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((h) => ({
          period: h.date,
          [t("cohesion.iceLabel")]: Number(h.ice_score),
          [t("cohesion.oceLabel")]: Number(h.oce_score),
        })),
    [history, t]
  );

  return (
    <Stack spacing={3} maxWidth={1180}>
      {/* Titre de page aligné sur les autres rubriques (Référentiel, Matrice
       * ID-3A) : le bandeau centré faisait doublon avec l'entête du tableau
       * des critères, juste en dessous. */}
      <PageHeader
        title={t("nav.cohesion")}
        view={t(
          view === "cohesion"
            ? "cohesion.viewSheet"
            : view === "strengths"
              ? "cohesion.viewStrengths"
              : view === "opinion"
                ? "cohesion.viewOpinion"
                : "cohesion.viewRelationship"
        )}
        subtitle={t("cohesion.subtitle")}
      />

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap className="pmc-no-print">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v) => v && setView(v)}
          sx={{
            height: 40,
            "& .MuiToggleButton-root": { px: 2, fontWeight: 700, borderColor: "primary.main", color: "primary.main" },
            "& .Mui-selected": { bgcolor: "primary.main", color: "#fff !important", "&:hover": { bgcolor: "primary.dark" } },
          }}
        >
          <ToggleButton value="cohesion">{t("cohesion.viewSheet")}</ToggleButton>
          <ToggleButton value="relationship">{t("cohesion.viewRelationship")}</ToggleButton>
          <ToggleButton value="strengths">{t("cohesion.viewStrengths")}</ToggleButton>
          <ToggleButton value="opinion">{t("cohesion.viewOpinion")}</ToggleButton>
        </ToggleButtonGroup>

        {/* La campagne borne la vue des avis comme elle borne la fiche : les
          * deux côtés de la comparaison doivent venir du même exercice. */}
        {view === "opinion" && campaigns.length > 0 && (
          <TextField
            select
            size="small"
            label={t("cohesion.campaign")}
            value={campaignId}
            onChange={(e) => setCampaignId(Number(e.target.value))}
            sx={{ minWidth: 240 }}
          >
            {[...campaigns]
              .sort((a, b) => b.start_date.localeCompare(a.start_date))
              .map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
          </TextField>
        )}

        {/* L'équipe se choisit dans toutes les vues : la fiche de cohésion a
          * son propre sélecteur plus bas, les planches utilisent celui-ci. */}
        {view !== "cohesion" && view !== "opinion" && (
          <TextField
            select
            size="small"
            label={t("cohesion.team")}
            value={directorsView ? DIRECTORS_TEAM : teamId}
            onChange={(e) => {
              if (e.target.value === DIRECTORS_TEAM) {
                setDirectorsView(true);
                if (ownTeam) setTeamId(ownTeam.id);
              } else {
                setDirectorsView(false);
                setTeamId(Number(e.target.value));
              }
            }}
            sx={{ minWidth: 260 }}
          >
            {isCompanyAdmin && <MenuItem value={DIRECTORS_TEAM}>{t("cohesion.allDirectors")}</MenuItem>}
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {view === "opinion" && <CohesionOpinionBoard data={aggregate} />}

      {view !== "cohesion" && view !== "opinion" && !(directorsView && !ownTeam) && (
        <Stack spacing={2}>
          <BoardPeriodBar
            dates={board.dates}
            currentId={board.currentId}
            onSelect={board.select}
            onNew={() => board.startNew(boardToday())}
            onSave={board.save}
            dirty={board.dirty}
            saving={board.saving}
            canEdit={canEditBoard}
          />
          {board.error === "duplicate" && <Alert severity="warning">{t("teamBoard.duplicateDate")}</Alert>}
          {board.error === "save" && <Alert severity="error">{t("teamBoard.saveFailed")}</Alert>}
          {board.draft && board.draft.id !== 0 && !canEditBoard && (
            <Alert severity="info">{t("teamBoard.readOnlyHint")}</Alert>
          )}
          {view === "strengths" ? (
            <TeamStrengthsBoard
              board={board.draft}
              patch={board.patch}
              readOnly={!canEditBoard}
              teamName={boardTeamName}
              teamSize={teamMembers.length}
            />
          ) : (
            <TeamRelationshipBoard
              board={board.draft}
              patch={board.patch}
              readOnly={!canEditBoard}
              members={teamMembers}
              relationships={teamRelationships}
              teamName={boardTeamName}
              iceScore={history.length ? Number(history[0].ice_score) : null}
              teamId={teamId === "" ? 0 : teamId}
              managerId={departments.find((d) => d.id === teamId)?.manager ?? null}
              onRelationshipsChanged={loadRelationships}
            />
          )}
        </Stack>
      )}

      {(view === "cohesion" || directorsView) && isCompanyAdmin && !ownTeamExists && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={handleProvisionOwnTeam} disabled={provisioning}>
              {t("cohesion.provisionOwnTeam")}
            </Button>
          }
        >
          {t("cohesion.provisionHint")}
        </Alert>
      )}

      {view === "cohesion" && (
      <>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={3}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 90 }}>
              {t("cohesion.team")}
            </Typography>
            <TextField
              select
              value={directorsView ? DIRECTORS_TEAM : teamId}
              onChange={(e) => {
                if (e.target.value === DIRECTORS_TEAM) {
                  setDirectorsView(true);
                  if (ownTeam) setTeamId(ownTeam.id);
                } else {
                  setDirectorsView(false);
                  setTeamId(Number(e.target.value));
                }
                setSaved(false);
              }}
              size="small"
              sx={{ minWidth: 260 }}
            >
              {isCompanyAdmin && <MenuItem value={DIRECTORS_TEAM}>{t("cohesion.allDirectors")}</MenuItem>}
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {/* Campagne : la cohésion se mesure à chaque exercice, et c'est la
            * campagne qui le nomme. Elle remplace la date isolée — deux
            * exercices se comparent par leur nom, pas par le jour où
            * l'encadrant a rempli sa fiche. */}
          {campaigns.length > 0 && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 90 }}>
                {t("cohesion.campaign")}
              </Typography>
              <TextField
                select
                size="small"
                value={campaignId}
                onChange={(e) => setCampaignId(Number(e.target.value))}
                sx={{ minWidth: 260 }}
              >
                {[...campaigns]
                  .sort((a, b) => b.start_date.localeCompare(a.start_date))
                  .map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
              </TextField>
            </Stack>
          )}
          {selectedDept && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 90 }}>
                {t("cohesion.headcount")}
              </Typography>
              <Box sx={{ px: 1.5, py: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1, minWidth: 60, textAlign: "center" }}>
                <Typography variant="body2" fontWeight={700}>
                  {selectedDept.member_count}
                </Typography>
              </Box>
            </Stack>
          )}
        </Stack>

        {teamId && (
          <Stack alignItems={{ xs: "flex-start", sm: "flex-end" }} spacing={1}>
            <Stack direction="row" spacing={3} flexWrap="wrap">
              <ValueBox label={t("cohesion.iceLabel")} value={ice} />
              <ValueBox label={t("cohesion.oceLabel")} value={oce} bg="#fff4c2" />
              <ValueBox label={t("cohesion.achievedLabel")} value={achieved} bg="#dbeeff" />
              <ValueBox label={t("cohesion.tcoLabel")} value={tco} suffix="%" />
            </Stack>
          </Stack>
        )}
      </Stack>

      {/* Aucune direction choisie : on le dit, plutôt que de laisser un écran
          nu qu'on prendrait pour un chargement. */}
      {!teamId && <Alert severity="info">{t("cohesion.pickTeamFirst")}</Alert>}

      {teamId && (
        <>
          {/* Le bandeau « vous consultez une fiche archivée » ne concerne que
              la relecture d'un exercice passé par son encadrant — pas le CEO,
              pour qui la fiche est de toute façon en lecture seule et qui n'a
              pas de nouvelle saisie à ouvrir. */}
          {viewedAnalysisId !== "" && !isCompanyAdmin && (
            <Alert severity="info" action={<Button size="small" color="inherit" onClick={() => showAnalysis("")}>{t("cohesion.newEntry")}</Button>}>
              {t("cohesion.viewingArchive", { date: history.find((h) => h.id === viewedAnalysisId)?.date ?? "" })}
            </Alert>
          )}

          <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: "30%", bgcolor: HEADER_BLUE, color: HEADER_TEXT, fontWeight: 700, fontSize: 12 }}>
                      {t("cohesion.criterionCol")}
                    </TableCell>
                    {/* Entêtes de paliers à la couleur du barème 1-5 : c'est le
                     * code couleur de la fiche ID-PMC, repris aussi par la
                     * pastille sélectionnée de chaque ligne. */}
                    {TIERS.map((tier) => (
                      <TableCell
                        key={tier}
                        align="center"
                        sx={{ bgcolor: cohesionColor(tier), color: "#fff", fontWeight: 700, fontSize: 11, lineHeight: 1.2, minWidth: 72 }}
                      >
                        {t(TIER_LABELS[tier - 1]).toUpperCase()}
                        <br />
                        {tier}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12 }}>
                      {t("cohesion.totalCol")}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12, bgcolor: "#fff4c2", color: LIGHT_CELL_TEXT }}>
                      {t("cohesion.oceCol")}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12, bgcolor: "#dbeeff", color: LIGHT_CELL_TEXT }}>
                      {t("cohesion.achievedCol")}
                    </TableCell>
                    {/* Ce que l'équipe a répondu, en face de ce que l'encadrant
                        a noté. C'est la confrontation des deux regards qui fait
                        la valeur de la fiche — les avoir sur deux écrans
                        séparés revenait à ne jamais les comparer. */}
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: 12, bgcolor: "#e8f3e2", color: LIGHT_CELL_TEXT, minWidth: 110 }}>
                      {t("cohesion.teamOpinionCol")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Typography variant="body2">
                          {i + 1}. {row.criterion}
                        </Typography>
                      </TableCell>
                      {TIERS.map((tier) => (
                        <TableCell key={tier} align="center">
                          <ScoreOval
                            selected={row.score === tier}
                            color={cohesionColor(tier)}
                            onClick={() => !readOnly && updateRow(i, { score: tier })}
                            ariaLabel={`${row.criterion} — ${tier}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell align="center">
                        <Box sx={{ px: 1, py: 0.25, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight={700}>
                            {row.score !== null ? row.score.toFixed(1) : "—"}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={{ bgcolor: "#fffaf0", color: LIGHT_CELL_TEXT }}>
                        <TextField
                          select
                          size="small"
                          value={row.objective_score ?? ""}
                          onChange={(e) =>
                            updateRow(i, { objective_score: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          disabled={readOnly}
                          sx={{ minWidth: 64, bgcolor: "#fff4c2", borderRadius: 1, color: LIGHT_CELL_TEXT, "& .MuiInputBase-root, & .MuiSelect-select": { color: LIGHT_CELL_TEXT } }}
                        >
                          <MenuItem value="">{t("cohesion.unset")}</MenuItem>
                          {TIERS.map((tier) => (
                            <MenuItem key={tier} value={tier}>
                              {tier}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell align="center" sx={{ bgcolor: "#f5faff", color: LIGHT_CELL_TEXT }}>
                        <TextField
                          select
                          size="small"
                          value={row.achieved_score ?? ""}
                          onChange={(e) =>
                            updateRow(i, { achieved_score: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          disabled={readOnly}
                          sx={{ minWidth: 64, bgcolor: "#dbeeff", borderRadius: 1, color: LIGHT_CELL_TEXT, "& .MuiInputBase-root, & .MuiSelect-select": { color: LIGHT_CELL_TEXT } }}
                        >
                          <MenuItem value="">{t("cohesion.unset")}</MenuItem>
                          {TIERS.map((tier) => (
                            <MenuItem key={tier} value={tier}>
                              {tier}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell align="center" sx={{ bgcolor: "#f4faf0", color: LIGHT_CELL_TEXT }}>
                        {opinionFor(row.criterion)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {!isCompanyAdmin && (
            <Stack direction="row" justifyContent="flex-end">
              <Button variant="contained" onClick={handleSubmit} disabled={!teamId || readOnly}>
                {t("cohesion.save")}
              </Button>
            </Stack>
          )}
          {saved && (
            <Alert severity="success" onClose={() => setSaved(false)}>
              {t("cohesion.saved")}
            </Alert>
          )}

          {history.length > 0 && (
            <>
              <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t("cohesion.date")}</TableCell>
                        <TableCell align="right">{t("cohesion.iceLabel")}</TableCell>
                        <TableCell align="right">{t("cohesion.oceLabel")}</TableCell>
                        <TableCell align="right">{t("cohesion.achievedLabel")}</TableCell>
                        <TableCell align="right">{t("cohesion.tcoLabel")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id} hover>
                          <TableCell>{h.date}</TableCell>
                          <TableCell align="right">{Number(h.ice_score).toFixed(1)}</TableCell>
                          <TableCell align="right">{Number(h.oce_score).toFixed(1)}</TableCell>
                          <TableCell align="right">{h.achieved_score ?? "—"}</TableCell>
                          <TableCell align="right">{h.tco !== null ? `${h.tco}%` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {chartData.length > 1 && (
                <Paper elevation={0} sx={{ p: 2, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {t("cohesion.chartTitle")}
                  </Typography>
                  {/* Graphe volontairement plus étroit que la fiche (70 %) et
                    * plus haut : des barres resserrées se comparent mieux à la
                    * verticale qu'étalées sur toute la largeur. */}
                  <ResponsiveContainer width="70%" height={190}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
                      // Écart entre les périodes réduit (défaut : 10 %) et
                      // barres bornées, pour qu'elles ne s'élargissent pas en
                      // récupérant la place gagnée.
                      barCategoryGap="5%"
                      barGap={2}
                    >
                      <CartesianGrid stroke="#e1e0d9" vertical={false} />
                      <XAxis dataKey="period" tick={{ fill: "#898781", fontSize: 12 }} />
                      <YAxis domain={[0, 5]} tick={{ fill: "#898781", fontSize: 12 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey={t("cohesion.iceLabel")} fill={ICE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Bar dataKey={t("cohesion.oceLabel")} fill={OCE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              )}
            </>
          )}

          <Paper elevation={0} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                {t("cohesion.actionPlanTitle")}
              </Typography>
              <Button size="small" startIcon={<AddOutlinedIcon />} onClick={() => setPlanDialog(true)}>
                {t("actionPlans.newAction")}
              </Button>
            </Stack>
            {cohesionPlans.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("cohesion.noActionPlan")}
              </Typography>
            ) : (
              <>
                {/* Avancement du plan : c'est ce qu'on vient chercher en
                  * premier sur un plan d'action, avant le détail ligne à ligne. */}
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 120 }}>
                    <LinearProgress
                      variant="determinate"
                      value={(doneCount / cohesionPlans.length) * 100}
                      sx={{ height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { bgcolor: STATUS_COLOR.DONE } }}
                    />
                  </Box>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    {t("actionPlans.progressDone", { done: doneCount, total: cohesionPlans.length })}
                  </Typography>
                  {overdueCount > 0 && (
                    <Chip size="small" label={`${overdueCount} ${t("actionPlans.overdue").toLowerCase()}`} color="error" variant="outlined" />
                  )}
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("actionPlans.priority")}</TableCell>
                      <TableCell sx={{ width: 130 }}>{t("actionPlans.responsible")}</TableCell>
                      <TableCell sx={{ width: 130 }}>{t("actionPlans.targetUser")}</TableCell>
                      <TableCell sx={{ width: 130 }}>{t("actionPlans.dueDate")}</TableCell>
                      <TableCell sx={{ width: 150 }}>{t("common.status")}</TableCell>
                      <TableCell sx={{ width: 44 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cohesionPlans.map((p) => {
                      const overdue = p.status !== "DONE" && p.due_date !== null && p.due_date < today();
                      return (
                        <TableRow key={p.id} hover>
                          <TableCell>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              sx={p.status === "DONE" ? { textDecoration: "line-through", color: "text.secondary" } : undefined}
                            >
                              {p.priority}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {p.objective}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{p.responsible || "—"}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{p.target_user_name ?? t("actionPlans.wholeTeam")}</Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Typography variant="body2" color={overdue ? "error.main" : undefined} fontWeight={overdue ? 700 : undefined}>
                                {p.due_date ?? "—"}
                              </Typography>
                              {overdue && <Chip size="small" label={t("actionPlans.overdue")} color="error" variant="outlined" />}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              size="small"
                              value={p.status}
                              onChange={(e) => handleStatusChange(p, e.target.value as PlanStatus)}
                              sx={{
                                minWidth: 130,
                                "& .MuiInputBase-input": { fontSize: 12, fontWeight: 700, color: STATUS_COLOR[p.status], py: 0.5 },
                              }}
                            >
                              {PLAN_STATUSES.map((status) => (
                                <MenuItem key={status} value={status} sx={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[status] }}>
                                  {t(`actionPlans.status.${status}`)}
                                </MenuItem>
                              ))}
                            </TextField>
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" aria-label={t("actionPlans.deleteAction")} onClick={() => setPlanToDelete(p)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </Paper>
        </>
      )}

      <Dialog open={planDialog} onClose={() => setPlanDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("cohesion.actionPlanTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t("cohesion.actionPlanHorizon")}
            </Typography>
            <TextField
              label={t("actionPlans.priorityLabel")}
              value={planForm.priority}
              onChange={(e) => setPlanForm({ ...planForm, priority: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("actionPlans.actionToTake")}
              value={planForm.objective}
              onChange={(e) => setPlanForm({ ...planForm, objective: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
            {/* Qui répond de l'action, et qui elle vise. */}
            <TextField
              select
              label={t("actionPlans.responsible")}
              value={planForm.responsible}
              onChange={(e) => setPlanForm({ ...planForm, responsible: e.target.value })}
              helperText={t("actionPlans.responsibleHelper")}
              fullWidth
            >
              {teamMembers.map((m) => (
                <MenuItem key={m.id} value={m.full_name || m.email}>
                  {m.full_name || m.email}
                  {m.position ? ` — ${m.position}` : ""}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t("actionPlans.targetUser")}
              value={planForm.target_user}
              onChange={(e) =>
                setPlanForm({ ...planForm, target_user: e.target.value === "" ? "" : Number(e.target.value) })
              }
              helperText={t("actionPlans.targetHelper")}
              fullWidth
            >
              <MenuItem value="">{t("actionPlans.wholeTeam")}</MenuItem>
              {teamMembers.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={t("actionPlans.dueDate")}
              type="date"
              value={planForm.due_date}
              onChange={(e) => setPlanForm({ ...planForm, due_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: sixMonthsFromNow() }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialog(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleCreatePlan} disabled={!planForm.priority}>
            {t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Suppression confirmée : l'action disparaît définitivement du plan. */}
      <Dialog open={planToDelete !== null} onClose={() => setPlanToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("actionPlans.deleteConfirmTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("actionPlans.deleteConfirmBody", { priority: planToDelete?.priority ?? "" })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanToDelete(null)}>{t("common.cancel")}</Button>
          <Button color="error" variant="contained" onClick={handleDeletePlan}>
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
      </>
      )}
    </Stack>
  );
}
