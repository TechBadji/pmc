import { Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import PersonPerformanceId from "@/components/PersonPerformanceId";
import type { Paginated, UserRecord } from "@/api/types";

export default function PerformancePage() {
  const { t } = useTranslation();
  const [people, setPeople] = useState<UserRecord[]>([]);

  useEffect(() => {
    apiClient.get<Paginated<UserRecord>>("/users/", { params: { page_size: 500 } }).then((r) => setPeople(r.data.results));
  }, []);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={700}>
        {t("nav.performances")}
      </Typography>
      <PersonPerformanceId people={people} />
    </Stack>
  );
}
