import { expect, it, vi } from "vitest";
import { pfs } from "./fs";
import LocalFileSystem from "./localFileSystem";
import { Notebook } from "./notebook";

// A folder on the user's disk, held in memory, with the part of the File
// System Access API the writes go through: asking for a folder where a file
// is gives a TypeMismatchError, as the browsers do.
class Folder {
  readonly kind = "directory";
  entries = new Map<string, Folder | string>();

  async queryPermission() {
    return "granted";
  }

  async requestPermission() {
    return "denied";
  }

  async getDirectoryHandle(name: string, { create = false } = {}) {
    const entry = this.entries.get(name);
    if (typeof entry === "string") {
      throw new DOMException("A file is in the way.", "TypeMismatchError");
    }
    if (entry) {
      return entry;
    }
    if (!create) {
      throw new DOMException("Not there.", "NotFoundError");
    }
    const folder = new Folder();
    this.entries.set(name, folder);
    return folder;
  }

  async getFileHandle(name: string, { create = false } = {}) {
    const entry = this.entries.get(name);
    if (entry instanceof Folder) {
      throw new DOMException("A folder is in the way.", "TypeMismatchError");
    }
    if (entry === undefined && !create) {
      throw new DOMException("Not there.", "NotFoundError");
    }
    if (entry === undefined) {
      this.entries.set(name, "");
    }
    return {
      getFile: async () => ({
        lastModified: Date.now(),
        text: async () => this.entries.get(name) as string,
      }),
      createWritable: async () => {
        let written = "";
        return {
          write: async (data: string) => {
            written += data;
          },
          close: async () => {
            this.entries.set(name, written);
          },
        };
      },
    };
  }
}

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
