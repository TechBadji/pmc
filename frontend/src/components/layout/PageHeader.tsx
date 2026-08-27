import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Breadcrumbs, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import { NAV_BY_ROLE } from "./navConfig";

/**
 * Entête commun à tous les écrans : fil d'Ariane, titre, sous-titre, actions.
 *
 * Le fil se déduit de l'adresse courante et du menu du rôle connecté — c'est
 * la même source qui décide de l'entrée surlignée dans le menu, si bien que le
 * fil ne peut pas la contredire. Une page à plusieurs vues ajoute simplement
 * la vue ouverte : l'utilisateur sait alors dans quelle rubrique il est *et*
 * ce qu'il regarde, ce qu'un titre figé ne disait pas.
 */
export default function PageHeader({
  title,
  subtitle,
  view,
  parent,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Vue ouverte au sein de la rubrique — dernier maillon du fil. */
  view?: string;
  /** Écran atteint depuis un autre : le maillon intermédiaire, cliquable. */
  parent?: { label: string; to: string };
  actions?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const { pathname } = useLocation();

  // Entrée de menu correspondant à l'adresse : la plus longue qui la préfixe,
  // pour qu'un détail (/departments/12) se rattache à sa rubrique.
  const items = user ? NAV_BY_ROLE[user.role] : [];
  const current = [...items]
    .filter((item) => pathname === item.path || (item.path !== "/" && pathname.startsWith(item.path)))
    .sort((a, b) => b.path.length - a.path.length)[0];

  return (
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
      <Box sx={{ minWidth: 0 }}>
        <Breadcrumbs
          separator={<ChevronRightRoundedIcon sx={{ fontSize: 15, color: "text.disabled" }} />}
          sx={{ mb: 0.25, "& .MuiBreadcrumbs-separator": { mx: 0.5 } }}
        >
          {current && (
            <MuiLink
              component={Link}
              to={current.path}
              underline="hover"
              color="text.secondary"
              sx={{ fontSize: 12.5, fontWeight: 600 }}
            >
              {t(current.labelKey)}
            </MuiLink>
          )}
          {parent && (
            <MuiLink
              component={Link}
              to={parent.to}
              underline="hover"
              color="text.secondary"
              sx={{ fontSize: 12.5, fontWeight: 600 }}
            >
              {parent.label}
            </MuiLink>
          )}
          {view && (
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: "primary.main" }}>{view}</Typography>
          )}
        </Breadcrumbs>

        <Typography variant="h5" fontWeight={700}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>

      {actions && (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
