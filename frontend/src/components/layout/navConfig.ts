import type { Role } from "@/api/types";

export interface NavItem {
  labelKey: string;
  path: string;
  icon:
    | "dashboard"
    | "business"
    | "groups"
    | "hub"
    | "scatterPlot"
    | "assignment"
    | "person"
    | "school"
    | "upload"
    | "lockReset"
    | "history"
    | "event"
    | "insights";
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { labelKey: "nav.dashboard", path: "/", icon: "dashboard" },
    { labelKey: "nav.companies", path: "/companies", icon: "business" },
    { labelKey: "nav.skillMatrices", path: "/skills-admin", icon: "school" },
    { labelKey: "nav.bulkUpload", path: "/upload", icon: "upload" },
    { labelKey: "nav.passwordRequests", path: "/password-requests", icon: "lockReset" },
    { labelKey: "nav.logs", path: "/logs", icon: "history" },
  ],
  COMPANY_ADMIN: [
    { labelKey: "nav.dashboard", path: "/", icon: "dashboard" },
    { labelKey: "nav.teams", path: "/teams", icon: "groups" },
    { labelKey: "nav.cohesion", path: "/cohesion", icon: "hub" },
    { labelKey: "nav.skillMatrices", path: "/skills", icon: "school" },
    { labelKey: "nav.id3aMatrix", path: "/id3a-matrix", icon: "scatterPlot" },
    { labelKey: "nav.talentsDashboard", path: "/talents-dashboard", icon: "insights" },
    { labelKey: "nav.evaluationCampaigns", path: "/evaluation-campaigns", icon: "event" },
    { labelKey: "nav.evaluations", path: "/evaluations", icon: "assignment" },
    { labelKey: "nav.actionPlans", path: "/action-plans", icon: "assignment" },
    { labelKey: "nav.performances", path: "/performances", icon: "person" },
    { labelKey: "nav.passwordRequests", path: "/password-requests", icon: "lockReset" },
  ],
  MANAGER: [
    { labelKey: "nav.dashboard", path: "/", icon: "dashboard" },
    { labelKey: "nav.myTeam", path: "/teams", icon: "groups" },
    { labelKey: "nav.cohesion", path: "/cohesion", icon: "hub" },
    { labelKey: "nav.id3aMatrix", path: "/id3a-matrix", icon: "scatterPlot" },
    { labelKey: "nav.talentsDashboard", path: "/talents-dashboard", icon: "insights" },
    { labelKey: "nav.evaluations", path: "/evaluations", icon: "assignment" },
    { labelKey: "nav.actionPlans", path: "/action-plans", icon: "assignment" },
    { labelKey: "nav.performances", path: "/performances", icon: "person" },
  ],
  MEMBER: [
    { labelKey: "nav.myProfile", path: "/", icon: "person" },
    { labelKey: "nav.cohesionSurvey", path: "/cohesion-survey", icon: "hub" },
    { labelKey: "nav.cohesionSurveyOrg", path: "/cohesion-survey-org", icon: "business" },
    { labelKey: "nav.myPerformance", path: "/my-performance", icon: "scatterPlot" },
  ],
};
