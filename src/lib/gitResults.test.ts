import { Errors } from "isomorphic-git";
import { afterEach, expect, it } from "vitest";
import { needsGitSettings, repositoryAddress } from "./gitConnection";
import { notifyGit, redactGitText } from "./gitResults";
import { getNotificationState, resetNotifications } from "./notifications";

afterEach(resetNotifications);

it("keeps literal filename characters while redacting credentials from a summary", () => {
  const files = "saved-secret-$&.md";
  const credentials = {
    gitUsername: "  reader-name  ",
    gitPassword: "saved-secret",
  };
  notifyGit("warning", "Conflict in " + redactGitText(files, credentials), {
    files,
    credentials,
    error: new Error("Unauthorized for reader-name"),
  });
  const notification = getNotificationState().current;
  expect(notification.message).toBe("Conflict in [redacted]-$&.md");
  expect(notification.details).toContain("Unauthorized for [redacted]");
  expect(notification.details).not.toMatch(/reader-name|saved-secret/);
});

it.each([401, 203])(
  "preserves HTTP %s and useful details without displaying secrets",
  (status) => {
    const error = new Errors.HttpError(
      status,
      [
        "Unauthorized for reader-name",
        "https://legacy:old-secret@example.test/notes.git?token=private-query",
        "Authorization: Basic dXNlcjpwYXNzd29yZA==",
        "The server echoed saved-secret",
      ].join("\n"),
      "server body ignored",
    );
    notifyGit("error", "Download failed", {
      error,
      credentials: { gitUsername: "reader-name", gitPassword: "saved-secret" },
      files: "notes/draft.md",
    });
    const details = getNotificationState().current.details;
    expect(needsGitSettings(error)).toBe(true);
    expect(details).toContain("HttpError");
    expect(details).toContain("HTTP " + status);
    expect(details).toContain("https://example.test/notes.git");
    expect(details).toContain("notes/draft.md");
    expect(details).not.toMatch(
      /reader-name|old-secret|private-query|dXNlcj|saved-secret|server body ignored/,
    );
  },
);

it("removes URL credentials without changing a root repository address", () => {
  expect(repositoryAddress("https://reader:secret@example.test:443")).toBe(
    "https://example.test:443",
  );
});
