import { Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAppSelector } from "@/app/hooks";
import PersonPerformanceId from "@/components/PersonPerformanceId";
import type { Paginated, UserRecord } from "@/api/types";

export default function PerformancePage() {
  const { t } = useTranslation();
  const { user } = useAppSelector((s) => s.auth);
  const [people, setPeople] = useState<UserRecord[]>([]);

  useEffect(() => {
    apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } }).then((r) => setPeople(r.data.results));
  }, []);

  // Côté CEO, le sélecteur ne propose que les managers (revue individuelle
  // des directeurs) — les autres collaborateurs restent consultables via
  // "Mon équipe" côté manager. `people` reste complet pour les lookups
  // internes (rattachement, collègues d'équipe pour la dynamique d'équipe).
  const selectablePeople = useMemo(
    () => (user?.role === "COMPANY_ADMIN" ? people.filter((p) => p.role === "MANAGER") : people),
    [people, user?.role]
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("nav.performances")}
      </Typography>
      <PersonPerformanceId people={people} selectablePeople={selectablePeople} />
    </Stack>
  );
}
