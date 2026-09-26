import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { Notebook } from "../lib/notebook";
import PushNotebookDialog from "./PushNotebookDialog";

// A push that never settles, so the dialog stays as it is after the click.
const { pushNotebook, settings } = vi.hoisted(() => ({
  pushNotebook: vi.fn(() => new Promise<never>(() => {})),
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
  const button = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Upload",
  );
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
