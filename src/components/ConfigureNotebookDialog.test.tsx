import React, { act } from "react";
import type { Root } from "react-dom/client";
import {
  mountTestRoot,
  unmountTestRoot,
  buttonByText,
  typeInput,
} from "../test/component";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import type { Notebook } from "../lib/notebook";
import ConfigureNotebookDialog from "./ConfigureNotebookDialog";

const { updateNotebook } = vi.hoisted(() => ({
  updateNotebook: vi.fn(() => Promise.resolve()),
}));

vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({
      notebooks: [] as Notebook[],
      updateNotebook,
      deleteNotebook: () => Promise.resolve(),
      hardResetNotebook: () => Promise.resolve(),
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
  updateNotebook.mockClear();
  ({ container, root } = mountTestRoot());
});

afterEach(() => {
  unmountTestRoot(container, root);
});

// Only a notebook cloned from git is checked for updates. Opens its dialog
// and hands back the notebook and the minutes field.
function openGitNotebook(onClose = vi.fn(), gitCorsProxy = "") {
  const notebook = {
    name: "Notes",
    gitURL: "https://example.com/notes.git",
    gitBranch: "main",
    gitUsername: "",
    gitPassword: "",
    gitCorsProxy,
    autoFetchPeriod: 60 * 60000,
  } as Notebook;
  act(() =>
    root.render(
      <ConfigureNotebookDialog
        open={true}
        onClose={onClose}
        notebook={notebook}
      />,
    ),
  );
  const minutes = Array.from(document.querySelectorAll("input")).find(
    (input) => input.value === "60",
  );
  return { notebook, minutes };
}

it("keeps the saved proxy on unrelated edits and only saves a typed replacement", async () => {
  const legacy = "https://crossnote.app/cors";
  const { notebook } = openGitNotebook(vi.fn(), legacy);
  const save = buttonByText(document, "Save");
  const name = document.querySelector("input")!;
  act(() => typeInput(name, "Renamed"));
  await act(async () => save.click());
  expect(updateNotebook).toHaveBeenLastCalledWith(
    notebook,
    expect.objectContaining({ name: "Renamed", gitCorsProxy: legacy }),
  );
  const gitSection = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent.includes("Git repository"),
  )!;
  act(() => gitSection.click());
  const proxy = Array.from(document.querySelectorAll("input")).find(
    (input) => input.value === legacy,
  )!;
  act(() => typeInput(proxy, "https://approved.example.test"));
  await act(async () => save.click());
  expect(updateNotebook).toHaveBeenLastCalledWith(
    notebook,
    expect.objectContaining({ gitCorsProxy: "https://approved.example.test" }),
  );
});

it("takes a period between checks for updates with a decimal point", async () => {
  const { notebook, minutes } = openGitNotebook();

  // Typed a key at a time, as a user does.
  for (const value of ["1", "1.", "1.5"]) {
    act(() => typeInput(minutes, value));
    expect(minutes.value).toBe(value);
  }

  const save = buttonByText(document, "Save");
  await act(async () => save.click());
  expect(updateNotebook).toHaveBeenCalledTimes(1);
  expect(updateNotebook).toHaveBeenCalledWith(
    notebook,
    expect.objectContaining({ autoFetchPeriod: 90000 }),
  );
  expect(notebook.autoFetchPeriod).toBe(60 * 60000);
});

it("takes nothing but a number for the period between checks", async () => {
  const { notebook, minutes } = openGitNotebook();

  // A decimal comma, full-width digits from a Japanese input method, words,
  // digits past what a number can hold: the field keeps the period it shows,
  // so what it shows is what is saved.
  for (const value of ["1,5", "１．５", "abc", "-5", "9".repeat(400)]) {
    act(() => typeInput(minutes, value));
    expect(minutes.value).toBe("60");
  }

  const save = buttonByText(document, "Save");
  await act(async () => save.click());
  expect(notebook.autoFetchPeriod).toBe(60 * 60000);
});

it("keeps a draft when the notebook settings cannot be saved and retries it", async () => {
  const close = vi.fn();
  const { notebook, minutes } = openGitNotebook(close);
  act(() => typeInput(minutes, "2"));
  const save = buttonByText(document, "Save");
  updateNotebook.mockRejectedValueOnce(new Error("disk full"));
  await act(async () => save.click());
  expect(close).not.toHaveBeenCalled();
  expect(notebook.autoFetchPeriod).toBe(60 * 60000);
  expect(minutes.value).toBe("2");
  await act(async () => save.click());
  expect(updateNotebook).toHaveBeenLastCalledWith(
    notebook,
    expect.objectContaining({ autoFetchPeriod: 120000 }),
  );
  expect(close).toHaveBeenCalledTimes(1);
});
