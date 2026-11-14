import { NoteDocument } from "../editor/noteDocument";
import { NoteSaver, type NoteLocation } from "./noteSaver";

// The notes open in editors, one entry for each note however many tabs show
// it: the tabs share the note's text, its undo history and the saver that
// writes it. With an editor and a saver to each tab, two tabs of one note
// each wrote the file, and what one took from the other's write replaced
// what was being typed in it.

/** What an open note calls on the app for; set by the tab that last drew. */
export interface OpenNoteCalls {
  /** Writes the text to the notebook; the writer's id names the write. */
  write: (
    writer: { getId(): string },
    location: NoteLocation,
    text: string,
  ) => Promise<void>;
  /** A write failed: said once, until one succeeds. */
  failed: (error: unknown) => void;
}

export class OpenNote {
  readonly document: NoteDocument;
  readonly saver: NoteSaver;
  calls: OpenNoteCalls;
  private readonly writtenListeners = new Set<() => void>();

  constructor(
    tabId: string,
    location: NoteLocation,
    text: string,
    calls: OpenNoteCalls,
    lineBreak?: string,
  ) {
    this.calls = calls;
    this.document = new NoteDocument(text, lineBreak);
    this.saver = new NoteSaver({
      tabId,
      location,
      text: () => this.document.text(),
      write: (to, written) =>
        this.calls.write({ getId: () => this.saver.id }, to, written),
      onWritten: () => {
        for (const listener of [...this.writtenListeners]) {
          listener();
        }
      },
      onFailed: (error) => this.calls.failed(error),
    });
    // The notebook holds this text: nothing to write until it is edited.
    this.saver.took(text);
    // Only what is typed is saved. A text taken from the file is the file's
    // already, and opening a note writes nothing.
    this.document.onChange(({ loaded }) => {
      if (!loaded) {
        this.saver.changed();
      }
    });
  }

  /** Calls back after each write that leaves the notebook with the text. */
  onWritten(listener: () => void): () => void {
    this.writtenListeners.add(listener);
    return () => {
      this.writtenListeners.delete(listener);
    };
  }

  /**
   * Whether a write the app tells of is this note's own: its saver's, or one
   * a tab of the note made itself (its settings, say). The text of such a
   * write is one the note had, not one to take in place of what is typed.
   */
  wrote(writerId: string): boolean {
    return writerId === this.saver.id || this.saver.tabs.has(writerId);
  }

  /**
   * Answers a write the app tells of. One of another note is none of this
   * note's, whoever made it: a tab of this note writes other notes too (the
   * settings of a note in its list of references), and that text taken for
   * one this note had would let a later text of the note's own replace what
   * is typed. The note's own write leaves what is typed alone. A write from
   * elsewhere with a text the saver knows changes nothing in the editors;
   * another text is taken in place of theirs.
   */
  written(
    writerId: string,
    location: NoteLocation,
    text: string,
    lineBreak?: string,
  ) {
    if (
      location.notebookPath !== this.saver.location.notebookPath ||
      location.filePath !== this.saver.location.filePath
    ) {
      return;
    }
    if (this.wrote(writerId)) {
      this.saver.wrote(text);
      return;
    }
    if (!this.saver.isOwn(text) || this.document.text() === text) {
      this.document.load(text, lineBreak);
    }
    this.saver.took(text);
  }
}

const open = new Map<string, OpenNote>();

const keyOf = ({ notebookPath, filePath }: NoteLocation) =>
  `${notebookPath}\n${filePath}`;

/**
 * The open note at a location, for a tab that is to show it: the one other
 * tabs already share, or a new one holding the text given.
 */
export function joinNote(
  tabId: string,
  location: NoteLocation,
  text: string,
  calls: OpenNoteCalls,
  lineBreak?: string,
): OpenNote {
  const key = keyOf(location);
  const existing = open.get(key);
  if (existing?.saver.open) {
    existing.saver.tabs.add(tabId);
    existing.calls = calls;
    return existing;
  }
  const note = new OpenNote(tabId, location, text, calls, lineBreak);
  open.set(key, note);
  return note;
}

/**
 * A tab stops showing a note. With the last tab gone the note's saver writes
 * what is left to write and the note is no longer open.
 */
export function leaveNote(note: OpenNote, tabId: string) {
  note.saver.tabs.delete(tabId);
  if (note.saver.tabs.size > 0) {
    return;
  }
  note.saver.dispose();
  for (const [key, value] of open) {
    if (value === note) {
      open.delete(key);
    }
  }
}

/** The note has a new path: its saver writes there from now on. */
export function moveNote(note: OpenNote, location: NoteLocation) {
  const key = keyOf(location);
  if (open.get(key) === note) {
    return;
  }
  for (const [old, value] of open) {
    if (value === note) {
      open.delete(old);
    }
  }
  note.saver.moveTo(location);
  if (note.saver.open) {
    open.set(key, note);
  }
}

/** The open note at a location, if a tab shows one. */
export function openNoteAt(location: NoteLocation): OpenNote | undefined {
  return open.get(keyOf(location));
}

// Asks before the page is left while anything typed may not be written yet:
// a write started as the page reloads seldom lands before it is gone (none
// of five in a measurement; four or five of five as the page is closed).
// Written as the page is hidden as well, in case it is not coming back.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    for (const note of open.values()) {
      if (note.saver.pending) {
        event.preventDefault();
        // Older browsers ask only when this is set.
        event.returnValue = "";
        return;
      }
    }
  });
  const writeAll = () => {
    for (const note of open.values()) {
      note.saver.flush().catch(() => {});
    }
  };
  window.addEventListener("pagehide", writeAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      writeAll();
    }
  });
}
