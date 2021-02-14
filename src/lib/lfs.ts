// Local File System API

import { Stats } from "fs";
import { randomID } from "../utilities/utils";

export default class LocalFileSystem {
  private directoryHandleMap: { [key: string]: FileSystemDirectoryHandle } = {};
  private _prefix = randomID();

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
    return path.startsWith(this._prefix);
  }

  private helper(path: string): [FileSystemDirectoryHandle, string[]] {
    const pathArr = path.split("/");
    const rootDir = "/" + pathArr[1] + "/" + pathArr[2] + "/";
    const directoryHandle = this.directoryHandleMap[rootDir];
    return [directoryHandle, pathArr];
  }

  public async readFile(path: string): Promise<string> {
    let [directoryHandle, pathArr] = this.helper(path);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 3; i < pathArr.length; i++) {
        if (i === pathArr.length - 1) {
          // file
          return (
            await (await directoryHandle.getFileHandle(pathArr[i])).getFile()
          ).text();
        } else {
          // directory
          directoryHandle = await directoryHandle.getDirectoryHandle(
            pathArr[i],
          );
        }
      }
    }
  }

  public async writeFile(path: string, data: string): Promise<void> {
    let [directoryHandle, pathArr] = this.helper(path);
    console.log("writeFile", directoryHandle, pathArr);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 3; i < pathArr.length; i++) {
        console.log(i);
        if (i === pathArr.length - 1) {
          // file
          const fileHandle = await directoryHandle.getFileHandle(pathArr[i], {
            create: true,
          });
          const writable = await fileHandle.createWritable();
          await writable.write(data);
          await writable.close();
        } else {
          // directory
          directoryHandle = await directoryHandle.getDirectoryHandle(
            pathArr[i],
            { create: true },
          );
        }
      }
    }
  }

  public async readdir(path: string): Promise<string[]> {
    const [directoryHandle] = this.helper(path);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      const names = [];
      for await (const entry of directoryHandle.values()) {
        names.push(entry.name);
      }
      console.log("readdir", names);
      return names;
    }
  }

  public async unlink(path: string): Promise<void> {
    let [directoryHandle, pathArr] = this.helper(path);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 3; i < pathArr.length; i++) {
        if (i === pathArr.length - 1) {
          directoryHandle.removeEntry(pathArr[i], { recursive: true });
        } else {
          directoryHandle = await directoryHandle.getDirectoryHandle(
            pathArr[i],
          );
        }
      }
    }
  }

  public async stats(path: string): Promise<Stats> {
    let [directoryHandle, pathArr] = this.helper(path);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 3; i < pathArr.length; i++) {
        if (i === pathArr.length - 1) {
          let isDirectory_ = false;
          try {
            await directoryHandle.getDirectoryHandle(pathArr[i]);
            isDirectory_ = true;
          } catch (error) {
            isDirectory_ = false;
          }
          const stats: any = {
            isDirectory: () => {
              return isDirectory_;
            },
            isFile: () => {
              return !isDirectory_;
            },
          };
          return stats;
        } else {
          directoryHandle = await directoryHandle.getDirectoryHandle(
            pathArr[i],
          );
        }
      }
    }
  }

  public async mkdir(path: string): Promise<void> {
    let [directoryHandle, pathArr] = this.helper(path);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 3; i < pathArr.length; i++) {
        directoryHandle.getDirectoryHandle(pathArr[i], { create: true });
      }
    }
  }

  public async exists(path: string): Promise<boolean> {
    let [directoryHandle, pathArr] = this.helper(path);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 3; i < pathArr.length; i++) {
        if (i === pathArr.length - 1) {
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
        } else {
          try {
            directoryHandle.getDirectoryHandle(pathArr[i], { create: true });
          } catch (error) {
            return false;
          }
        }
      }
    }
  }

  public async rmdir(path: string): Promise<void> {
    let [directoryHandle, pathArr] = this.helper(path);
    if (!directoryHandle) {
      throw new Error(`${path} is not valid`);
    } else {
      for (let i = 3; i < pathArr.length; i++) {
        if (i === pathArr.length - 1) {
          directoryHandle.removeEntry(pathArr[i], { recursive: true });
        } else {
          directoryHandle = await directoryHandle.getDirectoryHandle(
            pathArr[i],
          );
        }
      }
    }
  }

  public mkdirp = this.mkdir;
}
