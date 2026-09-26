import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    value,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// Only a notebook cloned from git is checked for updates. Opens its dialog
// and hands back the notebook and the minutes field.
function openGitNotebook() {
  const notebook = {
    name: "Notes",
    gitURL: "https://example.com/notes.git",
    gitBranch: "main",
    gitUsername: "",
    gitPassword: "",
    gitCorsProxy: "",
    autoFetchPeriod: 60 * 60000,
  } as Notebook;
  act(() =>
    root.render(
      <ConfigureNotebookDialog
        open={true}
        onClose={() => {}}
        notebook={notebook}
      />,
    ),
  );
  const minutes = Array.from(document.querySelectorAll("input")).find(
    (input) => input.value === "60",
  );
  return { notebook, minutes };
}

it("takes a period between checks for updates with a decimal point", async () => {
  const { notebook, minutes } = openGitNotebook();

  // Typed a key at a time, as a user does.
  for (const value of ["1", "1.", "1.5"]) {
    act(() => type(minutes, value));
    expect(minutes.value).toBe(value);
  }

  const save = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Save",
  );
  await act(async () => save.click());
  expect(updateNotebook).toHaveBeenCalledTimes(1);
  expect(notebook.autoFetchPeriod).toBe(90000);
});

it("takes nothing but a number for the period between checks", async () => {
  const { notebook, minutes } = openGitNotebook();

  // A decimal comma, full-width digits from a Japanese input method, words,
  // digits past what a number can hold: the field keeps the period it shows,
  // so what it shows is what is saved.
  for (const value of ["1,5", "１．５", "abc", "-5", "9".repeat(400)]) {
    act(() => type(minutes, value));
    expect(minutes.value).toBe("60");
  }

  const save = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Save",
  );
  await act(async () => save.click());
  expect(notebook.autoFetchPeriod).toBe(60 * 60000);
});
