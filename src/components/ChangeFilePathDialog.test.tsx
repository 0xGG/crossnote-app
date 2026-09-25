import type { TabNode } from "flexlayout-react";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import type { Note } from "../lib/note";
import ChangeFilePathDialog from "./ChangeFilePathDialog";

const { changeNoteFilePath } = vi.hoisted(() => ({
  changeNoteFilePath: vi.fn(() => Promise.resolve()),
}));

vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({ changeNoteFilePath }),
  },
}));

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const tabNode = {} as TabNode;
const note = { notebookPath: "/notebooks/a", filePath: "a.md" } as Note;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  changeNoteFilePath.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function show(forNote: Note) {
  act(() =>
    root.render(
      <ChangeFilePathDialog
        open={true}
        onClose={() => {}}
        note={forNote}
        tabNode={tabNode}
      />,
    ),
  );
}

// The dialog renders in a portal with its one text field.
const pathField = () => document.querySelector("input") as HTMLInputElement;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    value,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("keeps what is typed when the note is reloaded unchanged", () => {
  show(note);
  act(() => type(pathField(), "b.md"));
  // Every reload of the notebook, a pull finishing among them, hands the
  // panel a new note object with the same path.
  show({ ...note });
  expect(pathField().value).toBe("b.md");
});
