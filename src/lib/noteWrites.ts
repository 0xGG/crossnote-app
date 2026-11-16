import path from "path-browserify";
import type { NoteLocation } from "./noteSaver";
import { assertNotebookWritable, notebookOperation } from "./notebookOperation";

type Pending = { location: NoteLocation; done: Promise<unknown> };
const writes = new Map<string, Pending>();

// Both settings and text replace the whole file. Read their inputs only
// after the previous operation has settled, including staging and storeTree.
export function writeNoteOperation<T>(
  location: NoteLocation,
  operation: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(location.notebookPath, location.filePath);
  const previous = writes.get(key)?.done;
  const done = (previous ? previous.catch(() => {}) : Promise.resolve()).then(
    () =>
      notebookOperation(location.notebookPath, async () => {
        assertNotebookWritable(location.notebookPath);
        return operation();
      }),
  );
  const entry = { location, done };
  writes.set(key, entry);
  done
    .finally(() => {
      if (writes.get(key) === entry) writes.delete(key);
    })
    .catch(() => {});
  return done;
}

export function pendingNoteWrites(where?: {
  notebookPath: string;
  filePath?: string;
}): Pending[] {
  return [...writes.values()].filter(({ location }) =>
    !where
      ? true
      : path.resolve(location.notebookPath) ===
          path.resolve(where.notebookPath) &&
        (where.filePath === undefined ||
          path.resolve(location.notebookPath, location.filePath) ===
            path.resolve(where.notebookPath, where.filePath)),
  );
}
