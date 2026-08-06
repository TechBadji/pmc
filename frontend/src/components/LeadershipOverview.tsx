import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { Avatar, Box, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { Department, Evaluation, Me, UserRecord } from "@/api/types";
import { EXECUTIVE_BADGE_COLOR, performanceColors } from "@/theme";

const LABEL_WIDTH = 200;
const COL_WIDTH = 92;

interface PersonNodeProps {
  name: string;
  position: string;
  avatar: string | null;
  evaluation?: Evaluation;
  root?: boolean;
}

/** Contenu du hover — performance en cours (Altitude/HSI/SSI) quand une
 * évaluation existe, sinon un simple rappel du poste. */
function PerformanceTooltip({ name, position, evaluation }: { name: string; position: string; evaluation?: Evaluation }) {
  const { t } = useTranslation();
  if (!evaluation) {
    return (
      <Stack spacing={0.25} sx={{ p: 0.5 }}>
        <Typography variant="caption" fontWeight={700}>
          {name}
        </Typography>
        <Typography variant="caption" color="inherit" sx={{ opacity: 0.8 }}>
          {t("evaluations.notEvaluated")}
        </Typography>
      </Stack>
    );
  }
  const rating = evaluation.performance_rating;
  return (
    <Stack spacing={0.5} sx={{ p: 0.5, minWidth: 150 }}>
      <Typography variant="caption" fontWeight={700}>
        {name} — {position}
      </Typography>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          {t("dashboard.manager.altitude")}
        </Typography>
        <Typography variant="caption" fontWeight={700} sx={{ color: performanceColors[rating] }}>
          {evaluation.altitude_percentage}%
        </Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          HSI / SSI
        </Typography>
        <Typography variant="caption" fontWeight={700}>
          {evaluation.hsi} / {evaluation.ssi}
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ color: performanceColors[rating], fontWeight: 700 }}>
        {t(`common.performance.${rating}`)}
      </Typography>
    </Stack>
  );
}

function PersonNode({ name, position, avatar, evaluation, root }: PersonNodeProps) {
  const size = root ? 64 : 50;
  return (
    <Tooltip title={<PerformanceTooltip name={name} position={position} evaluation={evaluation} />} arrow>
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
          <Typography variant="caption" fontWeight={700} noWrap sx={{ fontSize: root ? 13 : 11.5 }}>
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
            sx={{ color: root ? "#fff" : "text.secondary", lineHeight: 1.25, display: "block", fontSize: 10 }}
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

export default function LeadershipOverview({
  ceo,
  directors,
  departments,
  lastEvaluationByUser,
}: {
  ceo: Me;
  directors: UserRecord[];
  departments: Department[];
  lastEvaluationByUser: Map<number, Evaluation>;
}) {
  const { t } = useTranslation();

  if (directors.length === 0) return null;

  const headcountByDirector = new Map<number, number>();
  departments.forEach((d) => {
    if (d.manager) headcountByDirector.set(d.manager, d.member_count);
  });

  const statRows: StatRow[] = [
    { labelKey: "dashboard.companyAdmin.age", values: directors.map((d) => d.age) },
    { labelKey: "dashboard.companyAdmin.yearsInRole", values: directors.map((d) => d.years_in_current_role) },
    { labelKey: "dashboard.companyAdmin.yearsInCompany", values: directors.map((d) => d.years_in_company) },
    { labelKey: "dashboard.companyAdmin.totalExperience", values: directors.map((d) => d.total_experience_years) },
    {
      labelKey: "dashboard.companyAdmin.teamHeadcount",
      values: directors.map((d) => headcountByDirector.get(d.id) ?? null),
      gapBefore: true,
    },
  ];

  // Colonnes fixes partagées par l'organigramme et le tableau ci-dessous —
  // deux grilles séparées, mais des largeurs identiques garantissent que
  // chaque valeur reste alignée sous la photo du directeur correspondant.
  const gridTemplateColumns = `${LABEL_WIDTH}px repeat(${directors.length}, ${COL_WIDTH}px)`;
  const gridMinWidth = LABEL_WIDTH + directors.length * COL_WIDTH;

  return (
    <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, border: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle1" fontWeight={800} textAlign="center" sx={{ color: "primary.main", mb: 2, letterSpacing: 0.3 }}>
        {t("dashboard.companyAdmin.leadershipTitle")}
      </Typography>

      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ display: "grid", gridTemplateColumns, minWidth: gridMinWidth, fontSize: 13 }}>
          {/* CEO centré sur les colonnes des directeurs (pas sur toute la
              largeur, décalée par la colonne des intitulés à gauche). */}
          <Box />
          <Box sx={{ gridColumn: `2 / ${directors.length + 2}`, justifySelf: "center", width: 116 }}>
            <PersonNode name={ceo.full_name} position={ceo.position} avatar={ceo.avatar} evaluation={lastEvaluationByUser.get(ceo.id)} root />
          </Box>

          <Box />
          <Box sx={{ gridColumn: `2 / ${directors.length + 2}`, justifySelf: "center", width: 2, height: 14, bgcolor: "divider" }} />

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
            minWidth: gridMinWidth,
            fontSize: 13,
            mt: 1.5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          {statRows.map((row, rowIdx) => (
            <Box key={row.labelKey} sx={{ display: "contents" }}>
              {row.gapBefore && <Box sx={{ gridColumn: "1 / -1", height: 6, bgcolor: "background.paper" }} />}
              <Box
                sx={{
                  bgcolor: row.gapBefore ? EXECUTIVE_BADGE_COLOR + "33" : EXECUTIVE_BADGE_COLOR + "1f",
                  px: 1.5,
                  py: 0.75,
                  fontWeight: 700,
                  borderTop: rowIdx === 0 || row.gapBefore ? "none" : "1px solid",
                  borderColor: "divider",
                }}
              >
                {t(row.labelKey)}
              </Box>
              {row.values.map((v, i) => (
                <Box
                  key={i}
                  sx={{
                    px: 1,
                    py: 0.75,
                    textAlign: "center",
                    borderLeft: "1px solid",
                    borderTop: rowIdx === 0 || row.gapBefore ? "none" : "1px solid",
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
