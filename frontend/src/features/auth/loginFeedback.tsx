import type { TFunction } from "i18next";
import { Fragment } from "react";
import { describeApiError } from "@/utils/apiError";
import { isBlank } from "@/utils/validation";
import type { LoginFailure } from "./authSlice";

/** Champs à remplir avant même d'interroger le serveur. */
export function loginProblems(t: TFunction, identifier: string, password: string): string[] {
  const problems: string[] = [];
  if (isBlank(identifier)) problems.push(t("validation.login.identifierRequired"));
  if (password === "") problems.push(t("validation.login.passwordRequired"));
  return problems;
}

function waitText(t: TFunction, seconds?: number): string {
  if (!seconds) return t("validation.login.waitAMoment");
  if (seconds < 90) return t("validation.login.waitSeconds", { count: seconds });
  return t("validation.login.waitMinutes", { count: Math.ceil(seconds / 60) });
}

/** Ce que l'utilisateur doit lire quand la connexion échoue : ce qui s'est passé, puis quoi faire. */
export function describeLoginFailure(t: TFunction, failure: LoginFailure): { title: string; advice: string } {
  switch (failure.code) {
    case "invalid_credentials":
      return { title: t("validation.login.invalidTitle"), advice: t("validation.login.invalidAdvice") };
    case "account_blocked":
      return { title: t("validation.login.blockedTitle"), advice: t("validation.login.blockedAdvice") };
    case "rejected":
      return { title: failure.detail ?? t("validation.login.rejectedTitle"), advice: t("validation.login.rejectedAdvice") };
    case "throttled":
      return {
        title: t("validation.login.throttledTitle"),
        advice: t("validation.login.throttledAdvice", { wait: waitText(t, failure.retryAfter) }),
      };
    case "timeout":
      return { title: t("validation.login.timeoutTitle"), advice: t("validation.login.networkAdvice") };
    case "unavailable":
      return { title: t("validation.login.unavailableTitle"), advice: t("validation.login.unavailableAdvice") };
    case "server":
      return { title: t("validation.login.serverTitle"), advice: t("validation.login.serverAdvice") };
    default:
      return { title: t("validation.login.networkTitle"), advice: t("validation.login.networkAdvice") };
  }
}

/** Contenu du bandeau d'erreur des pages de connexion : champs manquants d'abord, sinon refus du serveur. */
export function LoginErrorText({ t, issues, failure }: { t: TFunction; issues: string[]; failure: LoginFailure | null }) {
  if (issues.length) {
    return (
      <>
        {issues.map((issue, index) => (
          <Fragment key={index}>
            {index > 0 && <br />}
            {issue}
          </Fragment>
        ))}
      </>
    );
  }
  if (!failure) return null;
  const { title, advice } = describeLoginFailure(t, failure);
  return (
    <>
      <strong>{title}</strong>
      <br />
      {advice}
    </>
  );
}

/** Échec de « Mot de passe oublié » : la demande n'est pas partie, on dit pourquoi. */
export function forgotErrorText(t: TFunction, err: unknown): string {
  const info = describeApiError(err);
  if (info.kind === "throttled") return info.reasons[0];
  return `${t("login.forgotError")} ${info.reasons[0]} ${info.advice}`;
}
