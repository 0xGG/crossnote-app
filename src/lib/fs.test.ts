import { expect, it } from "vitest";
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
  const store = IDBObjectStore.prototype;
  const put = store.put;
  store.put = function (this: IDBObjectStore, ...args) {
    if (this.name === "fs_files") {
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
    // Long enough to go idle, and fail to write the tree out.
    await new Promise((resolve) => setTimeout(resolve, 800));
  } finally {
    store.put = put;
  }

  await pfs.writeFile("/notebooks/fs-refused/note.md", "# Third");
  expect(
    await pfs.readFile("/notebooks/fs-refused/note.md", { encoding: "utf8" }),
  ).toBe("# Third");
});
