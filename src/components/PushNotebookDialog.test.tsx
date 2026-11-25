import i18next from "i18next";
import * as notifications from "../lib/notifications";
import React, { act } from "react";
import { Root } from "react-dom/client";
import {
  mountTestRoot,
  unmountTestRoot,
  buttonByText,
} from "../test/component";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { Notebook } from "../lib/notebook";
import { IgnoredUploadFileError } from "../lib/notebookOperation";
import { GitUploadError, type PushNotebookResult } from "../lib/crossnote";
import PushNotebookDialog from "./PushNotebookDialog";

type PushOutcome = {
  result: PushNotebookResult;
  updateFailure?: { error: unknown };
};

// A push that never settles, so the dialog stays as it is after the click.
const { pushNotebook, settings } = vi.hoisted(() => ({
  pushNotebook: vi.fn(() => new Promise<PushOutcome>(() => {})),
  settings: { authorName: "", authorEmail: "" },
}));

vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({ pushNotebook, isPushingNotebook: false }),
  },
}));

vi.mock("../containers/settings", () => ({
  SettingsContainer: {
    useContainer: () => ({
      ...settings,
      setAuthorName: () => {},
      setAuthorEmail: () => {},
    }),
  },
}));

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  pushNotebook.mockClear();
  settings.authorName = "Ada Lovelace";
  settings.authorEmail = "ada@example.com";
  ({ container, root } = mountTestRoot());
});

afterEach(() => {
  unmountTestRoot(container, root);
});

function upload(gitUsername = "") {
  const notebook = Object.assign(new Notebook(), {
    name: "Notes",
    gitURL: "https://example.com/notes.git",
    gitBranch: "main",
    gitUsername,
    gitPassword: "",
  });
  act(() =>
    root.render(
      <PushNotebookDialog
        open
        onClose={() => {}}
        onOpenSettings={() => {}}
        notebook={notebook}
      />,
    ),
  );
  const button = buttonByText(document, "Upload");
  act(() => button.click());
}

it("commits under the author name and email from the settings", () => {
  upload();
  expect(document.querySelectorAll('[role="dialog"] input')).toHaveLength(3);
  expect(pushNotebook).toHaveBeenCalledWith(
    expect.objectContaining({
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.com",
    }),
  );
});

it("commits under the name the settings start with when the name is cleared", () => {
  // Git makes no commit without an author name.
  settings.authorName = "";
  upload();
  expect(pushNotebook).toHaveBeenCalledWith(
    expect.objectContaining({ authorName: "Anonymous" }),
  );
});

it("reports completion in the language selected during upload", async () => {
  let resolvePush: (outcome: PushOutcome) => void;
  pushNotebook.mockImplementationOnce(
    () =>
      new Promise<PushOutcome>((resolve) => {
        resolvePush = resolve;
      }),
  );
  const notify = vi.spyOn(notifications, "notify");
  await act(() => i18next.changeLanguage("en-US"));
  upload();
  await act(() => i18next.changeLanguage("zh-CN"));
  await act(async () => resolvePush({ result: "uploaded" }));
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ message: "笔记本已上传" }),
  );
  notify.mockRestore();
  await act(() => i18next.changeLanguage("en-US"));
});

it("reports confirmed delivery and the local refresh failure in one notice", async () => {
  const notify = vi.spyOn(notifications, "notify");
  try {
    pushNotebook.mockResolvedValueOnce({
      result: "confirmed-and-downloaded",
      updateFailure: { error: new Error("Could not refresh notes") },
    });
    upload();
    await act(async () => {});
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warning",
        message:
          "The remote already has your local commit. Downloaded newer changes. Could not finish updating the local notebook.",
        details: "Could not refresh notes",
      }),
    );
  } finally {
    notify.mockRestore();
  }
});

it("reports a completed download when upload preparation fails", async () => {
  pushNotebook.mockRejectedValueOnce(
    new GitUploadError("prepare", true, new Error("Index write failed")),
  );
  const notify = vi.spyOn(notifications, "notify");
  try {
    upload();
    await act(async () => {});
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Download completed. Failed to prepare local changes for upload.",
        details: "Index write failed",
      }),
    );
  } finally {
    notify.mockRestore();
  }
});

it("names the ignored file that stopped the upload", async () => {
  await act(() => i18next.changeLanguage("en-US"));
  pushNotebook.mockRejectedValueOnce(
    new IgnoredUploadFileError("notes/keep.md"),
  );
  const notify = vi.spyOn(notifications, "notify");
  upload();
  await vi.waitFor(() =>
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message:
          "Upload paused because notes/keep.md matches a Git ignore rule. Update the rule and retry.",
      }),
    ),
  );
  notify.mockRestore();
});

it("redacts the ignored path when the same word appears in the prompt", async () => {
  await act(() => i18next.changeLanguage("en-US"));
  pushNotebook.mockRejectedValueOnce(new IgnoredUploadFileError("because"));
  const notify = vi.spyOn(notifications, "notify");
  try {
    upload("because");
    await act(async () => {});
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Upload paused because [redacted] matches a Git ignore rule. Update the rule and retry.",
        details: expect.stringContaining("\n[redacted]"),
      }),
    );
  } finally {
    notify.mockRestore();
  }
});
