import { expect, it } from "vitest";
import { pfs } from "./fs";

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
