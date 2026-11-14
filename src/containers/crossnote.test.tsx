import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { TabNode } from "flexlayout-react";
import moment from "moment";
import React, { act, useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import type Crossnote from "../lib/crossnote";
import { pfs } from "../lib/fs";
import type { Note } from "../lib/note";
import { Notebook } from "../lib/notebook";
import { NoteSaver, NotesNotSavedError } from "../lib/noteSaver";
import { getNotificationState, resetNotifications } from "../lib/notifications";
import { joinNote, leaveNote, openNoteAt } from "../lib/openNotes";
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
  const open = joinNote("tab", location, text, {
    write: (writer, to, written) =>
      crossnote.updateNoteMarkdown(
        writer,
        to.notebookPath,
        to.filePath,
        written,
      ),
    failed: () => {},
  });
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
  return { open, type, close: () => leaveNote(open, "tab") };
}

// The text of a stored note, less the front matter a save puts before it.
const body = async (notebook: Notebook, fileName: string) =>
  ((await read(notebook, fileName)) as string).replace(
    /^---\n(?:.*\n)*?---\n/,
    "",
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
    const { open, type, close } = openForTyping(
      notebook,
      "a.md",
      note.markdown,
    );
    if (tabs === 2) {
      joinNote("other", open.saver.location, note.markdown, open.calls);
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
  open.calls = {
    write: async () => {
      throw new Error("disk full");
    },
    failed: () => {},
  };
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
