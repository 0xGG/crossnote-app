import React, { act } from "react";
import { mountTestRoot, unmountTestRoot } from "../test/component";
import { afterEach, expect, it, vi } from "vitest";
import type { Note } from "../lib/note";
import NoteCard from "./NoteCard";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  status: vi.fn(),
}));
vi.mock("../utilities/image", () => ({ resolveNoteImageSrc: mocks.resolve }));
vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({
      getStatus: mocks.status,
      getNote: vi.fn(),
      addTabNode: vi.fn(),
      getNotebookAtPath: vi.fn(),
    }),
  },
}));
vi.mock("../containers/settings", () => ({
  SettingsContainer: { useContainer: () => ({ language: "en" }) },
}));
vi.mock("./EmojiWrapper", () => ({ Emoji: (): null => null }));
vi.mock("./NotePopover", () => ({ default: (): null => null }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve: resolve! };
}
function note(markdown: string): Note {
  return {
    notebookPath: "book",
    filePath: "a.md",
    title: "Title",
    markdown,
    config: { createdAt: new Date(0), modifiedAt: new Date(0) },
  } as Note;
}
afterEach(() => vi.clearAllMocks());

it("does not show stale image or status results when a note is replaced", async () => {
  const oldImage = deferred<string>();
  const newImage = deferred<string>();
  const oldStatus = deferred<string>();
  const newStatus = deferred<string>();
  mocks.resolve
    .mockReturnValueOnce(oldImage.promise)
    .mockReturnValueOnce(newImage.promise);
  mocks.status
    .mockReturnValueOnce(oldStatus.promise)
    .mockReturnValueOnce(newStatus.promise);
  const { container, root } = mountTestRoot();
  const oldNote = note("![old](old.png)");
  const newNote = note("![new](new.png)");
  await act(async () =>
    root.render(<NoteCard tabNode={null} note={oldNote} />),
  );
  await act(async () =>
    root.render(<NoteCard tabNode={null} note={newNote} />),
  );
  await act(async () => {
    newImage.resolve("new.png");
    newStatus.resolve("added");
  });
  await act(async () => {
    oldImage.resolve("old.png");
    oldStatus.resolve("modified");
  });
  expect(container.innerHTML).toContain("new.png");
  expect(container.innerHTML).not.toContain("old.png");
  expect(container.textContent).toContain(" - added");
  expect(container.textContent).not.toContain(" - modified");
  unmountTestRoot(container, root);
});

it("shows up to three valid images after skipping unresolved sources", async () => {
  mocks.resolve.mockImplementation(async (_note, image: string) => {
    if (image === "unreadable") throw new Error("file read failed");
    return image === "missing" ? "" : image;
  });
  mocks.status.mockResolvedValue("");
  const { container, root } = mountTestRoot();
  await act(async () =>
    root.render(
      <NoteCard
        tabNode={null}
        note={note(
          "![x](missing)\n![bad](unreadable)\n![a](one)\n![b](two)\n![c](three)\n![d](four)",
        )}
      />,
    ),
  );
  expect(container.innerHTML).toContain("one");
  expect(container.innerHTML).toContain("two");
  expect(container.innerHTML).toContain("three");
  expect(container.innerHTML).not.toContain("four");
  unmountTestRoot(container, root);
});
