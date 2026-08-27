import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Avatar, Box, Button, IconButton, InputBase, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PerformanceObjective } from "@/api/types";

/* ---------------------------------------------------------------------------
 * « Fiche de fixation d'objectifs / d'évaluation annuelle de la performance »
 *
 * Reproduction de la feuille ID-PMC : entête d'identité, deux tableaux
 * d'objectifs — business puis leadership et managériaux — chacun clos par sa
 * performance, et la performance globale de l'année en pied de fiche.
 *
 * Rien de ce qui se calcule n'est saisi : le taux d'atteinte d'une ligne
 * découle du réalisé et de la cible, la performance d'un bloc est la moyenne
 * pondérée de ses lignes, et la performance globale la moyenne des deux blocs.
 * C'est cette dernière qui alimente l'Altitude, donc la matrice ID-3A, la
 * 9 Box et l'ID-TPD — une valeur ressaisie ailleurs finirait par les
 * contredire.
 * ------------------------------------------------------------------------- */

const YELLOW = "#ffff00";
const BUSINESS_BLUE = "#2e75b6";
const BUSINESS_TINT = "#deebf7";
const MANAGERIAL_GREEN = "#00a650";
const MANAGERIAL_TINT = "#e2efda";
const HEADER_PEACH = "#f8cbad";
const BORDER = "1px solid #9aa4b2";
const TEXT = "#1a1a1a";
const ROW_H = 30;

/** Colonnes de la feuille, largeurs reprises du modèle. */
const COLUMNS = "26px minmax(180px, 2.1fr) minmax(120px, 1.3fr) 96px 96px 96px 66px 76px";

export interface SheetIdentity {
  photo: string | null;
  name: string;
  company: string;
  department: string;
  position: string;
  managerName: string;
}

function Cell({
  children,
  bg,
  bold,
  center,
  color,
  colSpan,
}: {
  children?: React.ReactNode;
  bg?: string;
  bold?: boolean;
  center?: boolean;
  color?: string;
  colSpan?: number;
}) {
  return (
    <Box
      sx={{
        border: BORDER,
        bgcolor: bg ?? "#fff",
        color: color ?? TEXT,
        minHeight: ROW_H,
        display: "flex",
        alignItems: "center",
        justifyContent: center ? "center" : "flex-start",
        px: 0.75,
        fontSize: 11.5,
        fontWeight: bold ? 700 : 400,
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        overflow: "hidden",
      }}
    >
      {children}
    </Box>
  );
}

/** Case de saisie sans habillage, pour coller à la feuille de calcul. */
function Field({
  value,
  onChange,
  readOnly,
  align,
  numeric,
  placeholder,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  align?: "center" | "right";
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <InputBase
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => onChange?.(e.target.value)}
      sx={{
        width: "100%",
        fontSize: 11.5,
        "& input": { p: 0, textAlign: align ?? "left" },
      }}
    />
  );
}

/** Moyenne pondérée des taux d'atteinte d'un bloc. Sans coefficient saisi,
 * toutes les lignes pèsent pareil — l'usage courant de la feuille. */
export function blockPercent(rows: PerformanceObjective[]): number | null {
  const scored = rows.filter((r) => r.achievement_percent !== null && r.achievement_percent !== undefined);
  if (scored.length === 0) return null;
  const totalWeight = scored.reduce((sum, r) => sum + (Number(r.weight) || 1), 0);
  if (totalWeight === 0) return null;
  const weighted = scored.reduce((sum, r) => sum + (r.achievement_percent as number) * (Number(r.weight) || 1), 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

function ObjectiveBlock({
  title,
  color,
  tint,
  rows,
  readOnly,
  onPatch,
  onAdd,
  onRemove,
  footerLabel,
}: {
  title: string;
  color: string;
  tint: string;
  rows: PerformanceObjective[];
  readOnly: boolean;
  onPatch: (id: number, values: Partial<PerformanceObjective>) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  footerLabel: string;
}) {
  const { t } = useTranslation();
  const percent = blockPercent(rows);

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: COLUMNS }}>
        {/* Entête du bloc */}
        <Cell bg={color} color="#fff" bold center colSpan={2}>
          {title}
        </Cell>
        <Cell bg={tint} bold center>
          {t("objectivesSheet.indicator")}
        </Cell>
        <Cell bg={tint} bold center>
          {t("objectivesSheet.reference")}
        </Cell>
        <Cell bg={tint} bold center>
          {t("objectivesSheet.target")}
        </Cell>
        <Cell bg={tint} bold center>
          {t("objectivesSheet.actual")}
        </Cell>
        <Cell bg={tint} bold center>
          %
        </Cell>
        <Cell bg={tint} bold center>
          {t("objectivesSheet.weight")}
        </Cell>

        {rows.map((row, index) => (
          <Box key={row.id} sx={{ display: "contents" }}>
            <Cell bg="#f3f6fb" bold center>
              {index + 1}
            </Cell>
            <Cell>
              <Field
                value={row.label}
                readOnly={readOnly}
                onChange={(v) => onPatch(row.id, { label: v })}
                placeholder={t("objectivesSheet.objectivePlaceholder")}
              />
            </Cell>
            <Cell>
              <Field value={row.indicator} readOnly={readOnly} onChange={(v) => onPatch(row.id, { indicator: v })} />
            </Cell>
            <Cell center>
              <Field
                value={row.reference_value ?? ""}
                readOnly={readOnly}
                numeric
                align="center"
                onChange={(v) => onPatch(row.id, { reference_value: v })}
              />
            </Cell>
            <Cell center>
              <Field
                value={row.target_value ?? ""}
                readOnly={readOnly}
                numeric
                align="center"
                onChange={(v) => onPatch(row.id, { target_value: v })}
              />
            </Cell>
            <Cell center>
              <Field
                value={row.actual_value ?? ""}
                readOnly={readOnly}
                numeric
                align="center"
                onChange={(v) => onPatch(row.id, { actual_value: v })}
              />
            </Cell>
            {/* Calculé : la case reste grisée, on n'y écrit pas. */}
            <Cell
              bg="#fdf2e9"
              bold
              center
              color={
                row.achievement_percent === null || row.achievement_percent === undefined
                  ? TEXT
                  : row.achievement_percent >= 100
                    ? "#1b7f3b"
                    : row.achievement_percent >= 75
                      ? "#b8860b"
                      : "#c0392b"
              }
            >
              {row.achievement_percent === null || row.achievement_percent === undefined
                ? "—"
                : `${Math.round(row.achievement_percent)}%`}
            </Cell>
            <Cell center>
              <Stack direction="row" spacing={0.25} alignItems="center" sx={{ width: "100%" }}>
                <Field
                  value={row.weight ?? ""}
                  readOnly={readOnly}
                  numeric
                  align="center"
                  onChange={(v) => onPatch(row.id, { weight: v })}
                />
                {!readOnly && (
                  <IconButton size="small" onClick={() => onRemove(row.id)} aria-label={t("common.delete")}>
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              </Stack>
            </Cell>
          </Box>
        ))}

        {/* Pied du bloc : la performance individuelle sur ces objectifs */}
        <Cell bg={tint} bold colSpan={6}>
          <Box sx={{ width: "100%", textAlign: "center", fontWeight: 800, fontSize: 11.5 }}>{footerLabel}</Box>
        </Cell>
        <Cell bg="#fdf2e9" bold center>
          {percent === null ? "—" : `${Math.round(percent)}%`}
        </Cell>
        <Cell bg={tint} />
      </Box>

      {!readOnly && (
        <Button size="small" startIcon={<AddOutlinedIcon />} onClick={onAdd} sx={{ mt: 0.5 }}>
          {t("objectivesSheet.addLine")}
        </Button>
      )}
    </Box>
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
}) {
  const { t } = useTranslation();
  const business = rows.filter((r) => r.category === "BUSINESS");
  const managerial = rows.filter((r) => r.category === "MANAGERIAL");
  const businessPercent = blockPercent(business);
  const managerialPercent = blockPercent(managerial);
  const scored = [businessPercent, managerialPercent].filter((v): v is number => v !== null);
  const globalPercent = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null;

  /** Case d'entête : intitulé pêche puis valeur, comme sur la feuille. */
  function HeaderPair({
    label,
    value,
    field,
    type,
  }: {
    label: string;
    value: string;
    field?: string;
    type?: "date";
  }) {
    return (
      <>
        <Cell bg={HEADER_PEACH} bold>
          {label}
        </Cell>
        <Cell>
          {field && !readOnly ? (
            <InputBase
              type={type}
              value={value}
              onChange={(e) => onDateChange(field, e.target.value)}
              sx={{ width: "100%", fontSize: 11.5, "& input": { p: 0 } }}
            />
          ) : (
            <Typography sx={{ fontSize: 11.5 }}>{value || "—"}</Typography>
          )}
        </Cell>
      </>
    );
  }

  return (
    <Box sx={{ bgcolor: "#fff", p: 1.5, border: BORDER, color: TEXT }}>
      {/* Bandeau titre jaune de la feuille */}
      <Box sx={{ bgcolor: YELLOW, border: BORDER, py: 1, textAlign: "center", mb: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 15, color: TEXT }}>
          {t(teamSheet ? "objectivesSheet.titleTeam" : "objectivesSheet.title").toUpperCase()}
        </Typography>
      </Box>

      {/* Entête, disposée comme la feuille : la photo tient les trois lignes,
          puis quatre couples intitulé/valeur par ligne — identité à gauche,
          dates au centre, taux et visa à droite. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "132px 118px minmax(120px, 1fr) 132px minmax(96px, 1fr) 152px minmax(84px, 1fr) 132px minmax(84px, 1fr)",
          mb: 1.5,
        }}
      >
        <Box
          sx={{
            gridRow: "span 3",
            border: BORDER,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            p: 0.5,
          }}
        >
          <Avatar src={identity.photo ?? undefined} variant="rounded" sx={{ width: 54, height: 62 }}>
            {identity.name.charAt(0).toUpperCase()}
          </Avatar>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textAlign: "center", lineHeight: 1.15 }}>
            {identity.name || t("objectivesSheet.photo")}
          </Typography>
        </Box>

        {/* Ligne 1 */}
        <HeaderPair label={t("objectivesSheet.company")} value={identity.company} />
        <HeaderPair label={t("objectivesSheet.manager")} value={identity.managerName} />
        <HeaderPair label={t("objectivesSheet.previousEvaluation")} value={dates.previous_evaluated_on} />
        <HeaderPair
          label={t("objectivesSheet.nextEvaluation")}
          value={dates.next_evaluation_on}
          field="next_evaluation_on"
          type="date"
        />

        {/* Ligne 2 */}
        <HeaderPair label={t("objectivesSheet.department")} value={identity.department} />
        <HeaderPair
          label={t("objectivesSheet.objectivesSetOn")}
          value={dates.objectives_set_on}
          field="objectives_set_on"
          type="date"
        />
        <HeaderPair
          label={t("objectivesSheet.previousAchievement")}
          value={previousPercent === null ? "—" : `${Math.round(previousPercent)}%`}
        />
        <Cell bg={HEADER_PEACH} />
        <Cell />

        {/* Ligne 3 */}
        <HeaderPair label={t("objectivesSheet.position")} value={identity.position} />
        <HeaderPair
          label={t("objectivesSheet.evaluatedOn")}
          value={dates.evaluated_on}
          field="evaluated_on"
          type="date"
        />
        <HeaderPair
          label={t("objectivesSheet.achievementVsObjectives")}
          value={globalPercent === null ? "—" : `${Math.round(globalPercent)}%`}
        />
        <HeaderPair label={t("objectivesSheet.visa")} value={dates.manager_visa} field="manager_visa" />
      </Box>

      <ObjectiveBlock
        title={t(teamSheet ? "objectivesSheet.businessTeamTitle" : "objectivesSheet.businessTitle").toUpperCase()}
        color={BUSINESS_BLUE}
        tint={BUSINESS_TINT}
        rows={business}
        readOnly={readOnly}
        onPatch={onPatch}
        onAdd={() => onAdd("BUSINESS")}
        onRemove={onRemove}
        footerLabel={t(teamSheet ? "objectivesSheet.businessTeamFooter" : "objectivesSheet.businessFooter").toUpperCase()}
      />

      <ObjectiveBlock
        title={t(teamSheet ? "objectivesSheet.managerialTeamTitle" : "objectivesSheet.managerialTitle").toUpperCase()}
        color={MANAGERIAL_GREEN}
        tint={MANAGERIAL_TINT}
        rows={managerial}
        readOnly={readOnly}
        onPatch={onPatch}
        onAdd={() => onAdd("MANAGERIAL")}
        onRemove={onRemove}
        footerLabel={t(teamSheet ? "objectivesSheet.managerialTeamFooter" : "objectivesSheet.managerialFooter").toUpperCase()}
      />

      {/* Performance globale de l'année */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 142px", border: BORDER, bgcolor: "#fdf6ec" }}>
        <Box sx={{ px: 1, py: 0.75, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 800, fontSize: 12.5 }}>
            {t(teamSheet ? "objectivesSheet.globalTeamFooter" : "objectivesSheet.globalFooter").toUpperCase()}
          </Typography>
        </Box>
        <Box
          sx={{
            borderLeft: BORDER,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "#fdf2e9",
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
            {globalPercent === null ? "—" : `${Math.round(globalPercent)}%`}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
