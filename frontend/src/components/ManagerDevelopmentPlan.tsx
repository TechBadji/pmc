import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { HARD_SKILLS_COLOR, SOFT_SKILLS_COLOR } from "@/theme";
import type { ActionPlan, Paginated } from "@/api/types";

const PRIORITIES = [1, 2, 3];
const CATEGORIES: DevCategory[] = ["SOFT_SKILLS", "HARD_SKILLS"];
const HEADER_ORANGE = "#E08A34"; // orange du logo (theme.palette.warning.main)

type DevCategory = "SOFT_SKILLS" | "HARD_SKILLS";

/** Une action du plan : c'est la ligne qui se répète sous une priorité, avec
 * ses propres Échéance / Coût / Responsable / Éval. */
interface ActionItem {
  objective: string;
  start_date: string;
  due_date: string;
  cost: string;
  responsible: string;
  eval_note: string;
}

/** Une priorité de développement (3 par catégorie) et ses actions : la
 * priorité et ses KPIs sont saisis une seule fois, dans des cellules qui
 * s'étendent (rowSpan) sur toutes ses actions. */
interface PriorityGroup {
  priority: string;
  baseline: string;
  target: string;
  actions: ActionItem[];
}

function emptyAction(): ActionItem {
  return { objective: "", start_date: "", due_date: "", cost: "", responsible: "", eval_note: "" };
}

function emptyGroup(): PriorityGroup {
  return { priority: "", baseline: "", target: "", actions: [emptyAction()] };
}

// Colonnes Début/Fin : le champ date natif impose "jj/mm/aaaa" sur une seule
// ligne, ce qui interdisait à la fois de réduire la colonne et d'agrandir la
// police. La date est donc affichée par nos soins sur deux lignes (jj/mm puis
// l'année), et le champ natif — transparent, superposé à la cellule — ne sert
// plus qu'à ouvrir le calendrier et à recevoir la saisie clavier.
// 12 px pour "jj/mm" occupe ~30 px : la cellule ne garde sa largeur que si
// son padding horizontal est supprimé (voir dateCellSx).
const DATE_COL_WIDTH = 32;
const DATE_FONT_SIZE = 12;
const dateCellSx = { width: DATE_COL_WIDTH, px: 0 };

/** Cellule date compacte : affichage sur deux lignes, sélecteur natif au clic. */
function CompactDateField({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  // value est au format ISO (aaaa-mm-jj) imposé par <input type="date">.
  const dayMonth = value ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : "—";
  const year = value ? value.slice(0, 4) : "";

  return (
    <Box
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        const input = e.currentTarget.querySelector("input");
        // showPicker() lève si l'appel n'est pas issu d'un geste utilisateur
        // ou si le navigateur ne le gère pas : la saisie clavier reste
        // possible sur le champ natif superposé.
        try {
          input?.showPicker();
        } catch {
          /* ignore */
        }
      }}
      sx={{
        position: "relative",
        cursor: "pointer",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        py: 0.25,
        textAlign: "center",
        lineHeight: 1.15,
        "&:hover": { borderColor: "text.primary" },
      }}
    >
      <Box component="span" sx={{ display: "block", fontSize: DATE_FONT_SIZE, fontWeight: 600 }}>
        {dayMonth}
      </Box>
      <Box component="span" sx={{ display: "block", fontSize: DATE_FONT_SIZE, color: "text.secondary" }}>
        {year || " "}
      </Box>
      <Box
        component="input"
        type="date"
        aria-label={ariaLabel}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        // Transparent mais bien rendu : le calendrier natif s'ancre sur la
        // cellule, et `display: none` empêcherait showPicker() de s'ouvrir.
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          border: "none",
          p: 0,
          cursor: "pointer",
          font: "inherit",
        }}
      />
    </Box>
  );
}

const MAX_COST = 1_000_000;
const COST_AMOUNT = /\d+(?:[.,]\d+)?/;

/** Séparateurs de milliers déjà posés (espace, insécable, insécable fine) :
 * retirés avant tout calcul, sinon "1 500" serait lu comme "1" puis "500". */
function stripGrouping(value: string) {
  return value.replace(/(\d)[\s  ](?=\d)/g, "$1");
}

function costAmount(value: string): number | null {
  const match = stripGrouping(value).match(COST_AMOUNT);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function costExceedsMax(value: string) {
  const amount = costAmount(value);
  return amount !== null && amount > MAX_COST;
}

/** Coût : le champ reste libre (une devise ou une unité peuvent suivre le
 * montant), on se contente donc de plafonner le montant à MAX_COST, de
 * regrouper les milliers des nombres d'au moins 4 chiffres, et de laisser le
 * reste du texte intact. "1500000 FCFA" → "1 500 000 FCFA", "2500000" →
 * "1 000 000", "1500,50" → "1 500,50". */
function formatCost(value: string, locale: string) {
  return stripGrouping(value)
    .replace(COST_AMOUNT, (amount) => (Number(amount.replace(",", ".")) > MAX_COST ? String(MAX_COST) : amount))
    .replace(/\d{4,}/g, (digits) => new Intl.NumberFormat(locale).format(Number(digits)));
}

type GroupMap = Record<string, PriorityGroup>;

function key(category: DevCategory, priorityOrder: number) {
  return `${category}-${priorityOrder}`;
}

export default function ManagerDevelopmentPlan({ managerId, managerName }: { managerId: number; managerName: string }) {
  const { t, i18n } = useTranslation();
  const [groups, setGroups] = useState<GroupMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
    apiClient
      .get<Paginated<ActionPlan>>("/action-plans/", { params: { target_user: managerId, page_size: 200 } })
      .then((r) => {
        const map: GroupMap = {};
        r.data.results
          .filter((p) => p.order !== null && p.priority_order !== null)
          .sort((a, b) => (a.order as number) - (b.order as number))
          .forEach((p) => {
            const k = key(p.category, p.priority_order as number);
            // La priorité et ses KPIs sont dupliqués sur chaque action côté
            // API : la première ligne rencontrée fait foi.
            const group = map[k] ?? { priority: p.priority, baseline: p.baseline, target: p.target, actions: [] };
            group.actions.push({
              objective: p.objective,
              start_date: p.start_date ?? "",
              due_date: p.due_date ?? "",
              cost: p.cost,
              responsible: p.responsible,
              eval_note: p.eval_note,
            });
            map[k] = group;
          });
        setGroups(map);
      });
  }, [managerId]);

  function group(category: DevCategory, priorityOrder: number): PriorityGroup {
    return groups[key(category, priorityOrder)] ?? emptyGroup();
  }

  function updateGroup(category: DevCategory, priorityOrder: number, patch: Partial<PriorityGroup>) {
    setGroups((prev) => ({
      ...prev,
      [key(category, priorityOrder)]: { ...(prev[key(category, priorityOrder)] ?? emptyGroup()), ...patch },
    }));
    setSaved(false);
  }

  function updateAction(category: DevCategory, priorityOrder: number, index: number, field: keyof ActionItem, value: string) {
    const current = group(category, priorityOrder);
    const actions = current.actions.map((a, i) => (i === index ? { ...a, [field]: value } : a));
    updateGroup(category, priorityOrder, { actions });
  }

  function addAction(category: DevCategory, priorityOrder: number) {
    const current = group(category, priorityOrder);
    updateGroup(category, priorityOrder, { actions: [...current.actions, emptyAction()] });
  }

  function removeAction(category: DevCategory, priorityOrder: number, index: number) {
    const current = group(category, priorityOrder);
    updateGroup(category, priorityOrder, { actions: current.actions.filter((_, i) => i !== index) });
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Une ligne d'API par action : la priorité et ses KPIs sont recopiés sur
      // chacune (chaque plan d'action reste lisible seul, hors de la grille).
      const items = CATEGORIES.flatMap((category) =>
        PRIORITIES.flatMap((priorityOrder) => {
          const g = group(category, priorityOrder);
          return g.actions.map((a, i) => ({
            category,
            priority_order: priorityOrder,
            order: i + 1,
            priority: g.priority,
            baseline: g.baseline,
            target: g.target,
            ...a,
            // Filet : un enregistrement déclenché sans quitter le champ Coût
            // (clic direct sur "Enregistrer") n'a pas forcément vu passer
            // onBlur, donc le plafond est appliqué une dernière fois ici.
            cost: formatCost(a.cost, i18n.language),
          }));
        })
      );
      await apiClient.post("/action-plans/bulk-save-dev-plan/", { target_user: managerId, items });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  /** Lignes d'une catégorie : une par action, la cellule verticale de
   * catégorie n'étant portée que par la toute première. */
  function renderCategory(category: DevCategory, groupColor: string, groupLabel: string) {
    const rowCount = PRIORITIES.reduce((n, p) => n + group(category, p).actions.length, 0);
    let rowIndex = 0;

    return PRIORITIES.flatMap((priorityOrder) => {
      const g = group(category, priorityOrder);
      return g.actions.map((action, i) => {
        const isCategoryStart = rowIndex++ === 0;
        const isGroupStart = i === 0;
        const set = (field: keyof ActionItem) => (e: React.ChangeEvent<HTMLInputElement>) =>
          updateAction(category, priorityOrder, i, field, e.target.value);
        return (
          <TableRow key={`${key(category, priorityOrder)}-${i}`}>
            {isCategoryStart && (
              <TableCell
                rowSpan={rowCount}
                sx={{ bgcolor: groupColor, color: "#fff", textAlign: "center", p: 0.5, border: "1px solid", borderColor: "divider" }}
              >
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 1, fontSize: 11 }}
                >
                  {groupLabel}
                </Typography>
              </TableCell>
            )}
            {isGroupStart && (
              <>
                <TableCell rowSpan={g.actions.length} sx={{ width: 120, verticalAlign: "top" }}>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    value={g.priority}
                    onChange={(e) => updateGroup(category, priorityOrder, { priority: e.target.value })}
                  />
                  <Tooltip title={t("managerDevPlan.addActionHint")}>
                    <Button
                      size="small"
                      startIcon={<AddOutlinedIcon sx={{ fontSize: 14 }} />}
                      onClick={() => addAction(category, priorityOrder)}
                      sx={{ mt: 0.5, p: 0.25, minWidth: 0, fontSize: 10, lineHeight: 1.2 }}
                    >
                      {t("managerDevPlan.addAction")}
                    </Button>
                  </Tooltip>
                </TableCell>
                <TableCell rowSpan={g.actions.length} sx={{ width: 46, verticalAlign: "top" }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={g.baseline}
                    onChange={(e) => updateGroup(category, priorityOrder, { baseline: e.target.value })}
                  />
                </TableCell>
                <TableCell rowSpan={g.actions.length} sx={{ width: 46, verticalAlign: "top" }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={g.target}
                    onChange={(e) => updateGroup(category, priorityOrder, { target: e.target.value })}
                  />
                </TableCell>
              </>
            )}
            <TableCell sx={{ width: 180 }}>
              <Stack direction="row" spacing={0.25} alignItems="flex-start">
                <TextField size="small" fullWidth multiline value={action.objective} onChange={set("objective")} />
                {g.actions.length > 1 && (
                  <Tooltip title={t("managerDevPlan.removeAction")}>
                    <IconButton
                      size="small"
                      aria-label={t("managerDevPlan.removeAction")}
                      onClick={() => removeAction(category, priorityOrder, i)}
                      sx={{ p: 0.25 }}
                    >
                      <CloseOutlinedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </TableCell>
            <TableCell sx={dateCellSx}>
              <CompactDateField
                value={action.start_date}
                onChange={(v) => updateAction(category, priorityOrder, i, "start_date", v)}
                ariaLabel={t("managerDevPlan.timingStart")}
              />
            </TableCell>
            <TableCell sx={dateCellSx}>
              <CompactDateField
                value={action.due_date}
                onChange={(v) => updateAction(category, priorityOrder, i, "due_date", v)}
                ariaLabel={t("managerDevPlan.timingEnd")}
              />
            </TableCell>
            <TableCell sx={{ width: 51 }}>
              {/* Mise en forme et plafonnement à la sortie du champ :
                * reformater à chaque frappe déplacerait le curseur au fil des
                * séparateurs. Pendant la saisie, un dépassement se signale en
                * rouge plutôt qu'en bloquant les touches. */}
              <TextField
                size="small"
                fullWidth
                value={action.cost}
                onChange={set("cost")}
                onBlur={(e) => updateAction(category, priorityOrder, i, "cost", formatCost(e.target.value, i18n.language))}
                error={costExceedsMax(action.cost)}
                inputProps={{ title: costExceedsMax(action.cost) ? t("managerDevPlan.costMax") : undefined }}
              />
            </TableCell>
            <TableCell sx={{ width: 80 }}>
              <TextField size="small" fullWidth value={action.responsible} onChange={set("responsible")} />
            </TableCell>
            <TableCell sx={{ width: 60 }}>
              <TextField size="small" fullWidth value={action.eval_note} onChange={set("eval_note")} />
            </TableCell>
          </TableRow>
        );
      });
    });
  }

  return (
    <Paper elevation={0} sx={{ p: 2, mt: 2, border: "1px solid", borderColor: "divider" }}>
      <Paper elevation={0} sx={{ py: 1, mb: 2, textAlign: "center", bgcolor: "#f5efd6", border: "1px solid", borderColor: "divider" }}>
        <Typography variant="subtitle1" fontWeight={800} sx={{ color: "primary.main" }}>
          {`ID-PMC_ ${t("managerDevPlan.title", { name: managerName }).toUpperCase()}`}
        </Typography>
      </Paper>

      <TableContainer>
        <Table
          size="small"
          sx={{
            "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider", p: 0.5, fontSize: 12 },
            // Sans minWidth: 0, la largeur mini d'un <input> vient de son
            // attribut `size` (~180 px) et les largeurs de colonnes ci-dessous
            // ne sont jamais appliquées par le moteur de rendu du tableau.
            "& .MuiInputBase-input": { minWidth: 0 },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, width: 28 }} />
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.priorityCol")}
              </TableCell>
              <TableCell colSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.kpis")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.actionsCol")}
              </TableCell>
              <TableCell colSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.timing")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.cost")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.responsible")}
              </TableCell>
              <TableCell rowSpan={2} sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.eval")}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.baseline")}
              </TableCell>
              <TableCell sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                {t("managerDevPlan.target")}
              </TableCell>
              {/* Sous-colonnes du groupe "Échéance" : le navigateur les place
               * dans les deux créneaux laissés libres par les rowSpan=2.
               * Intitulés en 10 px pour ne pas élargir ces colonnes étroites. */}
              <TableCell sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 9, p: 0.25 }}>
                {t("managerDevPlan.timingStart")}
              </TableCell>
              <TableCell sx={{ bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 9, p: 0.25 }}>
                {t("managerDevPlan.timingEnd")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {renderCategory("SOFT_SKILLS", SOFT_SKILLS_COLOR, t("managerDevPlan.softSkills"))}
            {renderCategory("HARD_SKILLS", HARD_SKILLS_COLOR, t("managerDevPlan.hardSkills"))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={2} sx={{ mt: 2 }}>
        {saved && (
          <Alert severity="success" sx={{ py: 0 }}>
            {t("managerDevPlan.saved")}
          </Alert>
        )}
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {t("common.save")}
        </Button>
      </Stack>
    </Paper>
  );
}
