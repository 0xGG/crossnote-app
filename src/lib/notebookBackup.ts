import path from "path-browserify";
import { fs, missingFileOrThrow, pfs } from "./fs";
import { flushNotebookEdits } from "./noteSaver";
import type { Notebook } from "./notebook";
import { isNotebookRecovering, notebookOperation } from "./notebookOperation";

type BackupErrorKey =
  | "backup/read-error"
  | "backup/symbolic-link"
  | "backup/too-large"
  | "backup/sync-recovery";

export class NotebookBackupError extends Error {
  constructor(
    readonly key: BackupErrorKey,
    readonly filePath = ".",
    cause?: unknown,
  ) {
    super(key, { cause });
  }
}

async function readFromPath<T>(filePath: string, read: () => Promise<T>) {
  try {
    return await read();
  } catch (cause) {
    throw new NotebookBackupError("backup/read-error", filePath, cause);
  }
}

function hasWindowsNameIssue(name: string) {
  // eslint-disable-next-line no-control-regex
  const forbidden = /[<>:"\\|?*\x00-\x1f]|^ |[ .]$/;
  const device = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;
  return (
    name.length > 255 ||
    forbidden.test(name) ||
    device.test(name.split(".")[0].trimEnd())
  );
}

// fflate writes classic ZIP headers. Keep the ZIP64 sentinel values free.
const zipSizeLimit = 0xffffffff;
const zipEntryLimit = 0xffff;

export async function exportNotebookZip({
  dir,
  name,
}: Pick<Notebook, "dir" | "name">) {
  const isLocal = pfs.isPathOfLocalFileSystem(dir);
  const [zipLibrary] = await Promise.all([
    import("fflate"),
    isLocal
      ? readFromPath(".", () => pfs.requestPermission(dir, "read"))
      : undefined,
    flushNotebookEdits(dir),
  ]);

  return notebookOperation(dir, async () => {
    if (isNotebookRecovering(dir))
      throw new NotebookBackupError("backup/sync-recovery");

    const { Zip, ZipPassThrough, strToU8 } = zipLibrary;
    const displayName = name.trim() ? name : "Unnamed";
    const parts: Blob[] = [];
    const windowsPaths = new Set<string>();
    let outputSize = 0;
    let entryCount = 0;
    const zip = new Zip((error, bytes) => {
      if (error) throw error;
      outputSize += bytes.byteLength;
      if (outputSize >= zipSizeLimit)
        throw new NotebookBackupError("backup/too-large");
      parts.push(new Blob([bytes]));
    });

    function add(name: string, bytes = new Uint8Array()) {
      if (++entryCount >= zipEntryLimit)
        throw new NotebookBackupError("backup/too-large");
      const entry = new ZipPassThrough(name);
      if (name.endsWith("/")) entry.attrs = 0x10;
      zip.add(entry);
      entry.push(bytes, true);
    }

    async function visit(relative: string) {
      const folder = path.join(dir, relative);
      const names = await readFromPath(relative || ".", () =>
        pfs.readdir(folder),
      );
      const hasExactGit = names.includes(".git");
      const siblings = new Map<string, string>();
      for (const name of names) {
        if (name === ".git") continue;
        const child = relative + name;
        // A differently spelled entry is a Git alias only when the disk
        // resolves .git and the listing did not contain a separate .git.
        if (isLocal && !hasExactGit && name.toLowerCase() === ".git") {
          const gitAlias = await readFromPath(child, () =>
            pfs.stats(path.join(folder, ".git")).catch(missingFileOrThrow),
          );
          if (gitAlias) continue;
        }
        if (hasWindowsNameIssue(name)) windowsPaths.add(child);
        const foldedName = name.toUpperCase();
        const sibling = siblings.get(foldedName);
        if (sibling) {
          windowsPaths.add(sibling);
          windowsPaths.add(child);
        } else siblings.set(foldedName, child);

        const target = path.join(folder, name);
        const stat = await readFromPath(child, () =>
          isLocal ? pfs.stats(target) : fs.promises.lstat(target),
        );
        if (stat.isDirectory()) {
          add(`files/${child}/`);
          await visit(child + "/");
        } else if (stat.isFile()) {
          if (stat.size + outputSize >= zipSizeLimit)
            throw new NotebookBackupError("backup/too-large");
          const bytes = (await readFromPath(child, () =>
            pfs.readFile(target),
          )) as Uint8Array<ArrayBuffer>;
          add(`files/${child}`, bytes);
        } else {
          throw new NotebookBackupError("backup/symbolic-link", child);
        }
      }
    }

    add(
      "metadata.json",
      strToU8(
        JSON.stringify({
          format: "crossnote-notebook",
          version: 1,
          displayName,
        }),
      ),
    );
    add("files/");
    await visit("");
    zip.end();
    return {
      blob: new Blob(parts, { type: "application/zip" }),
      filename: `${displayName}.zip`,
      windowsPaths: [...windowsPaths].sort(),
    };
  });
}
