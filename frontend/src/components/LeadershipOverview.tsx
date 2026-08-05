import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { Avatar, Box, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { Department, Me, UserRecord } from "@/api/types";
import { EXECUTIVE_BADGE_COLOR } from "@/theme";

interface PersonNodeProps {
  name: string;
  position: string;
  avatar: string | null;
  root?: boolean;
}

function PersonNode({ name, position, avatar, root }: PersonNodeProps) {
  const size = root ? 88 : 68;
  return (
    <Stack alignItems="center" spacing={0.75} sx={{ width: root ? 160 : 132 }}>
      <Avatar
        src={avatar ?? undefined}
        sx={{
          width: size,
          height: size,
          fontSize: size / 2.6,
          bgcolor: "primary.main",
          border: "3px solid",
          borderColor: root ? EXECUTIVE_BADGE_COLOR : "divider",
          boxShadow: root ? `0 4px 14px ${EXECUTIVE_BADGE_COLOR}33` : "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        {name.charAt(0).toUpperCase()}
      </Avatar>
      <Paper
        elevation={0}
        sx={{
          px: 1.5,
          py: 0.4,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          width: "100%",
          textAlign: "center",
        }}
      >
        <Typography variant={root ? "subtitle1" : "body2"} fontWeight={700} noWrap>
          {name}
        </Typography>
      </Paper>
      <Box
        sx={{
          px: 1.25,
          py: 0.35,
          borderRadius: 1,
          width: "100%",
          textAlign: "center",
          bgcolor: root ? EXECUTIVE_BADGE_COLOR : "action.hover",
        }}
      >
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{ color: root ? "#fff" : "text.secondary", lineHeight: 1.3, display: "block" }}
        >
          {position || "—"}
        </Typography>
      </Box>
    </Stack>
  );
}

export default function LeadershipOverview({
  ceo,
  directors,
  departments,
}: {
  ceo: Me;
  directors: UserRecord[];
  departments: Department[];
}) {
  const { t } = useTranslation();

  if (directors.length === 0) return null;

  const headcountByDirector = new Map<number, number>();
  departments.forEach((d) => {
    if (d.manager) headcountByDirector.set(d.manager, d.member_count);
  });

  return (
    <Paper elevation={0} sx={{ p: { xs: 2, sm: 4 }, border: "1px solid", borderColor: "divider" }}>
      <Typography
        variant="h6"
        fontWeight={800}
        textAlign="center"
        sx={{ color: "primary.main", mb: 4, letterSpacing: 0.3 }}
      >
        {t("dashboard.companyAdmin.leadershipTitle")}
      </Typography>

      <Stack alignItems="center">
        <PersonNode name={ceo.full_name} position={ceo.position} avatar={ceo.avatar} root />

        <Box sx={{ width: 2, height: 22, bgcolor: "divider" }} />
        <Box sx={{ height: 2, bgcolor: "divider", width: "88%", maxWidth: 900 }} />

        <Stack
          direction="row"
          flexWrap="wrap"
          justifyContent="center"
          columnGap={{ xs: 2, sm: 3 }}
          rowGap={3}
          sx={{ mt: 0, pt: 0 }}
        >
          {directors.map((d) => (
            <Stack key={d.id} alignItems="center" spacing={0}>
              <KeyboardArrowDownRoundedIcon sx={{ color: "divider", mt: -0.5 }} />
              <PersonNode name={d.full_name || d.email} position={d.position} avatar={d.avatar} />
            </Stack>
          ))}
        </Stack>
      </Stack>

      <Box sx={{ mt: 4, overflowX: "auto" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `160px repeat(${directors.length}, 1fr)`,
            minWidth: 160 + directors.length * 90,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Box sx={{ bgcolor: EXECUTIVE_BADGE_COLOR + "1a", px: 1.5, py: 1, fontWeight: 700, fontSize: 13 }}>
            {t("dashboard.companyAdmin.age")}
          </Box>
          {directors.map((d) => (
            <Box
              key={d.id}
              sx={{ px: 1, py: 1, textAlign: "center", borderLeft: "1px solid", borderColor: "divider", fontVariantNumeric: "tabular-nums" }}
            >
              {d.age ?? "—"}
            </Box>
          ))}
          <Box
            sx={{
              bgcolor: EXECUTIVE_BADGE_COLOR + "1a",
              px: 1.5,
              py: 1,
              fontWeight: 700,
              fontSize: 13,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            {t("dashboard.companyAdmin.teamHeadcount")}
          </Box>
          {directors.map((d) => (
            <Box
              key={d.id}
              sx={{
                px: 1,
                py: 1,
                textAlign: "center",
                borderLeft: "1px solid",
                borderTop: "1px solid",
                borderColor: "divider",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {headcountByDirector.get(d.id) ?? "—"}
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
