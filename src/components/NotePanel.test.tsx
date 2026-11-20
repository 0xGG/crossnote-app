import type { TabNode } from "flexlayout-react";
import React, { act } from "react";
import { expect, it, vi } from "vitest";
import type { Notes } from "../lib/note";
import type { Notebook } from "../lib/notebook";
import { mountTestRoot, unmountTestRoot } from "../test/component";
import NotePanel from "./NotePanel";

const { updateNoteMarkdown } = vi.hoisted(() => ({
  updateNoteMarkdown: vi.fn(),
}));
vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({
      updateNoteMarkdown,
      getStatus: () => Promise.resolve(""),
    }),
  },
}));
vi.mock("../containers/settings", () => ({
  SettingsContainer: {
    useContainer: () => ({
      defaultEditorMode: "SourceCode",
      theme: { name: "light" },
    }),
  },
}));
vi.mock("./NotesPanel", () => ({ default: (): null => null }));
vi.mock("./NotePopover", () => ({ default: (): null => null }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it("waits for the destination when a tab moves as its first read completes", async () => {
  const { root, container } = mountTestRoot();
  let finishRead: (notes: Notes) => void;
  const notebook = {
    dir: "/notebooks/test",
    refreshNotesIfNotLoaded: () =>
      new Promise<Notes>((resolve) => (finishRead = resolve)),
  } as unknown as Notebook;
  const tabNode = {
    getId: () => "moving-tab",
    isVisible: () => true,
    getRect: (): null => null,
    setEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as TabNode;
  const show = (filePath: string) =>
    root.render(
      <NotePanel
        notebook={notebook}
        noteFilePath={filePath}
        tabNode={tabNode}
      />,
    );
  const finish = (filePath: string, markdown: string) =>
    finishRead({
      [filePath]: {
        notebookPath: notebook.dir,
        filePath,
        markdown,
        title: filePath,
        config: { createdAt: new Date(), modifiedAt: new Date() },
        mentions: {},
      },
    });
  try {
    await act(async () => show("source.md"));
    await act(async () => {
      finish("source.md", "Old content");
      // Let the old lookup enqueue its result in the same batch as the move.
      await Promise.resolve();
      show("destination.md");
    });
    expect(container.querySelector(".cm-content")).toBeNull();
    await act(async () => finish("destination.md", "Destination content"));
    expect(container.querySelector(".cm-content")?.textContent).toBe(
      "Destination content",
    );
  } finally {
    unmountTestRoot(container, root);
  }
  expect(updateNoteMarkdown).not.toHaveBeenCalled();
});
