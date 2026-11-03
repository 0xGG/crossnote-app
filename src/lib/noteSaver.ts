import { sameNoteText } from "./notebook";

// Where a note is: the notebook's folder and the note's path in it.
export interface NoteLocation {
  notebookPath: string;
  filePath: string;
}

export interface NoteSaverOptions {
  // The tab the editor is in.
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
 * until its writes have settled, so that whatever is about to change notes
 * behind the editors' backs (git, printing from storage) can write them out
 * first through flushNotes.
 */
export class NoteSaver {
  location: NoteLocation;
  readonly tabId: string;

  private options: NoteSaverOptions;
  private delay: number;
  private synced: string | null = null;
  private saving: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;
  private writes = 0;
  private failed = false;
  private lastError: unknown = null;
  private disposed = false;
  // Discarded: what its writes still going bring no longer counts.
  private dropped = false;

  constructor(options: NoteSaverOptions) {
    this.options = options;
    this.tabId = options.tabId;
    this.location = options.location;
    this.delay = options.delay ?? 300;
    savers.add(this);
  }

  /** Whether some of the editor's text may not be in the notebook yet. */
  get pending(): boolean {
    return this.timer !== null || this.writing !== null || this.failed;
  }

  /** Why the write started last failed, until one goes through. */
  get error(): unknown {
    return this.failed ? this.lastError : null;
  }

  /** Whether the editor is still there: not disposed or discarded. */
  get open(): boolean {
    return !this.disposed;
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
  }

  /** The notebook now holds text this saver wrote, as it came back. */
  wrote(text: string) {
    this.synced = text;
  }

  /** The note moved: write to it where it is now. */
  moveTo(location: NoteLocation) {
    this.location = location;
  }

  /**
   * The editor goes away: write out what it held, then leave the list. A
   * write that fails is not said: no editor is left to say it in.
   */
  dispose() {
    if (this.disposed) {
      return;
    }
    this.options.onFailed = undefined;
    this.options.onWritten = undefined;
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.start();
    }
    this.leaveOnceWritten();
  }

  /**
   * The editor goes away, and what it held that was not written with it. A
   * write still going settles unheard: the user let the note go.
   */
  discard() {
    this.options.onFailed = undefined;
    this.options.onWritten = undefined;
    this.disposed = true;
    this.dropped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.failed = false;
    this.leaveOnceWritten();
  }

  private leaveOnceWritten() {
    const writing = this.writing;
    if (writing === null) {
      savers.delete(this);
      return;
    }
    writing
      .catch(() => {})
      .then(() => {
        if (this.writing === null || this.writing === writing) {
          savers.delete(this);
        }
      });
  }

  private start() {
    const text = this.options.text();
    this.saving = text;
    const write = ++this.writes;
    // Started now when no write is going, else once the last one settles;
    // either way to where the note is as it starts.
    const run = () => this.options.write(this.location, text);
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
          this.options.onWritten?.();
        }
      },
      (error) => {
        if (write !== this.writes || this.dropped) {
          return;
        }
        if (!this.failed) {
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
        }
      });
  }
}

/**
 * The saver of the note editor open in a tab, if the tab has one. One the
 * tab had before, still writing what it held, is not it.
 */
export function saverOfTab(tabId: string): NoteSaver | undefined {
  for (const saver of savers) {
    if (saver.tabId === tabId && saver.open) {
      return saver;
    }
  }
}

/**
 * Writes out what the note editors open in a notebook, or on one note of it,
 * hold that is not in it yet. Rejects with a NotesNotSavedError naming the
 * notes that could not be written, once the others have been.
 */
export async function flushNotes(where: {
  notebookPath: string;
  filePath?: string;
}): Promise<void> {
  const chosen = [...savers].filter(
    (saver) =>
      saver.location.notebookPath === where.notebookPath &&
      (where.filePath === undefined ||
        saver.location.filePath === where.filePath),
  );
  const results = await Promise.allSettled(
    chosen.map((saver) => saver.flush()),
  );
  const failed = results
    .map((result, i) => ({ result, saver: chosen[i] }))
    .filter(({ result }) => result.status === "rejected");
  if (failed.length > 0) {
    throw new NotesNotSavedError(
      failed.map(({ saver }) => saver.location),
      failed.map(({ result }) => (result as PromiseRejectedResult).reason),
    );
  }
}
