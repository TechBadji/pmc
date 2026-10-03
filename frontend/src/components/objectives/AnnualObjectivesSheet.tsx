import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import {
  Avatar,
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
import { alpha, type Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { parseDecimalInput } from "@/components/inputs/DecimalField";
import { fmtDate } from "@/utils/evaluationValidation";
import type { PerformanceObjective } from "@/api/types";

/* ---------------------------------------------------------------------------
 * « Fiche de fixation d'objectifs / d'évaluation annuelle de la performance »
 *
 * Le contenu de la feuille ID-PMC : entête d'identité, objectifs business puis
 * leadership et managériaux — chaque bloc clos par sa performance — et la
 * performance globale de l'année en pied de fiche.
 *
 * L'habillage est celui du plan de développement (bandeau crème, entête
 * orange, bande verticale par catégorie, champs encadrés) : les deux grilles
 * se remplissent à la suite l'une de l'autre et doivent se lire pareil.
 *
 * Rien de ce qui se calcule n'est saisi : le taux d'atteinte d'une ligne
 * découle du réalisé et de la cible, la performance d'un bloc est la moyenne
 * pondérée de ses lignes, et la performance globale la moyenne des deux blocs.
 * C'est cette dernière qui alimente l'Altitude, donc la matrice ID-3A, la
 * 9 Box et l'ID-TPD — une valeur ressaisie ailleurs finirait par les
 * contredire.
 * ------------------------------------------------------------------------- */

const CREAM = "#f5efd6";
const HEADER_ORANGE = "#E08A34"; // orange du logo (theme.palette.warning.main)
const SOFT_ORANGE = alpha(HEADER_ORANGE, 0.12);
// Bleu et vert propres à la fiche : ceux des Hard/Soft Skills sont réservés
// aux deux volets de l'ID-3A.
const BUSINESS_BLUE = "#2e75b6";
const MANAGERIAL_GREEN = "#00a650";

/** En deçà, la fiche défile dans son cadre plutôt que d'écraser ses colonnes. */
const SHEET_MIN_WIDTH = 1060;

const tableSx = {
  // Largeurs fixées par <colgroup> : l'entête et la grille gardent les mêmes
  // proportions quel que soit le texte saisi.
  tableLayout: "fixed",
  minWidth: SHEET_MIN_WIDTH,
  "& .MuiTableCell-root": { border: "1px solid", borderColor: "divider", p: 0.5, fontSize: 12 },
  // Champs plus denses que le gabarit MUI : une valeur cible à dix chiffres
  // doit tenir entière dans sa colonne.
  "& .MuiInputBase-root": { fontSize: 12.5 },
  "& .MuiOutlinedInput-input": { minWidth: 0, px: 1, py: "7px" },
  "& .MuiInputBase-multiline": { px: 1, py: "7px" },
  "& .MuiInputBase-inputMultiline": { p: 0 },
} as const;

const headSx = { bgcolor: HEADER_ORANGE, color: "#fff", fontWeight: 700, textAlign: "center" } as const;

export interface SheetIdentity {
  photo: string | null;
  name: string;
  company: string;
  department: string;
  position: string;
  managerName: string;
}

/** Case de la fiche : champ encadré en saisie, simple texte en lecture. */
function Field({
  value,
  onChange,
  readOnly,
  align,
  numeric,
  multiline,
  type,
  placeholder,
  problem,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  align?: "center";
  numeric?: boolean;
  multiline?: boolean;
  type?: "date";
  placeholder?: string;
  /** Motif du refus de cette case : elle passe en rouge, le détail est au-dessus de la fiche. */
  problem?: string;
}) {
  if (readOnly) {
    return (
      <Typography sx={{ fontSize: 12.5, px: 0.5, py: 0.5, textAlign: align ?? "left", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {type === "date" ? fmtDate(value) : value}
      </Typography>
    );
  }
  return (
    <TextField
      size="small"
      fullWidth
      multiline={multiline}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      error={!!problem}
      inputProps={{ inputMode: numeric ? "decimal" : undefined, title: problem }}
      sx={{ "& .MuiInputBase-input": { textAlign: align ?? "left", ...(problem ? { color: "error.main" } : {}) } }}
    />
  );
}

/** Couple intitulé/valeur de l'entête. Sans `onChange`, la valeur se lit seulement. */
function HeaderPair({
  label,
  value,
  type,
  onChange,
  problem,
}: {
  label: string;
  value: string;
  type?: "date";
  onChange?: (v: string) => void;
  problem?: string;
}) {
  return (
    <>
      <TableCell sx={{ bgcolor: SOFT_ORANGE, fontWeight: 700, lineHeight: 1.25 }}>{label}</TableCell>
      <TableCell>
        <Field value={onChange ? value : value || "—"} type={type} readOnly={!onChange} onChange={onChange} problem={problem} />
      </TableCell>
    </>
  );
}

/** Moyenne pondérée des taux d'atteinte d'un bloc. Sans coefficient saisi,
 * toutes les lignes pèsent pareil — l'usage courant de la feuille. */
export function blockPercent(rows: PerformanceObjective[]): number | null {
  const scored = rows.filter((r) => r.achievement_percent !== null && r.achievement_percent !== undefined);
  if (scored.length === 0) return null;
  // Le coefficient est lu avec la même tolérance qu'à la saisie : tant que le
  // serveur n'a pas répondu, la cellule contient la frappe brute — « 2,4 » que
  // `Number` rendrait NaN, et le bloc afficherait un instant une pondération
  // uniforme au lieu de celle qui vient d'être saisie.
  const weightOf = (r: PerformanceObjective) => Number(parseDecimalInput(String(r.weight ?? ""))) || 1;
  const totalWeight = scored.reduce((sum, r) => sum + weightOf(r), 0);
  if (totalWeight === 0) return null;
  const weighted = scored.reduce((sum, r) => sum + (r.achievement_percent as number) * weightOf(r), 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

function percentText(percent: number | null | undefined) {
  return percent === null || percent === undefined ? "—" : `${Math.round(percent)}%`;
}

/** Vert, ambre ou rouge selon le taux d'atteinte — éclaircis en thème sombre,
 * où les teintes d'origine se perdraient dans le fond. */
const ACHIEVEMENT_COLORS = {
  light: { reached: "#1b7f3b", close: "#b8860b", missed: "#c0392b" },
  dark: { reached: "#5fd08a", close: "#e3b341", missed: "#f0766a" },
} as const;

function achievementColor(percent: number | null | undefined) {
  if (percent === null || percent === undefined) return "text.primary";
  const tier = percent >= 100 ? "reached" : percent >= 75 ? "close" : "missed";
  return (theme: Theme) => ACHIEVEMENT_COLORS[theme.palette.mode][tier];
}

/** Lignes d'un bloc d'objectifs : ses objectifs, la ligne d'ajout, puis sa
 * performance — le tout longé par la bande verticale de sa catégorie. */
function ObjectiveBlock({
  band,
  color,
  rows,
  readOnly,
  onPatch,
  onAdd,
  onRemove,
  footerLabel,
  problems,
}: {
  band: string;
  color: string;
  rows: PerformanceObjective[];
  readOnly: boolean;
  onPatch: (id: number, values: Partial<PerformanceObjective>) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  footerLabel: string;
  problems: Record<string, string>;
}) {
  const { t } = useTranslation();
  const problemOf = (id: number, field: string) => problems[`row:${id}:${field}`];
  const tint = alpha(color, 0.12);

  // Portée par la première ligne du bloc, quelle qu'elle soit : un bloc encore
  // vide commence par sa ligne d'ajout, ou par son pied en lecture seule.
  const bandCell = (
    <TableCell rowSpan={rows.length + (readOnly ? 1 : 2)} sx={{ bgcolor: color, color: "#fff", textAlign: "center" }}>
      <Typography
        variant="caption"
        fontWeight={700}
        // maxHeight : un intitulé long passe sur deux colonnes de texte plutôt
        // que d'étirer les lignes d'un bloc qui n'a qu'un ou deux objectifs.
        sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: 1, fontSize: 11, lineHeight: 1.3, maxHeight: 124 }}
      >
        {band}
      </Typography>
    </TableCell>
  );

  return (
    <>
      {rows.map((row, index) => (
        <TableRow key={row.id}>
          {index === 0 && bandCell}
          <TableCell sx={{ textAlign: "center", fontWeight: 700, color: "text.secondary" }}>{index + 1}</TableCell>
          <TableCell>
            <Stack direction="row" spacing={0.25} alignItems="flex-start">
              <Field
                value={row.label}
                readOnly={readOnly}
                multiline
                problem={problemOf(row.id, "label")}
                onChange={(v) => onPatch(row.id, { label: v })}
                placeholder={t("objectivesSheet.objectivePlaceholder")}
              />
              {!readOnly && (
                <Tooltip title={t("objectivesSheet.removeLine")}>
                  <IconButton
                    size="small"
                    aria-label={t("objectivesSheet.removeLine")}
                    onClick={() => onRemove(row.id)}
                    sx={{ p: 0.25 }}
                  >
                    <CloseOutlinedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </TableCell>
          <TableCell>
            <Field
              value={row.indicator}
              readOnly={readOnly}
              multiline
              problem={problemOf(row.id, "indicator")}
              onChange={(v) => onPatch(row.id, { indicator: v })}
            />
          </TableCell>
          <TableCell>
            <Field
              value={row.reference_value ?? ""}
              readOnly={readOnly}
              numeric
              align="center"
              problem={problemOf(row.id, "reference_value")}
              onChange={(v) => onPatch(row.id, { reference_value: v })}
            />
          </TableCell>
          <TableCell>
            <Field
              value={row.target_value ?? ""}
              readOnly={readOnly}
              numeric
              align="center"
              problem={problemOf(row.id, "target_value")}
              onChange={(v) => onPatch(row.id, { target_value: v })}
            />
          </TableCell>
          <TableCell>
            <Field
              value={row.actual_value ?? ""}
              readOnly={readOnly}
              numeric
              align="center"
              problem={problemOf(row.id, "actual_value")}
              onChange={(v) => onPatch(row.id, { actual_value: v })}
            />
          </TableCell>
          {/* Calculé : la case reste teintée, on n'y écrit pas. */}
          <TableCell sx={{ bgcolor: SOFT_ORANGE, fontWeight: 700, textAlign: "center", color: achievementColor(row.achievement_percent) }}>
            {percentText(row.achievement_percent)}
          </TableCell>
          <TableCell>
            <Field
              value={row.weight ?? ""}
              readOnly={readOnly}
              numeric
              align="center"
              problem={problemOf(row.id, "weight")}
              onChange={(v) => onPatch(row.id, { weight: v })}
            />
          </TableCell>
        </TableRow>
      ))}

      {!readOnly && (
        <TableRow>
          {rows.length === 0 && bandCell}
          <TableCell colSpan={8}>
            <Button
              size="small"
              startIcon={<AddOutlinedIcon sx={{ fontSize: 14 }} />}
              onClick={onAdd}
              sx={{ py: 0.25, px: 0.75, minWidth: 0, fontSize: 11, lineHeight: 1.2 }}
            >
              {t("objectivesSheet.addLine")}
            </Button>
          </TableCell>
        </TableRow>
      )}

      {/* Pied du bloc : la performance sur ces objectifs. Hauteur fixée : quand
          la bande verticale est plus haute que le bloc (bloc vide ou presque),
          ce sont les lignes du dessus qui s'étirent, pas le pied. */}
      <TableRow sx={{ height: 34 }}>
        {rows.length === 0 && readOnly && bandCell}
        <TableCell colSpan={6} sx={{ bgcolor: tint, fontWeight: 800, textAlign: "center" }}>
          {footerLabel}
        </TableCell>
        <TableCell sx={{ bgcolor: SOFT_ORANGE, fontWeight: 800, textAlign: "center" }}>{percentText(blockPercent(rows))}</TableCell>
        <TableCell sx={{ bgcolor: tint }} />
      </TableRow>
    </>
  );
}

export default function AnnualObjectivesSheet({
  identity,
  rows,
  readOnly,
  dates,
  onPatch,
  onAdd,
  onRemove,
  onDateChange,
  previousPercent,
  teamSheet,
  problems = {},
}: {
  identity: SheetIdentity;
  rows: PerformanceObjective[];
  readOnly: boolean;
  dates: {
    objectives_set_on: string;
    evaluated_on: string;
    next_evaluation_on: string;
    manager_visa: string;
    previous_evaluated_on: string;
  };
  onPatch: (id: number, values: Partial<PerformanceObjective>) => void;
  onAdd: (category: PerformanceObjective["category"]) => void;
  onRemove: (id: number) => void;
  onDateChange: (field: string, value: string) => void;
  previousPercent: number | null;
  /** La fiche d'équipe reprend la même forme, ses intitulés seuls diffèrent. */
  teamSheet?: boolean;
  /** Cases refusées à la validation, par clé « row:<id>:<champ> » ou « header:<champ> ». */
  problems?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const business = rows.filter((r) => r.category === "BUSINESS");
  const managerial = rows.filter((r) => r.category === "MANAGERIAL");
  const businessPercent = blockPercent(business);
  const managerialPercent = blockPercent(managerial);
  const scored = [businessPercent, managerialPercent].filter((v): v is number => v !== null);
  const globalPercent = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null;

  /** Saisie d'un champ d'entête — absente en lecture seule, la valeur s'affiche alors en texte. */
  const edit = (field: string) => (readOnly ? undefined : (value: string) => onDateChange(field, value));

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        border: "1px solid",
        borderColor: "divider",
        // Les navigateurs suppriment les aplats à l'impression : sans eux,
        // l'entête orange et les bandes n'auraient plus que leur texte blanc.
        "@media print": { "&, & *": { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } },
      }}
    >
      <Paper elevation={0} sx={{ py: 1, px: 1, mb: 2, textAlign: "center", bgcolor: CREAM, border: "1px solid", borderColor: "divider" }}>
        <Typography variant="subtitle1" fontWeight={800} sx={{ color: "primary.main" }}>
          {t(teamSheet ? "objectivesSheet.titleTeam" : "objectivesSheet.title").toUpperCase()}
        </Typography>
      </Paper>

      <TableContainer>
        {/* Entête, disposée comme la feuille : la photo tient les trois lignes,
            puis quatre couples intitulé/valeur par ligne — identité à gauche,
            dates au centre, taux et visa à droite. */}
        <Table size="small" sx={{ ...tableSx, mb: 2 }}>
          {/* Tout est à largeur fixe sauf la colonne d'identité : société,
              département et position sont les seuls textes de longueur libre. */}
          <colgroup>
            <col style={{ width: 108 }} />
            <col style={{ width: 96 }} />
            <col />
            <col style={{ width: 124 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 138 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 132 }} />
          </colgroup>
          <TableBody>
            <TableRow>
              <TableCell rowSpan={3} sx={{ textAlign: "center" }}>
                {/* La photo occupe la case qui lui revient : les trois lignes
                  * d'entête, moins celle du nom. Recadrée en « cover », elle
                  * la remplit sans se déformer. */}
                <Avatar
                  src={identity.photo ?? undefined}
                  variant="rounded"
                  sx={{
                    width: "100%",
                    height: 92,
                    fontSize: 34,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
                    color: "primary.main",
                    "& img": { objectFit: "cover" },
                  }}
                >
                  {identity.name.charAt(0).toUpperCase()}
                </Avatar>
                <Typography sx={{ mt: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1.2 }}>
                  {identity.name || t("objectivesSheet.photo")}
                </Typography>
              </TableCell>
              <HeaderPair label={t("objectivesSheet.company")} value={identity.company} />
              <HeaderPair label={t("objectivesSheet.manager")} value={identity.managerName} />
              <HeaderPair label={t("objectivesSheet.previousEvaluation")} value={dates.previous_evaluated_on} type="date" />
              <HeaderPair
                label={t("objectivesSheet.nextEvaluation")}
                value={dates.next_evaluation_on}
                type="date"
                onChange={edit("next_evaluation_on")}
                problem={problems["header:next_evaluation_on"]}
              />
            </TableRow>
            <TableRow>
              <HeaderPair label={t("objectivesSheet.department")} value={identity.department} />
              <HeaderPair
                label={t("objectivesSheet.objectivesSetOn")}
                value={dates.objectives_set_on}
                type="date"
                onChange={edit("objectives_set_on")}
                problem={problems["header:objectives_set_on"]}
              />
              <HeaderPair label={t("objectivesSheet.previousAchievement")} value={percentText(previousPercent)} />
              <TableCell colSpan={2} />
            </TableRow>
            <TableRow>
              <HeaderPair label={t("objectivesSheet.position")} value={identity.position} />
              <HeaderPair
                label={t("objectivesSheet.evaluatedOn")}
                value={dates.evaluated_on}
                type="date"
                onChange={edit("evaluated_on")}
                problem={problems["header:evaluated_on"]}
              />
              <HeaderPair label={t("objectivesSheet.achievementVsObjectives")} value={percentText(globalPercent)} />
              <HeaderPair
                label={t("objectivesSheet.visa")}
                value={dates.manager_visa}
                onChange={edit("manager_visa")}
                problem={problems["header:manager_visa"]}
              />
            </TableRow>
          </TableBody>
        </Table>

        <Table size="small" sx={tableSx}>
          <colgroup>
            <col style={{ width: 38 }} />
            <col style={{ width: 30 }} />
            <col />
            <col style={{ width: "21%" }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 84 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell sx={headSx} />
              {/* L'intitulé de colonne et la bande verticale se complètent :
                  « Objectifs individuels » × « Business ». */}
              <TableCell colSpan={2} sx={headSx}>
                {t(teamSheet ? "objectivesSheet.objectivesColTeam" : "objectivesSheet.objectivesCol")}
              </TableCell>
              <TableCell sx={headSx}>{t("objectivesSheet.indicator")}</TableCell>
              <TableCell sx={headSx}>{t("objectivesSheet.reference")}</TableCell>
              <TableCell sx={headSx}>{t("objectivesSheet.target")}</TableCell>
              <TableCell sx={headSx}>{t("objectivesSheet.actual")}</TableCell>
              <TableCell sx={headSx}>%</TableCell>
              <TableCell sx={headSx}>{t("objectivesSheet.weight")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <ObjectiveBlock
              band={t("objectivesSheet.businessBand").toUpperCase()}
              color={BUSINESS_BLUE}
              rows={business}
              readOnly={readOnly}
              onPatch={onPatch}
              onAdd={() => onAdd("BUSINESS")}
              onRemove={onRemove}
              problems={problems}
              footerLabel={t(teamSheet ? "objectivesSheet.businessTeamFooter" : "objectivesSheet.businessFooter").toUpperCase()}
            />
            <ObjectiveBlock
              band={t("objectivesSheet.managerialBand").toUpperCase()}
              color={MANAGERIAL_GREEN}
              rows={managerial}
              readOnly={readOnly}
              onPatch={onPatch}
              onAdd={() => onAdd("MANAGERIAL")}
              onRemove={onRemove}
              problems={problems}
              footerLabel={t(teamSheet ? "objectivesSheet.managerialTeamFooter" : "objectivesSheet.managerialFooter").toUpperCase()}
            />

            {/* Performance globale de l'année : même crème que le bandeau, la fiche s'ouvre et se referme dessus. */}
            <TableRow>
              <TableCell colSpan={7} sx={{ bgcolor: CREAM, color: "primary.main", textAlign: "center" }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13, py: 0.5 }}>
                  {t(teamSheet ? "objectivesSheet.globalTeamFooter" : "objectivesSheet.globalFooter").toUpperCase()}
                </Typography>
              </TableCell>
              <TableCell colSpan={2} sx={{ bgcolor: CREAM, color: "primary.main", textAlign: "center" }}>
                <Typography sx={{ fontWeight: 800, fontSize: 16 }}>{percentText(globalPercent)}</Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
