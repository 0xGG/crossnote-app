import { expect, it, vi } from "vitest";
import { isStored } from "../test/storedTree";
import { fs, pfs } from "./fs";

// The browser file system would put a folder under a file, out of sight of
// every listing; a folder on the user's disk refuses that, and so does the
// file system the app goes through.
it("will not make a folder under a file", async () => {
  await pfs.mkdirp("/notebooks/fs-test");
  await pfs.writeFile("/notebooks/fs-test/note.md", "# Note");

  await expect(pfs.mkdir("/notebooks/fs-test/note.md/folder")).rejects.toThrow(
    "ENOTDIR",
  );
  await expect(pfs.mkdirp("/notebooks/fs-test/note.md/a/b")).rejects.toThrow(
    "ENOTDIR",
  );
  expect(await pfs.exists("/notebooks/fs-test/note.md/folder")).toBe(false);
  expect(
    await pfs.readFile("/notebooks/fs-test/note.md", { encoding: "utf8" }),
  ).toBe("# Note");
});

// Before the app refused such paths, a note could end up under another
// note's file, and it may still be open in a tab. Saving it writes over it
// and puts nothing new under the file, so it is let through.
it("still saves a note an earlier version put under a file", async () => {
  await pfs.mkdirp("/notebooks/fs-earlier");
  await pfs.writeFile("/notebooks/fs-earlier/parent.md", "# Parent");
  // Written the way the file system took it then.
  await fs.promises.writeFile(
    "/notebooks/fs-earlier/parent.md/child.md",
    "# Child",
    "utf8",
  );

  await pfs.writeFile("/notebooks/fs-earlier/parent.md/child.md", "# Edited");
  expect(
    await pfs.readFile("/notebooks/fs-earlier/parent.md/child.md", {
      encoding: "utf8",
    }),
  ).toBe("# Edited");
  // A new note there is still refused.
  await expect(
    pfs.writeFile("/notebooks/fs-earlier/parent.md/new.md", ""),
  ).rejects.toThrow("ENOTDIR");
});

// The browser file system goes idle half a second after its last operation,
// writing its directory tree out as it does. Storage that refuses writes, as
// a full disk does, refuses that too; once it takes writes again, the file
// system has to save a note as before, not fail until the page is reloaded.
it("works again once the storage takes writes after refusing them", async () => {
  await pfs.mkdirp("/notebooks/fs-refused");
  await pfs.writeFile("/notebooks/fs-refused/note.md", "# First");
  await pfs.storeTree("/notebooks/fs-refused");
  const store = IDBObjectStore.prototype;
  const put = store.put;
  // The writes of the directory tree refused: the debounced save after the
  // write, and the one going idle makes.
  let treesRefused = 0;
  store.put = function (this: IDBObjectStore, ...args) {
    if (this.name === "fs_files") {
      if (args[1] === "!root") {
        treesRefused++;
      }
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    }
    return put.apply(this, args);
  } as IDBObjectStore["put"];
  try {
    await expect(
      pfs.writeFile("/notebooks/fs-refused/note.md", "# Second"),
    ).rejects.toThrow("quota");
    await vi.waitFor(() => expect(treesRefused).toBe(2), { timeout: 3000 });
  } finally {
    store.put = put;
  }

  await pfs.writeFile("/notebooks/fs-refused/new.md", "# Third");
  await pfs.storeTree("/notebooks/fs-refused");
  expect(
    await pfs.readFile("/notebooks/fs-refused/new.md", { encoding: "utf8" }),
  ).toBe("# Third");
  // And the tree it went on with is the one a page loaded next finds.
  expect(await isStored("/notebooks/fs-refused/new.md")).toBe(true);
});

// A write the storage refuses has to leave the tree as it was: going on with
// the tree it holds, the file system would otherwise save a file it never
// stored, or drop one it never deleted.
it("leaves nothing behind of the writes the storage refused", async () => {
  await pfs.mkdirp("/notebooks/fs-left");
  await pfs.writeFile("/notebooks/fs-left/kept.md", "# Kept");
  const store = IDBObjectStore.prototype;
  const put = store.put;
  const remove = store.delete;
  const refused = () => {
    throw new DOMException(
      "The quota has been exceeded.",
      "QuotaExceededError",
    );
  };
  store.put = function (this: IDBObjectStore, ...args) {
    return this.name === "fs_files" ? refused() : put.apply(this, args);
  } as IDBObjectStore["put"];
  store.delete = function (this: IDBObjectStore, ...args) {
    return this.name === "fs_files" ? refused() : remove.apply(this, args);
  } as IDBObjectStore["delete"];
  try {
    await expect(
      pfs.writeFile("/notebooks/fs-left/new.md", "# New"),
    ).rejects.toThrow("quota");
    await expect(pfs.unlink("/notebooks/fs-left/kept.md")).rejects.toThrow(
      "quota",
    );
  } finally {
    store.put = put;
    store.delete = remove;
  }

  expect(await pfs.exists("/notebooks/fs-left/new.md")).toBe(false);
  expect(
    await pfs.readFile("/notebooks/fs-left/kept.md", { encoding: "utf8" }),
  ).toBe("# Kept");
  expect((await pfs.readdir("/notebooks/fs-left")).sort()).toEqual(["kept.md"]);
});

// Putting the tree back undoes only the refused write's own change: a write
// to the same file that went through meanwhile stays.
it("keeps a write that went through while another was refused", async () => {
  await pfs.mkdirp("/notebooks/fs-race");
  const store = IDBObjectStore.prototype;
  const put = store.put;
  let refuseNext = true;
  store.put = function (this: IDBObjectStore, ...args) {
    if (this.name === "fs_files" && args[1] !== "!root" && refuseNext) {
      refuseNext = false;
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    }
    return put.apply(this, args);
  } as IDBObjectStore["put"];
  try {
    const refused = fs.promises.writeFile("/notebooks/fs-race/note.md", "A");
    const taken = fs.promises.writeFile("/notebooks/fs-race/note.md", "B");
    await expect(refused).rejects.toThrow("quota");
    await taken;
  } finally {
    store.put = put;
  }
  expect(
    await pfs.readFile("/notebooks/fs-race/note.md", { encoding: "utf8" }),
  ).toBe("B");
});

const quotaExceeded = () =>
  new DOMException("The quota has been exceeded.", "QuotaExceededError");

// Content writes, unless the storage is to take them, and deletions refused,
// as by storage that is full, while the tree still takes its own writes.
function refuseContent({ puts = true } = {}) {
  const store = IDBObjectStore.prototype;
  const put = store.put;
  const remove = store.delete;
  store.put = function (this: IDBObjectStore, ...args) {
    if (puts && this.name === "fs_files" && args[1] !== "!root") {
      throw quotaExceeded();
    }
    return put.apply(this, args);
  } as IDBObjectStore["put"];
  store.delete = function (this: IDBObjectStore, ...args) {
    if (this.name === "fs_files") {
      throw quotaExceeded();
    }
    return remove.apply(this, args);
  } as IDBObjectStore["delete"];
  return () => {
    store.put = put;
    store.delete = remove;
  };
}

// The browser file system's store of file content, reached through its
// internals only to choose when a deletion is refused.
function contentStore() {
  return (
    fs.promises as unknown as {
      _backend: { _idb: { unlink: (ino: number) => Promise<void> } };
    }
  )._backend._idb;
}

// What a refused write puts back can no longer be what another refused write
// left: two refused writes of a new file leave no file.
it("leaves nothing behind of two refused writes to a new file", async () => {
  await pfs.mkdirp("/notebooks/fs-turns-writes");
  const restore = refuseContent();
  try {
    const first = fs.promises.writeFile(
      "/notebooks/fs-turns-writes/new.md",
      "A",
    );
    const second = fs.promises.writeFile(
      "/notebooks/fs-turns-writes/new.md",
      "BB",
    );
    await Promise.all([
      expect(first).rejects.toThrow("quota"),
      expect(second).rejects.toThrow("quota"),
    ]);
  } finally {
    restore();
  }
  expect(await pfs.readdir("/notebooks/fs-turns-writes")).toEqual([]);
});

// Nor a deletion called while the write of a new file is still going on. The
// two take turns: the deletion starts once the refused write has taken its
// entry out again, finds no file and fails for that. The stub would refuse it
// only after the write, the order in which the patch put the write's entry
// back before operations on the same path took turns.
it("leaves nothing behind of a refused write and deletion of a new file", async () => {
  await pfs.mkdirp("/notebooks/fs-turns-delete");
  let written: Promise<void> = Promise.resolve();
  const unlink = vi
    .spyOn(contentStore(), "unlink")
    .mockImplementation(async () => {
      await written.catch(() => {});
      throw quotaExceeded();
    });
  const restore = refuseContent();
  try {
    written = fs.promises.writeFile("/notebooks/fs-turns-delete/new.md", "A");
    const deleted = fs.promises.unlink("/notebooks/fs-turns-delete/new.md");
    await Promise.all([
      expect(written).rejects.toThrow("quota"),
      expect(deleted).rejects.toThrow(),
    ]);
  } finally {
    restore();
    unlink.mockRestore();
  }
  expect(await pfs.readdir("/notebooks/fs-turns-delete")).toEqual([]);
});

// A file whose deletion was refused stays, even when a write of it that was
// refused too came right after.
it("keeps a file whose deletion and next write were both refused", async () => {
  await pfs.mkdirp("/notebooks/fs-turns-kept");
  await pfs.writeFile("/notebooks/fs-turns-kept/kept.md", "# Kept");
  const restore = refuseContent();
  try {
    const deleted = fs.promises.unlink("/notebooks/fs-turns-kept/kept.md");
    const written = fs.promises.writeFile(
      "/notebooks/fs-turns-kept/kept.md",
      "# New",
    );
    await Promise.all([
      expect(deleted).rejects.toThrow("quota"),
      expect(written).rejects.toThrow("quota"),
    ]);
  } finally {
    restore();
  }
  expect(await pfs.readdir("/notebooks/fs-turns-kept")).toEqual(["kept.md"]);
  expect(
    await pfs.readFile("/notebooks/fs-turns-kept/kept.md", {
      encoding: "utf8",
    }),
  ).toBe("# Kept");
});

// A write that went through between two refused deletions of the file is
// what the file reads. The three take turns: the first deletion is refused,
// the write goes through, the second deletion is refused. The stub holds the
// first until the second reaches the store or 50 ms have passed: before
// operations on the same path took turns, the second got there first, the
// order in which the patch put the file back as it was before the write; now
// it never does, and the first waits the 50 ms. A file made after the note
// keeps the write from getting the note's inode, the highest one plus one,
// which would store it where the old entry points.
it("keeps the write that went through between two refused deletions", async () => {
  await pfs.mkdirp("/notebooks/fs-turns-between");
  await pfs.writeFile("/notebooks/fs-turns-between/note.md", "# Old");
  await pfs.writeFile("/notebooks/fs-turns-between/later.md", "# Later");
  let first: Promise<void> = Promise.resolve();
  let secondCame = () => {};
  const second = new Promise<void>((resolve) => (secondCame = resolve));
  let calls = 0;
  const unlink = vi
    .spyOn(contentStore(), "unlink")
    .mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        await Promise.race([
          second,
          new Promise((resolve) => setTimeout(resolve, 50)),
        ]);
      } else {
        secondCame();
        await first.catch(() => {});
      }
      throw quotaExceeded();
    });
  try {
    first = fs.promises.unlink("/notebooks/fs-turns-between/note.md");
    const written = fs.promises.writeFile(
      "/notebooks/fs-turns-between/note.md",
      "# New",
    );
    const last = fs.promises.unlink("/notebooks/fs-turns-between/note.md");
    await Promise.all([
      expect(first).rejects.toThrow("quota"),
      written,
      expect(last).rejects.toThrow("quota"),
    ]);
  } finally {
    unlink.mockRestore();
  }
  expect(
    await pfs.readFile("/notebooks/fs-turns-between/note.md", {
      encoding: "utf8",
    }),
  ).toBe("# New");
});

// A new file renamed while its content is being stored, and the content
// refused: there is no file under either name.
it("leaves nothing behind of a refused write to a file renamed meanwhile", async () => {
  await pfs.mkdirp("/notebooks/fs-turns-rename");
  const restore = refuseContent();
  const written = fs.promises.writeFile("/notebooks/fs-turns-rename/a.md", "A");
  const renamed = fs.promises
    .rename(
      "/notebooks/fs-turns-rename/a.md",
      "/notebooks/fs-turns-rename/b.md",
    )
    .catch((error: unknown) => error);
  try {
    await Promise.all([expect(written).rejects.toThrow("quota"), renamed]);
  } finally {
    restore();
  }
  expect(await pfs.readdir("/notebooks/fs-turns-rename")).toEqual([]);
  expect(await renamed).toHaveProperty("code", "ENOENT");
});

// The same with the folder the new file is in renamed as a whole.
it("leaves nothing behind of a refused write in a folder renamed meanwhile", async () => {
  await pfs.mkdirp("/notebooks/fs-turns-folder/old");
  const restore = refuseContent();
  try {
    const written = fs.promises.writeFile(
      "/notebooks/fs-turns-folder/old/new.md",
      "A",
    );
    const renamed = fs.promises.rename(
      "/notebooks/fs-turns-folder/old",
      "/notebooks/fs-turns-folder/moved",
    );
    await Promise.all([expect(written).rejects.toThrow("quota"), renamed]);
  } finally {
    restore();
  }
  expect(await pfs.readdir("/notebooks/fs-turns-folder/moved")).toEqual([]);
});

// A file put back after its deletion was refused keeps its inode to itself.
// While the deletion was going on, the file was out of the tree, and a new
// file was given the highest inode number in the tree plus one, which was the
// deleted file's own when it had the highest; the new file's content then
// went where the file put back points. The deletion is refused once the new
// file is stored.
it("keeps the inode of a file whose deletion was refused to it alone", async () => {
  await pfs.mkdirp("/notebooks/fs-inode");
  await pfs.writeFile("/notebooks/fs-inode/x.md", "# X");
  let written: Promise<void> = Promise.resolve();
  const unlink = vi
    .spyOn(contentStore(), "unlink")
    .mockImplementation(async () => {
      await written.catch(() => {});
      throw quotaExceeded();
    });
  try {
    const deleted = fs.promises.unlink("/notebooks/fs-inode/x.md");
    written = fs.promises.writeFile("/notebooks/fs-inode/y.md", "# Y");
    await Promise.all([expect(deleted).rejects.toThrow("quota"), written]);
  } finally {
    unlink.mockRestore();
  }
  expect(
    await pfs.readFile("/notebooks/fs-inode/x.md", { encoding: "utf8" }),
  ).toBe("# X");
  expect(
    await pfs.readFile("/notebooks/fs-inode/y.md", { encoding: "utf8" }),
  ).toBe("# Y");
});
