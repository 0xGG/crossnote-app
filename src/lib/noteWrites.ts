import path from "path-browserify";
import type { NoteLocation } from "./noteSaver";
import { assertNotebookWritable, notebookOperation } from "./notebookOperation";

type Pending = { location: NoteLocation; done: Promise<unknown> };
export type NoteWriteScope = { notebookPath: string; filePath?: string };
const writes = new Map<string, Pending[]>();
const insertions = new Set<Pending>();

// File inputs can still be reading or writing the attachment before sending
// the change to the note saver.
export function trackNoteInsertion(
  location: NoteLocation,
  done: Promise<void>,
) {
  const entry = { location, done };
  insertions.add(entry);
  const forget = () => insertions.delete(entry);
  void done.then(forget, forget);
}

export function pendingNoteEdits() {
  return [...insertions, ...[...writes.values()].flat()];
}

// Both settings and text replace the whole file. Read their inputs only
// after the previous operation has settled, including staging and storeTree.
export function writeNoteOperation<T>(
  location: NoteLocation,
  operation: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(location.notebookPath, location.filePath);
  const queued = writes.get(key) ?? [];
  const previous = queued.at(-1)?.done;
  const done = (previous ? previous.catch(() => {}) : Promise.resolve()).then(
    () =>
      notebookOperation(location.notebookPath, async () => {
        assertNotebookWritable(location.notebookPath);
        return operation();
      }),
  );
  const entry = { location, done };
  queued.push(entry);
  writes.set(key, queued);
  done
    .finally(() => {
      queued.splice(queued.indexOf(entry), 1);
      if (!queued.length) writes.delete(key);
    })
    .catch(() => {});
  return done;
}

export function pendingNoteWrites(where?: NoteWriteScope): Pending[] {
  return [...writes.values()]
    .map((queue) => queue[queue.length - 1])
    .filter(({ location }) => {
      if (!where) return true;
      return (
        path.resolve(location.notebookPath) ===
          path.resolve(where.notebookPath) &&
        (where.filePath === undefined ||
          path.resolve(location.notebookPath, location.filePath) ===
            path.resolve(where.notebookPath, where.filePath))
      );
    });
}
