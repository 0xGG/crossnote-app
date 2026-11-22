export type FileBytes = Uint8Array | null;
export type ConflictDeletions = Record<string, "local" | "remote">;
export interface PullRecovery {
  version: 1;
  localSha: string;
  remoteSha: string;
  files: Record<string, FileBytes>;
  conflicts: string[];
  // New local files that were eligible for upload before the incoming ignore rules.
  uploadCandidates?: string[];
  deletions?: ConflictDeletions;
  // These local paths have durable copies at safe paths in files. Remove the
  // originals before checkout so remote files and directories can replace them.
  // Older plans listed only the original paths.
  relocated?: Record<string, string> | string[];
}

// Earlier versions could publish a plan after Git advertised no refs.
export type StoredPullRecovery = Omit<PullRecovery, "remoteSha"> & {
  remoteSha: string | null;
};

// Kept outside the git working tree. A resolved write means the transaction,
// not just its put request, committed before any destructive git operation.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("crossnote-pull-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pulls");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pulls", mode);
    const request = action(tx.objectStore("pulls"));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = () => {
      db.close();
      reject(
        tx.error ?? request.error ?? new Error("Recovery transaction aborted"),
      );
    };
    tx.onerror = () => {};
  });
}

export const readPullRecovery = (
  id: string,
): Promise<StoredPullRecovery | undefined> =>
  transaction("readonly", (store) => store.get(id));
export const savePullRecovery = (id: string, recovery: PullRecovery) =>
  transaction("readwrite", (store) => store.put(recovery, id));
export const deletePullRecovery = (id: string) =>
  transaction("readwrite", (store) => store.delete(id));
