import path from "path-browserify";
import { pfs } from "./fs";
import { sameNoteText } from "./notebook";
import {
  pendingNoteEdits,
  pendingNoteWrites,
  type NoteWriteScope,
} from "./noteWrites";

// Where a note is: the notebook's folder and the note's path in it.
export interface NoteLocation {
  notebookPath: string;
  filePath: string;
}

export interface NoteSaverOptions {
  // The tab the note's first editor is in. A note open in more tabs has one
  // saver, which the others join (tabs).
  tabId: string;
  location: NoteLocation;
  // The text the editor holds now.
  text: () => string;
  // Writes text to the note at location; rejects when it cannot.
  write: (location: NoteLocation, text: string) => Promise<void>;
  // How long after the last change the text is written.
  delay?: number;
  // A write this saver started last went through.
  onWritten?: () => void;
  // The write started last failed: said once, and not again until a write
  // that is still the last one started when it settles goes through.
  onFailed?: (error: unknown) => void;
  // The closed editor can release its document once written or discarded.
  onReleased?: () => void;
}

// Thrown by flushNotes when a note it waited on could not be written.
export class NotesNotSavedError extends Error {
  constructor(
    readonly locations: NoteLocation[],
    readonly errors: unknown[],
  ) {
    super(
      `Could not save ${locations.map((location) => location.filePath).join(", ")}`,
    );
    this.name = "NotesNotSavedError";
  }
}

const savers = new Set<NoteSaver>();
let made = 0;

/**
 * Keeps one note editor's text on its way to the notebook: writes it a moment
 * after the last change, or at once when asked, and remembers which texts are
 * its own. The notebook, read again, brings back the text the editor last had
 * from it or gave it, or the text of the write started last, whenever nothing
 * else has changed the note meanwhile; putting that in the editor would drop
 * whatever was typed since and send the caret to the start. Once the editor
 * has taken text from elsewhere, those two no longer stand for what it holds.
 *
 * Writes go one at a time, in the order started: two writes of a note at once
 * could land in either order, the older text last.
 *
 * Each saver is listed while it lives, and after it is disposed or discarded
 * until its writes succeed or it is discarded, so whatever changes notes
 * behind the editors' backs (git, printing from storage) can write them out
 * first through flushNotes.
 */
export class NoteSaver {
  location: NoteLocation;
  // The tabs the note is open in; the saver is theirs together.
  readonly tabs = new Set<string>();
  // What the saver's own writes are known by, whichever tabs come and go.
  readonly id: string;

  private options: NoteSaverOptions;
  private delay: number;
  private synced: string | null = null;
  private saving: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;
  private renaming: Promise<void> | null = null;
  // Writes wait only on the move itself, after the old-path writes finish.
  // A move that partly succeeded stays rejected until the note is discarded.
  private moving: Promise<void> | null = null;
  private writes = 0;
  private failed = false;
  private lastError: unknown = null;
  private disposed = false;
  // Discarded: what its writes still going bring no longer counts.
  private dropped = false;

  constructor(options: NoteSaverOptions) {
    this.options = options;
    this.tabs.add(options.tabId);
    this.id = `note-saver-${++made}`;
    this.location = options.location;
    this.delay = options.delay ?? 300;
    savers.add(this);
  }

  /** Whether some of the editor's text may not be in the notebook yet. */
  get pending(): boolean {
    return (
      this.renaming !== null ||
      this.timer !== null ||
      this.writing !== null ||
      this.failed
    );
  }

  /** Why the write started last failed, until one goes through. */
  get error(): unknown {
    return this.failed ? this.lastError : null;
  }

  /** The last text accepted from, or successfully written to, the file. */
  get savedText(): string | null {
    return this.synced;
  }

  /** Whether the editor is still there: not disposed or discarded. */
  get open(): boolean {
    return !this.disposed;
  }

  join(tabId: string) {
    this.disposed = false;
    this.tabs.add(tabId);
  }

  /** The editor's text changed: write it once it has stayed so a moment. */
  changed() {
    if (this.disposed) {
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.start();
    }, this.delay);
  }

  /**
   * Writes now whatever the editor holds that is not in the notebook yet,
   * trying again after a write that failed, and settles once the last write
   * has, including what is typed while it waits. Rejects with that write's
   * error when it fails.
   */
  async flush(): Promise<void> {
    do {
      if (this.renaming !== null) {
        await this.renaming;
      }
      await this.flushWrites();
      await Promise.all(
        pendingNoteWrites(this.location).map((entry) => entry.done),
      );
    } while (
      this.renaming !== null ||
      this.timer !== null ||
      this.writing !== null ||
      pendingNoteWrites(this.location).length > 0
    );
  }

  private async flushWrites(): Promise<void> {
    if (this.timer === null && this.writing === null && this.failed) {
      this.start();
    }
    while (this.timer !== null || this.writing !== null) {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
        this.start();
      }
      await this.writing.catch(() => {});
    }
    if (this.failed) {
      throw this.lastError;
    }
  }

  /** Whether text read back from the notebook is one this saver knows. */
  isOwn(text: string): boolean {
    return [this.synced, this.saving].some(
      (own) => own !== null && sameNoteText(text, own),
    );
  }

  /** The editor now holds text from the notebook: the note as it is there. */
  took(text: string) {
    this.synced = text;
    this.saving = null;
    // An older write may still land after this read. Put the document now
    // accepted (or anything typed after it) behind that write. A plain load
    // with no write in flight still writes nothing.
    if (this.writing !== null) {
      this.changed();
    }
  }

  /** The notebook now holds text this saver wrote, as it came back. */
  wrote(text: string) {
    this.synced = text;
  }

  /** A confirmed write to disk and the index supersedes the failed autosave. */
  resolved(text: string) {
    this.synced = text;
    this.saving = null;
    this.failed = false;
    this.lastError = null;
  }

  /** The note moved: write to it where it is now. */
  moveTo(location: NoteLocation) {
    this.location = location;
  }

  /**
   * Keeps saving and closing behind a rename, including its path migration.
   * The callback reports when the file has actually moved: a failure after
   * that point cannot be retried as a successful write to the old path.
   */
  rename<T>(move: (moved: () => void) => Promise<T>): Promise<T> {
    const ready =
      this.renaming === null
        ? this.flushWrites()
        : this.renaming.then(() => this.flushWrites());
    const rename = ready.then(() => {
      let moved = false;
      const operation = move(() => {
        moved = true;
      });
      this.moving = operation.then(() => {});
      this.moving.catch(() => {});
      return operation.then(
        (result) => {
          this.moving = null;
          return result;
        },
        (error) => {
          if (moved) {
            this.failed = true;
            this.lastError = error;
          } else {
            this.moving = null;
          }
          throw error;
        },
      );
    });
    const waiting = rename.then(() => {});
    this.renaming = waiting;
    waiting
      .catch(() => {})
      .then(() => {
        if (this.renaming === waiting) {
          this.renaming = null;
        }
      });
    return rename;
  }

  /**
   * The editor goes away: write out what it held and keep it available for
   * retry if that fails. The closed editor no longer reports the result.
   */
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.start();
    }
    this.releaseIfDone();
  }

  /**
   * The editor goes away, and what it held that was not written with it. A
   * write still going settles unheard: the user let the note go.
   */
  discard() {
    this.disposed = true;
    this.dropped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.failed = false;
    this.options.onReleased?.();
    this.releaseIfDone();
  }

  private releaseIfDone() {
    if (this.disposed && this.writing === null && !this.failed) {
      savers.delete(this);
      if (!this.dropped) this.options.onReleased?.();
    }
  }

  private start() {
    const text = this.options.text();
    this.saving = text;
    const write = ++this.writes;
    // Started now when no write is going, else once the last one settles;
    // either way to where the note is as it starts.
    const writeHere = () => this.options.write(this.location, text);
    const run = () =>
      this.moving === null ? writeHere() : this.moving.then(writeHere);
    const before = this.writing;
    const writing = (
      before === null ? run() : before.catch(() => {}).then(run)
    ).then(
      () => {
        // Only the write started last tells: one started before it settles
        // while the newer one waits its turn.
        if (write === this.writes) {
          this.failed = false;
          this.lastError = null;
          if (!this.disposed) this.options.onWritten?.();
        }
      },
      (error) => {
        if (write !== this.writes || this.dropped) {
          return;
        }
        if (!this.failed && !this.disposed) {
          this.options.onFailed?.(error);
        }
        this.failed = true;
        this.lastError = error;
        throw error;
      },
    );
    this.writing = writing;
    writing
      .catch(() => {})
      .then(() => {
        if (this.writing === writing) {
          this.writing = null;
          this.releaseIfDone();
        }
      });
  }
}

/**
 * The saver of the note open in a tab, if the tab is the only one the note
 * is open in: closing it is then what leaves the note's text to the saver
 * alone. A note open in another tab as well stays there, text and all. A
 * saver the tab had before, still writing what it held, is not it.
 */
export function saverOfTab(tabId: string): NoteSaver | undefined {
  for (const saver of savers) {
    if (saver.open && saver.tabs.size === 1 && saver.tabs.has(tabId)) {
      return saver;
    }
  }
}

export function saverOfWriter(writerId: string): NoteSaver | undefined {
  return [...savers].find((saver) => saver.id === writerId);
}

// A tab closed during a Git operation still has a saver until its queued
// write settles. Move those writers along with any visible editor.
export function moveNoteSavers(from: NoteLocation, to: NoteLocation) {
  for (const saver of savers) {
    if (
      saver.location.notebookPath === from.notebookPath &&
      saver.location.filePath === from.filePath
    )
      saver.moveTo(to);
  }
}

/**
 * Writes the pending edits in the selected scope. Rejects with a
 * NotesNotSavedError naming the notes that could not be written, once the
 * others have been.
 */
export async function flushNotes(where: NoteWriteScope): Promise<void> {
  do {
    await flushNoteBatch(where);
  } while (pendingNoteWrites(where).length > 0);
}

// First let already accepted file inputs reach their editors. Text and
// attributes can then finish through the existing savers and write queue.
export async function flushNotebookEdits(
  notebookPath: string,
  onlyFile?: string,
  ready?: Promise<void>,
): Promise<void> {
  const dir = path.resolve(notebookPath);
  async function inExport<T extends { location: NoteLocation }>(entries: T[]) {
    const paths = await Promise.all(
      entries.map(async (entry) => {
        const filePath = await pfs.filePathInNotebook(
          dir,
          path.resolve(entry.location.notebookPath),
          entry.location.filePath,
        );
        return filePath === null ||
          (onlyFile !== undefined && onlyFile !== filePath)
          ? null
          : { ...entry, location: { notebookPath, filePath } };
      }),
    );
    return paths.filter((entry) => entry !== null);
  }

  // Capture writes before looking up paths. A settled write leaves the queue.
  await Promise.all([
    inExport(pendingNoteEdits()).then(waitForNoteWrites),
    ready,
  ]);

  const editors = [...savers]
    .filter((saver) => saver.pending)
    .map((saver) => ({ location: saver.location, save: () => saver.flush() }));
  const [chosen, queued] = await Promise.all([
    inExport(editors),
    inExport(pendingNoteWrites()),
  ]);
  await waitForNoteWrites([
    ...chosen.map(({ location, save }) => ({ location, done: save() })),
    ...queued,
  ]);
  let writes = await inExport(pendingNoteWrites());
  while (writes.length) {
    await waitForNoteWrites(writes);
    writes = await inExport(pendingNoteWrites());
  }
}

function flushNoteBatch(where: NoteWriteScope): Promise<void> {
  const chosen = [...savers].filter(({ location }) => {
    return (
      location.notebookPath === where.notebookPath &&
      (where.filePath === undefined || location.filePath === where.filePath)
    );
  });
  const pending = pendingNoteWrites(where);
  return waitForNoteWrites([
    ...chosen.map((saver) => ({
      location: saver.location,
      done: saver.flush(),
    })),
    ...pending,
  ]);
}

async function waitForNoteWrites(
  pending: { location: NoteLocation; done: Promise<unknown> }[],
) {
  const results = await Promise.allSettled(pending.map(({ done }) => done));
  const failed = results.flatMap((result, i) =>
    result.status === "rejected"
      ? [{ location: pending[i].location, cause: result.reason }]
      : [],
  );
  if (failed.length > 0) {
    throw new NotesNotSavedError(
      failed.map(({ location }) => location),
      failed.map(({ cause }) => cause),
    );
  }
}
