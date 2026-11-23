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
import PushNotebookDialog from "./PushNotebookDialog";

// A push that never settles, so the dialog stays as it is after the click.
const { pushNotebook, settings } = vi.hoisted(() => ({
  pushNotebook: vi.fn(() => new Promise<void>(() => {})),
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

const notebook = {
  name: "Notes",
  gitURL: "https://example.com/notes.git",
  gitBranch: "main",
  gitUsername: "",
  gitPassword: "",
} as Notebook;

function upload() {
  act(() =>
    root.render(
      <PushNotebookDialog open={true} onClose={() => {}} notebook={notebook} />,
    ),
  );
  const button = buttonByText(document, "Upload");
  act(() => button.click());
}

it("commits under the author name and email from the settings", () => {
  upload();
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
  let resolvePush: () => void;
  pushNotebook.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolvePush = resolve;
      }),
  );
  const notify = vi.spyOn(notifications, "notify");
  await act(() => i18next.changeLanguage("en-US"));
  upload();
  await act(() => i18next.changeLanguage("zh-CN"));
  await act(async () => resolvePush());
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ message: "笔记本已上传" }),
  );
  notify.mockRestore();
  await act(() => i18next.changeLanguage("en-US"));
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
