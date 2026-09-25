import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import AddNotebookDialog from "./AddNotebookDialog";

// An add that never settles, so the dialog stays as it is after the click.
const { addNotebook } = vi.hoisted(() => ({
  addNotebook: vi.fn((name: string) => new Promise<never>(() => {})),
}));

vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({
      addNotebook,
      isAddingNotebook: false,
      openLocalNotebook: () => {},
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
  addNotebook.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("names a notebook from a link after its repository", async () => {
  // A link to a repository opens the dialog this way. GitHub Pages
  // repositories are named like hosts, with .git in the middle of the name.
  act(() =>
    root.render(
      <AddNotebookDialog
        open={true}
        onClose={() => {}}
        canCancel={true}
        gitURL={"https://github.com/alice/alice.github.io.git"}
        gitBranch={"main"}
        hideOpeningLocal={true}
      />,
    ),
  );
  const add = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Add",
  );
  await act(async () => add.click());

  expect(addNotebook).toHaveBeenCalledTimes(1);
  expect(addNotebook.mock.calls[0][0]).toBe("alice.github.io");
});
