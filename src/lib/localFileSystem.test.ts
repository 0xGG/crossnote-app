import { expect, it, vi } from "vitest";
import { Folder } from "../test/diskFolder";
import { pfs } from "./fs";
import LocalFileSystem from "./localFileSystem";
import { Notebook } from "./notebook";

it.each([false, true])(
  "matches an ancestor note path using the disk's case sensitivity (%s)",
  async (caseSensitive) => {
    const folder = new Folder(undefined, caseSensitive);
    const child = await folder.getDirectoryHandle("Child", { create: true });
    if (caseSensitive) {
      await folder.getDirectoryHandle("child", { create: true });
    }
    const fs = new LocalFileSystem();
    const mount = async (id: string, handle: Folder) =>
      (
        await fs.attachLocalDirectory(
          id,
          handle as unknown as FileSystemDirectoryHandle,
        )
      ).slice(0, -1);
    const parent = await mount("parent", folder);
    const target = await mount("child", child);

    expect(
      await fs.filePathInNotebook(target, parent, "./Child/nested/Note.md"),
    ).toBe("nested/Note.md");
    expect(await fs.filePathInNotebook(target, parent, "child/Note.md")).toBe(
      caseSensitive ? null : "Note.md",
    );
    expect(
      await fs.filePathInNotebook(target, parent, "Childish/Note.md"),
    ).toBeNull();
  },
);

it("creates a note with missing parents and preserves it when folder access fails", async () => {
  const root = new Folder();
  const notebook = new Notebook();
  notebook.dir = await pfs.attachLocalDirectory({
    id: "note-access",
    directoryHandle: root as unknown as FileSystemDirectoryHandle,
  });
  notebook.isLocal = true;
  notebook.initSearch();
  const path = "missing/note.md";
  expect(await notebook.getNote(path)).toBeNull();
  const note = await notebook.writeNote(path, "Original", {
    createdAt: new Date(),
    modifiedAt: new Date(),
  });
  const folder = root.entries.get("missing") as Folder;
  const stored = folder.entries.get("note.md");
  const failure = new DOMException(
    "Could not inspect entry",
    "NotReadableError",
  );
  vi.spyOn(folder, "getDirectoryHandle").mockRejectedValueOnce(failure);
  await expect(notebook.getNote(path, true)).rejects.toBe(failure);
  vi.spyOn(root, "queryPermission").mockResolvedValue("denied");
  await expect(notebook.getNote(path, true)).rejects.toMatchObject({
    name: "NotAllowedError",
  });
  await expect(
    notebook.writeNote(path, "Edited", note.config),
  ).rejects.toMatchObject({ name: "NotAllowedError" });
  expect(folder.entries.get("note.md")).toBe(stored);
});

async function attached() {
  const lfs = new LocalFileSystem();
  const root = new Folder();
  const dir = await lfs.attachLocalDirectory(
    "folder",
    root as unknown as FileSystemDirectoryHandle,
  );
  return { lfs, root, dir };
}

it("creates a note in a disk folder without Promise.withResolvers", async () => {
  const { lfs, dir } = await attached();
  const original = Object.getOwnPropertyDescriptor(Promise, "withResolvers")!;
  Reflect.deleteProperty(Promise, "withResolvers");
  try {
    await lfs.withFileCreationLock(dir, () =>
      lfs.writeFile(`${dir}note.md`, "# Saved"),
    );
  } finally {
    Object.defineProperty(Promise, "withResolvers", original);
  }
  expect(await lfs.readFile(`${dir}note.md`, { encoding: "utf8" })).toBe(
    "# Saved",
  );
});

it("makes the folders a new file's path names", async () => {
  const { lfs, root, dir } = await attached();
  await lfs.writeFile(`${dir}made/deeper/new.md`, "# New");
  const made = root.entries.get("made") as Folder;
  const deeper = made.entries.get("deeper") as Folder;
  expect(deeper.entries.get("new.md")).toBe("# New");
});

// The same error as the browser file system gives, which the app tells the
// user about as a link that leads inside a note.
it("refuses a new file under a file as the browser file system does", async () => {
  const { lfs, root, dir } = await attached();
  root.entries.set("note.md", "# Note");
  for (const filePath of ["note.md/new.md", "note.md/folder/new.md"]) {
    await expect(lfs.writeFile(`${dir}${filePath}`, "")).rejects.toMatchObject({
      code: "ENOTDIR",
    });
  }
  expect(root.entries.get("note.md")).toBe("# Note");
});
