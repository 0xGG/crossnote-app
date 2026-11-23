import { strFromU8, unzipSync } from "fflate";
import { afterEach, expect, it, vi } from "vitest";
import { fs, pfs } from "./fs";
import { exportNotebookZip } from "./notebookBackup";
import { needsRecovery } from "./notebookOperation";

afterEach(() => vi.restoreAllMocks());

async function entries(blob: Blob) {
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return unzipSync(new Uint8Array(bytes));
}

it("writes an empty files directory and gives a blank notebook a usable backup name", async () => {
  const dir = "/notebooks/backup-empty";
  await pfs.writeFile(`${dir}/.git/config`, "not part of the backup");
  const notebook = { dir, name: " \t " };
  const archive = await exportNotebookZip(notebook);
  const files = await entries(archive.blob);
  expect(Object.keys(files).sort()).toEqual(["files/", "metadata.json"]);
  expect(JSON.parse(strFromU8(files["metadata.json"]))).toEqual({
    format: "crossnote-notebook",
    version: 1,
    displayName: "Unnamed",
  });
  expect(archive.filename).toBe("Unnamed.zip");
  expect(notebook.name).toBe(" \t ");
});

it("reports a symbolic link by its notebook path without reading its target", async () => {
  const dir = "/notebooks/backup-symlink";
  await pfs.mkdirp(`${dir}/notes`);
  await fs.promises.symlink("chapter.md", `${dir}/notes/latest.md`);
  const read = vi.spyOn(pfs, "readFile");

  await expect(
    exportNotebookZip({ dir, name: "Linked" }),
  ).rejects.toMatchObject({
    key: "backup/symbolic-link",
    filePath: "notes/latest.md",
  });
  expect(read).not.toHaveBeenCalled();
});

it("reports revoked folder access before reading and identifies a vanished child", async () => {
  const dir = "/lfs/backup-disk/";
  const noAccess = new DOMException("Permission removed", "NotAllowedError");
  const vanished = new DOMException("Entry removed", "NotFoundError");
  const permission = vi
    .spyOn(pfs, "requestPermission")
    .mockRejectedValueOnce(noAccess)
    .mockResolvedValueOnce(undefined);
  const list = vi.spyOn(pfs, "readdir").mockResolvedValue(["missing.md"]);
  vi.spyOn(pfs, "stats").mockRejectedValue(vanished);
  const notebook = { dir, name: "Folder" };

  await expect(exportNotebookZip(notebook)).rejects.toMatchObject({
    key: "backup/read-error",
    filePath: ".",
    cause: noAccess,
  });
  expect(list).not.toHaveBeenCalled();
  expect(permission).toHaveBeenCalledWith(dir, "read");
  await expect(exportNotebookZip(notebook)).rejects.toMatchObject({
    key: "backup/read-error",
    filePath: "missing.md",
    cause: vanished,
  });
});

it("does not back up a worktree with an unfinished sync recovery", async () => {
  const dir = "/notebooks/backup-recovery";
  const list = vi.spyOn(pfs, "readdir");
  needsRecovery(dir, true);
  try {
    await expect(
      exportNotebookZip({ dir, name: "Interrupted" }),
    ).rejects.toMatchObject({ key: "backup/sync-recovery" });
    expect(list).not.toHaveBeenCalled();
  } finally {
    needsRecovery(dir, false);
  }
});

it("checks the ZIP size limit before loading an oversized file", async () => {
  const dir = "/notebooks/backup-large";
  const file = `${dir}/large.bin`;
  await pfs.writeFile(file, Uint8Array.of(0));
  const stat = await fs.promises.lstat(file);
  stat.size = 0xffffffff;
  vi.spyOn(fs.promises, "lstat").mockResolvedValue(stat);
  const read = vi.spyOn(pfs, "readFile");

  await expect(exportNotebookZip({ dir, name: "Large" })).rejects.toMatchObject(
    { key: "backup/too-large" },
  );
  expect(read).not.toHaveBeenCalled();
});

it("warns about a Windows name over 255 characters and preserves the archived files", async () => {
  const dir = "/notebooks/backup-long-name";
  const atLimit = `${"a".repeat(252)}.md`;
  const overLimit = `${"b".repeat(253)}.md`;
  await pfs.writeFile(`${dir}/${atLimit}`, "Fits");
  await pfs.writeFile(`${dir}/${overLimit}`, "Original");

  const archive = await exportNotebookZip({
    dir,
    name: "Notes",
  });
  const files = await entries(archive.blob);
  expect(archive.windowsPaths).toEqual([overLimit]);
  expect(strFromU8(files[`files/${atLimit}`])).toBe("Fits");
  expect(strFromU8(files[`files/${overLimit}`])).toBe("Original");
});
