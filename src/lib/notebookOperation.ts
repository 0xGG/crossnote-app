import { Mutex } from "async-mutex";
import path from "path-browserify";
import { pfs } from "./fs";

const locks = new Map<string, Mutex>();
const recovering = new Set<string>();

export class IgnoredUploadFileError extends Error {
  constructor(readonly filepath: string) {
    super("error/notebook-file-ignored");
  }
}

export function notebookOperation<T>(
  dir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = pfs.notebookLockPath(path.resolve(dir));
  let lock = locks.get(key);
  if (!lock) {
    lock = new Mutex();
    locks.set(key, lock);
  }
  return lock.runExclusive(operation);
}

export function needsRecovery(dir: string, pending: boolean) {
  if (pending) recovering.add(path.resolve(dir));
  else recovering.delete(path.resolve(dir));
}

export function assertNotebookWritable(dir: string) {
  if (recovering.has(path.resolve(dir)))
    throw new Error(
      "Sync recovery is pending. Retry the download before saving.",
    );
}
