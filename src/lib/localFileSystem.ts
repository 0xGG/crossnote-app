// Local File System API

import type LightningFS from "@isomorphic-git/lightning-fs";
import { Mutex } from "async-mutex";
import path from "path-browserify";
import { randomID } from "../utilities/utils";

export interface ReadFileOptions {
  encoding?: string;
}

// What both file systems give for a path that goes through something other
// than a folder: the browser file system has to check for it itself, a
// folder on the user's disk gives a TypeMismatchError.
export function notAFolder(filePath: string): Error {
  return Object.assign(new Error(`ENOTDIR: ${filePath}`), { code: "ENOTDIR" });
}

export async function verifyPermission(
  fileHandle: FileSystemHandle,
  mode?: FileSystemPermissionMode,
) {
  const options: FileSystemHandlePermissionDescriptor = {
    mode,
  };
  // Check if permission was already granted. If so, return true.
  if ((await fileHandle.queryPermission(options)) === "granted") {
    return true;
  }

  // Request permission. If the user grants permission, return true.
  if ((await fileHandle.requestPermission(options)) === "granted") {
    return true;
  }
  // The user didn't grant permission, so return false.
  return false;
}

export default class LocalFileSystem {
  private readonly directories: Record<
    string,
    { handle: FileSystemDirectoryHandle; lockPath: string }
  > = {};
  private readonly attaching = new Mutex();
  private readonly creatingFiles = new Set<{
    handle: FileSystemDirectoryHandle;
    done: Promise<unknown>;
  }>();
  private readonly _prefix = "lfs";

  public async attachLocalDirectory(
    rootDir: string,
    directoryHandle: FileSystemDirectoryHandle,
  ): Promise<string> {
    if (!rootDir) {
      rootDir = randomID();
    }
    if (!rootDir.startsWith("/")) {
      rootDir = "/" + rootDir;
    }
    if (!rootDir.startsWith(`/${this._prefix}`)) {
      rootDir = `/${this._prefix}` + rootDir;
    }
    if (!rootDir.endsWith("/")) {
      rootDir += "/";
    }
    // Separate notebook registrations can point to the same disk directory.
    await this.attaching.runExclusive(async () => {
      let lockPath = rootDir.slice(0, -1);
      for (const mounted of Object.values(this.directories)) {
        if (await directoryHandle.isSameEntry(mounted.handle)) {
          lockPath = mounted.lockPath;
          break;
        }
      }
      this.directories[rootDir] = { handle: directoryHandle, lockPath };
    });
    return rootDir;
  }

  public notebookLockPath(dir: string) {
    return this.directories[`${dir}/`]?.lockPath ?? dir;
  }

  public async filePathInNotebook(
    dir: string,
    notebookPath: string,
    filePath: string,
  ): Promise<string | null> {
    const relativeFile = path.normalize(filePath);
    if (dir === notebookPath) return relativeFile;
    const root = this.directories[`${dir}/`];
    const source = this.directories[`${notebookPath}/`];
    if (!root || !source) return null;
    if (root.lockPath === source.lockPath) return relativeFile;

    const sourcePath = await root.handle.resolve(source.handle);
    if (sourcePath !== null) return path.join(...sourcePath, relativeFile);

    const rootPath = await source.handle.resolve(root.handle);
    const parts = relativeFile.split("/");
    if (!rootPath || parts.length <= rootPath.length) return null;
    const prefix = parts.slice(0, rootPath.length);
    if (
      prefix.join("/") !== rootPath.join("/") &&
      !(await this.matchesDirectoryPath(source.handle, prefix, rootPath))
    ) {
      return null;
    }
    return parts.slice(rootPath.length).join("/");
  }

  private async matchesDirectoryPath(
    directory: FileSystemDirectoryHandle,
    supplied: string[],
    actual: string[],
  ) {
    // A Windows link can spell a directory differently from the picker.
    // Check that the alternate spelling resolves and is not a separate entry.
    for (const [i, name] of actual.entries()) {
      const alternate = supplied[i];
      if (alternate !== name) {
        const folded = name.toUpperCase();
        if (alternate.toUpperCase() !== folded) return false;
        try {
          await directory.getDirectoryHandle(alternate);
        } catch (error) {
          if (
            error instanceof DOMException &&
            (error.name === "NotFoundError" ||
              error.name === "TypeMismatchError")
          ) {
            return false;
          }
          throw error;
        }
        for await (const entry of directory.values()) {
          if (entry.name !== name && entry.name.toUpperCase() === folded)
            return false;
        }
      }
      if (i + 1 < actual.length)
        directory = await directory.getDirectoryHandle(name);
    }
    return true;
  }

  public async withFileCreationLock<T>(
    dir: string,
    create: () => Promise<T>,
  ): Promise<T> {
    const { handle } = this.directories[`${path.resolve(dir)}/`];
    const earlier = [...this.creatingFiles];
    // Overlapping registrations can create the same file through either root.
    const creation = Promise.all(
      earlier.map(async (other) => {
        if (
          (await handle.resolve(other.handle)) !== null ||
          (await other.handle.resolve(handle)) !== null
        ) {
          await other.done;
        }
      }),
    ).then(create);
    const current = { handle, done: creation.catch(() => {}) };
    this.creatingFiles.add(current);
    try {
      return await creation;
    } finally {
      this.creatingFiles.delete(current);
    }
  }

  public isPathOfLocalFileSystem(path: string) {
    return path.startsWith("/" + this._prefix);
  }

  public async helper(
    path: string,
    mode: FileSystemPermissionMode = "readwrite",
  ): Promise<[FileSystemDirectoryHandle, string[]]> {
    const pathArr = path.replace(/\/+$/, "").split("/");
    const rootDir = "/" + pathArr[1] + "/" + pathArr[2] + "/";
    const directoryHandle = this.directories[rootDir]?.handle;
    if (!directoryHandle) throw new Error(`${path} is not valid`);
    if (!(await verifyPermission(directoryHandle, mode))) {
      throw new DOMException(
        "Access to the folder was denied.",
        "NotAllowedError",
      );
    }
    return [directoryHandle, pathArr.slice(3, pathArr.length)];
  }

  private async directoryAt(
    directory: FileSystemDirectoryHandle,
    parts: string[],
  ) {
    for (const name of parts) {
      try {
        directory = await directory.getDirectoryHandle(name);
      } catch (error) {
        if ((error as DOMException).name === "TypeMismatchError") {
          throw notAFolder(name);
        }
        throw error;
      }
    }
    return directory;
  }

  private async parentOf(path: string, mode: FileSystemPermissionMode) {
    const [root, parts] = await this.helper(path, mode);
    return {
      directory: await this.directoryAt(root, parts.slice(0, -1)),
      name: parts[parts.length - 1],
    };
  }

  public async readFile(
    path: string,
    opts: ReadFileOptions = { encoding: "" },
  ): Promise<string | Uint8Array> {
    const { directory, name } = await this.parentOf(path, "read");
    const file = await (await directory.getFileHandle(name)).getFile();
    return /^utf-?8$/i.test(opts.encoding ?? "")
      ? file.text()
      : new Uint8Array(await file.arrayBuffer());
  }

  public async writeFile(
    path: string,
    data: string | Uint8Array,
  ): Promise<void> {
    const [root, parts] = await this.helper(path, "readwrite");
    let directory = root;
    for (let i = 0; i < parts.length - 1; i++) {
      try {
        directory = await directory.getDirectoryHandle(parts[i], {
          create: true,
        });
      } catch (error) {
        if ((error as DOMException).name === "TypeMismatchError") {
          throw notAFolder(parts.slice(0, i + 1).join("/"));
        }
        throw error;
      }
    }
    const fileHandle = await directory.getFileHandle(parts[parts.length - 1], {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(
      typeof data === "string" ? data : new Uint8Array(data),
    );
    await writable.close();
  }

  public async readdir(path: string): Promise<string[]> {
    const [root, parts] = await this.helper(path, "read");
    const directory = await this.directoryAt(root, parts);
    const names = [];
    for await (const entry of directory.values()) names.push(entry.name);
    return names;
  }

  public async unlink(path: string): Promise<void> {
    const { directory, name } = await this.parentOf(path, "readwrite");
    await directory.removeEntry(name, { recursive: true });
  }

  public async stats(path: string): Promise<LightningFS.Stats> {
    const { directory, name } = await this.parentOf(path, "read");
    let file: File | undefined;
    try {
      await directory.getDirectoryHandle(name);
    } catch (error) {
      if ((error as DOMException).name !== "TypeMismatchError") throw error;
      file = await (await directory.getFileHandle(name)).getFile();
    }
    const time = file?.lastModified ?? Date.now();
    return {
      isDirectory: () => !file,
      isFile: () => !!file,
      ctimeMs: time,
      mtimeMs: time,
    } as LightningFS.Stats;
  }

  public async mkdir(path: string): Promise<void> {
    const [root, parts] = await this.helper(path, "readwrite");
    let directory = root;
    for (const name of parts) {
      directory = await directory.getDirectoryHandle(name, { create: true });
    }
  }

  public async exists(path: string): Promise<boolean> {
    const [root, parts] = await this.helper(path, "read");
    try {
      const directory = await this.directoryAt(root, parts.slice(0, -1));
      const name = parts[parts.length - 1];
      try {
        await directory.getFileHandle(name);
      } catch {
        await directory.getDirectoryHandle(name);
      }
      return true;
    } catch {
      return false;
    }
  }

  public rmdir(path: string): Promise<void> {
    return this.unlink(path);
  }

  public mkdirp = this.mkdir;

  /**
   * Assuming rename only file but not path
   * @param oldPath
   * @param newPath
   */
  public async rename(oldPath: string, newPath: string): Promise<void> {
    const data = await this.readFile(oldPath, { encoding: "utf-8" }); // Could be buggy for binary file
    await this.writeFile(newPath, data as any);
    await this.unlink(oldPath);
  }
}
