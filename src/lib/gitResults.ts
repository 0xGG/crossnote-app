import { Errors } from "isomorphic-git";
import i18next, { isAppErrorKey } from "../i18n/i18n";
import { gitHttpStatus, repositoryAddress } from "./gitConnection";
import { type NotificationSeverity, notify } from "./notifications";

type GitCredentials = { gitUsername?: string; gitPassword?: string };

export function gitErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && isAppErrorKey(error.message)) {
    return i18next.t(error.message);
  }
  return fallback;
}

export function redactGitText(text: string, credentials: GitCredentials) {
  let result = text
    .replace(/\b(?:proxy-)?authorization\b["']?\s*[:=][^\r\n]*/gi, "[redacted]")
    .replace(/\b(?:basic|bearer) [A-Za-z0-9+/_=.-]+/gi, "[redacted]")
    .replace(
      /https?:\/\/[^\s"'<>]+/gi,
      (url) => repositoryAddress(url).split(/[?#]/, 1)[0],
    )
    .replace(
      /([?&](?:access_token|password|token|api_key|key|signature|auth)=)[^&\s"'<>]+/gi,
      "$1[redacted]",
    );
  for (const value of [
    credentials.gitPassword,
    credentials.gitUsername,
    credentials.gitUsername?.trim(),
  ]) {
    if (value && result.includes(value)) {
      result = result.split(value).join("[redacted]");
    }
  }
  return result;
}

export function notifyGit(
  severity: NotificationSeverity,
  message: string,
  {
    updateFailure,
    error = updateFailure?.error,
    credentials = {},
    files,
    openSettings,
    dialog,
  }: {
    updateFailure?: { error: unknown };
    error?: unknown;
    credentials?: GitCredentials;
    files?: string;
    openSettings?: () => void;
    dialog?: HTMLElement;
  } = {},
) {
  const { code, message: original } = Object(error) as {
    code?: string;
    message?: string;
  };
  const status = gitHttpStatus(error);
  const causes =
    error instanceof Errors.MultipleGitError
      ? [...new Set(error.errors.map((cause) => cause.message))]
      : [];
  const details = [
    typeof code === "string" ? code : "",
    typeof status === "number" ? "HTTP " + status : "",
    gitErrorMessage(
      error,
      original ?? (typeof error === "string" ? error : ""),
    ),
    files,
  ]
    .concat(causes)
    .filter(Boolean)
    .join("\n");
  notify({
    severity: updateFailure ? "warning" : severity,
    message: updateFailure
      ? i18next.t("git/local-update-failed", {
          outcome: message.replace(/[.。]$/, ""),
        })
      : message,
    duration: openSettings ? 8000 : 4000,
    details: details ? redactGitText(details, credentials) : undefined,
    dialog,
    action: openSettings
      ? { label: i18next.t("git/change-credentials"), onClick: openSettings }
      : undefined,
  });
}
