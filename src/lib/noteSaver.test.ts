import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushNotes,
  NoteLocation,
  NoteSaver,
  NotesNotSavedError,
  saverOfTab,
} from "./noteSaver";

// A write the test settles by hand, in whatever order it likes.
interface Write {
  location: NoteLocation;
  text: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

// An editor's text, and the writes its saver starts, held until settled.
function editor(
  location: NoteLocation = { notebookPath: "/n", filePath: "a.md" },
) {
  const state = { text: "", writes: [] as Write[] };
  const onWritten = vi.fn();
  const onFailed = vi.fn();
  const saver = new NoteSaver({
    tabId: `tab-${location.filePath}`,
    location,
    text: () => state.text,
    write: (location, text) =>
      new Promise<void>((resolve, reject) => {
        const write = { location, text, resolve, reject };
        state.writes.push(write);
        started.push(write);
      }),
    onWritten,
    onFailed,
  });
  made.push(saver);
  return {
    saver,
    onWritten,
    onFailed,
    get writes() {
      return state.writes;
    },
    type(text: string) {
      state.text = text;
      saver.changed();
    },
  };
}

// Lets the promises settled so far run their callbacks.
const settle = () => vi.advanceTimersByTimeAsync(0);

let made: NoteSaver[] = [];
let started: Write[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  // The list of savers is the module's own; none outlives its test. A saver
  // leaves it once its last write has settled.
  for (const saver of made) {
    saver.discard();
  }
  for (const write of started) {
    write.reject(new Error("Test over"));
  }
  await settle();
  made = [];
  started = [];
  vi.useRealTimers();
});

describe("NoteSaver", () => {
  it("writes the text once it has stayed the same for a moment", async () => {
    const note = editor();
    note.type("a");
    await vi.advanceTimersByTimeAsync(200);
    note.type("ab");
    await vi.advanceTimersByTimeAsync(299);
    expect(note.writes).toHaveLength(0);
    expect(note.saver.pending).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(note.writes.map((write) => write.text)).toEqual(["ab"]);
    expect(note.saver.pending).toBe(true);

    note.writes[0].resolve();
    await settle();
    expect(note.saver.pending).toBe(false);
    expect(note.onWritten).toHaveBeenCalledTimes(1);
  });

  it("writes at once what is waiting when flushed, and settles once it is written", async () => {
    const note = editor();
    note.type("typed");
    let flushed = false;
    const flushing = note.saver.flush().then(() => (flushed = true));
    expect(note.writes.map((write) => write.text)).toEqual(["typed"]);
    await settle();
    expect(flushed).toBe(false);

    note.writes[0].resolve();
    await flushing;
    expect(note.saver.pending).toBe(false);
    // The moment passing writes nothing more.
    await vi.advanceTimersByTimeAsync(1000);
    expect(note.writes).toHaveLength(1);
  });

  it("waits, when flushed, for a write already going and for one a change starts meanwhile", async () => {
    const note = editor();
    note.type("first");
    await vi.advanceTimersByTimeAsync(300);
    let flushed = false;
    const flushing = note.saver.flush().then(() => (flushed = true));
    note.type("second");
    await vi.advanceTimersByTimeAsync(300);

    note.writes[0].resolve();
    await settle();
    expect(note.writes.map((write) => write.text)).toEqual(["first", "second"]);
    expect(flushed).toBe(false);
    note.writes[1].resolve();
    await flushing;
  });

  // Typed while a flush waits on a write, as a tab being closed or a pull
  // starting does: written before the flush settles, not a moment after.
  it("waits, when flushed, for a change made while it waits", async () => {
    const note = editor();
    note.type("first");
    let flushed = false;
    const flushing = note.saver.flush().then(() => (flushed = true));
    note.type("second");
    note.writes[0].resolve();
    await settle();
    expect(flushed).toBe(false);
    expect(note.writes.map((write) => write.text)).toEqual(["first", "second"]);
    note.writes[1].resolve();
    await flushing;
    expect(note.saver.pending).toBe(false);
  });

  // Two writes of a note at once can land in either order; a write waits
  // for the one before it.
  it("starts a write only once the one before it has settled", async () => {
    const note = editor();
    note.type("first");
    await vi.advanceTimersByTimeAsync(300);
    note.type("second");
    const flushing = note.saver.flush();
    await settle();
    expect(note.writes.map((write) => write.text)).toEqual(["first"]);
    note.writes[0].reject(new Error("Disk full"));
    await settle();
    expect(note.writes.map((write) => write.text)).toEqual(["first", "second"]);
    note.writes[1].resolve();
    await flushing;
  });

  it("flushes nothing when everything is written", async () => {
    const note = editor();
    await note.saver.flush();
    expect(note.writes).toHaveLength(0);
  });

  it("says once that a write failed, keeps saying it is pending, and writes again when flushed", async () => {
    const note = editor();
    const full = new Error("Disk full");
    note.type("one");
    await vi.advanceTimersByTimeAsync(300);
    note.writes[0].reject(full);
    await settle();
    expect(note.onFailed).toHaveBeenCalledWith(full);
    expect(note.saver.pending).toBe(true);
    expect(note.saver.error).toBe(full);

    // Failing again is not said again.
    note.type("one two");
    await vi.advanceTimersByTimeAsync(300);
    note.writes[1].reject(full);
    await settle();
    expect(note.onFailed).toHaveBeenCalledTimes(1);

    // Flushed, it tries again, and rejects as the write does.
    const flushing = note.saver.flush();
    expect(note.writes.map((write) => write.text)).toEqual([
      "one",
      "one two",
      "one two",
    ]);
    note.writes[2].reject(full);
    await expect(flushing).rejects.toBe(full);

    // Once one goes through, the next failure is said again.
    const again = note.saver.flush();
    note.writes[3].resolve();
    await again;
    expect(note.saver.pending).toBe(false);
    expect(note.saver.error).toBeNull();
    note.type("one two three");
    await vi.advanceTimersByTimeAsync(300);
    note.writes[4].reject(full);
    await settle();
    expect(note.onFailed).toHaveBeenCalledTimes(2);
  });

  // Two saves on their way: the one started first settles while the other
  // waits to start.
  it("says nothing of a write that fails once a newer one is on its way", async () => {
    const note = editor();
    note.type("one");
    await vi.advanceTimersByTimeAsync(300);
    note.type("one two");
    await vi.advanceTimersByTimeAsync(300);
    note.writes[0].reject(new Error("Disk full"));
    await settle();
    expect(note.onFailed).not.toHaveBeenCalled();
    expect(note.saver.error).toBeNull();
    note.writes[1].resolve();
    await settle();
    expect(note.saver.pending).toBe(false);
  });

  it("goes by the newer write when an older one goes through first", async () => {
    const note = editor();
    const full = new Error("Disk full");
    note.type("one");
    await vi.advanceTimersByTimeAsync(300);
    note.type("one two");
    await vi.advanceTimersByTimeAsync(300);
    note.writes[0].resolve();
    await settle();
    expect(note.onWritten).not.toHaveBeenCalled();
    expect(note.saver.pending).toBe(true);
    note.writes[1].reject(full);
    await settle();
    expect(note.saver.error).toBe(full);
    expect(note.onFailed).toHaveBeenCalledTimes(1);
  });

  it("knows the text it was given and the text it wrote last, as the notebook brings them back", async () => {
    const note = editor();
    note.saver.took("opened");
    expect(note.saver.isOwn("opened")).toBe(true);

    note.type("typed");
    await vi.advanceTimersByTimeAsync(300);
    // Read back before the write has come back.
    expect(note.saver.isOwn("typed")).toBe(true);
    expect(note.saver.isOwn("opened")).toBe(true);
    note.writes[0].resolve();
    note.saver.wrote("typed");
    expect(note.saver.isOwn("typed")).toBe(true);
    expect(note.saver.isOwn("elsewhere")).toBe(false);
  });

  it("knows its text with settings typed into the front matter that the notebook keeps apart", () => {
    const note = editor();
    note.saver.took("---\npinned: true\ncolor: red\n---\nBody");
    expect(note.saver.isOwn("---\ncolor: red\n---\nBody")).toBe(true);
  });

  // The notebook read again replaces the editor's text with a change made
  // elsewhere, and then again, within the moment, with the text this editor
  // wrote last: that is no longer the editor's own, and has to go in.
  it("no longer knows the text it wrote once it has taken text from elsewhere", async () => {
    const note = editor();
    note.type("mine");
    await vi.advanceTimersByTimeAsync(300);
    note.writes[0].resolve();
    note.saver.wrote("mine");
    await settle();

    note.saver.took("theirs");
    expect(note.saver.isOwn("mine")).toBe(false);
    expect(note.saver.isOwn("theirs")).toBe(true);
  });

  it("writes to where the note has moved", async () => {
    const note = editor();
    note.type("typed");
    note.saver.moveTo({ notebookPath: "/n", filePath: "moved.md" });
    await vi.advanceTimersByTimeAsync(300);
    expect(note.writes[0].location).toEqual({
      notebookPath: "/n",
      filePath: "moved.md",
    });
  });

  // A write waiting its turn behind a slow one while the note is renamed.
  it("writes a waiting write to where the note is when its turn comes", async () => {
    const note = editor();
    note.type("one");
    await vi.advanceTimersByTimeAsync(300);
    note.type("one two");
    await vi.advanceTimersByTimeAsync(300);
    note.saver.moveTo({ notebookPath: "/n", filePath: "moved.md" });
    note.writes[0].resolve();
    await settle();
    expect(note.writes.map((write) => write.location.filePath)).toEqual([
      "a.md",
      "moved.md",
    ]);
  });

  it("writes at once what is waiting as it is disposed, and is waited for until written", async () => {
    const note = editor();
    note.type("last words");
    note.saver.dispose();
    expect(note.writes.map((write) => write.text)).toEqual(["last words"]);
    expect(note.saver.open).toBe(false);

    let flushed = false;
    const flushing = flushNotes({ notebookPath: "/n" }).then(
      () => (flushed = true),
    );
    await settle();
    expect(flushed).toBe(false);
    note.writes[0].reject(new Error("Disk full"));
    await expect(flushing).rejects.toBeInstanceOf(NotesNotSavedError);
    // Not said: no editor is left to say it in.
    expect(note.onFailed).not.toHaveBeenCalled();
    // Out of the list once its write has settled.
    await expect(flushNotes({ notebookPath: "/n" })).resolves.toBeUndefined();

    note.type("after");
    await vi.advanceTimersByTimeAsync(300);
    expect(note.writes).toHaveLength(1);
  });

  // A tab's editor made again, as its panel is, while the one before is
  // still writing what it held.
  it("is the tab's saver only while open", () => {
    const before = editor();
    before.type("before");
    before.saver.dispose();
    expect(saverOfTab("tab-a.md")).toBeUndefined();
    const now = editor();
    expect(saverOfTab("tab-a.md")).toBe(now.saver);
  });

  // Discarded while a write it tried again is still going, as when the page
  // was hidden while the close dialog was open: what that write brings is
  // not said, and git is not held up by a note the user let go.
  it("says nothing of a write still going once discarded", async () => {
    const note = editor();
    const full = new Error("Disk full");
    note.type("one");
    await vi.advanceTimersByTimeAsync(300);
    note.writes[0].reject(full);
    await settle();
    expect(note.onFailed).toHaveBeenCalledTimes(1);
    note.saver.flush().catch(() => {});
    expect(note.writes).toHaveLength(2);

    note.saver.discard();
    const flushing = flushNotes({ notebookPath: "/n" });
    note.writes[1].reject(full);
    await expect(flushing).resolves.toBeUndefined();
    expect(note.onFailed).toHaveBeenCalledTimes(1);
    expect(note.saver.pending).toBe(false);
    expect(note.saver.error).toBeNull();
  });

  it("writes nothing more once discarded", async () => {
    const note = editor();
    note.type("dropped");
    note.saver.discard();
    await vi.advanceTimersByTimeAsync(1000);
    expect(note.writes).toHaveLength(0);
    expect(note.saver.pending).toBe(false);
    expect(saverOfTab("tab-a.md")).toBeUndefined();
  });
});

describe("flushNotes", () => {
  it("writes the notes open in a notebook, or one note of it, and no others", async () => {
    const a = editor({ notebookPath: "/n", filePath: "a.md" });
    const b = editor({ notebookPath: "/n", filePath: "b.md" });
    const other = editor({ notebookPath: "/other", filePath: "a.md" });
    for (const note of [a, b, other]) {
      note.type("typed");
    }

    const one = flushNotes({ notebookPath: "/n", filePath: "b.md" });
    expect([a, b, other].map((note) => note.writes.length)).toEqual([0, 1, 0]);
    b.writes[0].resolve();
    await one;

    const all = flushNotes({ notebookPath: "/n" });
    expect([a, b, other].map((note) => note.writes.length)).toEqual([1, 1, 0]);
    a.writes[0].resolve();
    await all;
  });

  it("names the notes it could not write, once the others are written", async () => {
    const a = editor({ notebookPath: "/n", filePath: "a.md" });
    const b = editor({ notebookPath: "/n", filePath: "b.md" });
    a.type("typed");
    b.type("typed");
    const full = new Error("Disk full");

    let failure: unknown;
    const flushing = flushNotes({ notebookPath: "/n" }).catch(
      (error) => (failure = error),
    );
    a.writes[0].reject(full);
    await settle();
    expect(failure).toBeUndefined();
    b.writes[0].resolve();
    await flushing;
    expect(failure).toBeInstanceOf(NotesNotSavedError);
    expect((failure as NotesNotSavedError).locations).toEqual([
      { notebookPath: "/n", filePath: "a.md" },
    ]);
    expect((failure as NotesNotSavedError).errors).toEqual([full]);
  });
});
