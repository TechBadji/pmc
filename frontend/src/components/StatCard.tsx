import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  color,
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        p: 2.5,
        border: "1px solid",
        borderColor: onClick ? (color ?? "primary.main") : "divider",
        minWidth: 180,
        flex: 1,
        ...(onClick && {
          cursor: "pointer",
          bgcolor: (color ?? "#2E8FCB") + "0d",
          boxShadow: `0 2px 10px ${(color ?? "#2E8FCB") + "26"}`,
          transition: "box-shadow 0.15s, transform 0.15s",
          "&:hover": { boxShadow: `0 4px 16px ${(color ?? "#2E8FCB") + "40"}`, transform: "translateY(-1px)" },
        }),
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        {icon && (
          <Stack
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: (color ?? "#2E8FCB") + "22",
              color: color ?? "primary.main",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </Stack>
        )}
        <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
        </Stack>
        {onClick && <ArrowForwardRoundedIcon sx={{ color: color ?? "primary.main", flexShrink: 0 }} />}
      </Stack>
    </Paper>
  );
}
