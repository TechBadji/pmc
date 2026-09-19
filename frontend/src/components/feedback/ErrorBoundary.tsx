import { Box, Button, Stack, Typography } from "@mui/material";
import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "@/i18n";

interface State {
  error: Error | null;
  reference: string;
}

/** Un chargement de page qui échoue juste après une mise en ligne : les fichiers
 * de l'ancienne version n'existent plus sur le serveur. Ce n'est pas un bug,
 * c'est une nouvelle version à recharger — et l'écran doit le dire. */
function isNewVersionError(error: Error) {
  return /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch dynamically/i.test(
    `${error.name} ${error.message}`
  );
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, reference: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, reference: Math.random().toString(36).slice(2, 10).toUpperCase() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.state.reference}]`, error, info.componentStack);
  }

  render() {
    const { error, reference } = this.state;
    if (!error) return this.props.children;
    const t = (key: string) => i18n.t(key) as string;
    const newVersion = isNewVersionError(error);
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center", p: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 520, textAlign: "center", alignItems: "center" }}>
          <Typography variant="h5" fontWeight={700}>
            {t(newVersion ? "errors.boundary.newVersionTitle" : "errors.boundary.title")}
          </Typography>
          <Typography color="text.secondary">
            {t(newVersion ? "errors.boundary.newVersionText" : "errors.boundary.text")}
          </Typography>
          {!newVersion && (
            <Typography variant="body2" fontWeight={700}>
              {(i18n.t("errors.reference", { reference }) as string)}
            </Typography>
          )}
          <Button variant="contained" onClick={() => window.location.reload()}>
            {t("errors.boundary.reload")}
          </Button>
        </Stack>
      </Box>
    );
  }
}
