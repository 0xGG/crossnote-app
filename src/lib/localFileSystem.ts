// Local File System API

import { Stats } from "fs";
import { randomID } from "../utilities/utils";

export interface ReadFileOptions {
  encoding?: string;
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
  private directoryHandleMap: { [key: string]: FileSystemDirectoryHandle } = {};
  private _prefix: string;

  constructor() {
    this._prefix = randomID();
  }

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
    this.directoryHandleMap[rootDir] = directoryHandle;
    return rootDir;
  }

  public isPathOfLocalFileSystem(path: string) {
    return path.startsWith("/" + this._prefix);
  }

  private async helper(
    path: string,
    mode: FileSystemPermissionMode = "readwrite",
  ): Promise<[FileSystemDirectoryHandle, string[]]> {
    const pathArr = path.replace(/\/+$/, "").split("/");
    const rootDir = "/" + pathArr[1] + "/" + pathArr[2] + "/";
    const directoryHandle = this.directoryHandleMap[rootDir];
    await verifyPermission(directoryHandle, mode);
    return [directoryHandle, pathArr.slice(3, pathArr.length)];
  }

  public async readFile(
    path: string,
    opts: ReadFileOptions = { encoding: "" },
  ): Promise<string | Uint8Array> {
    let [directoryHandle, pathArr] = await this.helper(path, "read");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      let i = 0;
      for (; i < pathArr.length - 1; i++) {
        directoryHandle = await directoryHandle.getDirectoryHandle(pathArr[i]);
      }
      const file = await (
        await directoryHandle.getFileHandle(pathArr[i])
      ).getFile();
      if (opts.encoding && opts.encoding.match(/^utf-?8$/i)) {
        return file.text();
      } else {
        return new Uint8Array(await file.arrayBuffer());
      }
    }
  }

  public async writeFile(path: string, data: string): Promise<void> {
    let [directoryHandle, pathArr] = await this.helper(path, "readwrite");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      let i = 0;
      for (; i < pathArr.length - 1; i++) {
        directoryHandle = await directoryHandle.getDirectoryHandle(pathArr[i], {
          create: true,
        });
      }
      const fileHandle = await directoryHandle.getFileHandle(pathArr[i], {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
    }
  }

  public async readdir(path: string): Promise<string[]> {
    let [directoryHandle, pathArr] = await this.helper(path, "read");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      let i = 0;
      for (; i < pathArr.length; i++) {
        directoryHandle = await directoryHandle.getDirectoryHandle(pathArr[i]);
      }
      const names = [];
      for await (const entry of directoryHandle.values()) {
        names.push(entry.name);
      }
      return names;
    }
  }

  public async unlink(path: string): Promise<void> {
    let [directoryHandle, pathArr] = await this.helper(path, "readwrite");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      let i = 0;
      for (; i < pathArr.length - 1; i++) {
        directoryHandle = await directoryHandle.getDirectoryHandle(pathArr[i]);
      }
      return await directoryHandle.removeEntry(pathArr[i], { recursive: true });
    }
  }

  public async stats(path: string): Promise<Stats> {
    let [directoryHandle, pathArr] = await this.helper(path, "read");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      let i = 0;
      for (; i < pathArr.length - 1; i++) {
        directoryHandle = await directoryHandle.getDirectoryHandle(pathArr[i]);
      }
      let fHandle: FileSystemFileHandle = null;
      let dHandle: FileSystemDirectoryHandle = null;
      try {
        dHandle = await directoryHandle.getDirectoryHandle(pathArr[i]);
      } catch (error) {
        try {
          fHandle = await directoryHandle.getFileHandle(pathArr[i]);
        } catch (error) {
          throw error;
        }
      }
      const stats: any = {
        isDirectory: () => {
          return !!dHandle;
        },
        isFile: () => {
          return !!fHandle;
        },
        ctimeMs: fHandle ? (await fHandle.getFile()).lastModified : Date.now(),
        mtimeMs: fHandle ? (await fHandle.getFile()).lastModified : Date.now(),
      };
      return stats;
    }
  }

  public async mkdir(path: string): Promise<void> {
    let [directoryHandle, pathArr] = await this.helper(path, "readwrite");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 0; i < pathArr.length; i++) {
        directoryHandle = await directoryHandle.getDirectoryHandle(pathArr[i], {
          create: true,
        });
      }
    }
  }

  public async exists(path: string): Promise<boolean> {
    let [directoryHandle, pathArr] = await this.helper(path, "read");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      let i = 0;
      for (; i < pathArr.length - 1; i++) {
        try {
          directoryHandle = await directoryHandle.getDirectoryHandle(
            pathArr[i],
          );
        } catch (error) {
          return false;
        }
      }
      try {
        await directoryHandle.getFileHandle(pathArr[i]);
        return true;
      } catch (error) {
        try {
          await directoryHandle.getDirectoryHandle(pathArr[i]);
          return true;
        } catch (error) {
          return false;
        }
      }
    }
  }

  public async rmdir(path: string): Promise<void> {
    let [directoryHandle, pathArr] = await this.helper(path, "readwrite");
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      let i = 0;
      for (; i < pathArr.length - 1; i++) {
        directoryHandle = await directoryHandle.getDirectoryHandle(pathArr[i]);
      }
      return await directoryHandle.removeEntry(pathArr[i], { recursive: true });
    }
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
