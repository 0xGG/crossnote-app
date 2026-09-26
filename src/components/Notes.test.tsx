import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import type { Note } from "../lib/note";
import type { Notebook } from "../lib/notebook";
import Notes from "./Notes";

// The list is under test, not the cards: each card shows its note's text,
// notes the file of each card drawn, and every card is drawn at once.
const { drawn } = vi.hoisted(() => ({ drawn: [] as string[] }));
vi.mock("./NoteCard", () => ({
  NoteCardMargin: 8,
  default: ({ note }: { note: Note }) => {
    drawn.push(note.filePath);
    return <div className={"note-card"}>{note.markdown}</div>;
  },
}));
vi.mock("react-lazyload", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: { useContainer: () => ({}) },
}));

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const notebook = { dir: "/notebooks/a" } as Notebook;

function note(markdown: string, filePath = "a.md"): Note {
  return {
    notebookPath: notebook.dir,
    filePath,
    title: filePath.replace(/\.md$/, ""),
    markdown,
    config: { createdAt: new Date(0), modifiedAt: new Date(0) },
    mentions: {},
  } as Note;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  drawn.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function show(notes: Note[], searchValue = "") {
  act(() =>
    root.render(
      <Notes
        tabNode={null}
        notebook={notebook}
        notes={notes}
        searchValue={searchValue}
        scrollElement={null}
      />,
    ),
  );
}

it("shows a note's new text when the list is handed the note anew", () => {
  show([note("Old text")]);
  expect(container.textContent).toContain("Old text");

  // Every reload of the notebook, a pull among them, hands out new note
  // objects, in the same order when no note was added or removed.
  show([note("New text")]);
  expect(container.textContent).toContain("New text");
});

it("draws again only the card whose note changed", () => {
  const a = note("A", "a.md");
  show([a, note("B", "b.md")]);
  drawn.length = 0;

  // A refresh after a save hands the list the one note that was written
  // anew and the others as they were.
  show([a, note("B, edited", "b.md")]);
  expect(container.textContent).toContain("B, edited");
  expect(drawn).toEqual(["b.md"]);
});

it("searches for text that a pattern would read as more than text", () => {
  const notes = [
    note("Why? Because.", "why.md"),
    note("C:\\Users", "path.md"),
    note("Nothing to see", "other.md"),
  ];
  // Each word is looked for as typed, question mark and backslash included.
  show(notes, "why ?");
  expect(container.textContent).toContain("Why? Because.");
  expect(container.textContent).not.toContain("Nothing to see");

  show(notes, "C:\\");
  expect(container.textContent).toContain("C:\\Users");
  expect(container.textContent).not.toContain("Why? Because.");
});
