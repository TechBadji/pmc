import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import ChangePasswordPage from "@/features/auth/ChangePasswordPage";
import LoginPage from "@/features/auth/LoginPage";
import ActionPlansPage from "@/pages/ActionPlansPage";
import BulkUploadPage from "@/pages/BulkUploadPage";
import CohesionFormPage from "@/pages/CohesionFormPage";
import CompaniesPage from "@/pages/CompaniesPage";
import CompanyDepartmentsPage from "@/pages/CompanyDepartmentsPage";
import DashboardPage from "@/pages/DashboardPage";
import DepartmentDetailPage from "@/pages/DepartmentDetailPage";
import DirectorsPerformanceReviewPage from "@/pages/DirectorsPerformanceReviewPage";
import EvaluationCampaignsPage from "@/pages/EvaluationCampaignsPage";
import EvaluationFormPage from "@/pages/EvaluationFormPage";
import EvaluationsPage from "@/pages/EvaluationsPage";
import ID3AMatrixPage from "@/pages/ID3AMatrixPage";
import LogsPage from "@/pages/LogsPage";
import MyPerformancePage from "@/pages/MyPerformancePage";
import PasswordResetRequestsPage from "@/pages/PasswordResetRequestsPage";
import ProfilePage from "@/pages/ProfilePage";
import SkillsAdminPage from "@/pages/SkillsAdminPage";
import SkillsPage from "@/pages/SkillsPage";
import TeamsPage from "@/pages/TeamsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

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
          <Route path="/id3a-matrix" element={<ID3AMatrixPage />} />
          <Route path="/evaluation-campaigns" element={<EvaluationCampaignsPage />} />
          <Route path="/evaluations" element={<EvaluationsPage />} />
          <Route path="/evaluations/new" element={<EvaluationFormPage />} />
          <Route path="/evaluations/:id" element={<EvaluationFormPage />} />
          <Route path="/directors-performance-review" element={<DirectorsPerformanceReviewPage />} />
          <Route path="/action-plans" element={<ActionPlansPage />} />
          <Route path="/my-performance" element={<MyPerformancePage />} />
          <Route path="/password-requests" element={<PasswordResetRequestsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
