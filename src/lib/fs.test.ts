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
