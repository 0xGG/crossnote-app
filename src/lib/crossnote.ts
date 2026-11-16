import { DEFAULT_CORS_PROXY } from "../config";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import path from "path-browserify";
import PouchDB from "pouchdb";
import PouchdbFind from "pouchdb-find";
import { notebookNameFromGitURL, randomID } from "../utilities/utils";
import { fs, pfs } from "./fs";
import { Notebook } from "./notebook";
import { needsRecovery, notebookOperation } from "./notebookOperation";
import {
  hasTextConflicts,
  mergeFile,
  NotebookConflictError,
  sameBytes,
} from "./mergeFiles";
import {
  deletePullRecovery,
  readPullRecovery,
  savePullRecovery,
  type FileBytes,
  type ConflictDeletions,
  type PullRecovery,
} from "./pullRecovery";

/*
export interface Attachment {
  notebook: Notebook;
  filePath: string;
  content: string;
  createdAt: Date;
  modifiedAt: Date;
}
*/

interface CloneNotebookArgs {
  name?: string;
  corsProxy?: string;
  gitURL: string;
  branch?: string;
  depth?: number;
  username?: string;
  password?: string;
  rememberCredentials?: boolean;
  directoryHandle?: FileSystemDirectoryHandle;
}

// type ListAttachmentsArgs = ListNotesArgs;

export interface PushNotebookArgs {
  notebook: Notebook;
  authorName?: string;
  authorEmail?: string;
  username?: string;
  password?: string;
  message?: string;
  onProgress?: (progress: git.GitProgressEvent) => void;
  onMessage?: (message: string) => void;
  onAuthFailure?: (url: string) => void;
  onAuthSuccess?: (url: string) => void;
}

export interface PullNotebookArgs {
  notebook: Notebook;
  onProgress?: (progress: git.GitProgressEvent) => void;
  onMessage?: (message: string) => void;
  onAuthFailure?: (url: string) => void;
  onAuthSuccess?: (url: string) => void;
}

export type FetchNotebookArgs = PullNotebookArgs;

interface PullNotebookResult {
  numConflicts: number;
  cache: Cache;
  conflicts: string[];
  deletions?: ConflictDeletions;
}

type Cache = Record<string, FileBytes>;

interface NotebookDBEntry {
  // basic info
  _id: string;
  dir: string;
  name: string;

  // git
  gitURL: string;
  gitBranch: string;
  gitCorsProxy?: string;
  gitUsername?: string;
  gitPassword?: string;
  autoFetchPeriod: number; // in milliseconds
  fetchedAt: Date;
  remoteSha: string;
  localSha: string;
  directoryHandle?: FileSystemDirectoryHandle;
}

export function convertNotebookToNotebookDBEntry(
  notebook: Notebook,
  directoryHandle: FileSystemDirectoryHandle,
): NotebookDBEntry {
  return {
    _id: notebook._id,
    dir: notebook.dir,
    name: notebook.name,
    gitURL: notebook.gitURL,
    gitBranch: notebook.gitBranch,
    gitCorsProxy: notebook.gitCorsProxy,
    gitUsername: notebook.gitUsername,
    gitPassword: notebook.gitPassword,
    autoFetchPeriod: notebook.autoFetchPeriod,
    fetchedAt: notebook.fetchedAt,
    remoteSha: notebook.remoteSha,
    localSha: notebook.localSha,
    directoryHandle: directoryHandle,
  };
}

export default class Crossnote {
  private notebookDB: PouchDB.Database<NotebookDBEntry>;

  constructor() {
    PouchDB.plugin(PouchdbFind);
    this.notebookDB = new PouchDB("notebooks");
    this.notebookDB.createIndex({
      index: {
        fields: ["gitURL"],
      },
    });
  }

  public async addNotebook({
    name = "",
    corsProxy = "",
    gitURL = "",
    branch = "master",
    username = "",
    password = "",
    depth = 3,
    rememberCredentials = false,
    directoryHandle = null,
  }: CloneNotebookArgs) {
    if (gitURL) {
      return await this.cloneNotebook({
        name,
        corsProxy,
        gitURL,
        branch,
        username,
        password,
        depth,
        rememberCredentials,
      });
    } else {
      const _id = randomID();
      let dir = `/notebooks/${_id}`;
      if (directoryHandle) {
        dir = (
          await pfs.attachLocalDirectory({ id: _id, directoryHandle })
        ).replace(/\/+$/, "");
      }

      const notebook = new Notebook();
      notebook._id = _id;
      notebook.dir = dir;
      notebook.name = directoryHandle
        ? directoryHandle.name.trim()
        : name.trim() || "Unnamed";
      notebook.gitURL = gitURL.trim();
      notebook.gitBranch = branch.trim() || "master";
      notebook.gitCorsProxy = corsProxy.trim();
      notebook.gitUsername = rememberCredentials ? username.trim() : "";
      notebook.gitPassword = rememberCredentials ? password : "";
      notebook.autoFetchPeriod = 0;
      notebook.fetchedAt = new Date();
      notebook.remoteSha = "";
      notebook.localSha = "";

      if (directoryHandle) {
        notebook.isLocal = true;
      }

      if (!(await pfs.exists("/notebooks"))) {
        await pfs.mkdir("/notebooks");
      }
      if (!directoryHandle && !(await pfs.exists(dir))) {
        await pfs.mkdir(dir);
      }

      if (!directoryHandle) {
        await git.init({
          fs: fs,
          dir,
        });
      }
      // Before the record: a notebook recorded without its folder could
      // never take a note.
      await pfs.storeTree(dir);

      // Save to DB
      try {
        await this.notebookDB.put(
          convertNotebookToNotebookDBEntry(notebook, directoryHandle),
        );
      } catch (error) {
        console.error("failed to save to database");
        // Failed to save to DB
        if (!directoryHandle) {
          await pfs.rmdir(dir);
        }
      }

      return notebook;
    }
  }

  public async cloneNotebook({
    name = "",
    corsProxy,
    gitURL,
    branch = "master",
    username = "",
    password = "",
    depth = 10,
    rememberCredentials = false,
  }: CloneNotebookArgs): Promise<Notebook> {
    if (!gitURL.match(/^https?:\/\//)) {
      throw new Error("error/invalid-git-url-prefix");
    }

    // Check if gitURL exists
    /*
    let exists = false;
    try {
      const notebooks = await this.notebookDB.find({
        selector: {
          gitURL: { $eq: gitURL }
        }
      });
      if (notebooks.docs && notebooks.docs.length) {
        exists = true;
      }
    } catch (error) {
      exists = false;
    }

    if (exists) {
      throw new Error("error/repository-already-cloned");
    }*/

    const _id = randomID();
    const dir = `/notebooks/${_id}`;

    await git.clone({
      fs: fs,
      http,
      dir,
      corsProxy,
      url: gitURL,
      ref: branch.trim() || "master",
      depth: depth,
      singleBranch: true,
      onAuth: (url, auth) => {
        return {
          username,
          password,
        };
      },
    });

    const sha = await this.getGitSHA(
      dir,
      `origin/${branch.trim() || "master"}`,
    );
    // Before the record, as for a notebook made here.
    await pfs.storeTree(dir);

    const notebook: Notebook = new Notebook();
    notebook._id = _id;
    notebook.dir = dir;
    notebook.name = name || notebookNameFromGitURL(gitURL);
    notebook.gitURL = gitURL;
    notebook.gitBranch = branch.trim() || "master";
    notebook.gitCorsProxy = corsProxy;
    notebook.gitUsername = rememberCredentials ? username : "";
    notebook.gitPassword = rememberCredentials ? password : "";
    notebook.autoFetchPeriod = 3600000; // 60 minutes
    notebook.fetchedAt = new Date();
    notebook.localSha = sha;
    notebook.remoteSha = sha;

    // Save to DB
    try {
      await this.notebookDB.put(
        convertNotebookToNotebookDBEntry(notebook, null),
      );
    } catch (error) {
      // Failed to save to DB
      await pfs.rmdir(dir);
    }

    return notebook;
  }

  public async exportNotebookToJSON(notebook: Notebook): Promise<string> {
    return "";
  }

  public async importNotebookFromJSON(notebook: Notebook): Promise<string> {
    return "";
  }

  public async deleteNotebook(notebookID: string) {
    const notebook = await this.notebookDB.get(notebookID);
    // The record goes first. Removing the folder first could leave a record
    // whose folder is gone, a notebook that can take no notes, whenever the
    // record fails to go: the file system stores its tree on its own half a
    // second after the last change. The other way round, a failure leaves at
    // most a folder nothing lists.
    await this.notebookDB.remove(notebook);
    if (!notebook.directoryHandle) {
      await pfs.rmdir(notebook.dir);
    }
    await pfs.storeTree(notebook.dir);
  }
  public async updateNotebook(notebook: Notebook) {
    const nb = await this.notebookDB.get(notebook._id);
    nb.dir = notebook.dir;
    nb.name = notebook.name;
    nb.gitURL = notebook.gitURL;
    nb.gitBranch = notebook.gitBranch;
    nb.gitCorsProxy = notebook.gitCorsProxy;
    nb.gitUsername = notebook.gitUsername;
    nb.gitPassword = notebook.gitPassword;
    nb.autoFetchPeriod = notebook.autoFetchPeriod;
    nb.fetchedAt = notebook.fetchedAt;
    nb.remoteSha = notebook.remoteSha;
    nb.localSha = notebook.localSha;
    await this.notebookDB.put(nb, { force: true });
  }

  private async generateChangesCache(notebook: Notebook): Promise<Cache> {
    const cache: Cache = Object.create(null);
    for (const [file, head, work] of await git.statusMatrix({
      fs,
      dir: notebook.dir,
    })) {
      if (head === 0 && work === 0) continue;
      const bytes =
        work === 0
          ? null
          : new Uint8Array(
              (await pfs.readFile(
                path.resolve(notebook.dir, file),
              )) as Uint8Array,
            );
      // Git's stat shortcut compares timestamps only to whole seconds. An
      // equal-sized edit within that second can look unchanged. Before reset,
      // compare the bytes even for files the matrix calls clean.
      if (head === work) {
        const base = await git.readBlob({
          fs,
          dir: notebook.dir,
          oid: notebook.localSha,
          filepath: file,
        });
        if (sameBytes(bytes, base.blob)) continue;
      }
      cache[file] = bytes;
    }
    return cache;
  }

  public pushNotebook(args: PushNotebookArgs): Promise<null | git.PushResult> {
    return notebookOperation(args.notebook.dir, () =>
      this.pushNotebookUnlocked(args),
    );
  }

  private async pushNotebookUnlocked({
    notebook,
    authorName = "crossnote",
    authorEmail = "anonymous@crossnote.com",
    username,
    password,
    message = "doc: Updated docs",
    onProgress,
    onMessage,
    onAuthFailure,
    onAuthSuccess,
  }: PushNotebookArgs): Promise<null | git.PushResult> {
    // Pull notebook first
    const pullNotebookResult = await this.pullNotebookUnlocked({
      notebook,
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage,
    });

    if (pullNotebookResult.numConflicts > 0) {
      throw new NotebookConflictError(
        pullNotebookResult.conflicts,
        pullNotebookResult.deletions,
      );
    }

    const localSha = notebook.localSha;

    const sha = await git.commit({
      fs: fs,
      dir: notebook.dir,
      author: {
        name: authorName,
        email: authorEmail,
      },
      message,
    });

    const restoreSHA = async () => {
      const gitBranch = notebook.gitBranch || "master";
      // Perform a soft reset
      await pfs.writeFile(
        path.resolve(notebook.dir, `.git/refs/heads/${gitBranch}`),
        localSha,
      );
    };

    // console.log(sha);
    let pushResult: git.PushResult;
    try {
      pushResult = await git.push({
        fs: fs,
        http,
        onAuth: (url, auth) => {
          return {
            username: username, // || notebook.gitUsername,
            password: password, // || notebook.gitPassword
          };
        },
        onProgress: (progress) => {
          if (onProgress) {
            onProgress(progress);
          }
        },
        onMessage: (message) => {
          if (onMessage) {
            onMessage(message);
          }
        },
        onAuthFailure: (url, auth) => {
          if (onAuthFailure) {
            onAuthFailure(url);
          }
        },
        onAuthSuccess: (url, auth) => {
          if (onAuthSuccess) {
            onAuthSuccess(url);
          }
        },
        url: notebook.gitURL,
        dir: notebook.dir,
        ref: notebook.gitBranch,
        corsProxy: notebook.gitCorsProxy,
      });
    } catch (error) {
      await restoreSHA();
      await pfs.storeTree(notebook.dir);
      throw error;
    }

    if (pushResult.error) {
      await restoreSHA();
      await pfs.storeTree(notebook.dir);
      throw new Error(pushResult.error);
    }
    // The commit is made here whether or not the push went through.
    await pfs.storeTree(notebook.dir);

    if (pushResult.ok) {
      // Update notebook
      notebook.fetchedAt = new Date();
      notebook.localSha = sha;
      notebook.remoteSha = sha;
      await this.updateNotebook(notebook);
    }
    return pushResult;
  }

  public async getGitSHA(dir: string, ref: string = "master"): Promise<string> {
    try {
      let logs = await git.log({
        fs: fs,
        dir: dir,
        ref: ref,
        depth: 5,
      });
      if (logs.length > 0) {
        return (logs && logs[0]).oid;
      } else {
        return "";
      }
    } catch (error) {
      return "";
    }
  }

  public async hardResetNotebook(
    notebook: Notebook,
    sha: string,
    force = false,
  ) {
    await pfs.writeFile(
      path.resolve(notebook.dir, `.git/refs/heads/${notebook.gitBranch}`),
      sha,
    );
    const index = path.resolve(notebook.dir, `.git/index`);
    if (await pfs.exists(index)) await pfs.unlink(index);
    await git.checkout({
      dir: notebook.dir,
      fs: fs,
      ref: notebook.gitBranch || "master",
      force,
    });
    await pfs.storeTree(notebook.dir);
  }

  private checkedPath(notebook: Notebook, file: string): string {
    if (
      !file ||
      file
        .split("/")
        .some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            part.toLowerCase() === ".git",
        ) ||
      /\\/.test(file)
    ) {
      throw new Error("Invalid recovery file path");
    }
    return path.resolve(notebook.dir, file);
  }

  private async restoreFilesFromCache(
    cache: Cache,
    notebook: Notebook,
  ): Promise<void> {
    for (const [file, bytes] of Object.entries(cache)) {
      const target = this.checkedPath(notebook, file);
      if (bytes === null) {
        if (await pfs.exists(target)) await pfs.unlink(target);
        await git.remove({ fs, dir: notebook.dir, filepath: file });
      } else {
        await pfs.mkdirp(path.dirname(target));
        await pfs.writeFile(target, bytes);
        await git.add({ fs, dir: notebook.dir, filepath: file });
      }
    }
  }

  private async pendingPull(
    notebook: Notebook,
  ): Promise<PullRecovery | undefined> {
    const pending = await readPullRecovery(notebook._id);
    if (pending) {
      if (pending.version !== 1)
        throw new Error("Unknown pull recovery version");
      return pending;
    }
    const legacy = localStorage.getItem(`pending/pull/${notebook._id}`);
    if (!legacy) return;
    const old = JSON.parse(legacy) as {
      localSha: string;
      cache: Record<string, { status: string; markdown: string }>;
    };
    const files: Cache = Object.create(null);
    for (const [file, entry] of Object.entries(old.cache)) {
      this.checkedPath(notebook, file);
      files[file] =
        entry.status.replace(/^\*/, "") === "deleted"
          ? null
          : new TextEncoder().encode(entry.markdown);
    }
    const upgraded: PullRecovery = {
      version: 1,
      localSha: old.localSha || notebook.localSha,
      remoteSha: old.localSha || notebook.localSha,
      files,
      conflicts: [],
    };
    await savePullRecovery(notebook._id, upgraded);
    return upgraded;
  }

  private async finishPull(
    notebook: Notebook,
    recovery: PullRecovery,
  ): Promise<void> {
    // Replay the same planned bytes, including stable conflict-copy names.
    // Nothing deletes the recovery record on a failed reset, write or flush.
    needsRecovery(notebook.dir, true);
    const remoteFiles = new Set(
      await git.listFiles({ fs, dir: notebook.dir, ref: recovery.remoteSha }),
    );
    const baseFiles = await git.listFiles({
      fs,
      dir: notebook.dir,
      ref: recovery.localSha,
    });
    for (const file of new Set([...baseFiles, ...(recovery.relocated ?? [])])) {
      if (
        !remoteFiles.has(file) &&
        !Object.prototype.hasOwnProperty.call(recovery.files, file)
      ) {
        const target = this.checkedPath(notebook, file);
        if (
          (await pfs.exists(target)) &&
          !(await pfs.stats(target)).isDirectory()
        )
          await pfs.unlink(target);
      }
    }
    // Checkout cannot write a file over a directory, even when all its former
    // files have been removed. Only empty directories are disposable: an
    // unexpected file must stop recovery rather than be recursively deleted.
    const removeEmptyDirectory = async (dir: string): Promise<void> => {
      for (const entry of await pfs.readdir(dir)) {
        const child = path.join(dir, entry);
        if (!(await pfs.stats(child)).isDirectory())
          throw new Error(`Unplanned file blocks Git checkout: ${child}`);
        await removeEmptyDirectory(child);
      }
      await pfs.rmdir(dir);
    };
    for (const file of remoteFiles) {
      const target = this.checkedPath(notebook, file);
      if ((await pfs.exists(target)) && (await pfs.stats(target)).isDirectory())
        await removeEmptyDirectory(target);
    }
    await this.hardResetNotebook(notebook, recovery.remoteSha, true);
    // A reset removes the old index. Include every remote file before applying
    // local additions/deletions, so the next commit cannot drop untouched files.
    for (const file of remoteFiles) {
      // This git version logs individual checkout write failures and resolves.
      // Never stage stale working bytes as the downloaded remote version.
      if (!Object.prototype.hasOwnProperty.call(recovery.files, file)) {
        const expected = await git.readBlob({
          fs,
          dir: notebook.dir,
          oid: recovery.remoteSha,
          filepath: file,
        });
        const target = this.checkedPath(notebook, file);
        const actual = (await pfs.exists(target))
          ? ((await pfs.readFile(target)) as Uint8Array)
          : null;
        if (!sameBytes(actual, expected.blob))
          throw new Error(`Git checkout did not restore ${file}`);
      }
      await git.add({ fs, dir: notebook.dir, filepath: file });
    }
    await this.restoreFilesFromCache(recovery.files, notebook);
    await pfs.storeTree(notebook.dir);
    notebook.localSha = recovery.remoteSha;
    notebook.remoteSha = recovery.remoteSha;
    notebook.fetchedAt = new Date();
    await this.updateNotebook(notebook);
    // Delete legacy data first: failure leaves the committed new record.
    localStorage.removeItem(`pending/pull/${notebook._id}`);
    await deletePullRecovery(notebook._id);
    needsRecovery(notebook.dir, false);
  }

  public async resumeNotebook(notebook: Notebook): Promise<void> {
    await notebookOperation(notebook.dir, async () => {
      const pending = await this.pendingPull(notebook);
      if (pending) {
        await this.finishPull(notebook, pending);
        if (pending.conflicts.length)
          throw new NotebookConflictError(pending.conflicts, pending.deletions);
      }
    });
  }

  public pullNotebook(args: PullNotebookArgs): Promise<PullNotebookResult> {
    return notebookOperation(args.notebook.dir, () =>
      this.pullNotebookUnlocked(args),
    );
  }

  private async pullNotebookUnlocked({
    notebook,
    onProgress,
    onAuthFailure,
    onAuthSuccess,
    onMessage,
  }: PullNotebookArgs): Promise<PullNotebookResult> {
    const previous = await this.pendingPull(notebook);
    if (previous) {
      await this.finishPull(notebook, previous);
      // A retried interrupted pull must still stop this push on conflicts.
      if (previous.conflicts.length)
        return {
          numConflicts: previous.conflicts.length,
          conflicts: previous.conflicts,
          deletions: previous.deletions,
          cache: previous.files,
        };
    }
    const fetched = await git.fetch({
      fs,
      http,
      dir: notebook.dir,
      singleBranch: true,
      corsProxy: notebook.gitCorsProxy,
      ref: notebook.gitBranch || "master",
      onAuth: () => ({
        username: notebook.gitUsername,
        password: notebook.gitPassword,
      }),
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage,
    });
    const cache = await this.generateChangesCache(notebook);
    const localSha = notebook.localSha;
    const remoteSha = fetched.fetchHead;
    const baseFiles = new Set(
      await git.listFiles({ fs, dir: notebook.dir, ref: localSha }),
    );
    const remoteFiles = new Set(
      await git.listFiles({ fs, dir: notebook.dir, ref: remoteSha }),
    );
    // A remote file may replace a local directory. Preserve untracked/ignored
    // children too; Git's status matrix need not include those files.
    const collectUntracked = async (dir: string): Promise<void> => {
      for (const name of await pfs.readdir(this.checkedPath(notebook, dir))) {
        const file = `${dir}/${name}`;
        const target = this.checkedPath(notebook, file);
        if ((await pfs.stats(target)).isDirectory())
          await collectUntracked(file);
        else if (!baseFiles.has(file) && !(file in cache))
          cache[file] = new Uint8Array(
            (await pfs.readFile(target)) as Uint8Array,
          );
      }
    };
    for (const file of remoteFiles) {
      const target = this.checkedPath(notebook, file);
      if ((await pfs.exists(target)) && (await pfs.stats(target)).isDirectory())
        await collectUntracked(file);
      const parts = file.split("/");
      parts.pop();
      while (parts.length) {
        const ancestor = parts.join("/");
        const target = this.checkedPath(notebook, ancestor);
        if (
          (await pfs.exists(target)) &&
          !(await pfs.stats(target)).isDirectory() &&
          !(ancestor in cache)
        )
          cache[ancestor] = new Uint8Array(
            (await pfs.readFile(target)) as Uint8Array,
          );
        parts.pop();
      }
    }
    const reserved = new Set([
      ...baseFiles,
      ...remoteFiles,
      ...Object.keys(cache),
    ]);
    const files: Cache = Object.create(null);
    const conflicts: string[] = [];
    const deletions: ConflictDeletions = Object.create(null);
    const relocated: string[] = [];
    const overlaps = (a: string, b: string) =>
      a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
    const copyPath = async (file: string, side: "local" | "remote") => {
      // A relocated local file cannot retain an ancestor that is now a remote
      // file. Put it at the notebook root and report both paths to the user.
      const name =
        side === "local" ||
        [...reserved].some((entry) => file.startsWith(`${entry}/`))
          ? path.basename(file)
          : file;
      const ext = path.extname(name);
      const stem = name.slice(0, name.length - ext.length);
      let copy: string;
      let suffix = 0;
      do {
        copy = `${stem}.${side}-${remoteSha.slice(0, 8)}${suffix ? `-${suffix}` : ""}${ext}`;
        suffix++;
      } while (
        [...reserved].some((entry) => overlaps(entry, copy)) ||
        (await pfs.exists(this.checkedPath(notebook, copy)))
      );
      reserved.add(copy);
      return copy;
    };
    const blob = async (
      sha: string,
      file: string,
      listed: Set<string>,
    ): Promise<FileBytes> =>
      listed.has(file)
        ? (
            await git.readBlob({
              fs,
              dir: notebook.dir,
              oid: sha,
              filepath: file,
            })
          ).blob
        : null;
    for (const [file, ours] of Object.entries(cache)) {
      this.checkedPath(notebook, file);
      const merged = mergeFile(
        file,
        await blob(localSha, file, baseFiles),
        ours,
        await blob(remoteSha, file, remoteFiles),
      );
      if (
        [...remoteFiles].some(
          (remote) => remote !== file && overlaps(remote, file),
        )
      ) {
        // A deletion at this path must not unlink the new remote directory or
        // remove its ancestor from the index. Nonempty local versions move to
        // stable, non-conflicting names before the plan is published.
        if (merged.bytes !== null) {
          const copy = await copyPath(file, "local");
          files[copy] = merged.bytes;
          relocated.push(file);
          conflicts.push(file, copy);
        }
        continue;
      }
      files[file] = merged.bytes;
      if (merged.conflict) conflicts.push(file);
      if (merged.deleted) deletions[file] = merged.deleted;
      if (merged.copy) {
        const copy = await copyPath(file, "remote");
        files[copy] = merged.copy;
        conflicts.push(copy);
      }
    }
    const recovery: PullRecovery = {
      version: 1,
      localSha,
      remoteSha,
      files,
      conflicts,
      deletions,
      relocated,
    };
    // Recovery references the fetched commit and its objects. Persist their
    // directory entries before publishing a plan a new page must replay.
    await pfs.storeTree(notebook.dir);
    await savePullRecovery(notebook._id, recovery);
    await this.finishPull(notebook, recovery);
    return { numConflicts: conflicts.length, conflicts, deletions, cache };
  }

  public fetchNotebook(args: FetchNotebookArgs): Promise<boolean> {
    return notebookOperation(args.notebook.dir, () =>
      this.fetchNotebookUnlocked(args),
    );
  }

  private async fetchNotebookUnlocked({
    notebook,
    onProgress,
    onAuthFailure,
    onAuthSuccess,
    onMessage,
  }: FetchNotebookArgs): Promise<boolean> {
    const localSha = notebook.localSha;
    const result = await git.fetch({
      fs: fs,
      http,
      dir: notebook.dir,
      singleBranch: true,
      tags: false,
      depth: 1,
      corsProxy: notebook.gitCorsProxy,
      url: notebook.gitURL,
      ref: notebook.gitBranch || "master",
      onAuth: (url, auth) => {
        return {
          username: notebook.gitUsername,
          password: notebook.gitPassword,
        };
      },
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage,
    });

    await pfs.storeTree(notebook.dir);

    // Update notebook
    notebook.fetchedAt = new Date();
    notebook.localSha = localSha;
    notebook.remoteSha = result.fetchHead;
    await this.updateNotebook(notebook);

    return localSha !== result.fetchHead;
  }

  public markdownHasConflicts(markdown: string): boolean {
    return hasTextConflicts(markdown);
  }

  public async listNotebooks(): Promise<Notebook[]> {
    const notebookEntries = (
      await this.notebookDB.find({
        selector: {
          gitURL: { $gt: null },
        },
      })
    ).docs;
    const notebooks: Notebook[] = [];
    for (let i = 0; i < notebookEntries.length; i++) {
      const n = notebookEntries[i];
      const notebook = new Notebook();
      notebook._id = n._id;
      notebook.dir = n.dir;
      notebook.name = n.name;
      notebook.gitURL = n.gitURL;
      notebook.gitBranch = n.gitBranch;
      notebook.gitCorsProxy = n.gitCorsProxy;
      notebook.gitUsername = n.gitUsername;
      notebook.gitPassword = n.gitPassword;
      notebook.autoFetchPeriod = n.autoFetchPeriod;
      notebook.fetchedAt = n.fetchedAt;
      notebook.remoteSha = n.remoteSha;
      notebook.localSha = n.localSha;

      if (
        typeof notebook.gitCorsProxy === "string" &&
        notebook.gitCorsProxy.startsWith("https://crossnote.app/cors")
      ) {
        notebook.gitCorsProxy = DEFAULT_CORS_PROXY;
      }

      if (n.directoryHandle) {
        // local notebook
        const dir = (
          await pfs.attachLocalDirectory({
            id: n._id,
            directoryHandle: n.directoryHandle,
          })
        ).replace(/\/+$/, "");
        notebook.dir = dir;
        notebook.isLocal = true;
      }

      notebooks.push(notebook);
    }

    const promises = notebooks.map((notebook, i) => {
      return (async (i: number) => {
        const notebook = notebooks[i];
        notebook.fetchedAt = new Date(notebook.fetchedAt || 0);
        if (notebook.gitURL.trim().length <= 0) {
          // no remote set
          return;
        }
        if (typeof notebook.autoFetchPeriod === "undefined") {
          notebook.autoFetchPeriod = 3600000; // 60 minutes
        }
        if (typeof notebook.localSha === "undefined") {
          notebook.localSha = await this.getGitSHA(
            notebook.dir,
            `origin/${notebook.gitBranch}`,
          );
        }
        if (typeof notebook.remoteSha === "undefined") {
          notebook.remoteSha = notebook.localSha;
        }
        const gitBranch = notebook.gitBranch || "master";
        const sha = notebook.localSha || "";
        try {
          // Perform a soft reset
          await pfs.writeFile(
            path.resolve(notebook.dir, `.git/refs/heads/${gitBranch}`),
            sha,
          );

          const pendingPull = await this.pendingPull(notebook);
          if (pendingPull) await this.finishPull(notebook, pendingPull);

          const status = await git.status({
            fs: fs,
            dir: notebook.dir,
            filepath: ".",
          });

          // check: absent, deleted, undeleted
          if (status.match(/(absent|deleted)/) || pendingPull) {
            // NOTE: Seems like there is a bug somewhere that caused all files to become *undeleted
            // So we run git.add again.
            await git.add({
              fs: fs,
              dir: notebook.dir,
              filepath: ".",
            });
          }
          await pfs.storeTree(notebook.dir);
        } catch (error) {
          notebooks[i] = null;
        }
      })(i);
    });

    await Promise.all(promises);

    return notebooks
      .filter((nb) => nb)
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  /*
  public async listAttachments({
    notebook,
    dir = "./",
    includeSubdirectories = false,
  }: ListAttachmentsArgs): Promise<Attachment[]> {
    let attachments: Attachment[] = [];
    let files: string[] = [];
    try {
      files = await pfs.readdir(path.resolve(notebook.dir, dir));
    } catch (error) {
      files = [];
    }
    const listAttachmentsPromises = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const absFilePath = path.resolve(notebook.dir, dir, file);
      const stats = await pfs.stats(absFilePath);
      if (
        stats.isFile() &&
        !absFilePath.endsWith(".md") &&
        isFileAnImage(file) // TODO: We only support images for now. Supports other types of files in the future
      ) {
        const attachment: Attachment = {
          notebook,
          filePath: path.relative(notebook.dir, absFilePath),
          content: isBinarySync(file)
            ? ""
            : ((await pfs.readFile(absFilePath, {
                encoding: "utf8",
              })) as string),
          createdAt: new Date(stats.ctimeMs),
          modifiedAt: new Date(stats.mtimeMs),
        };
        attachments.push(attachment);
        if (isBinarySync(file)) {
        } else {
        }
      }

      if (stats.isDirectory() && file !== ".git" && includeSubdirectories) {
        listAttachmentsPromises.push(
          this.listAttachments({
            notebook,
            dir: path.relative(notebook.dir, absFilePath),
            includeSubdirectories,
          }),
        );
      }
    }

    const res = await Promise.all(listAttachmentsPromises);
    res.forEach((r) => {
      attachments = attachments.concat(r);
    });

    return attachments;
  }
  */

  public async getStatus(notebookPath: string, filePath: string) {
    return await git.status({
      fs: fs,
      dir: notebookPath,
      filepath: filePath,
    });
  }
}
