import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
import { Stack } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import { apiClient } from "@/api/client";
import type { Company, Paginated } from "@/api/types";
import StatCard from "@/components/StatCard";

export default function SuperAdminDashboard() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    apiClient
      .get<Paginated<Company>>("/companies/")
      .then((r) => setCompanies(r.data.results));
  }, []);

  const activeCount = companies.filter((c) => c.is_active).length;
  const totalUsers = companies.reduce((sum, c) => sum + c.user_count, 0);

  return (
    <Stack spacing={3}>
      <PageHeader title={t("dashboard.superAdmin.title")} />
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <StatCard
          label={t("dashboard.superAdmin.companies")}
          value={companies.length}
          icon={<BusinessOutlinedIcon />}
        />
        <StatCard
          label={t("dashboard.superAdmin.activeCompanies")}
          value={activeCount}
          color="#0ca30c"
          icon={<ToggleOnOutlinedIcon />}
        />
        <StatCard
          label={t("dashboard.superAdmin.totalUsers")}
          value={totalUsers}
          color="#B23FA0"
          icon={<GroupsOutlinedIcon />}
        />
      </Stack>
    </Stack>
  );
}
