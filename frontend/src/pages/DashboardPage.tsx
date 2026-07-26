import { useAppSelector } from "@/app/hooks";
import SuperAdminDashboard from "./SuperAdminDashboard";
import CompanyAdminDashboard from "./CompanyAdminDashboard";
import ManagerDashboard from "./ManagerDashboard";
import MyPerformancePage from "./MyPerformancePage";

/** Aiguille vers le bon tableau de bord selon le rôle de l'utilisateur connecté. */
export default function DashboardPage() {
  const { user } = useAppSelector((s) => s.auth);
  if (!user) return null;

  switch (user.role) {
    case "SUPER_ADMIN":
      return <SuperAdminDashboard />;
    case "COMPANY_ADMIN":
      return <CompanyAdminDashboard />;
    case "MANAGER":
      return <ManagerDashboard />;
    case "MEMBER":
      return <MyPerformancePage />;
  }
}
