import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { TabNode } from "flexlayout-react";
import * as git from "isomorphic-git";
import moment from "moment";
import React, { act, useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import type Crossnote from "../lib/crossnote";
import { EventType, globalEmitter } from "../lib/event";
import { fs, pfs } from "../lib/fs";
import type { Note } from "../lib/note";
import { Notebook } from "../lib/notebook";
import { NoteSaver, NotesNotSavedError, flushNotes } from "../lib/noteSaver";
import { getNotificationState, resetNotifications } from "../lib/notifications";
import {
  joinNote,
  leaveNote,
  openNoteAt,
  type OpenNoteCalls,
} from "../lib/openNotes";
import {
  IgnoredUploadFileError,
  notebookOperation,
} from "../lib/notebookOperation";
import { pendingNoteWrites } from "../lib/noteWrites";
import { NotebookConflictError } from "../lib/mergeFiles";
import { CrossnoteContainer } from "./crossnote";

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The container as the app's components get it, handed out once rendered.
let crossnote: ReturnType<typeof CrossnoteContainer.useContainer>;
function Probe(): null {
  const container = CrossnoteContainer.useContainer();
  useEffect(() => {
    crossnote = container;
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

// A notebook whose notes have been read, on the browser file system the app
// uses. Every test has one of its own. git stands in for what the container
// asks git to do, where a test has it do something.
async function notebookAt(
  dir: string,
  git: Partial<Crossnote> = {},
): Promise<Notebook> {
  await pfs.mkdirp(dir);
  const notebook = new Notebook();
  notebook._id = dir;
  notebook.dir = dir;
  notebook.name = dir;
  notebook.isLocal = true;
  notebook.initSearch();
  await notebook.refreshNotesIfNotLoaded({
    dir: "./",
    includeSubdirectories: true,
  });
  const listed = { listNotebooks: async () => [notebook], ...git };
  await act(async () =>
    root.render(
      <CrossnoteContainer.Provider
        initialState={{ crossnote: listed as unknown as Crossnote }}
      >
        <Probe />
      </CrossnoteContainer.Provider>,
    ),
  );
  return notebook;
}

// A file put there by something other than this notebook's list: another
// tab of the app, a program working on the same folder, or a list that is
// being read again at that moment.
const read = (notebook: Notebook, fileName: string) =>
  pfs.readFile(`${notebook.dir}/${fileName}`, { encoding: "utf8" });

it("gives a new note a name no file has, whether the list knows the file or not", async () => {
  const notebook = await notebookAt("/notebooks/unlisted-today");
  const today = `${moment().format("YYYY-MM-DD")}.md`;
  await pfs.writeFile(`${notebook.dir}/${today}`, "# Today\n\nKept");

  const note = await crossnote.createNewNote(notebook, "", "");
  expect(note.filePath).not.toBe(today);
  expect(await read(notebook, today)).toBe("# Today\n\nKept");
});

it("opens a note it is asked to create at a path that has one", async () => {
  const notebook = await notebookAt("/notebooks/unlisted-named");
  await pfs.writeFile(`${notebook.dir}/Plans.md`, "# Plans\n\nKept");

  // What following a link to the note does.
  const note = await crossnote.createNewNote(notebook, "Plans.md", "");
  expect(note.markdown).toBe("# Plans\n\nKept");
  expect(await read(notebook, "Plans.md")).toBe("# Plans\n\nKept");
});

it("writes no note outside its notebook", async () => {
  const notebook = await notebookAt("/notebooks/fenced");

  await expect(
    crossnote.createNewNote(notebook, "../outside.md", ""),
  ).rejects.toThrow();
  expect(await pfs.exists("/notebooks/outside.md")).toBe(false);
});

it("preserves an existing note when its name cannot be checked for creation", async () => {
  const notebook = await notebookAt("/notebooks/unreadable-name");
  await pfs.writeFile(`${notebook.dir}/Plans.md`, "# Original");
  const error = new Error("Could not inspect entry");
  vi.spyOn(pfs, "stats").mockRejectedValueOnce(error);
  await expect(
    crossnote.createNewNote(notebook, "Plans.md", "New"),
  ).rejects.toBe(error);
  expect(await read(notebook, "Plans.md")).toBe("# Original");
});

it("opens no note a link leads to outside the notebook, and says so", async () => {
  const notebook = await notebookAt("/notebooks/linking");
  // A note of the notebook next door.
  await pfs.mkdirp("/notebooks/next-door");
  await pfs.writeFile("/notebooks/next-door/Kept.md", "# Kept");
  resetNotifications();

  // What clicking [kept](../next-door/Kept.md) in one of its notes does.
  await crossnote.openNoteAtPath(notebook, "../next-door/Kept.md");
  expect(getNotificationState().current?.message).toBe(
    "The link leads outside the notebook",
  );
  expect(notebook.notes["../next-door/Kept.md"]).toBeUndefined();
  expect(
    await pfs.readFile("/notebooks/next-door/Kept.md", { encoding: "utf8" }),
  ).toBe("# Kept");
});

// Two notes asked for at once would both find a name free, and the second
// would be written over the first.
it("gives two new notes asked for at once names of their own", async () => {
  const notebook = await notebookAt("/notebooks/at-once");

  const [a, b] = await Promise.all([
    crossnote.createNewNote(notebook, "", "[[From A]]"),
    crossnote.createNewNote(notebook, "", "[[From B]]"),
  ]);
  expect(a.filePath).not.toBe(b.filePath);
  expect(await read(notebook, a.filePath)).toContain("[[From A]]");
  expect(await read(notebook, b.filePath)).toContain("[[From B]]");
});

it("writes no new note over one asked for by name at the same time", async () => {
  const notebook = await notebookAt("/notebooks/at-once-named");
  const today = `${moment().format("YYYY-MM-DD")}.md`;

  // A new note, which is named after the day, and the day's note opened
  // from the sidebar.
  await Promise.all([
    crossnote.createNewNote(notebook, "", "[[Back link]]"),
    crossnote.createNewNote(notebook, today, ""),
  ]);
  expect(await read(notebook, today)).toContain("[[Back link]]");
});

it("opens no note a link leads to inside another note, and says so", async () => {
  const notebook = await notebookAt("/notebooks/linking-under");
  await pfs.writeFile(`${notebook.dir}/Kept.md`, "# Kept");
  resetNotifications();

  // What clicking [[Kept.md/child]] in one of its notes does.
  await crossnote.openNoteAtPath(notebook, "Kept.md/child");
  expect(getNotificationState().current?.message).toBe(
    "The link leads inside a note, not a folder",
  );
  expect(await pfs.exists(`${notebook.dir}/Kept.md/child.md`)).toBe(false);
  expect(await read(notebook, "Kept.md")).toBe("# Kept");
});

// A tab as the container's functions use it: they only ask for its id.
const tab = { getId: () => "tab" } as unknown as TabNode;

// An editor saves its text a moment after the last keystroke; by then the
// notebook, or the note, can be gone.
it("saves nothing into a notebook that is gone, and does not fail", async () => {
  await notebookAt("/notebooks/saving");

  await expect(
    crossnote.updateNoteMarkdown(tab, "/notebooks/deleted", "a.md", "Typed"),
  ).resolves.toBeUndefined();
});

it("saves nothing for a note that is gone, and does not fail", async () => {
  const notebook = await notebookAt("/notebooks/saving-gone");

  await expect(
    crossnote.updateNoteMarkdown(tab, notebook.dir, "moved.md", "Typed"),
  ).resolves.toBeUndefined();
  // Not saved, as it tells its callers.
  await expect(
    crossnote.updateNoteConfig(tab, notebook.dir, "moved.md", {
      createdAt: new Date(),
      modifiedAt: new Date(),
      pinned: true,
    }),
  ).resolves.toBe(false);
  expect(await pfs.exists(`${notebook.dir}/moved.md`)).toBe(false);
});

it("says when a note a link asks for cannot be created, and opens none", async () => {
  const notebook = await notebookAt("/notebooks/link-new");
  notebook.writeNote = async () => {
    throw new Error("Disk full");
  };
  resetNotifications();

  // What clicking [[New]] in one of its notes does.
  await crossnote.openNoteAtPath(notebook, "New");
  expect(getNotificationState().current?.message).toBe(
    "Failed to create the note: Disk full",
  );
  expect(notebook.notes["New.md"]).toBeUndefined();
  expect(await pfs.exists(`${notebook.dir}/New.md`)).toBe(false);
});

// What git, and reading a local folder again, are asked to do, in order, and
// a saver with text typed into a note of the notebook that is yet to be
// written.
async function notebookWithTyping(dir: string, write: () => Promise<void>) {
  const done: string[] = [];
  const notebook = await notebookAt(dir, {
    pullNotebook: async () => {
      done.push("pull");
    },
    pushNotebook: async () => {
      done.push("push");
    },
    hardResetNotebook: async () => {
      done.push("reset");
    },
  } as unknown as Partial<Crossnote>);
  // Restoring a note is for notebooks git keeps.
  notebook.isLocal = false;
  notebook.checkoutNote = async (note) => {
    done.push("restore");
    return note;
  };
  const refreshNotes = notebook.refreshNotes.bind(notebook);
  notebook.refreshNotes = async (args) => {
    done.push("read");
    return refreshNotes(args);
  };
  const saver = new NoteSaver({
    tabId: `tab-${dir}`,
    location: { notebookPath: dir, filePath: "a.md" },
    text: () => "Typed",
    write: async () => {
      done.push("write");
      await write();
      done.push("written");
    },
  });
  const operations: [string, () => Promise<unknown>][] = [
    ["pull", () => crossnote.pullNotebook({ notebook })],
    [
      "push",
      () =>
        crossnote.pushNotebook({
          notebook,
          authorName: "Test",
          authorEmail: "",
          username: "",
          password: "",
          message: "",
        }),
    ],
    ["reset", () => crossnote.hardResetNotebook(notebook)],
    ["read", () => crossnote.refreshNotebook(notebook)],
    [
      "restore",
      () =>
        crossnote.checkoutNote({
          notebookPath: dir,
          filePath: "a.md",
        } as Note),
    ],
  ];
  return { done, saver, operations };
}

it("writes what is typed into a notebook's notes before git, or reading the folder again, changes them", async () => {
  const { done, saver, operations } = await notebookWithTyping(
    "/notebooks/git-written",
    async () => {},
  );
  try {
    for (const [name, run] of operations) {
      done.length = 0;
      saver.changed();
      await act(async () => {
        await run();
      });
      expect(done.slice(0, 2), name).toEqual(["write", "written"]);
      expect(done, name).toContain(name);
    }
  } finally {
    saver.discard();
  }
});

it("does none of it, and says which note, when what is typed into it cannot be written first", async () => {
  const { done, saver, operations } = await notebookWithTyping(
    "/notebooks/git-not-written",
    async () => {
      throw new Error("Disk full");
    },
  );
  try {
    for (const [name, run] of operations) {
      done.length = 0;
      saver.changed();
      resetNotifications();
      let failure: unknown = null;
      await act(async () => {
        await run().catch((error) => {
          failure = error;
        });
      });
      // Pulling and pushing fail for their callers, which say nothing more;
      // none of the others' callers acts on a failure.
      if (name === "pull" || name === "push") {
        expect(failure, name).toBeInstanceOf(NotesNotSavedError);
      } else {
        expect(failure, name).toBeNull();
      }
      expect(done, name).toEqual(["write"]);
      expect(getNotificationState().current?.message, name).toBe(
        "Nothing was done, as a.md could not be saved: Disk full",
      );
    }
  } finally {
    saver.discard();
  }
});

// Typed while git resets the notebook: the reset is done, so what is typed
// is written, or fails, and the notebook is then read again either way.
it("reads the notebook again after a hard reset once what is typed during it has been written, or could not be", async () => {
  const done: string[] = [];
  let saver: NoteSaver = null;
  let reset = false;
  const notebook = await notebookAt("/notebooks/git-reset", {
    hardResetNotebook: async () => {
      done.push("reset");
      reset = true;
      saver.changed();
    },
  } as unknown as Partial<Crossnote>);
  const refreshNotes = notebook.refreshNotes.bind(notebook);
  notebook.refreshNotes = async (args) => {
    done.push("read");
    return refreshNotes(args);
  };
  saver = new NoteSaver({
    tabId: "tab-git-reset",
    location: { notebookPath: notebook.dir, filePath: "a.md" },
    text: () => "Typed",
    write: async () => {
      done.push("write");
      // Settles a step later, as a real write does.
      await Promise.resolve();
      if (reset) {
        done.push("failed");
        throw new Error("Disk full");
      }
      done.push("written");
    },
    // Only a flush writes what is typed here, never the timer.
    delay: 60_000,
  });
  try {
    saver.changed();
    resetNotifications();
    await act(async () => {
      await crossnote.hardResetNotebook(notebook);
    });
    // The typing during the reset is written (here it fails) before the
    // notebook is read again, and the reset is not said to be undone.
    expect(done).toEqual([
      "write",
      "written",
      "reset",
      "write",
      "failed",
      "read",
    ]);
    expect(getNotificationState().current?.message).toBeUndefined();
  } finally {
    saver.discard();
  }
});

// A note open in an editor, as a note's panel opens it, and what types into
// it as an editor of it would.
function openForTyping(notebook: Notebook, filePath: string, text: string) {
  const location = { notebookPath: notebook.dir, filePath };
  const calls: OpenNoteCalls = {
    write: (writer, to, written) =>
      crossnote.updateNoteMarkdown(
        writer,
        to.notebookPath,
        to.filePath,
        written,
        filePath,
      ),
    failed: () => {},
  };
  const open = joinNote("tab", location, text, calls);
  const type = (typed: string) => {
    const view = new EditorView({
      dispatchTransactions: open.document.dispatchTransactions,
      state: EditorState.create({ doc: open.document.doc }),
    });
    const detach = open.document.attach(view);
    view.dispatch({
      changes: { from: view.state.doc.length, insert: typed },
      userEvent: "input.type",
    });
    detach();
    view.destroy();
  };
  return { open, calls, type, close: () => leaveNote(open, "tab") };
}

it("keeps a moved editor's write pending until its destination can be read", async () => {
  const notebook = await notebookAt("/notebooks/pending-destination");
  await pfs.writeFile(`${notebook.dir}/old.md`, "Original");
  const { open, type, close } = openForTyping(notebook, "old.md", "Original");
  try {
    type(" draft");
    globalEmitter.emit(EventType.ChangedNoteFilePath, {
      notebookPath: notebook.dir,
      oldNoteFilePath: "old.md",
      newNoteFilePath: "moved.md",
    });
    await expect(open.saver.flush()).rejects.toThrow();
    expect(open.saver.pending).toBe(true);
    expect(open.document.text()).toBe("Original draft");
    await pfs.writeFile(`${notebook.dir}/moved.md`, "Original");
    await open.saver.flush();
    expect(open.saver.pending).toBe(false);
    expect(await read(notebook, "moved.md")).toContain("Original draft");
    expect(await read(notebook, "old.md")).toBe("Original");
  } finally {
    close();
  }
});

it.each(["closed", "reopened"])(
  "retries a %s draft at the restored destination through the app",
  async (state) => {
    const notebook = await notebookAt(`/notebooks/restored-draft-${state}`);
    const original = "Title\n\nFirst paragraph\n\nLast paragraph";
    const moved = { notebookPath: notebook.dir, filePath: "moved.md" };
    await pfs.writeFile(`${notebook.dir}/old.md`, original);
    const { open, type, close } = openForTyping(notebook, "old.md", original);
    const write = vi.spyOn(notebook, "writeNote");
    try {
      await notebookOperation(notebook.dir, async () => {
        type(" edited");
        close();
        expect(
          pendingNoteWrites({ ...moved, filePath: "old.md" }),
        ).toHaveLength(1);
        globalEmitter.emit(EventType.ChangedNoteFilePath, {
          notebookPath: notebook.dir,
          oldNoteFilePath: "old.md",
          newNoteFilePath: moved.filePath,
        });
      });
      await expect(crossnote.getNoteForPrint(moved)).rejects.toBeInstanceOf(
        NotesNotSavedError,
      );
      expect(write).not.toHaveBeenCalled();

      const restored = original.replace("Title", "Updated title");
      await pfs.writeFile(`${notebook.dir}/moved.md`, restored);
      if (state === "reopened") {
        const { open: reopened } = openForTyping(
          notebook,
          moved.filePath,
          restored,
        );
        expect(reopened.document.text()).toBe(original + " edited");
      }
      const printed = await crossnote.getNoteForPrint(moved);
      expect(printed.markdown).toBe(restored + " edited");
      expect(write.mock.calls.map(([path]) => path)).toEqual([moved.filePath]);
      expect(await read(notebook, "old.md")).toBe(original);
      expect(await body(notebook, moved.filePath)).toBe(restored + " edited");
      expect(open.saver.pending).toBe(false);
    } finally {
      open.saver.discard();
      close();
    }
  },
);

it("reserves a closed draft's path until the draft is released", async () => {
  const notebook = await notebookAt("/notebooks/reserved-rename");
  const source = await notebook.writeNote("source.md", "Source", {
    createdAt: new Date(),
    modifiedAt: new Date(),
  });
  const folder = `${notebook.dir}/drafts`;
  const target = "drafts/draft.md";
  await pfs.writeFile(`${notebook.dir}/${target}`, "Draft");
  const { open, type, close } = openForTyping(notebook, target, "Draft");
  const write = vi
    .spyOn(notebook, "writeNote")
    .mockRejectedValue(new Error("Busy"));
  try {
    type(" pending");
    close();
    await expect(flushNotes(open.saver.location)).rejects.toBeInstanceOf(
      NotesNotSavedError,
    );
    await pfs.rmdir(folder);
    const rename = () =>
      crossnote.changeNoteFilePath(tab, source, "./drafts/draft");
    await expect(rename()).rejects.toThrow("error/target-file-already-exists");
    expect(await pfs.exists(folder)).toBe(false);
    expect(await body(notebook, "source.md")).toBe("Source");
    expect(open.document.text()).toBe("Draft pending");
    expect(open.saver.pending).toBe(true);
    open.saver.discard();
    await rename();
    expect(await body(notebook, target)).toBe("Source");
  } finally {
    open.saver.discard();
    write.mockRestore();
  }
});

it("releases a closed draft when its note is explicitly deleted", async () => {
  const notebook = await notebookAt("/notebooks/delete-closed-draft");
  const note = await notebook.writeNote("example.md", "Example", {
    createdAt: new Date(),
    modifiedAt: new Date(),
  });
  const { open, type, close } = openForTyping(
    notebook,
    note.filePath,
    note.markdown,
  );
  const write = vi
    .spyOn(notebook, "writeNote")
    .mockRejectedValueOnce(new Error("Try again"));
  try {
    type(" edited");
    close();
    await expect(flushNotes(open.saver.location)).rejects.toBeInstanceOf(
      NotesNotSavedError,
    );
    await crossnote.deleteNote(tab, notebook.dir, note.filePath);
    await flushNotes(open.saver.location);
    expect(open.saver.pending).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await pfs.exists(`${notebook.dir}/example.md`)).toBe(false);
  } finally {
    open.saver.discard();
  }
});

it("prints the downloaded text when the note list still has its old contents", async () => {
  const notebook = await notebookAt("/notebooks/print-after-download");
  const note = await notebook.writeNote("example.md", "Before download", {
    createdAt: new Date(),
    modifiedAt: new Date(),
  });
  let printed!: ReturnType<typeof crossnote.getNoteForPrint>;
  await notebookOperation(notebook.dir, async () => {
    printed = crossnote.getNoteForPrint(note);
    await pfs.writeFile(`${notebook.dir}/example.md`, "Downloaded text");
    expect(notebook.notes[note.filePath].markdown).toBe("Before download");
  });
  await expect(printed).resolves.toMatchObject({ markdown: "Downloaded text" });
});

it.each(["rename", "delete", "checkout", "print"])(
  "cancels a waiting %s from a card when the note moves",
  async (action) => {
    const notebook = await notebookAt(`/notebooks/card-${action}`);
    const note = await notebook.writeNote("old.md", "Example", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    const rename = vi
      .spyOn(notebook, "changeNoteFilePath")
      .mockResolvedValue(note);
    const remove = vi
      .spyOn(notebook, "deleteNote")
      .mockResolvedValue(undefined);
    const checkout = vi.spyOn(notebook, "checkoutNote").mockResolvedValue(note);
    const readNote = vi.spyOn(notebook, "getNote");
    notebook.isLocal = false;
    let pending!: Promise<unknown>;
    await notebookOperation(notebook.dir, async () => {
      if (action === "rename")
        pending = crossnote.changeNoteFilePath(tab, note, "renamed.md");
      if (action === "delete")
        pending = crossnote.deleteNote(tab, notebook.dir, note.filePath);
      if (action === "checkout") pending = crossnote.checkoutNote(note);
      if (action === "print") pending = crossnote.getNoteForPrint(note);
      globalEmitter.emit(EventType.ChangedNoteFilePath, {
        notebookPath: notebook.dir,
        oldNoteFilePath: note.filePath,
        newNoteFilePath: "moved.md",
      });
    });
    await expect(pending).rejects.toThrow("The note moved to moved.md");
    expect(rename).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
    expect(readNote).not.toHaveBeenCalled();
  },
);

it("updates the moved card's settings and search entry while preserving its replacement", async () => {
  const notebook = await notebookAt("/notebooks/moved-card-settings");
  await pfs.writeFile(`${notebook.dir}/old.md`, "Replacement");
  await pfs.writeFile(`${notebook.dir}/moved.md`, "Example");
  let settings!: Promise<string[]>;
  await notebookOperation(notebook.dir, async () => {
    settings = crossnote.addNoteAlias(tab, notebook.dir, "old.md", "Reminder");
    globalEmitter.emit(EventType.ChangedNoteFilePath, {
      notebookPath: notebook.dir,
      oldNoteFilePath: "old.md",
      newNoteFilePath: "moved.md",
    });
  });
  await expect(settings).resolves.toEqual(["Reminder"]);
  expect(await read(notebook, "old.md")).toBe("Replacement");
  expect((await notebook.getNote("moved.md", true)).config.aliases).toEqual([
    "Reminder",
  ]);
  expect(notebook.search.search("Reminder").map((hit) => hit.filePath)).toEqual(
    ["moved.md"],
  );
});

it("applies a recovery move to the shared editor and its waiting save", async () => {
  const notebook = await notebookAt("/notebooks/moved-editor");
  const original = ".crossnote-recovered/recovered-example.md";
  const moved = ".crossnote-recovered-1/recovered-example.md";
  const text = "Example";
  await pfs.writeFile(`${notebook.dir}/${moved}`, text);
  const { open, type, close } = openForTyping(notebook, original, text);
  const write = vi.spyOn(notebook, "writeNote");
  let saving: Promise<void>;
  try {
    await notebookOperation(notebook.dir, async () => {
      type(" edited");
      saving = open.saver.flush();
      expect(pendingNoteWrites(open.saver.location)).toHaveLength(1);
      globalEmitter.emit(EventType.ChangedNoteFilePath, {
        notebookPath: notebook.dir,
        oldNoteFilePath: original,
        newNoteFilePath: moved,
      });
    });
    await saving!;
    expect(open.saver.location.filePath).toBe(moved);
    expect(openNoteAt({ notebookPath: notebook.dir, filePath: moved })).toBe(
      open,
    );
    expect(open.document.text()).toBe("Example edited");
    expect(write.mock.calls.map(([file]) => file)).toEqual([moved]);
    expect(await read(notebook, moved)).toContain("Example edited");
  } finally {
    close();
  }
});

// The text of a stored note, less the front matter a save puts before it.
const body = async (notebook: Notebook, fileName: string) =>
  ((await read(notebook, fileName)) as string).replace(
    /^---\n(?:.*\n)*?---\n/,
    "",
  );

function holdNextNoteWrite(notebook: Notebook) {
  let reach!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => (reach = resolve));
  const held = new Promise<void>((resolve) => (release = resolve));
  const write = notebook.writeNote.bind(notebook);
  vi.spyOn(notebook, "writeNote").mockImplementationOnce(async (...args) => {
    reach();
    await held;
    return write(...args);
  });
  return { reached, release };
}

it.each(["settings", "text"])(
  "keeps text and settings when the %s write settles last",
  async (first) => {
    const notebook = await notebookAt(`/notebooks/interleaved-${first}`);
    await pfs.writeFile(`${notebook.dir}/a.md`, "A");
    const { open, calls, type, close } = openForTyping(notebook, "a.md", "A");
    joinNote("other", open.saver.location, "A", calls);
    const hold = holdNextNoteWrite(notebook);
    try {
      if (first === "text") type("B");
      const firstWrite =
        first === "settings"
          ? crossnote.togglePin(tab, notebook.dir, "a.md")
          : open.saver.flush();
      await hold.reached;
      if (first === "settings") type("B");
      const secondWrite =
        first === "settings"
          ? open.saver.flush()
          : crossnote.togglePin(tab, notebook.dir, "a.md");
      type("C");
      hold.release();
      await Promise.all([firstWrite, secondWrite]);
      await flushNotes({ notebookPath: notebook.dir });
      expect(await body(notebook, "a.md")).toBe("ABC");
      expect((await notebook.getNote("a.md", true)).config.pinned).toBe(true);
      expect(open.document.text()).toBe("ABC");
    } finally {
      hold.release();
      leaveNote(open, "other");
      close();
    }
  },
);

it("merges independent settings of an unopened note without reverting text or other settings", async () => {
  const notebook = await notebookAt("/notebooks/unopened-interleaved-settings");
  const raw = '---\r\ncustom: "kept"\r\n---\r\nA\r\n';
  await pfs.writeFile(`${notebook.dir}/a.md`, raw);
  const hold = holdNextNoteWrite(notebook);
  const pin = crossnote.togglePin(tab, notebook.dir, "a.md");
  await hold.reached;
  const favorite = crossnote.toggleFavorite(tab, notebook.dir, "a.md");
  const aliases = Promise.all([
    crossnote.addNoteAlias(tab, notebook.dir, "a.md", "one"),
    crossnote.addNoteAlias(tab, notebook.dir, "a.md", "two"),
  ]);
  hold.release();
  await Promise.all([pin, favorite, aliases]);
  await crossnote.deleteNoteAlias(tab, notebook.dir, "a.md", "one");
  const note = await notebook.getNote("a.md", true);
  expect(note.config).toMatchObject({
    pinned: true,
    favorited: true,
    aliases: ["two"],
  });
  const stored = await read(notebook, "a.md");
  expect(stored).toContain('custom: "kept"\r\n');
  expect(stored).toContain("A\r\n");
  expect(String(stored).replaceAll("\r\n", "")).not.toContain("\n");
});

it("updates the alias search index when a settings write is retried", async () => {
  const notebook = await notebookAt("/notebooks/retried-alias");
  const file = "a.md";
  await pfs.writeFile(
    `${notebook.dir}/${file}`,
    "---\naliases: [original, retained]\n---\nA",
  );
  await notebook.getNote(file, true);
  const hits = (alias: string) =>
    notebook.search.search(alias).map((result) => result.filePath);
  expect(hits("original")).toEqual([file]);

  vi.spyOn(pfs, "storeTree").mockRejectedValueOnce(new Error("Store refused"));
  const remove = () =>
    crossnote.deleteNoteAlias(tab, notebook.dir, file, "original");
  expect(await remove()).toEqual(["original", "retained"]);
  expect(await remove()).toEqual(["retained"]);
  expect(hits("original")).toEqual([]);
  expect(hits("retained")).toEqual([file]);

  vi.spyOn(pfs, "storeTree").mockRejectedValueOnce(new Error("Store refused"));
  const add = () => crossnote.addNoteAlias(tab, notebook.dir, file, "newalias");
  expect(await add()).toEqual(["retained"]);
  expect(await add()).toEqual(["retained", "newalias"]);
  expect(hits("newalias")).toEqual([file]);
  expect((await notebook.getNote(file, true)).config.aliases).toEqual([
    "retained",
    "newalias",
  ]);
});

it("keeps newer typing after a settings write fails and lets the setting be retried", async () => {
  const notebook = await notebookAt("/notebooks/settings-retry");
  await pfs.writeFile(`${notebook.dir}/a.md`, "A");
  const { open, type, close } = openForTyping(notebook, "a.md", "A");
  vi.spyOn(notebook, "writeNote").mockRejectedValueOnce(new Error("Disk full"));
  resetNotifications();
  try {
    await crossnote.togglePin(tab, notebook.dir, "a.md");
    expect(getNotificationState().current?.message).toContain(
      "Failed to save the note's settings",
    );
    type("B");
    await open.saver.flush();
    await crossnote.togglePin(tab, notebook.dir, "a.md");
    const note = await notebook.getNote("a.md", true);
    expect(note.markdown).toBe("AB");
    expect(note.config.pinned).toBe(true);
  } finally {
    close();
  }
});

it.each(["stage", "tree"] as const)(
  "retries %s durability after text or settings already reached the file",
  async (phase) => {
    const notebook = await notebookAt(`/notebooks/retry-durability-${phase}`);
    notebook.isLocal = false;
    await git.init({ fs, dir: notebook.dir });
    await pfs.writeFile(`${notebook.dir}/a.md`, "A");
    await notebook.getNote("a.md", true);
    const { open, type, close } = openForTyping(notebook, "a.md", "A");
    const failTwice = () => {
      const failure = new Error(`${phase} refused`);
      const spy =
        phase === "stage" ? vi.spyOn(git, "add") : vi.spyOn(pfs, "storeTree");
      spy.mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
      return { failure, spy };
    };
    try {
      const text = failTwice();
      type("B");
      await expect(open.saver.flush()).rejects.toBe(text.failure);
      expect(await body(notebook, "a.md")).toBe("AB");
      await expect(open.saver.flush()).rejects.toBe(text.failure);
      expect(open.saver.pending).toBe(true);
      await open.saver.flush();
      expect(text.spy).toHaveBeenCalledTimes(3);
      expect(open.saver.pending).toBe(false);
      text.spy.mockRestore();
      type("C");
      await open.saver.flush();
      expect(await body(notebook, "a.md")).toBe("ABC");
      expect(open.saver.savedText).toBe("ABC");

      const settings = failTwice();
      const pin = () =>
        crossnote.updateNoteConfig(tab, notebook.dir, "a.md", (current) => ({
          ...current,
          pinned: true,
        }));
      expect(await pin()).toBe(false);
      expect((await notebook.getNote("a.md", true)).config.pinned).toBe(true);
      expect(await pin()).toBe(false);
      expect(await pin()).toBe(true);
      expect(settings.spy).toHaveBeenCalledTimes(3);
      expect(await git.listFiles({ fs, dir: notebook.dir })).toContain("a.md");
    } finally {
      close();
    }
  },
);

it("waits for an unopened note's settings before flushing a notebook for git", async () => {
  const notebook = await notebookAt("/notebooks/settings-before-git");
  await pfs.writeFile(`${notebook.dir}/a.md`, "A");
  const hold = holdNextNoteWrite(notebook);
  const pin = crossnote.togglePin(tab, notebook.dir, "a.md");
  await hold.reached;
  let flushed = false;
  const flushing = flushNotes({ notebookPath: notebook.dir }).then(() => {
    flushed = true;
  });
  await Promise.resolve();
  expect(flushed).toBe(false);
  hold.release();
  await Promise.all([pin, flushing]);
  expect((await notebook.getNote("a.md", true)).config.pinned).toBe(true);
});

it("merges input queued during git with the downloaded text before it saves", async () => {
  const notebook = await notebookAt("/notebooks/typing-during-git");
  const initial = "First\nMiddle\nLast\n";
  await pfs.writeFile(`${notebook.dir}/a.md`, initial);
  await notebook.getNote("a.md", true);
  const { open, type, close } = openForTyping(notebook, "a.md", initial);
  let release!: () => void;
  let reach!: () => void;
  const reached = new Promise<void>((resolve) => (reach = resolve));
  const held = new Promise<void>((resolve) => (release = resolve));
  const syncing = notebookOperation(notebook.dir, async () => {
    reach();
    await held;
    await pfs.writeFile(`${notebook.dir}/a.md`, "Remote first\nMiddle\nLast\n");
  });
  await reached;
  try {
    type("Typed during sync\n");
    const saving = open.saver.flush();
    release();
    await Promise.all([syncing, saving]);
    expect(await body(notebook, "a.md")).toBe(
      "Remote first\nMiddle\nLast\nTyped during sync\n",
    );
    expect(open.document.text()).toBe(
      "Remote first\nMiddle\nLast\nTyped during sync\n",
    );
    type("More\n");
    await open.saver.flush();
    expect(await body(notebook, "a.md")).toBe(
      "Remote first\nMiddle\nLast\nTyped during sync\nMore\n",
    );
  } finally {
    release();
    close();
  }
});

it("restores same-page input when sync removes the edited note and its parent", async () => {
  const notebook = await notebookAt("/notebooks/typing-during-removal");
  const file = "nested/note.md";
  const initial = "First\n";
  await pfs.writeFile(`${notebook.dir}/${file}`, initial);
  await notebook.getNote(file, true);
  const { open, type, close } = openForTyping(notebook, file, initial);
  try {
    await notebookOperation(notebook.dir, async () => {
      type("Typed during sync\n");
      await pfs.rmdir(`${notebook.dir}/nested`);
    });
    await open.saver.flush();
    expect(await body(notebook, file)).toBe(initial + "Typed during sync\n");
    expect(open.saver.pending).toBe(false);
  } finally {
    close();
  }
});

it.each(["stat", "read original"])(
  "keeps external edits and pending input when the save cannot %s",
  async (failure) => {
    const notebook = await notebookAt(`/notebooks/failed-save-${failure}`);
    const initial = "First\nMiddle\nLast\n";
    const settings = "---\npinned: true # keep my comment\n---\n";
    const path = `${notebook.dir}/a.md`;
    await pfs.writeFile(path, settings + initial);
    const note = await notebook.getNote("a.md", true);
    const { open, type, close } = openForTyping(
      notebook,
      "a.md",
      note.markdown,
    );
    try {
      const external = "External first\nMiddle\nLast\n";
      await pfs.writeFile(path, settings + external);
      type("Appended\n");
      const refused = new Error("storage unavailable");
      if (failure === "stat") {
        vi.spyOn(pfs, "stats").mockRejectedValueOnce(refused);
      } else {
        const readFile = pfs.readFile.bind(pfs);
        vi.spyOn(pfs, "readFile")
          .mockImplementationOnce(readFile)
          .mockRejectedValueOnce(refused);
      }
      await expect(open.saver.flush()).rejects.toBe(refused);
      expect(await read(notebook, "a.md")).toBe(settings + external);
      expect(open.document.text()).toContain("Appended\n");
      expect(open.saver.pending).toBe(true);
      await open.saver.flush();
      expect(await body(notebook, "a.md")).toBe(external + "Appended\n");
      expect(await read(notebook, "a.md")).toContain(
        "pinned: true # keep my comment\n",
      );
      expect(open.saver.pending).toBe(false);
    } finally {
      close();
    }
  },
);

it.each(["text", "settings"])(
  "preserves the disk and dirty editor when %s cannot reconcile downloaded bytes",
  async (save) => {
    const notebook = await notebookAt(`/notebooks/unmergeable-${save}`);
    const initial = "Base\0\n";
    const remote = "Downloaded\0\n";
    await pfs.writeFile(`${notebook.dir}/a.md`, initial);
    await notebook.getNote("a.md", true);
    const { open, type, close } = openForTyping(notebook, "a.md", initial);
    try {
      type("Local input\n");
      await pfs.writeFile(`${notebook.dir}/a.md`, remote);
      const write = vi.spyOn(notebook, "writeNote");
      if (save === "settings") {
        resetNotifications();
        await crossnote.togglePin(tab, notebook.dir, "a.md");
        expect(getNotificationState().current?.message).toContain(
          "Failed to save the note's settings",
        );
      }
      await expect(open.saver.flush()).rejects.toBeInstanceOf(
        NotebookConflictError,
      );
      // Repeating the save must not advance the base and turn this into a
      // one-sided overwrite. Keep local input available for manual resolution.
      await expect(open.saver.flush()).rejects.toBeInstanceOf(
        NotebookConflictError,
      );
      expect(write).not.toHaveBeenCalled();
      expect(await read(notebook, "a.md")).toBe(remote);
      expect(open.document.text()).toBe(initial + "Local input\n");
      expect(open.saver.savedText).toBe(initial);
      expect(open.saver.pending).toBe(true);
    } finally {
      close();
    }
  },
);

it("reconciles typing when a queued alias removal is already present in downloaded settings", async () => {
  const notebook = await notebookAt("/notebooks/noop-settings-during-git");
  const initial = "First\nMiddle\nLast\n";
  const note = await notebook.writeNote("a.md", initial, {
    aliases: ["x", "y"],
    createdAt: new Date(),
    modifiedAt: new Date(),
  });
  const { open, type, close } = openForTyping(notebook, "a.md", initial);
  let reach!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => (reach = resolve));
  const held = new Promise<void>((resolve) => (release = resolve));
  const syncing = notebookOperation(notebook.dir, async () => {
    reach();
    await held;
    await notebook.writeNote("a.md", "Remote\nMiddle\nLast\n", {
      ...note.config,
      aliases: ["y"],
    });
  });
  await reached;
  try {
    const settings = crossnote.deleteNoteAlias(tab, notebook.dir, "a.md", "x");
    // Hold Git until the settings operation is queued ahead of the text save.
    await vi.waitFor(() =>
      expect(
        pendingNoteWrites({ notebookPath: notebook.dir, filePath: "a.md" }),
      ).toHaveLength(1),
    );
    type("Typed during sync\n");
    const saving = open.saver.flush();
    release();
    await Promise.all([syncing, settings, saving]);
    expect(await body(notebook, "a.md")).toBe(
      "Remote\nMiddle\nLast\nTyped during sync\n",
    );
    expect(open.document.text()).toBe(await body(notebook, "a.md"));
    expect((await notebook.getNote("a.md", true)).config.aliases).toEqual([
      "y",
    ]);
  } finally {
    release();
    close();
  }
});

it("chooses a new note's path only after git has restored the notebook", async () => {
  const notebook = await notebookAt("/notebooks/creating-during-git");
  let reach!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => (reach = resolve));
  const held = new Promise<void>((resolve) => (release = resolve));
  const syncing = notebookOperation(notebook.dir, async () => {
    reach();
    await held;
    await pfs.writeFile(`${notebook.dir}/remote.md`, "Downloaded");
  });
  await reached;
  try {
    const creating = crossnote.createNewNote(notebook, "remote.md", "New");
    await Promise.resolve();
    release();
    await syncing;
    const note = await creating;
    expect(note.markdown).toBe("Downloaded");
    expect(await read(notebook, "remote.md")).toBe("Downloaded");
  } finally {
    release();
  }
});

it.each([
  ["conflict", new NotebookConflictError(["assets/a.bin"])],
  ["ignored file", new IgnoredUploadFileError("draft.md")],
] as const)(
  "saves input before refreshing editors after an upload stops for %s",
  async (reason, error) => {
    let reach!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => (reach = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const notebook = await notebookAt(`/notebooks/typing-during-${reason}`, {
      pushNotebook: async () => {
        reach();
        await held;
        await pfs.writeFile(`${notebook.dir}/a.md`, "Remote\nMiddle\nLast\n");
        await pfs.writeFile(`${notebook.dir}/README.md`, "Incoming");
        throw error;
      },
    });
    const initial = "First\nMiddle\nLast\n";
    await pfs.writeFile(`${notebook.dir}/a.md`, initial);
    await notebook.getNote("a.md", true);
    await pfs.writeFile(`${notebook.dir}/README.md`, "Original");
    expect((await notebook.getNote("README.md", true)).markdown).toBe(
      "Original",
    );
    const { open, type, close } = openForTyping(notebook, "a.md", initial);
    const pendingAtRefresh: boolean[] = [];
    const onRefresh = ({ notebookPath }: { notebookPath: string }) => {
      if (notebookPath === notebook.dir)
        pendingAtRefresh.push(open.saver.pending);
    };
    globalEmitter.on(EventType.PerformedGitOperation, onRefresh);
    try {
      await act(async () => {
        const pushing = crossnote.pushNotebook({ notebook });
        const rejected = expect(pushing).rejects.toBe(error);
        await reached;
        type("Typed during sync\n");
        release();
        await rejected;
      });
      expect(pendingAtRefresh).toEqual([false]);
      expect((await notebook.getNote("README.md")).markdown).toBe("Incoming");
      expect(await body(notebook, "a.md")).toBe(
        "Remote\nMiddle\nLast\nTyped during sync\n",
      );
      expect(open.document.text()).toBe(await body(notebook, "a.md"));
      expect(open.saver.pending).toBe(false);
    } finally {
      globalEmitter.off(EventType.PerformedGitOperation, onRefresh);
      release();
      close();
    }
  },
);

it.each(["save", "refresh"] as const)(
  "keeps the ignored upload path when the following %s fails",
  async (failure) => {
    const ignored = new IgnoredUploadFileError("private/draft.md");
    const secondary = new Error(
      failure === "save" ? "Disk full" : "Cannot read notes",
    );
    const notebook = await notebookAt(
      `/notebooks/ignored-with-${failure}-failure`,
      {
        pushNotebook: async () => {
          type(" in progress");
          throw ignored;
        },
      },
    );
    const initial = "Draft";
    await pfs.writeFile(`${notebook.dir}/a.md`, initial);
    await notebook.getNote("a.md", true);
    const { open, calls, type, close } = openForTyping(
      notebook,
      "a.md",
      initial,
    );
    const refresh = vi.spyOn(notebook, "refreshNotes");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const reportSaveFailure = vi.spyOn(calls, "failed");
    if (failure === "save")
      vi.spyOn(calls, "write").mockRejectedValue(secondary);
    else refresh.mockRejectedValue(secondary);
    try {
      await act(async () => {
        await expect(crossnote.pushNotebook({ notebook })).rejects.toBe(
          ignored,
        );
      });
      expect(open.document.text()).toBe("Draft in progress");
      if (failure === "save") {
        expect(refresh).not.toHaveBeenCalled();
        expect(open.saver.pending).toBe(true);
        expect(reportSaveFailure).toHaveBeenCalledWith(secondary);
      } else {
        expect(refresh).toHaveBeenCalledOnce();
        expect(logged).toHaveBeenCalledWith(secondary);
        expect(await body(notebook, "a.md")).toBe("Draft in progress");
      }
    } finally {
      open.saver.discard();
      close();
    }
  },
);

it("writes what was just typed into a note before renaming it, and saves it under its new name from then on", async () => {
  const notebook = await notebookAt("/notebooks/renaming");
  await pfs.writeFile(`${notebook.dir}/a.md`, "# A");
  const note = await notebook.getNote("a.md", true);
  const { open, type, close } = openForTyping(notebook, "a.md", note.markdown);
  try {
    // Renamed at once: the save that comes a moment after the last key has
    // not come yet.
    type(" typed");
    expect(open.saver.pending).toBe(true);
    await act(async () => {
      await crossnote.changeNoteFilePath(tab, note, "b.md");
    });
    expect(await pfs.exists(`${notebook.dir}/a.md`)).toBe(false);
    expect(await body(notebook, "b.md")).toBe("# A typed");
    // The saver has followed the file, without a tab telling it to.
    expect(open.saver.location.filePath).toBe("b.md");
    type(" more");
    await open.saver.flush();
    expect(await body(notebook, "b.md")).toBe("# A typed more");
    expect(await pfs.exists(`${notebook.dir}/a.md`)).toBe(false);
  } finally {
    close();
  }
});

it.each([1, 2])(
  "saves edits made during rename before closing the last of %i tabs",
  async (tabs) => {
    const notebook = await notebookAt(
      `/notebooks/renaming-while-typing-${tabs}`,
    );
    await pfs.writeFile(`${notebook.dir}/a.md`, "# A");
    const note = await notebook.getNote("a.md", true);
    const { open, calls, type, close } = openForTyping(
      notebook,
      "a.md",
      note.markdown,
    );
    if (tabs === 2) {
      joinNote("other", open.saver.location, note.markdown, calls);
    }
    let reach: () => void;
    let release: () => void;
    const reached = new Promise<void>((resolve) => (reach = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    const storeTree = pfs.storeTree.bind(pfs);
    vi.spyOn(pfs, "storeTree").mockImplementationOnce(async (dir) => {
      reach();
      await held;
      await storeTree(dir);
    });
    try {
      const renaming = crossnote.changeNoteFilePath(tab, note, "b.md");
      await reached;
      type(" typed");
      if (tabs === 2) {
        close();
      }
      let closed = false;
      const closing = open.saver.flush().then(() => {
        leaveNote(open, tabs === 2 ? "other" : "tab");
        closed = true;
      });
      expect(await body(notebook, "b.md")).toBe("# A");
      const closedBeforeRelease = closed;
      release!();
      await renaming;
      await closing;
      expect(await body(notebook, "b.md")).toBe("# A typed");
      expect(closedBeforeRelease).toBe(false);
      expect(await pfs.exists(`${notebook.dir}/a.md`)).toBe(false);
      expect(
        openNoteAt({ notebookPath: notebook.dir, filePath: "b.md" }),
      ).toBeUndefined();
    } finally {
      release!();
      leaveNote(open, "other");
      close();
    }
  },
);

it("keeps saving to the original path when the file could not be moved", async () => {
  const notebook = await notebookAt("/notebooks/rename-refused");
  await pfs.writeFile(`${notebook.dir}/a.md`, "# A");
  const note = await notebook.getNote("a.md", true);
  const { open, type, close } = openForTyping(notebook, "a.md", note.markdown);
  const refused = new Error("rename refused");
  vi.spyOn(pfs, "rename").mockRejectedValueOnce(refused);
  try {
    await expect(crossnote.changeNoteFilePath(tab, note, "b.md")).rejects.toBe(
      refused,
    );
    type(" kept");
    await open.saver.flush();
    expect(await body(notebook, "a.md")).toBe("# A kept");
    expect(open.saver.pending).toBe(false);
    expect(await pfs.exists(`${notebook.dir}/b.md`)).toBe(false);
  } finally {
    close();
  }
});

it("keeps edits and rejects repeated saves when rename fails after moving the file", async () => {
  const notebook = await notebookAt("/notebooks/rename-partly-failed");
  await pfs.writeFile(`${notebook.dir}/a.md`, "# A");
  const note = await notebook.getNote("a.md", true);
  const { open, type, close } = openForTyping(notebook, "a.md", note.markdown);
  const failed = new Error("tree write refused");
  vi.spyOn(pfs, "storeTree").mockImplementationOnce(async () => {
    type(" kept");
    throw failed;
  });
  try {
    await expect(crossnote.changeNoteFilePath(tab, note, "b.md")).rejects.toBe(
      failed,
    );
    await expect(open.saver.flush()).rejects.toBe(failed);
    type(" more");
    await expect(open.saver.flush()).rejects.toBe(failed);
    expect(open.document.text()).toBe("# A kept more");
    expect(open.saver.pending).toBe(true);
    expect(open.saver.error).toBe(failed);
    expect(await body(notebook, "b.md")).toBe("# A");
    expect(await pfs.exists(`${notebook.dir}/a.md`)).toBe(false);
  } finally {
    open.saver.discard();
    close();
  }
});

it("retains edits when writing the renamed note fails and retries at the new path", async () => {
  const notebook = await notebookAt("/notebooks/rename-new-write-failed");
  await pfs.writeFile(`${notebook.dir}/a.md`, "# A");
  const note = await notebook.getNote("a.md", true);
  const { open, type, close } = openForTyping(notebook, "a.md", note.markdown);
  const move = notebook.changeNoteFilePath.bind(notebook);
  vi.spyOn(notebook, "changeNoteFilePath").mockImplementationOnce(
    async (...args) => {
      const moved = await move(...args);
      type(" kept");
      return moved;
    },
  );
  const refused = new Error("new path write refused");
  vi.spyOn(notebook, "writeNote").mockRejectedValueOnce(refused);
  try {
    await crossnote.changeNoteFilePath(tab, note, "b.md");
    await expect(open.saver.flush()).rejects.toBe(refused);
    expect(open.document.text()).toBe("# A kept");
    expect(open.saver.pending).toBe(true);
    expect(open.saver.location.filePath).toBe("b.md");
    await open.saver.flush();
    expect(await body(notebook, "b.md")).toBe("# A kept");
    expect(await pfs.exists(`${notebook.dir}/a.md`)).toBe(false);
  } finally {
    close();
  }
});

it("does not rename a note whose text cannot be written first", async () => {
  const notebook = await notebookAt("/notebooks/renaming-unwritten");
  await pfs.writeFile(`${notebook.dir}/a.md`, "# A");
  const note = await notebook.getNote("a.md", true);
  const { open, type, close } = openForTyping(notebook, "a.md", note.markdown);
  open.setCalls({
    write: async () => {
      throw new Error("disk full");
    },
    failed: () => {},
  });
  try {
    type(" typed");
    await expect(
      crossnote.changeNoteFilePath(tab, note, "b.md"),
    ).rejects.toBeInstanceOf(NotesNotSavedError);
    expect(await pfs.exists(`${notebook.dir}/a.md`)).toBe(true);
    expect(await pfs.exists(`${notebook.dir}/b.md`)).toBe(false);
  } finally {
    open.saver.discard();
    close();
  }
});

function addUnrenderedTabs(notebook: Notebook) {
  for (const component of ["Note", "Notes", "Graph"] as const) {
    crossnote.addTabNode({
      id: component,
      type: "tab",
      component,
      name: component,
      config: {
        singleton: false,
        component,
        notebookPath: notebook.dir,
        noteFilePath: component === "Note" ? "a.md" : undefined,
      },
    });
  }
  crossnote.addTabNode({
    id: "other",
    type: "tab",
    component: "Notes",
    name: "Other notebook",
    config: {
      singleton: false,
      component: "Notes",
      notebookPath: "/notebooks/other",
    },
  });
}

it("keeps a notebook and its tabs listed when deletion is rejected", async () => {
  const failure = new Error("record still exists");
  const notebook = await notebookAt("/notebooks/delete-rejected", {
    deleteNotebook: async () => {
      throw failure;
    },
  });
  addUnrenderedTabs(notebook);
  await expect(crossnote.deleteNotebook(notebook)).rejects.toBe(failure);
  expect(crossnote.notebooks).toContain(notebook);
  for (const id of ["Note", "Notes", "Graph", "other"]) {
    expect(crossnote.layoutModel.getNodeById(id)).toBeDefined();
  }
});

it("removes even unrendered tabs and reports cleanup failure once the record is gone", async () => {
  resetNotifications();
  const notebook = await notebookAt("/notebooks/delete-committed", {
    deleteNotebook: async () => ({
      cleanupError: new Error("could not clear folder"),
    }),
  });
  addUnrenderedTabs(notebook);
  try {
    await act(() => crossnote.deleteNotebook(notebook));
    expect(crossnote.notebooks).not.toContain(notebook);
    for (const id of ["Note", "Notes", "Graph"]) {
      expect(crossnote.layoutModel.getNodeById(id)).toBeUndefined();
    }
    expect(crossnote.layoutModel.getNodeById("other")).toBeDefined();
    expect(getNotificationState().current?.message).toContain(
      "could not clear folder",
    );
  } finally {
    resetNotifications();
  }
});

it("writes the last edit before unregistering a local notebook", async () => {
  const dir = "/notebooks/delete-local-dirty";
  const remove = vi.fn(async () => {
    expect(await body(notebook, "a.md")).toBe("A kept");
  });
  const notebook = await notebookAt(dir, { deleteNotebook: remove });
  await pfs.writeFile(`${dir}/a.md`, "A");
  const { type, close } = openForTyping(notebook, "a.md", "A");
  try {
    type(" kept");
    await act(() => crossnote.deleteNotebook(notebook));
    expect(remove).toHaveBeenCalledOnce();
    expect(crossnote.notebooks).not.toContain(notebook);
  } finally {
    close();
  }
});
