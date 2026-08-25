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
  avatar_full_body: string | null;
  phone: string;
  birth_date: string | null;
  age: number | null;
  career_start_date: string | null;
  total_experience_years: number | null;
  hire_date: string | null;
  years_in_company: number | null;
  role_start_date: string | null;
  years_in_current_role: number | null;
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
  /** Direction de rattachement : renseigné pour un service, nul pour une
   * direction. La hiérarchie s'arrête à ce niveau. */
  parent: number | null;
  parent_name: string | null;
  service_count: number;
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
  avatar_full_body: string | null;
  phone: string;
  birth_date: string | null;
  age: number | null;
  career_start_date: string | null;
  total_experience_years: number | null;
  hire_date: string | null;
  years_in_company: number | null;
  role_start_date: string | null;
  years_in_current_role: number | null;
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
  objectives_set_on?: string | null;
  evaluated_on?: string | null;
  next_evaluation_on?: string | null;
  manager_visa?: string;
  people_objectives_score: string;
  notes: string;
  skill_scores: SkillScore[];
  hsi: string;
  ssi: string;
  hso: string;
  ssio: string;
  altitude_percentage: string;
  performance_rating: PerformanceRating;
}

export type SkillNoteCategory = "SOFT_STRENGTH" | "SOFT_WEAKNESS" | "HARD_STRENGTH" | "HARD_WEAKNESS";

export interface SkillNote {
  id: number;
  evaluation: number;
  category: SkillNoteCategory;
  order: number;
  text: string;
  score: number | null;
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
  objective_score: number | null;
  achieved_score: number | null;
}

export interface TeamCohesionAnalysis {
  id: number;
  team: number;
  team_name: string;
  date: string;
  ice_score: string;
  oce_score: string;
  achieved_score: string | null;
  tco: number | null;
  notes: string;
  criterion_scores: CohesionCriterionScore[];
  created_at: string;
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
  start_date: string | null;
  due_date: string | null;
  responsible: string;
  eval_note: string;
  /** Numéro de la priorité de développement (1-3) dans la grille du plan de
   * développement d'un manager ; `order` numérote ses actions. */
  priority_order: number | null;
  order: number | null;
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

export interface TeamRelationship {
  id: number;
  team: number;
  from_user: number;
  from_user_name: string;
  to_user: number;
  to_user_name: string;
  quality: "EXCELLENT" | "CORRECT" | "DIFFICULT" | "TOXIC";
}

export interface PerformanceProfile {
  id: number;
  user: number;
  gender: string;
  contract_type: string;
  qualifications: string[];
  previous_positions: string[];
  previous_position_dates: string[];
  professional_achievements: string[];
  personal_achievements: string[];
  vision_aspirations: string;
  personal_projects: string;
  professional_role_models: string[];
  role_models_in_life: string[];
  dislikes: string[];
  motivates: string[];
  personality_traits: string[];
  hobbies: string[];
  bono_hat: string;
  performance_pct: string;
  performer_category: "" | "OUTSTANDING" | "GOOD" | "AVERAGE" | "LOW" | "VERY_LOW";
  brings_to_team: string[];
  brings_to_manager: string[];
  expects_from_team: string[];
  expects_from_manager: string[];
  dev_priorities: string[];
  dev_professional_perspectives: string[];
  dev_actions_support: string[];
  dev_risks_obstacles: string[];
  updated_at: string;
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

/** Carte d'identité d'une équipe à une date donnée — support des planches
 * Forces & faiblesses, Relationship Dynamic et Team Performance ID. */
export interface TeamBoard {
  id: number;
  team: number;
  team_name: string;
  date: string;
  people_strengths: string[];
  people_weaknesses: string[];
  business_strengths: string[];
  business_weaknesses: string[];
  catalysts: string[];
  nourishers: string[];
  inhibitors: string[];
  toxins: string[];
  vision_missions: string;
  values: string[];
  counter_values: string[];
  achievements: string[];
  failures_lessons: string[];
  objectives: string[];
  priorities_cohesion: string[];
  priorities_business: string[];
  /** Une ligne par année : objectif visé et résultat obtenu. */
  targets_vs_actuals: { year: string; target: number | null; actual: number | null }[];
  /** Mêmes séries, projetées sur les années à venir. */
  objectives_plan: { year: string; target: number | null; actual: number | null }[];
}

/** Ligne de la fiche de fixation d'objectifs / d'évaluation annuelle.
 * Les valeurs numériques transitent en chaîne : la saisie est libre, la
 * conversion se fait côté serveur. */
export interface PerformanceObjective {
  id: number;
  evaluation: number | null;
  team: number | null;
  campaign: number | null;
  category: "BUSINESS" | "MANAGERIAL";
  order: number;
  label: string;
  indicator: string;
  reference_value: string | null;
  target_value: string | null;
  actual_value: string | null;
  weight: string | null;
  /** Taux d'atteinte calculé par le serveur. */
  achievement_percent: number | null;
}
