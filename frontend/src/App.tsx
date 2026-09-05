import { CircularProgress, Stack } from "@mui/material";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import ChangePasswordPage from "@/features/auth/ChangePasswordPage";
import LoginPage from "@/features/auth/LoginPage";

/* Chaque écran est chargé à la demande. Les planches de cette application
 * embarquent des bibliothèques graphiques lourdes — Recharts est importé par
 * six écrans — et tout servir au premier affichage faisait payer à chaque
 * utilisateur, à chaque connexion, le poids de pages qu'il n'ouvrira peut-être
 * jamais. Seuls la connexion et le changement de mot de passe restent dans le
 * paquet initial : ce sont les deux écrans que tout le monde traverse. */
/* Variantes figées de la page de connexion, servies pour comparer plusieurs
 * directions artistiques côte à côte. Chargées à la demande : ce sont des
 * planches de travail, elles n'ont rien à faire dans le paquet initial. */
const LoginPage1 = lazy(() => import("@/features/auth/variants/login1/LoginPage1"));
const LoginPage2 = lazy(() => import("@/features/auth/variants/login2/LoginPage2"));

const ActionPlansPage = lazy(() => import("@/pages/ActionPlansPage"));
const BulkUploadPage = lazy(() => import("@/pages/BulkUploadPage"));
const CohesionFormPage = lazy(() => import("@/pages/CohesionFormPage"));
const CohesionSurveyPage = lazy(() => import("@/pages/CohesionSurveyPage"));
const CompaniesPage = lazy(() => import("@/pages/CompaniesPage"));
const CompanyDepartmentsPage = lazy(() => import("@/pages/CompanyDepartmentsPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const DepartmentDetailPage = lazy(() => import("@/pages/DepartmentDetailPage"));
const DirectorsPerformanceReviewPage = lazy(() => import("@/pages/DirectorsPerformanceReviewPage"));
const EvaluationCampaignsPage = lazy(() => import("@/pages/EvaluationCampaignsPage"));
const EvaluationFormPage = lazy(() => import("@/pages/EvaluationFormPage"));
const EvaluationsPage = lazy(() => import("@/pages/EvaluationsPage"));
const ID3AMatrixPage = lazy(() => import("@/pages/ID3AMatrixPage"));
const LogsPage = lazy(() => import("@/pages/LogsPage"));
const MyPerformancePage = lazy(() => import("@/pages/MyPerformancePage"));
const PasswordResetRequestsPage = lazy(() => import("@/pages/PasswordResetRequestsPage"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const SkillsAdminPage = lazy(() => import("@/pages/SkillsAdminPage"));
const TalentsDashboardPage = lazy(() => import("@/pages/TalentsDashboardPage"));
const SkillsPage = lazy(() => import("@/pages/SkillsPage"));
const TeamsPage = lazy(() => import("@/pages/TeamsPage"));

/** Le temps du chargement d'un écran, on garde la place plutôt que de faire
 * sauter la mise en page. */
function RouteFallback() {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
      <CircularProgress />
    </Stack>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login1" element={<LoginPage1 />} />
      <Route path="/login2" element={<LoginPage2 />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/:companyId/departments" element={<CompanyDepartmentsPage />} />
          <Route path="/companies/:companyId/upload" element={<BulkUploadPage />} />
          <Route path="/skills-admin" element={<SkillsAdminPage />} />
          <Route path="/upload" element={<BulkUploadPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/departments/:id" element={<DepartmentDetailPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/cohesion" element={<CohesionFormPage />} />
          <Route path="/cohesion-survey" element={<CohesionSurveyPage />} />
          <Route path="/cohesion-survey-org" element={<CohesionSurveyPage scope="ORGANISATION" />} />
          <Route path="/id3a-matrix" element={<ID3AMatrixPage />} />
          <Route path="/talents-dashboard" element={<TalentsDashboardPage />} />
          <Route path="/evaluation-campaigns" element={<EvaluationCampaignsPage />} />
          <Route path="/evaluations" element={<EvaluationsPage />} />
          <Route path="/evaluations/new" element={<EvaluationFormPage />} />
          <Route path="/evaluations/:id" element={<EvaluationFormPage />} />
          <Route path="/directors-performance-review" element={<DirectorsPerformanceReviewPage />} />
          <Route path="/action-plans" element={<ActionPlansPage />} />
          <Route path="/performances" element={<PerformancePage />} />
          <Route path="/my-performance" element={<MyPerformancePage />} />
          <Route path="/password-requests" element={<PasswordResetRequestsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
