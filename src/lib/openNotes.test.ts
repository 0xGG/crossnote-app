import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saverOfTab } from "./noteSaver";
import {
  joinNote,
  leaveNote,
  moveNote,
  openNoteAt,
  type OpenNote,
  type OpenNoteCalls,
} from "./openNotes";

const location = { notebookPath: "/notebooks/a", filePath: "note.md" };

function calls() {
  return {
    write: vi.fn<OpenNoteCalls["write"]>(async () => {}),
    failed: vi.fn<OpenNoteCalls["failed"]>(),
  };
}

const views: EditorView[] = [];
const joined: [OpenNote, string][] = [];

function join(
  tabId: string,
  text = "Text",
  its: OpenNoteCalls = calls(),
  at = location,
  lineBreak?: string,
) {
  const note = joinNote(tabId, at, text, its, lineBreak);
  joined.push([note, tabId]);
  return note;
}

// Types at the end of an open note, as an editor of it would.
function type(note: OpenNote, text: string) {
  const view = new EditorView({
    dispatchTransactions: note.document.dispatchTransactions,
    state: EditorState.create({ doc: note.document.doc }),
  });
  views.push(view);
  const detach = note.document.attach(view);
  view.dispatch({
    changes: { from: view.state.doc.length, insert: text },
    userEvent: "input.type",
  });
  detach();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  for (const [note, tabId] of joined.splice(0)) {
    leaveNote(note, tabId);
  }
  for (const view of views.splice(0)) {
    view.destroy();
  }
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe("open notes", () => {
  it("takes a file's line ending even when a stripped body's text has not changed", () => {
    const note = join("tab-1", "Body", calls(), location, "\r\n");
    note.written("external", location, "Body", "\r");
    type(note, "\nNext");
    expect(note.document.text()).toBe("Body\rNext");
  });
  it("gives every tab of a note the one text and the one saver", () => {
    const first = join("tab-1", "Text");
    const second = join("tab-2", "Another text, which the note already has");
    expect(second).toBe(first);
    expect(second.document.text()).toBe("Text");
    expect([...first.saver.tabs]).toEqual(["tab-1", "tab-2"]);
    expect(openNoteAt(location)).toBe(first);
  });

  it("keeps notes at different paths apart", () => {
    const first = join("tab-1");
    const other = join("tab-2", "Other", calls(), {
      ...location,
      filePath: "other.md",
    });
    expect(other).not.toBe(first);
    expect(other.document.text()).toBe("Other");
  });

  it("writes what is typed once, a moment later, as the note's saver", async () => {
    const its = calls();
    const note = join("tab-1", "Text", its);
    join("tab-2", "Text", its);
    type(note, " typed");
    expect(its.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(its.write).toHaveBeenCalledTimes(1);
    const [writer, to, text] = its.write.mock.calls[0];
    expect(writer.getId()).toBe(note.saver.id);
    expect(to).toEqual(location);
    expect(text).toBe("Text typed");
  });

  it("writes nothing for a note that is opened, or takes a text from the file", async () => {
    const its = calls();
    const note = join("tab-1", "Text", its);
    note.document.load("Text from the file");
    await vi.advanceTimersByTimeAsync(1000);
    expect(its.write).not.toHaveBeenCalled();
    expect(note.saver.pending).toBe(false);
  });

  it("calls on the tab that joined last", async () => {
    const first = calls();
    const second = calls();
    const note = join("tab-1", "Text", first);
    join("tab-2", "Text", second);
    type(note, " typed");
    await vi.advanceTimersByTimeAsync(300);
    expect(first.write).not.toHaveBeenCalled();
    expect(second.write).toHaveBeenCalledTimes(1);
  });

  it.each(["reload", "external write"])(
    "settles a %s after an older write without leaving the disk behind the document",
    async (source) => {
      let disk = "O";
      let release: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const its = calls();
      const note = join("tab-1", "O", its);
      its.write.mockImplementation(async (writer, to, text) => {
        if (text === "OA") {
          await gate;
        }
        disk = text;
        note.written(writer.getId(), to, text);
      });
      type(note, "A");
      const saving = note.saver.flush();
      expect(its.write).toHaveBeenCalledTimes(1);
      expect(disk).toBe("O");
      disk = "B";
      if (source === "reload") {
        note.document.load(disk);
        note.saver.took(disk);
      } else {
        note.written("external", location, disk);
      }
      release();
      await saving;
      expect(disk).toBe("B");
      expect(note.document.text()).toBe(disk);
      expect(note.saver.pending).toBe(false);
      expect(its.write.mock.calls.map((call) => call[2])).toEqual(["OA", "B"]);
    },
  );

  it("keeps input after a reload and reports a failed repair until retry succeeds", async () => {
    let disk = "O";
    let release: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const its = calls();
    const note = join("tab-1", "O", its);
    const failure = new Error("disk full");
    its.write.mockImplementationOnce(async () => {
      await gate;
      disk = "OA";
      note.written(note.saver.id, location, disk);
    });
    its.write.mockRejectedValueOnce(failure);
    its.write.mockImplementation(async (writer, to, text) => {
      disk = text;
      note.written(writer.getId(), to, text);
    });
    type(note, "A");
    const saving = note.saver.flush();
    disk = "B";
    note.document.load(disk);
    note.saver.took(disk);
    type(note, "C");
    const failed = expect(saving).rejects.toBe(failure);
    release();
    await failed;
    expect(note.document.text()).toBe("BC");
    expect(disk).toBe("OA");
    expect(note.saver.pending).toBe(true);
    expect(its.failed).toHaveBeenCalledWith(failure);
    await note.saver.flush();
    expect(disk).toBe("BC");
    expect(note.saver.pending).toBe(false);
  });

  it("tells whoever listens once a write has landed", async () => {
    const note = join("tab-1");
    const written = vi.fn();
    const stop = note.onWritten(written);
    type(note, " typed");
    await vi.advanceTimersByTimeAsync(300);
    expect(written).toHaveBeenCalledTimes(1);
    stop();
    type(note, " more");
    await vi.advanceTimersByTimeAsync(300);
    expect(written).toHaveBeenCalledTimes(1);
  });

  it("says a failed write once", async () => {
    const its = calls();
    its.write.mockRejectedValue(new Error("disk full"));
    const note = join("tab-1", "Text", its);
    type(note, " typed");
    await vi.advanceTimersByTimeAsync(300);
    type(note, " more");
    await vi.advanceTimersByTimeAsync(300);
    expect(its.failed).toHaveBeenCalledTimes(1);
    expect(note.saver.pending).toBe(true);
  });

  it("knows its own writes: its saver's, and those of the tabs it is open in", () => {
    const note = join("tab-1");
    join("tab-2");
    expect(note.wrote(note.saver.id)).toBe(true);
    expect(note.wrote("tab-1")).toBe(true);
    expect(note.wrote("tab-2")).toBe(true);
    expect(note.wrote("tab-3")).toBe(false);
  });

  it("takes no text of another note for its own, though a tab of the note wrote it", () => {
    const note = join("tab-1");
    // The settings of a note in this one's list of references, say.
    note.written(
      "tab-1",
      { ...location, filePath: "other.md" },
      "The other note's text",
    );
    expect(note.saver.isOwn("The other note's text")).toBe(false);
    expect(note.document.text()).toBe("Text");
  });

  it("leaves what is typed alone at a write of its own, and takes a text written elsewhere", async () => {
    const its = calls();
    const note = join("tab-1", "Text", its);
    type(note, " typed");
    // Its settings saved from its own tab, with the text the notebook had.
    note.written("tab-1", location, "Text");
    expect(note.document.text()).toBe("Text typed");
    await vi.advanceTimersByTimeAsync(300);
    note.written(note.saver.id, location, "Text typed");
    expect(its.write).toHaveBeenCalledTimes(1);
    // Read again, the notebook brings a text the note had: nothing changes.
    type(note, " more");
    note.written("a list of notes", location, "Text typed");
    expect(note.document.text()).toBe("Text typed more");
    // Another text is the note's from now on, and is not written back.
    await vi.advanceTimersByTimeAsync(300);
    note.written("a list of notes", location, "From elsewhere");
    expect(note.document.text()).toBe("From elsewhere");
    await vi.advanceTimersByTimeAsync(1000);
    expect(its.write).toHaveBeenCalledTimes(2);
  });

  it("writes at once what is typed as the page is hidden", () => {
    const its = calls();
    const note = join("tab-1", "Text", its);
    type(note, " typed");
    window.dispatchEvent(new Event("pagehide"));
    expect(its.write).toHaveBeenCalledTimes(1);
    expect(its.write.mock.calls[0][2]).toBe("Text typed");
  });

  it("stays open, text and all, until its last tab leaves", async () => {
    const its = calls();
    const note = join("tab-1", "Text", its);
    join("tab-2", "Text", its);
    type(note, " typed");
    leaveNote(note, "tab-1");
    expect(note.saver.open).toBe(true);
    expect(openNoteAt(location)).toBe(note);
    expect(its.write).not.toHaveBeenCalled();
    // The last tab leaving writes what is still to be written, at once.
    leaveNote(note, "tab-2");
    expect(note.saver.open).toBe(false);
    expect(openNoteAt(location)).toBeUndefined();
    expect(its.write).toHaveBeenCalledTimes(1);
    expect(its.write.mock.calls[0][2]).toBe("Text typed");
  });

  it("opens the note anew, with the text given, after its last tab has left", () => {
    const first = join("tab-1", "Text");
    leaveNote(first, "tab-1");
    const second = join("tab-2", "Text as the notebook has it now");
    expect(second).not.toBe(first);
    expect(second.document.text()).toBe("Text as the notebook has it now");
  });

  it("is the saver a tab's closing leaves the text to, only for the note's last tab", () => {
    const note = join("tab-1");
    expect(saverOfTab("tab-1")).toBe(note.saver);
    join("tab-2");
    expect(saverOfTab("tab-1")).toBeUndefined();
    expect(saverOfTab("tab-2")).toBeUndefined();
    leaveNote(note, "tab-1");
    expect(saverOfTab("tab-2")).toBe(note.saver);
  });

  it("follows the note to a new path, and writes there", async () => {
    const its = calls();
    const note = join("tab-1", "Text", its);
    const renamed = { ...location, filePath: "renamed.md" };
    moveNote(note, renamed);
    // Told twice, once by each tab of the note: the same.
    moveNote(note, renamed);
    expect(openNoteAt(location)).toBeUndefined();
    expect(openNoteAt(renamed)).toBe(note);
    type(note, " typed");
    await vi.advanceTimersByTimeAsync(300);
    expect(its.write.mock.calls[0][1]).toEqual(renamed);
    // A tab that opens the note at its new path joins it.
    expect(join("tab-2", "Stale", its, renamed)).toBe(note);
  });
});
