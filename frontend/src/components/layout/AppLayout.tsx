import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ScatterPlotOutlinedIcon from "@mui/icons-material/ScatterPlotOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  ButtonBase,
  Chip,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { logout } from "@/features/auth/authSlice";
import { NAV_BY_ROLE, type NavItem } from "./navConfig";

const PENDING_RESET_POLL_MS = 20000;

const DRAWER_WIDTH = 260;

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  dashboard: <DashboardOutlinedIcon />,
  event: <EventOutlinedIcon />,
  business: <BusinessOutlinedIcon />,
  groups: <GroupsOutlinedIcon />,
  hub: <HubOutlinedIcon />,
  scatterPlot: <ScatterPlotOutlinedIcon />,
  assignment: <AssignmentOutlinedIcon />,
  person: <PersonOutlineIcon />,
  school: <SchoolOutlinedIcon />,
  upload: <UploadFileOutlinedIcon />,
  lockReset: <LockResetOutlinedIcon />,
  history: <HistoryOutlinedIcon />,
};

export default function AppLayout() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pendingResetCount, setPendingResetCount] = useState(0);
  const canSeeResetRequests = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (!canSeeResetRequests) return;
    function fetchCount() {
      apiClient
        .get<{ count: number }>("/password-reset-requests/", {
          params: { resolved: false, page_size: 1 },
        })
        .then((r) => setPendingResetCount(r.data.count))
        .catch(() => {});
    }
    fetchCount();
    const interval = setInterval(fetchCount, PENDING_RESET_POLL_MS);
    return () => clearInterval(interval);
  }, [canSeeResetRequests]);

  if (!user) return null;
  const items = NAV_BY_ROLE[user.role];

  function handleLogout() {
    setMenuAnchor(null);
    dispatch(logout());
    navigate("/login", { replace: true });
  }

  function handleProfile() {
    setMenuAnchor(null);
    navigate("/profile");
  }

  return (
    <Box sx={{ display: "flex" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", borderRight: "1px solid", borderColor: "divider" },
        }}
      >
        <Toolbar>
          <Box component="img" src="/pmc-logo.png" alt="ID-PMC" sx={{ height: 40 }} />
        </Toolbar>
        <Divider />
        <List sx={{ px: 1, pt: 1 }}>
          {items.map((item) => (
            <ListItemButton
              key={item.path}
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {item.icon === "lockReset" && pendingResetCount > 0 ? (
                  <Badge
                    badgeContent={pendingResetCount}
                    color="error"
                    sx={{
                      "& .MuiBadge-badge": {
                        animation: "pmc-pulse 1.1s ease-in-out infinite",
                      },
                      "@keyframes pmc-pulse": {
                        "0%": { transform: "scale(1)", opacity: 1 },
                        "50%": { transform: "scale(1.35)", opacity: 0.7 },
                        "100%": { transform: "scale(1)", opacity: 1 },
                      },
                    }}
                  >
                    {ICONS[item.icon]}
                  </Badge>
                ) : (
                  ICONS[item.icon]
                )}
              </ListItemIcon>
              <ListItemText primary={t(item.labelKey)} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <AppBar
          position="sticky"
          color="inherit"
          sx={{ borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {user.company_name ?? t("common.roles.SUPER_ADMIN")}
              </Typography>
              <Chip size="small" label={t(`common.roles.${user.role}`)} color="primary" variant="outlined" />
            </Box>
            <ButtonBase
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 0.5, borderRadius: 2 }}
            >
              <Box sx={{ textAlign: "right" }}>
                <Typography variant="body2" fontWeight={600}>
                  {user.full_name || user.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user.position}
                </Typography>
              </Box>
              <Avatar
                key={user.avatar ?? "no-avatar"}
                src={user.avatar ?? undefined}
                alt={(user.full_name || user.email).charAt(0).toUpperCase()}
                sx={{ bgcolor: "primary.main" }}
              >
                {(user.full_name || user.email).charAt(0).toUpperCase()}
              </Avatar>
            </ButtonBase>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
              <MenuItem onClick={handleProfile}>
                <PersonOutlineIcon fontSize="small" sx={{ mr: 1.5 }} />
                {t("nav.myProfile")}
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <LogoutOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
                {t("common.logout")}
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
