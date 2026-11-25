import { Errors } from "isomorphic-git";
import { afterEach, expect, it } from "vitest";
import { needsGitSettings, repositoryAddress } from "./gitConnection";
import { gitConflictNotice, notifyGit } from "./gitResults";
import { NotebookConflictError } from "./mergeFiles";
import { getNotificationState, resetNotifications } from "./notifications";

afterEach(resetNotifications);

it("keeps literal filename characters and redacts credentials in conflict results", () => {
  const error = new NotebookConflictError([
    "saved-secret-$&.md",
    "reader-name.md",
  ]);
  const credentials = {
    gitUsername: "  reader-name  ",
    gitPassword: "saved-secret",
  };
  const { message } = gitConflictNotice(error, credentials);
  notifyGit("warning", message, {
    credentials,
    error,
  });
  const notification = getNotificationState().current;
  expect(notification.message).toContain("[redacted]-$&.md, [redacted].md");
  expect(notification.details).toContain("Please resolve conflicts first");
  expect(notification.details).toContain("[redacted]-$&.md, [redacted].md");
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

it("removes URL credentials and keeps the repository selected by the browser", () => {
  expect(repositoryAddress("https://reader:secret@example.test:443")).toBe(
    "https://example.test:443",
  );
  expect(
    repositoryAddress(
      "https://reader:secret@example.test\\path@other.test/repo.git",
    ),
  ).toBe("https://example.test/path@other.test/repo.git");
});
