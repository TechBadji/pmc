import type { AxiosError } from "axios";
import i18n from "@/i18n";

/** Une erreur d'API mise à la portée de l'utilisateur : ce qui s'est passé, pourquoi,
 * et ce qu'il peut faire — plus de quoi renseigner le support. */
export interface ApiErrorInfo {
  kind:
    | "network"
    | "timeout"
    | "validation"
    | "auth"
    | "forbidden"
    | "notFound"
    | "conflict"
    | "throttled"
    | "tooLarge"
    | "server"
    | "unavailable"
    | "unknown";
  status?: number;
  title: string;
  reasons: string[];
  advice: string;
  reference?: string;
  technical: string;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RouteRule {
  match: RegExp;
  subject?: string;
  titles?: Partial<Record<Method, string>>;
}

/* Ce que l'utilisateur croit faire, pour chaque route de l'API. Les plus
 * précises d'abord : la première qui correspond l'emporte. */
const ROUTES: RouteRule[] = [
  { match: /^\/action-plans\/bulk-save-dev-plan\//, titles: { POST: "saveDevPlan" } },
  { match: /^\/action-plans\//, subject: "actionPlan" },
  { match: /^\/skill-notes\/bulk-save\//, titles: { POST: "saveSkillNotes" } },
  { match: /^\/skill-notes\//, subject: "skillNotes" },
  { match: /^\/performance-profiles\/save-for-user\//, titles: { PUT: "saveProfile" } },
  { match: /^\/performance-profiles\//, subject: "profile" },
  { match: /^\/performance-objectives\//, subject: "objective" },
  { match: /^\/evaluation-campaigns\/\d+\/close\//, titles: { POST: "closeCampaign" } },
  { match: /^\/evaluation-campaigns\/\d+\/reopen\//, titles: { POST: "reopenCampaign" } },
  { match: /^\/evaluation-campaigns\//, subject: "campaign" },
  { match: /^\/evaluations\//, subject: "evaluation" },
  { match: /^\/managerial-self-assessments\//, subject: "managerial" },
  { match: /^\/managerial-syntheses\//, subject: "synthesis" },
  { match: /^\/monkey-management-assessments\//, subject: "monkey" },
  { match: /^\/cohesion-responses\/aggregate\//, subject: "cohesionResults" },
  { match: /^\/cohesion-responses\//, subject: "cohesionAnswer" },
  { match: /^\/cohesion-analyses\//, subject: "cohesionSheet" },
  { match: /^\/team-relationships\//, subject: "relationship" },
  { match: /^\/team-boards\//, subject: "teamBoard" },
  { match: /^\/users\/\d+\/reset-password\//, titles: { POST: "resetPassword" } },
  { match: /^\/users\/\d+\/toggle-active\//, titles: { POST: "toggleActive" } },
  { match: /^\/users\/\d+\//, subject: "user" },
  { match: /^\/users\//, subject: "users" },
  { match: /^\/companies\/\d+\/bulk-upload-users\//, titles: { POST: "upload" } },
  { match: /^\/companies\/\d+\/toggle-active\//, titles: { POST: "toggleActive" } },
  { match: /^\/companies\//, subject: "company" },
  { match: /^\/departments\//, subject: "department" },
  { match: /^\/skill-(matrices|items)\//, subject: "skills" },
  { match: /^\/audit-logs\//, subject: "logs" },
  { match: /^\/password-reset-requests\//, subject: "resetRequest" },
  { match: /^\/auth\/change-password\//, subject: "password" },
  { match: /^\/auth\/me\//, subject: "me" },
];

const HIDDEN_KEYS = new Set(["code", "reference", "retry_after", "messages", "token_class", "token_type"]);

function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

function humanize(key: string): string {
  const text = key.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fieldLabel(key: string): string {
  if (/^\d+$/.test(key)) return t("errors.row", { n: Number(key) + 1 });
  return i18n.exists(`errors.fields.${key}`) ? t(`errors.fields.${key}`) : humanize(key);
}

/** Aplatit les erreurs de validation DRF (`{champ: [messages]}`, éventuellement
 * imbriquées) en lignes lisibles : « Notes des critères › ligne 3 › Note : … ». */
function flatten(data: unknown, path: string[] = []): string[] {
  if (typeof data === "string") {
    const label = path.map(fieldLabel).filter(Boolean).join(" › ");
    return [label ? `${label} : ${data}` : data];
  }
  if (Array.isArray(data)) {
    return data.flatMap((item, index) =>
      typeof item === "string" ? flatten(item, path) : flatten(item, [...path, String(index)])
    );
  }
  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, unknown>)
      .filter(([key]) => !HIDDEN_KEYS.has(key))
      .flatMap(([key, value]) => flatten(value, key === "detail" || key === "non_field_errors" ? path : [...path, key]));
  }
  return [];
}

function relativePath(url: string | undefined): string {
  if (!url) return "";
  const noOrigin = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  return noOrigin.replace(/^\/api(?=\/)/, "");
}

function requestTitle(method: Method, path: string, override?: string): string {
  if (override) return override;
  const rule = ROUTES.find((r) => r.match.test(path));
  const special = rule?.titles?.[method];
  if (special) return t(`errors.titles.${special}`);
  if (rule?.subject) {
    const verb = method === "GET" ? "load" : method === "DELETE" ? "delete" : "save";
    return t(`errors.verbs.${verb}`, { subject: t(`errors.subjects.${rule.subject}`) });
  }
  return t("errors.titles.generic");
}

export function describeApiError(error: unknown, overrideTitle?: string): ApiErrorInfo {
  const err = error as AxiosError<unknown>;
  const method = ((err.config?.method ?? "get").toUpperCase() as Method);
  const path = relativePath(err.config?.url);
  const title = requestTitle(method, path, overrideTitle);
  const isWrite = method !== "GET";
  const status = err.response?.status;
  const data = err.response?.data as Record<string, unknown> | undefined;
  const reference = typeof data?.reference === "string" ? data.reference : undefined;
  const technical = [method, path || "?", status ?? (err.code ?? "réseau")].join(" · ") + (reference ? ` · ${reference}` : "");
  const base = { status, title, reference, technical };

  if (!err.response) {
    const timeout = err.code === "ECONNABORTED" || err.code === "ETIMEDOUT";
    return {
      ...base,
      kind: timeout ? "timeout" : "network",
      reasons: [t(timeout ? "errors.reasons.timeout" : "errors.reasons.network")],
      advice: t(isWrite ? "errors.advice.networkSave" : "errors.advice.networkLoad"),
    };
  }

  const serverText = typeof data?.detail === "string" ? data.detail : undefined;
  const lines = flatten(data);

  if (status === 400 && data?.code === "conflict") {
    return { ...base, kind: "conflict", reasons: [serverText ?? t("errors.reasons.conflict")], advice: t("errors.advice.conflict") };
  }
  if (status === 400 || status === 422) {
    return {
      ...base,
      kind: "validation",
      reasons: lines.length ? lines : [t("errors.reasons.invalid")],
      advice: t(lines.length ? "errors.advice.invalid" : "errors.advice.invalidGeneric"),
    };
  }
  if (status === 401) {
    return { ...base, kind: "auth", reasons: [t("errors.reasons.auth")], advice: t("errors.advice.auth") };
  }
  if (status === 403) {
    const custom = serverText && !/permission/i.test(serverText) ? serverText : undefined;
    return { ...base, kind: "forbidden", reasons: [custom ?? t("errors.reasons.forbidden")], advice: t("errors.advice.forbidden") };
  }
  if (status === 404) {
    return { ...base, kind: "notFound", reasons: [t("errors.reasons.notFound")], advice: t("errors.advice.notFound") };
  }
  if (status === 409) {
    return { ...base, kind: "conflict", reasons: [serverText ?? t("errors.reasons.conflict")], advice: t("errors.advice.conflict") };
  }
  if (status === 413) {
    return { ...base, kind: "tooLarge", reasons: [t("errors.reasons.tooLarge")], advice: t("errors.advice.tooLarge") };
  }
  if (status === 429) {
    const seconds = typeof data?.retry_after === "number" ? data.retry_after : undefined;
    return {
      ...base,
      kind: "throttled",
      reasons: [serverText ?? t("errors.reasons.throttled")],
      advice: seconds ? t("errors.advice.throttled", { seconds }) : t("errors.advice.throttledGeneric"),
    };
  }
  if (status === 502 || status === 503 || status === 504) {
    return { ...base, kind: "unavailable", reasons: [t("errors.reasons.unavailable")], advice: t("errors.advice.unavailable") };
  }
  if (status && status >= 500) {
    return {
      ...base,
      kind: "server",
      reasons: [serverText ?? t("errors.reasons.server")],
      advice: t("errors.advice.server"),
    };
  }
  return { ...base, kind: "unknown", reasons: [serverText ?? t("errors.reasons.unknown")], advice: t("errors.advice.unknown") };
}
