import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createAppTheme } from "@/theme";
import { useAppSelector } from "./hooks";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Calcule le thème effectif (clair/sombre) à partir de la préférence
 * enregistrée sur le profil utilisateur (LIGHT / DARK / SYSTEM) et l'applique
 * immédiatement à toute l'application via le ThemeProvider MUI. */
export default function ThemeModeProvider({ children }: { children: ReactNode }) {
  const themePreference = useAppSelector((s) => s.auth.user?.theme_preference) ?? "SYSTEM";
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const mode = useMemo(() => {
    if (themePreference === "DARK") return "dark";
    if (themePreference === "LIGHT") return "light";
    return systemDark ? "dark" : "light";
  }, [themePreference, systemDark]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
