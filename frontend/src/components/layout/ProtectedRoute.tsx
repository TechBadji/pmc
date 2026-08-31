import { Box, CircularProgress } from "@mui/material";
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { tokenStorage } from "@/api/client";
import { fetchMe } from "@/features/auth/authSlice";

export default function ProtectedRoute() {
  const dispatch = useAppDispatch();
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

  // Aucune redirection forcée vers /change-password : un compte créé en masse
  // ou réinitialisé entre directement dans l'application avec le mot de passe
  // qu'on lui a communiqué. `must_change_password` reste posé à la création et
  // à la réinitialisation, mais ne sert plus qu'à signaler au Super Admin les
  // comptes encore sur le mot de passe par défaut (liste des entreprises) ;
  // le changement se fait quand l'utilisateur le décide, depuis son profil.
  return <Outlet />;
}
