import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { Avatar, Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { Evaluation, UserRecord } from "@/api/types";
import { EXECUTIVE_BADGE_COLOR, performanceColors } from "@/theme";

const LABEL_WIDTH = 220;
const COL_WIDTH = 111;

interface PersonNodeProps {
  name: string;
  position: string;
  avatar: string | null;
  evaluation?: Evaluation;
  root?: boolean;
}

// sx forcé sur le tooltip MUI pour retirer son chrome gris foncé par défaut
// et ne laisser paraître que la Paper claire ci-dessous — même traitement
// que CustomTooltip sur la Matrice ID-3A (survol d'une vignette).
const TOOLTIP_SLOT_SX = { bgcolor: "transparent", p: 0, m: 0, maxWidth: "none", boxShadow: "none" };

/** Contenu du hover — performance en cours (Altitude/HSI/SSI), même habillage
 * (Paper claire bordée) que CustomTooltip sur la Matrice ID-3A. */
function PerformanceTooltip({ name, position, avatar, evaluation }: { name: string; position: string; avatar: string | null; evaluation?: Evaluation }) {
  const { t } = useTranslation();
  return (
    <Paper elevation={0} sx={{ p: 1.5, minWidth: 200, border: "1px solid", borderColor: "divider" }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Avatar src={avatar ?? undefined} sx={{ width: 32, height: 32, fontSize: 14, bgcolor: "primary.main" }}>
          {name.charAt(0).toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {position}
          </Typography>
        </Box>
      </Stack>
      {evaluation ? (
        <>
          <Typography variant="body2" sx={{ mt: 0.75 }}>
            {t("evaluationForm.aptitudes")} (HSI): <strong>{Number(evaluation.hsi).toFixed(1)}</strong> ·{" "}
            {t("evaluationForm.attitudes")} (SSI): <strong>{Number(evaluation.ssi).toFixed(1)}</strong>
          </Typography>
          <Typography variant="body2" sx={{ color: performanceColors[evaluation.performance_rating] }}>
            {t("dashboard.manager.altitude")}: <strong>{evaluation.altitude_percentage}%</strong> —{" "}
            {t(`common.performance.${evaluation.performance_rating}`)}
          </Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {t("evaluations.notEvaluated")}
        </Typography>
      )}
    </Paper>
  );
}

function PersonNode({ name, position, avatar, evaluation, root }: PersonNodeProps) {
  const size = root ? 70 : 61;
  return (
    <Tooltip
      title={<PerformanceTooltip name={name} position={position} avatar={avatar} evaluation={evaluation} />}
      slotProps={{ tooltip: { sx: TOOLTIP_SLOT_SX } }}
    >
      <Stack alignItems="center" spacing={0.5} sx={{ width: "100%", cursor: "default" }}>
        <Avatar
          src={avatar ?? undefined}
          sx={{
            width: size,
            height: size,
            fontSize: size / 2.6,
            bgcolor: "primary.main",
            border: "2px solid",
            borderColor: root ? EXECUTIVE_BADGE_COLOR : "divider",
            boxShadow: root ? `0 3px 10px ${EXECUTIVE_BADGE_COLOR}33` : "0 2px 6px rgba(0,0,0,0.08)",
          }}
        >
          {name.charAt(0).toUpperCase()}
        </Avatar>
        <Paper
          elevation={0}
          sx={{ px: 1, py: 0.2, border: "1px solid", borderColor: "divider", borderRadius: 1, width: "100%", textAlign: "center" }}
        >
          <Typography variant="caption" fontWeight={700} noWrap sx={{ fontSize: root ? 14.5 : 13.75 }}>
            {name}
          </Typography>
        </Paper>
        <Box
          sx={{
            px: 1,
            py: 0.2,
            borderRadius: 1,
            width: "100%",
            textAlign: "center",
            bgcolor: root ? EXECUTIVE_BADGE_COLOR : "action.hover",
          }}
        >
          <Typography
            variant="caption"
            fontWeight={600}
            noWrap
            sx={{ color: root ? "#fff" : "text.secondary", lineHeight: 1.25, display: "block", fontSize: root ? 11 : 12 }}
          >
            {position || "—"}
          </Typography>
        </Box>
      </Stack>
    </Tooltip>
  );
}

interface StatRow {
  labelKey: string;
  values: (number | null)[];
  gapBefore?: boolean;
}

/** Personne pouvant occuper la racine de l'organigramme : le CEO sur le
 * tableau de bord entreprise, le manager sur celui de son département. */
interface RootPerson {
  id: number;
  full_name: string;
  position: string;
  avatar: string | null;
}

/**
 * Organigramme d'un responsable et de ceux qui lui reportent, surmontant le
 * tableau des données de carrière — âge, ancienneté, expérience — colonne par
 * colonne. Générique pour servir les deux échelles : CEO et directeurs,
 * manager et son équipe. La dernière ligne (effectif encadré) n'a de sens que
 * lorsque les personnes affichées encadrent elles-mêmes du monde : elle est
 * omise quand aucun effectif n'est fourni.
 */
export default function LeadershipOverview({
  root,
  people,
  headcountById,
  titleKey = "dashboard.companyAdmin.leadershipTitle",
  lastEvaluationByUser,
}: {
  root: RootPerson;
  people: UserRecord[];
  headcountById?: Map<number, number>;
  titleKey?: string;
  lastEvaluationByUser: Map<number, Evaluation>;
}) {
  const { t } = useTranslation();

  const directors = people;
  if (directors.length === 0) return null;

  const headcounts = directors.map((d) => headcountById?.get(d.id) ?? null);

  const statRows: StatRow[] = [
    { labelKey: "dashboard.companyAdmin.age", values: directors.map((d) => d.age) },
    { labelKey: "dashboard.companyAdmin.yearsInRole", values: directors.map((d) => d.years_in_current_role) },
    { labelKey: "dashboard.companyAdmin.yearsInCompany", values: directors.map((d) => d.years_in_company) },
    { labelKey: "dashboard.companyAdmin.totalExperience", values: directors.map((d) => d.total_experience_years) },
    ...(headcounts.some((v) => v !== null)
      ? [{ labelKey: "dashboard.companyAdmin.teamHeadcount", values: headcounts, gapBefore: true }]
      : []),
  ];

  // Colonnes fixes partagées par l'organigramme et le tableau ci-dessous —
  // deux grilles séparées, mais des largeurs identiques garantissent que
  // chaque valeur reste alignée sous la photo du directeur correspondant.
  const gridTemplateColumns = `${LABEL_WIDTH}px repeat(${directors.length}, ${COL_WIDTH}px)`;
  const gridMinWidth = LABEL_WIDTH + directors.length * COL_WIDTH;

  return (
    <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle1" fontWeight={800} textAlign="center" sx={{ color: "primary.main", mb: 2, letterSpacing: 0.3 }}>
        {t(titleKey)}
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", overflowX: "auto" }}>
        <Box sx={{ display: "grid", gridTemplateColumns, width: `${gridMinWidth}px`, flexShrink: 0, fontSize: 14.5 }}>
          {/* CEO centré sur les colonnes des directeurs (pas sur toute la
              largeur, décalée par la colonne des intitulés à gauche). */}
          <Box />
          <Box sx={{ gridColumn: `2 / ${directors.length + 2}`, justifySelf: "center", width: 128 }}>
            <PersonNode name={root.full_name} position={root.position} avatar={root.avatar} evaluation={lastEvaluationByUser.get(root.id)} root />
          </Box>

          <Box />
          <Box sx={{ gridColumn: `2 / ${directors.length + 2}`, justifySelf: "center", width: 2, height: 15, bgcolor: "divider" }} />

          {/* barre de connexion horizontale, alignée sur les colonnes directeurs */}
          <Box />
          <Box sx={{ gridColumn: `2 / ${directors.length + 2}`, height: 2, bgcolor: "divider" }} />

          {/* organigramme : flèche + photo de chaque directeur, dans sa colonne */}
          <Box />
          {directors.map((d) => (
            <Stack key={d.id} alignItems="center" spacing={0} sx={{ px: 0.75, pt: 0.25 }}>
              <KeyboardArrowDownRoundedIcon fontSize="small" sx={{ color: "divider" }} />
              <PersonNode
                name={d.full_name || d.email}
                position={d.position}
                avatar={d.avatar}
                evaluation={lastEvaluationByUser.get(d.id)}
              />
            </Stack>
          ))}
        </Box>

        {/* tableau de statistiques — grille séparée mais mêmes colonnes
            fixes (LABEL_WIDTH/COL_WIDTH) que l'organigramme ci-dessus, donc
            chaque valeur reste alignée sous la photo du bon directeur. */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns,
            width: `${gridMinWidth}px`,
            flexShrink: 0,
            fontSize: 11.5,
            mt: 1.5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          {statRows.map((row, rowIdx) => (
            <Box key={row.labelKey} sx={{ display: "contents" }}>
              <Box
                sx={{
                  bgcolor: row.gapBefore ? EXECUTIVE_BADGE_COLOR + "33" : EXECUTIVE_BADGE_COLOR + "1f",
                  px: 1.4,
                  py: 0.55,
                  fontWeight: 700,
                  borderTop: rowIdx === 0 ? "none" : "1px solid",
                  borderColor: "divider",
                }}
              >
                {t(row.labelKey)}
              </Box>
              {row.values.map((v, i) => (
                <Box
                  key={i}
                  sx={{
                    px: 0.85,
                    py: 0.55,
                    textAlign: "center",
                    borderLeft: "1px solid",
                    borderTop: rowIdx === 0 ? "none" : "1px solid",
                    borderColor: "divider",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {v !== null ? String(v).padStart(2, "0") : "—"}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
