import type { TabNode } from "flexlayout-react";
import React, { act } from "react";
import { expect, it, vi } from "vitest";
import NotePanel from "../components/NotePanel";
import type Crossnote from "../lib/crossnote";
import { pfs } from "../lib/fs";
import { NotebookConflictError } from "../lib/mergeFiles";
import { Notebook } from "../lib/notebook";
import { mountTestRoot, unmountTestRoot } from "../test/component";
import { CrossnoteContainer } from "./crossnote";

vi.mock("./settings", () => ({
  SettingsContainer: {
    useContainer: () => ({
      defaultEditorMode: "SourceCode",
      theme: { name: "light" },
    }),
  },
}));
vi.mock("../components/NotesPanel", () => ({ default: (): null => null }));
vi.mock("../components/NotePopover", () => ({ default: (): null => null }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it.each([
  ["pullNotebook", "conflicts"],
  ["pushNotebook", "conflicts"],
  ["pullNotebook", "completes"],
  ["pushNotebook", "completes"],
] as const)(
  "shows the latest completed download in its open editor when the next %s %s",
  async (operation, outcome) => {
    const notebook = new Notebook();
    notebook.name = "Recovered";
    notebook.dir = `/notebooks/recovered-${operation}-${outcome}`;
    notebook.isLocal = true;
    const file = "README.md";
    const path = notebook.dir + "/" + file;
    await pfs.writeFile(path, "Before the download");
    const conflict = new NotebookConflictError(["draft.md"]);
    const app = {
      listNotebooks: async () => [notebook],
      resumeNotebook: async () => {
        await pfs.writeFile(path, "Recovered download");
        return true;
      },
      [operation]: async () => {
        if (outcome === "conflicts") throw conflict;
        await pfs.writeFile(path, "Next download");
        return operation === "pullNotebook" ? { cache: {} } : "downloaded";
      },
    };
    const tab = {
      getId: () => "recovered-tab",
      getConfig: () => ({ noteFilePath: file }),
      isVisible: () => true,
      getRect: (): null => null,
      setEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as TabNode;
    let api: ReturnType<typeof CrossnoteContainer.useContainer>;
    function OpenNote() {
      api = CrossnoteContainer.useContainer();
      return (
        <NotePanel notebook={notebook} noteFilePath={file} tabNode={tab} />
      );
    }
    const { root, container } = mountTestRoot();
    const editor = () => container.querySelector(".cm-content")?.textContent;
    try {
      await act(async () =>
        root.render(
          <CrossnoteContainer.Provider
            initialState={{ crossnote: app as unknown as Crossnote }}
          >
            <OpenNote />
          </CrossnoteContainer.Provider>,
        ),
      );
      expect(editor()).toBe("Before the download");
      await act(async () => {
        const syncing = api[operation]({ notebook });
        if (outcome === "conflicts")
          await expect(syncing).rejects.toBe(conflict);
        else await syncing;
      });
      const expected =
        outcome === "conflicts" ? "Recovered download" : "Next download";
      expect((await notebook.getNote(file)).markdown).toBe(expected);
      expect(editor()).toBe(expected);
    } finally {
      unmountTestRoot(container, root);
    }
  },
);
