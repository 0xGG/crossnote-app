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

it("leaves an Enter that confirms an input method's candidate alone", () => {
  show(note);
  act(() => type(pathField(), "b.md"));
  // What Chromium sends when Enter commits a composition: a keydown flagged
  // as composing, then a plain keyup once the composition has ended.
  act(() => {
    pathField().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 229,
        isComposing: true,
        bubbles: true,
      }),
    );
    pathField().dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }),
    );
  });
  expect(changeNoteFilePath).not.toHaveBeenCalled();

  // A plain Enter moves the note.
  act(() => {
    pathField().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 13,
        bubbles: true,
      }),
    );
  });
  expect(changeNoteFilePath).toHaveBeenCalledTimes(1);
});

it("moves the note once however often it is asked while moving it", () => {
  // A move that has not finished yet: the dialog stays open until it has.
  changeNoteFilePath.mockReturnValueOnce(new Promise(() => {}));
  show(note);
  act(() => type(pathField(), "b.md"));
  const enter = (init: KeyboardEventInit = {}) =>
    pathField().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 13,
        bubbles: true,
        ...init,
      }),
    );
  act(() => enter());

  // Enter held down repeats its keydown; Enter may be pressed again, or Save
  // clicked, twice even, while the first move is still under way.
  act(() => enter({ repeat: true }));
  act(() => enter());
  const save = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Save",
  );
  act(() => save.click());
  act(() => save.click());
  expect(changeNoteFilePath).toHaveBeenCalledTimes(1);
});
