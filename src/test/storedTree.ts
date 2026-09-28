// What the next page load would find on the browser file system, read from
// IndexedDB the way that load reads it: the directory tree the file system
// last wrote out, as opposed to the one it keeps in memory and writes out
// only half a second after the last change to it, and the contents that tree
// points at.
//
// This reads lightning-fs's own storage: the "fs" database, its "fs_files"
// store and the tree under "!root". The end-to-end page object reads the same
// in the browser (`expectStored` in e2e/crossnote.ts); the two change
// together.
//
// When there is no tree to read where it should be, the checks fail rather
// than report every path as missing: a test that expects a path to be gone
// would otherwise pass however wrong the reading had gone.

type Node = Map<string | number, unknown>;

// The file system keeps each entry's details under this key of its node.
const STAT = 0;

async function withStore<T>(
  read: (files: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const open = indexedDB.open("fs");
    // Only asked when the database does not exist yet: creating it here
    // would leave out the store the file system adds when it creates it.
    open.onupgradeneeded = () => open.transaction?.abort();
    open.onerror = () => resolve(null);
    open.onsuccess = () => resolve(open.result);
  });
  if (!db) {
    throw new Error('The browser file system has no "fs" database to read');
  }
  try {
    if (!db.objectStoreNames.contains("fs_files")) {
      throw new Error('The browser file system has no "fs_files" store');
    }
    return await read(db.transaction("fs_files").objectStore("fs_files"));
  } finally {
    db.close();
  }
}

function get(files: IDBObjectStore, key: IDBValidKey): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = files.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storedNode(files: IDBObjectStore, filePath: string) {
  const root = (await get(files, "!root")) as Node | undefined;
  if (typeof root?.get !== "function" || !root.get("/")) {
    throw new Error('The browser file system has no tree stored at "!root"');
  }
  let node = root.get("/");
  for (const part of filePath.split("/").filter(Boolean)) {
    node = (node as Node | undefined)?.get(part);
  }
  return node as Node | undefined;
}

// Whether the stored tree holds the path.
export async function isStored(filePath: string): Promise<boolean> {
  return !!(await withStore((files) => storedNode(files, filePath)));
}

// The content a file would be read back with: undefined when the stored
// tree does not hold the path, or points at content that is gone.
export async function readStored(
  filePath: string,
): Promise<Uint8Array | undefined> {
  return withStore(async (files) => {
    const node = await storedNode(files, filePath);
    const stat = node?.get(STAT) as { ino: number } | undefined;
    return stat
      ? ((await get(files, stat.ino)) as Uint8Array | undefined)
      : undefined;
  });
}
