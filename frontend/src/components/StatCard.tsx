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
        borderColor: "divider",
        minWidth: 180,
        flex: 1,
        ...(onClick && {
          cursor: "pointer",
          transition: "border-color 0.15s",
          "&:hover": { borderColor: color ?? "primary.main" },
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
            }}
          >
            {icon}
          </Stack>
        )}
        <Stack>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}
