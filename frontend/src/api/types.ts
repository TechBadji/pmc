export type Role = "SUPER_ADMIN" | "COMPANY_ADMIN" | "MANAGER" | "MEMBER";
export type Plan = "DEMO" | "STANDARD" | "PREMIUM";
export type ThemePreference = "LIGHT" | "DARK" | "SYSTEM";
export type AppLanguage = "fr" | "en";

export interface Me {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  role_display: string;
  position: string;
  company: number | null;
  company_name: string | null;
  department: number | null;
  department_name: string | null;
  manager: number | null;
  must_change_password: boolean;
  avatar: string | null;
  phone: string;
  birth_date: string | null;
  age: number | null;
  theme_preference: ThemePreference;
  language: AppLanguage;
}

export interface PlanFeatures {
  label: string;
  max_users: number | null;
  max_departments: number | null;
  cohesion_analysis: boolean;
  id3a_matrix: boolean;
  action_plans: boolean;
  bulk_upload: boolean;
  custom_skill_matrices: boolean;
  data_export: boolean;
}

export interface Company {
  id: number;
  name: string;
  slug: string;
  sector: string;
  employee_count: number;
  plan: Plan;
  plan_features: PlanFeatures;
  is_active: boolean;
  is_compliant: boolean;
  admin_first_name: string;
  admin_last_name: string;
  admin_user: number | null;
  admin_email: string | null;
  admin_login: string | null;
  admin_is_active: boolean | null;
  admin_must_change_password: boolean | null;
  user_count: number;
  department_count: number;
  created_at: string;
}

export interface Department {
  id: number;
  company: number;
  name: string;
  code: string;
  manager: number | null;
  manager_name: string | null;
  manager_position: string | null;
  member_count: number;
}

export interface UserRecord {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  role_display: string;
  position: string;
  company: number;
  department: number | null;
  department_name: string | null;
  manager: number | null;
  is_active: boolean;
  generated_login: string;
  must_change_password: boolean;
  avatar: string | null;
  phone: string;
  birth_date: string | null;
  age: number | null;
  theme_preference: ThemePreference;
  language: AppLanguage;
}

export interface BulkUploadCreatedRow {
  row: number;
  full_name: string;
  email: string;
  login: string;
  department: string;
  role: string;
  password: string;
}

export interface BulkUploadErrorRow {
  row: number;
  error: string;
}

export interface BulkUploadResult {
  created: BulkUploadCreatedRow[];
  errors: BulkUploadErrorRow[];
  created_count: number;
}

export type PerformanceRating =
  | "VERY_LOW"
  | "LOW"
  | "AVERAGE"
  | "GOOD"
  | "OUTSTANDING";

export interface SkillScore {
  id: number;
  evaluation: number;
  skill_item: number;
  skill_name: string;
  skill_type: "HARD" | "SOFT";
  score: string;
  objective_score: string | null;
  achievement_rate: string | null;
}

export interface Evaluation {
  id: number;
  user: number;
  user_name: string;
  user_position: string;
  user_age: number | null;
  user_role: Role;
  user_department: string | null;
  user_avatar: string | null;
  evaluator: number | null;
  campaign: number;
  campaign_name: string;
  campaign_start_date: string;
  campaign_end_date: string;
  campaign_is_closed: boolean;
  business_objectives_score: string;
  people_objectives_score: string;
  notes: string;
  skill_scores: SkillScore[];
  hsi: string;
  ssi: string;
  altitude_percentage: string;
  performance_rating: PerformanceRating;
}

export interface EvaluationCampaign {
  id: number;
  company: number;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_by: number | null;
  created_by_name: string | null;
  evaluations_count: number;
  created_at: string;
}

export interface SkillItem {
  id: number;
  matrix: number;
  name: string;
  description: string;
  weight: string;
  order: number;
}

export interface SkillMatrix {
  id: number;
  company: number;
  department: number | null;
  name: string;
  type: "HARD" | "SOFT";
  items: SkillItem[];
}

export interface CohesionCriterionScore {
  id?: number;
  criterion: string;
  score: number;
}

export interface TeamCohesionAnalysis {
  id: number;
  team: number;
  team_name: string;
  date: string;
  ice_score: string;
  notes: string;
  criterion_scores: CohesionCriterionScore[];
}

export interface ActionPlan {
  id: number;
  manager: number;
  manager_name: string;
  team: number;
  team_name: string;
  target_user: number | null;
  target_user_name: string | null;
  category: "HARD_SKILLS" | "SOFT_SKILLS";
  priority: string;
  objective: string;
  baseline: string;
  target: string;
  cost: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  due_date: string | null;
}

export interface PasswordResetRequest {
  id: number;
  user: number;
  user_name: string;
  user_email: string;
  user_role: Role;
  user_role_display: string;
  company_name: string | null;
  requested_at: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: number | null;
  resolved_by_name: string | null;
}

export interface AuditLog {
  id: number;
  created_at: string;
  actor: number | null;
  actor_name: string;
  actor_role: Role | "";
  company_name: string;
  action: string;
  description: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
