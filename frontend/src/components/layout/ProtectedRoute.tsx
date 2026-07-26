import { Box, CircularProgress } from "@mui/material";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { tokenStorage } from "@/api/client";
import { fetchMe } from "@/features/auth/authSlice";

export default function ProtectedRoute() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { user, status } = useAppSelector((s) => s.auth);

  useEffect(() => {
    if (!user && status === "idle" && tokenStorage.access) {
      dispatch(fetchMe());
    }
  }, [user, status, dispatch]);

  if (!tokenStorage.access) return <Navigate to="/login" replace />;

  if (!user && status !== "error") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
