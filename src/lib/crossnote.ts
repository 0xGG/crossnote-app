import { DEFAULT_CORS_PROXY } from "../config";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { decode } from "isomorphic-textencoder";
import ignore, { type Ignore } from "ignore";
import path from "path-browserify";
import PouchDB from "pouchdb";
import PouchdbFind from "pouchdb-find";
import { notebookNameFromGitURL, randomID } from "../utilities/utils";
import { fs, missingFileOrThrow, pfs } from "./fs";
import { EventType, globalEmitter } from "./event";
import { Notebook } from "./notebook";
import { RecoveryDirectoryCollisionError } from "./recoveryDirectory";
import {
  IgnoredUploadFileError,
  needsRecovery,
  notebookOperation,
} from "./notebookOperation";
import {
  hasTextConflicts,
  mergeFile,
  mergeableText,
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
  type StoredPullRecovery,
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

export type NotebookSettings = Pick<
  Notebook,
  "name" | "gitCorsProxy" | "gitUsername" | "gitPassword" | "autoFetchPeriod"
>;

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
  status?: "up-to-date" | "pending-upload";
  ignoredUploadFile?: string;
  numConflicts: number;
  cache: Cache;
  conflicts: string[];
  deletions?: ConflictDeletions;
}

type Cache = Record<string, FileBytes>;

const recoveryHeader = "# Crossnote recovered files";
const recoveredMarker = `${recoveryHeader}\n*\n`;
const recoveredDirectory = (suffix: number) =>
  `.crossnote-recovered${suffix ? `-${suffix}` : ""}`;
const recoveryDirectoryName = /^\.crossnote-recovered(?:-\d+)?$/;
const legacyRecoveryDirectoryName =
  /^\.crossnote-recovery\.local-[0-9a-f]{8}(?:-\d+)?$/;
const recoveryFilesChanged = () => new Error("error/recovery-files-changed");

// Git interprets a missing ref as the index. An unborn branch has an empty
// base tree regardless of which files the user has already staged.
async function filesAtCommit(dir: string, sha: string): Promise<string[]> {
  return sha ? git.listFiles({ fs, dir, ref: sha }) : [];
}

const branchName = (branch: string) =>
  (branch || "master").replace(/^refs\/heads\//, "");
const branchRef = (branch: string) => `refs/heads/${branchName(branch)}`;

async function refSha(dir: string, ref: string): Promise<string> {
  try {
    return await git.resolveRef({ fs, dir, ref });
  } catch (error) {
    if (error instanceof git.Errors.NotFoundError) return "";
    throw error;
  }
}

// Match the working tree or a planned set of rules using Git 1.3.1's matcher.
// An excluded parent wins before a nested rule can re-include its children.
function ignoreCheck(dir: string, overrides?: Map<string, string>) {
  const matchers = new Map<string, Ignore>();
  return async (filepath: string) => {
    if (path.basename(filepath) === ".git") return true;
    let ignored = false;
    const parts = filepath.split("/");
    for (let depth = 0; depth < parts.length; depth++) {
      const folder = path.join(...parts.slice(0, depth));
      let matcher = matchers.get(folder);
      if (!matcher) {
        let contents = overrides?.get(folder);
        if (contents === undefined) {
          const rule = path.join(dir, folder, ".gitignore");
          const stats = await pfs.stats(rule).catch(missingFileOrThrow);
          contents = stats?.isFile()
            ? ((await pfs.readFile(rule, { encoding: "utf8" })) as string)
            : "";
        }
        matcher = ignore().add(contents);
        matchers.set(folder, matcher);
      }
      const relative = parts.slice(depth).join("/");
      const parent = path.dirname(relative);
      if (parent !== "." && matcher.ignores(parent)) return true;
      const result = matcher.test(relative);
      if (result.ignored || result.unignored) ignored = result.ignored;
    }
    return ignored;
  };
}

async function prepareUploadIndex(
  dir: string,
  changes: Cache,
): Promise<boolean> {
  const args = { fs, dir };
  const isIgnored = ignoreCheck(dir);
  const unchecked = new Set<string>();
  for (const [file, head, work, index] of await git.statusMatrix(args)) {
    if (
      work &&
      (work !== index || file in changes) &&
      (await isIgnored(file))
    ) {
      if (!head && index) {
        // A draft staged before the ignore rule changed must stay local.
        await git.remove({ ...args, filepath: file });
        continue;
      }
      unchecked.add(file);
    }
  }

  // Only the committed tree and index determine what the next commit changes.
  // The working directory can hide a staged deletion from the status matrix.
  const fileVersion = async (entry: git.WalkerEntry | null) =>
    entry && (await entry.type()) !== "tree"
      ? `${await entry.mode()} ${await entry.oid()}`
      : null;
  let hasStagedChanges = false;
  await git.walk({
    ...args,
    trees: [git.TREE({ ref: "HEAD" }), git.STAGE()],
    map: async (file, [head, entry]) => {
      if (
        !hasStagedChanges &&
        (await fileVersion(head)) !== (await fileVersion(entry))
      )
        hasStagedChanges = true;
      // Git add can skip ignored edits even when cached file stats match.
      if (!unchecked.has(file)) return;
      const object = (await pfs.readFile(path.join(dir, file))) as Uint8Array;
      if ((await git.hashBlob({ object })).oid === (await entry?.oid()))
        unchecked.delete(file);
    },
  });
  const [unstaged] = unchecked;
  if (unstaged) throw new IgnoredUploadFileError(unstaged);
  return hasStagedChanges;
}

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
  remoteSha: string | null;
  localSha: string;
  blockedUploadPaths?: string[];
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

    const gitBranch = branch.trim() || "master";
    await git.clone({
      fs: fs,
      http,
      dir,
      corsProxy,
      url: gitURL,
      ref: branchRef(gitBranch),
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
      `refs/remotes/origin/${branchName(gitBranch)}`,
    );
    // Before the record, as for a notebook made here.
    await pfs.storeTree(dir);

    const notebook: Notebook = new Notebook();
    notebook._id = _id;
    notebook.dir = dir;
    notebook.name = name || notebookNameFromGitURL(gitURL);
    notebook.gitURL = gitURL;
    notebook.gitBranch = gitBranch;
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

  public saveNotebookSettings(notebook: Notebook, draft: NotebookSettings) {
    const settings = {
      name: draft.name,
      gitCorsProxy: draft.gitCorsProxy,
      gitUsername: draft.gitUsername,
      gitPassword: draft.gitPassword,
      autoFetchPeriod: draft.autoFetchPeriod,
    };
    return notebookOperation(notebook.dir, async () => {
      const record = await this.notebookDB.get(notebook._id);
      await this.notebookDB.put({ ...record, ...settings });
      Object.assign(notebook, settings);
    });
  }

  public async deleteNotebook(
    notebookID: string,
  ): Promise<void | { cleanupError: unknown }> {
    const notebook = await this.notebookDB.get(notebookID);
    // The record goes first. Removing the folder first could leave a record
    // whose folder is gone, a notebook that can take no notes, whenever the
    // record fails to go: the file system stores its tree on its own half a
    // second after the last change. The other way round, a failure leaves at
    // most a folder nothing lists.
    await this.notebookDB.remove(notebook);
    try {
      if (!notebook.directoryHandle) {
        await pfs.rmdir(notebook.dir);
      }
      await pfs.storeTree(notebook.dir);
    } catch (cleanupError) {
      return { cleanupError };
    }
  }
  private async saveSyncState(notebook: Notebook, uploadCandidates?: string[]) {
    const record = await this.notebookDB.get(notebook._id);
    record.fetchedAt = notebook.fetchedAt;
    record.remoteSha = notebook.remoteSha;
    record.localSha = notebook.localSha;
    if (
      uploadCandidates &&
      (uploadCandidates.length || record.blockedUploadPaths?.length)
    ) {
      const paths = new Set([
        ...(record.blockedUploadPaths ?? []),
        ...uploadCandidates,
      ]);
      const tracked = new Set(
        await filesAtCommit(notebook.dir, notebook.localSha),
      );
      const isIgnored = ignoreCheck(notebook.dir);
      const blocked: string[] = [];
      for (const filepath of paths) {
        if (tracked.has(filepath)) continue;
        const target = this.checkedPath(notebook, filepath);
        const stats = await pfs.stats(target).catch(missingFileOrThrow);
        if (stats?.isFile() && (await isIgnored(filepath)))
          blocked.push(filepath);
      }
      if (blocked.length) record.blockedUploadPaths = blocked;
      else delete record.blockedUploadPaths;
    }
    await this.notebookDB.put(record, { force: true });
    return record.blockedUploadPaths?.[0];
  }

  private async cacheWorkingFileAncestor(
    notebook: Notebook,
    file: string,
    cache: Cache,
    forStaging = false,
  ) {
    let ancestor = "";
    for (const name of file.split("/").slice(0, -1)) {
      ancestor = ancestor ? `${ancestor}/${name}` : name;
      if (ancestor in cache) return;
      const target = this.checkedPath(notebook, ancestor);
      const stats = await pfs.stats(target).catch(missingFileOrThrow);
      if (!stats) return;
      if (stats.isDirectory()) continue;
      // The parent has no tracked file in HEAD. On the no-checkout path a
      // null entry only removes it from the index, leaving the file on disk.
      if (forStaging && (await ignoreCheck(notebook.dir)(ancestor))) {
        cache[ancestor] = null;
        return;
      }
      cache[ancestor] = new Uint8Array(
        (await pfs.readFile(target)) as Uint8Array,
      );
      return;
    }
  }

  private async generateChangesCache(
    notebook: Notebook,
    includeStaged = false,
  ): Promise<Cache> {
    const cache: Cache = Object.create(null);
    const args = { fs, dir: notebook.dir };
    const rows = await git.statusMatrix(args);
    if (includeStaged) {
      // A staged blob can be hidden by a restored directory. A submodule is
      // also a directory on disk, but its staged commit must be preserved.
      const visible = new Set(rows.map(([file]) => file));
      await git.walk({
        ...args,
        trees: [git.STAGE()],
        map: async (file, [entry]) => {
          if (visible.has(file) || (await entry.type()) !== "blob") return;
          const target = this.checkedPath(notebook, file);
          if (
            (
              await fs.promises.lstat(target).catch(missingFileOrThrow)
            )?.isDirectory()
          )
            cache[file] = null;
        },
      });
    }
    for (const [file, head, work, stage] of rows) {
      // When checkout is skipped the old index still exists. An upload must
      // stage the current working bytes even if an earlier edit was undone.
      const indexMatches = !includeStaged || head === stage;
      if (head === 0 && work === 0 && indexMatches) continue;
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
      if (head === work && indexMatches && notebook.localSha) {
        const base = await git.readBlob({
          fs,
          dir: notebook.dir,
          oid: notebook.localSha,
          filepath: file,
        });
        if (sameBytes(bytes, base.blob)) continue;
      }
      cache[file] = bytes;
      // Git reports the deleted children but skips the file replacing their directory.
      if (!work && head)
        await this.cacheWorkingFileAncestor(
          notebook,
          file,
          cache,
          includeStaged,
        );
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
    if (pullNotebookResult.ignoredUploadFile)
      throw new IgnoredUploadFileError(pullNotebookResult.ignoredUploadFile);

    const args = { fs, dir: notebook.dir };
    if (pullNotebookResult.status) {
      // No checkout staged the working changes on this path.
      for (const [filepath, bytes] of Object.entries(
        pullNotebookResult.cache,
      )) {
        if (bytes === null) await git.remove({ ...args, filepath });
        else await git.add({ ...args, filepath });
      }
    }
    const hasStagedChanges = await prepareUploadIndex(
      notebook.dir,
      pullNotebookResult.cache,
    );
    if (hasStagedChanges) {
      notebook.localSha = await git.commit({
        ...args,
        author: { name: authorName, email: authorEmail },
        message,
      });
      // The new commit belongs to this branch even if the network fails.
      await pfs.storeTree(notebook.dir);
      await this.saveSyncState(notebook);
    }
    if (notebook.localSha === notebook.remoteSha) return null;

    const pushResult = await git.push({
      ...args,
      http,
      onAuth: () => ({ username, password }),
      onProgress,
      onMessage,
      onAuthFailure,
      onAuthSuccess,
      url: notebook.gitURL,
      ref: branchRef(notebook.gitBranch),
      corsProxy: notebook.gitCorsProxy,
    });
    if (pushResult.error || !pushResult.ok)
      throw new Error(pushResult.error || "error/failed-to-upload-notebook");
    await pfs.storeTree(notebook.dir);
    notebook.fetchedAt = new Date();
    notebook.remoteSha = notebook.localSha;
    await this.saveSyncState(notebook);
    return pushResult;
  }

  public async getGitSHA(dir: string, ref: string = "master"): Promise<string> {
    try {
      const logs = await git.log({
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
    const ref = branchRef(notebook.gitBranch);
    await pfs.writeFile(path.resolve(notebook.dir, ".git", ref), sha);
    const index = path.resolve(notebook.dir, `.git/index`);
    if (await pfs.exists(index)) await pfs.unlink(index);
    await git.checkout({
      dir: notebook.dir,
      fs: fs,
      ref,
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

  private async isProtectedRecoveryDirectory(
    notebook: Notebook,
    directory: string,
    newCopy?: string,
  ): Promise<boolean> {
    const dir = this.checkedPath(notebook, directory);
    const marker = path.join(dir, ".gitignore");
    const entries = await pfs.readdir(dir);
    if (
      !entries.includes(".gitignore") ||
      !(await fs.promises.lstat(marker)).isFile()
    )
      return false;
    const text = await pfs.readFile(marker, { encoding: "utf8" });
    if (typeof text !== "string") return false;
    const rules = text.split(/\r?\n/);
    if (
      !rules.some((line) => line.trimEnd() === recoveryHeader) ||
      !rules.some((rule) => /^\*[ \t]*$/.test(rule))
    )
      return false;
    if (!rules.some((rule) => rule.startsWith("!"))) return true;
    // The directory's own ordered rules must protect every existing file.
    const gitdir = path.join(notebook.dir, ".git");
    const isIgnored = async (filepath: string) =>
      (await git.status({ fs, dir, gitdir, filepath })) === "ignored";
    if (newCopy && !(await isIgnored(newCopy))) return false;
    const remaining = [...entries];
    while (remaining.length) {
      const file = remaining.pop()!;
      const target = this.checkedPath(notebook, `${directory}/${file}`);
      if ((await fs.promises.lstat(target)).isDirectory()) {
        for (const child of await pfs.readdir(target))
          remaining.push(`${file}/${child}`);
      } else if (!(await isIgnored(file))) return false;
    }
    return true;
  }

  private async untrackedRecoveryDirectoryKind(
    notebook: Notebook,
    directory: string,
  ) {
    const legacy = legacyRecoveryDirectoryName.test(directory);
    if (notebook.isLocal || (!legacy && !recoveryDirectoryName.test(directory)))
      return;
    const root = this.checkedPath(notebook, directory);
    if (
      !(await fs.promises.lstat(root).catch(missingFileOrThrow))?.isDirectory()
    )
      return;
    const args = { fs, dir: notebook.dir };
    const head = await git
      .resolveRef({ ...args, ref: "HEAD" })
      .catch((error) => {
        if (error instanceof git.Errors.NotFoundError) return "";
        throw error;
      });
    const tracked = (file: string) =>
      file === directory || file.startsWith(directory + "/");
    if (
      (await git.listFiles(args)).some(tracked) ||
      (await filesAtCommit(notebook.dir, head)).some(tracked) ||
      (head !== notebook.localSha &&
        (await filesAtCommit(notebook.dir, notebook.localSha)).some(tracked))
    )
      return;
    // Older copies had only a wildcard ignore rule, with no ownership marker.
    if (legacy) return "legacy";
    if (await this.isProtectedRecoveryDirectory(notebook, directory))
      return "owned";
  }

  private async recoveryContents(
    notebook: Notebook,
    directory: string,
    mode: "read" | "release",
  ) {
    const kind = await this.untrackedRecoveryDirectoryKind(notebook, directory);
    if (!kind || (mode === "release" && kind !== "owned"))
      throw recoveryFilesChanged();
    const root = this.checkedPath(notebook, directory);
    const files = new Map<string, Uint8Array>();
    const directories: string[] = [];
    const visit = async (folder: string) => {
      for (const entry of await pfs.readdir(path.join(root, folder))) {
        const relative = path.join(folder, entry);
        const target = this.checkedPath(notebook, directory + "/" + relative);
        const stat = await fs.promises.lstat(target);
        if (stat.isDirectory()) {
          await visit(relative);
          directories.push(target);
        } else if (stat.isFile()) {
          files.set(
            relative,
            new Uint8Array((await pfs.readFile(target)) as Uint8Array),
          );
        } else throw recoveryFilesChanged();
      }
    };
    await visit("");
    return { files, directories };
  }

  public readRecoveryFiles(
    notebook: Notebook,
    directory: string,
  ): Promise<Map<string, Uint8Array>> {
    return notebookOperation(
      notebook.dir,
      async () =>
        (await this.recoveryContents(notebook, directory, "read")).files,
    );
  }

  public releaseRecoveryFiles(
    notebook: Notebook,
    directory: string,
    snapshot: Map<string, Uint8Array>,
    canRelease: () => boolean,
  ): Promise<void> {
    return notebookOperation(notebook.dir, async () => {
      const { files, directories } = await this.recoveryContents(
        notebook,
        directory,
        "release",
      );
      if (
        files.size !== snapshot.size ||
        [...files].some(
          ([file, bytes]) => !sameBytes(bytes, snapshot.get(file) ?? null),
        )
      )
        throw recoveryFilesChanged();
      const checkOpenNotes = () => {
        if (!canRelease()) throw new Error("error/close-recovery-notes");
      };
      const root = this.checkedPath(notebook, directory);
      const deletedNotes: string[] = [];
      try {
        // Leave the marker in place if a file or nested directory cannot be removed.
        for (const file of files.keys()) {
          if (file === ".gitignore") continue;
          checkOpenNotes();
          await pfs.unlink(path.join(root, file));
          if (file.endsWith(".md"))
            deletedNotes.push(path.join(directory, file));
        }
        for (const dir of directories) {
          checkOpenNotes();
          await fs.promises.rmdir(dir);
        }
        const remaining = await pfs.readdir(root);
        if (remaining.length !== 1 || remaining[0] !== ".gitignore")
          throw recoveryFilesChanged();
        checkOpenNotes();
        await pfs.unlink(path.join(root, ".gitignore"));
        try {
          await fs.promises.rmdir(root);
        } catch (error) {
          // Keep an interrupted release recognizable on the next sync.
          const marker = path.join(root, ".gitignore");
          if ((await pfs.exists(root)) && !(await pfs.exists(marker)))
            await pfs.writeFile(marker, files.get(".gitignore")!);
          throw error;
        }
        await pfs.storeTree(notebook.dir);
      } finally {
        if (deletedNotes.length) {
          await notebook.refreshNotes({
            dir: "./",
            includeSubdirectories: true,
          });
          for (const noteFilePath of deletedNotes)
            globalEmitter.emit(EventType.DeletedNote, {
              notebookPath: notebook.dir,
              noteFilePath,
              tabId: "",
            });
        }
      }
    });
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
      if (!pending.remoteSha) {
        await this.recoverEmptyRemote(notebook, pending);
        return;
      }
      return { ...pending, remoteSha: pending.remoteSha };
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
    if (!upgraded.remoteSha) {
      await this.recoverEmptyRemote(notebook, upgraded, true);
      return;
    }
    await savePullRecovery(notebook._id, upgraded);
    return upgraded;
  }

  private async recoverEmptyRemote(
    notebook: Notebook,
    recovery: StoredPullRecovery,
    legacyOnly = false,
  ): Promise<void> {
    needsRecovery(notebook.dir, true);
    // With a null ref Git listed the index. The old replay could unlink a
    // base file absent from the index before the null branch write failed.
    const args = { fs, dir: notebook.dir };
    const base = await filesAtCommit(notebook.dir, recovery.localSha);
    const index = new Set(await git.listFiles(args));
    const reservedRoots = new Set(
      [...base, ...index, ...Object.keys(recovery.files)].map(
        (file) => file.split("/")[0],
      ),
    );
    const getStats = async (file: string) => {
      const target = this.checkedPath(notebook, file);
      let current = notebook.dir;
      try {
        for (const part of file.split("/")) {
          current = path.join(current, part);
          const stats = await pfs.stats(current);
          if (current === target) return stats.isFile() ? "file" : "directory";
          if (!stats.isDirectory()) return "blocked";
        }
      } catch (error) {
        if (
          (error as { code?: string }).code === "ENOENT" ||
          (error as Error).name === "NotFoundError"
        )
          return null;
        throw error;
      }
    };
    for (const file of base) {
      if (
        index.has(file) ||
        Object.prototype.hasOwnProperty.call(recovery.files, file) ||
        (await getStats(file))
      )
        continue;
      const { blob } = await git.readBlob({
        ...args,
        oid: recovery.localSha,
        filepath: file,
      });
      await pfs.writeFile(this.checkedPath(notebook, file), blob);
    }
    for (const [file, bytes] of Object.entries(recovery.files)) {
      if (bytes === null) continue;
      let target = this.checkedPath(notebook, file);
      const stats = await getStats(file);
      if (!stats) {
        await pfs.writeFile(target, bytes);
        continue;
      }
      if (
        stats === "file" &&
        sameBytes((await pfs.readFile(target)) as Uint8Array, bytes)
      )
        continue;

      // The working version or a blocking ancestor wins its original path.
      // Keep the other bytes out of later commits even if only the original
      // name was ignored. Reuse an interrupted copy only with matching bytes.
      for (let suffix = 0; ; suffix++) {
        const dir = recoveredDirectory(suffix);
        if (reservedRoots.has(dir)) continue;
        const folder = await getStats(dir);
        const name = `recovered-${path.basename(file)}`;
        const ignore = this.checkedPath(notebook, `${dir}/.gitignore`);
        if (!folder) await pfs.writeFile(ignore, recoveredMarker);
        else if (
          folder !== "directory" ||
          !(await this.isProtectedRecoveryDirectory(notebook, dir, name))
        )
          continue;
        const copy = `${dir}/${name}`;
        target = this.checkedPath(notebook, copy);
        const existing = await getStats(copy);
        if (!existing) {
          await pfs.writeFile(target, bytes);
          break;
        }
        if (
          existing === "file" &&
          sameBytes((await pfs.readFile(target)) as Uint8Array, bytes)
        )
          break;
      }
    }
    await pfs.storeTree(notebook.dir);
    const entry = await this.notebookDB.get(notebook._id);
    const remoteSha = entry.remoteSha ?? entry.localSha;
    if (entry.remoteSha !== remoteSha) {
      await this.notebookDB.put({ ...entry, remoteSha });
    }
    notebook.remoteSha = remoteSha;
    localStorage.removeItem(`pending/pull/${notebook._id}`);
    if (!legacyOnly) await deletePullRecovery(notebook._id);
    needsRecovery(notebook.dir, false);
  }

  private async finishPull(
    notebook: Notebook,
    recovery: PullRecovery,
  ): Promise<string | undefined> {
    // Replay the same planned bytes, including stable conflict-copy names.
    // Nothing deletes the recovery record on a failed reset, write or flush.
    needsRecovery(notebook.dir, true);
    const remoteFiles = new Set(
      await git.listFiles({ fs, dir: notebook.dir, ref: recovery.remoteSha }),
    );
    const baseFiles = await filesAtCommit(notebook.dir, recovery.localSha);
    // Older plans saved the working bytes without their upload eligibility.
    // Recover it from the original checkout before replacing its ignore rules.
    if (
      !recovery.uploadCandidates &&
      recovery.localSha !== recovery.remoteSha &&
      (await refSha(notebook.dir, branchRef(notebook.gitBranch))) ===
        recovery.localSha
    ) {
      const tracked = new Set(baseFiles);
      const isIgnored = ignoreCheck(notebook.dir);
      const candidates: string[] = [];
      for (const [filepath, bytes] of Object.entries(recovery.files)) {
        if (
          bytes === null ||
          tracked.has(filepath) ||
          remoteFiles.has(filepath)
        )
          continue;
        const target = this.checkedPath(notebook, filepath);
        const stats = await pfs.stats(target).catch(missingFileOrThrow);
        if (stats?.isFile() && !(await isIgnored(filepath)))
          candidates.push(filepath);
      }
      recovery.uploadCandidates = candidates;
      await savePullRecovery(notebook._id, recovery);
    }
    const moves = recovery.relocated ?? {};
    const originals = Array.isArray(moves) ? moves : Object.keys(moves);
    for (const file of new Set([...baseFiles, ...originals])) {
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
    const ignoredUploadFile = await this.saveSyncState(
      notebook,
      recovery.uploadCandidates ?? [],
    );
    // Delete legacy data first: failure leaves the committed new record.
    localStorage.removeItem(`pending/pull/${notebook._id}`);
    await deletePullRecovery(notebook._id);
    needsRecovery(notebook.dir, false);
    // Update editors while Git still owns the notebook lock, before queued
    // writes get to read or recreate the old paths.
    if (!Array.isArray(moves)) {
      for (const [oldNoteFilePath, newNoteFilePath] of Object.entries(moves)) {
        if (oldNoteFilePath.endsWith(".md"))
          globalEmitter.emit(EventType.ChangedNoteFilePath, {
            notebookPath: notebook.dir,
            oldNoteFilePath,
            newNoteFilePath,
          });
      }
    }
    return ignoredUploadFile;
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
    const ref = branchRef(notebook.gitBranch);
    const fetched = await git.fetch({
      fs,
      http,
      dir: notebook.dir,
      singleBranch: true,
      corsProxy: notebook.gitCorsProxy,
      ref,
      onAuth: () => ({
        username: notebook.gitUsername,
        password: notebook.gitPassword,
      }),
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage,
    });
    const remoteSha = fetched.fetchHead;
    if (!remoteSha) throw new Error("error/remote-has-no-commits");
    const args = { fs, dir: notebook.dir };
    const localSha = await refSha(notebook.dir, ref);
    const headRef = await git.currentBranch({ ...args, fullname: true });
    // Synchronization uses the working files and index of this checkout.
    if (headRef !== ref && (await refSha(notebook.dir, "HEAD")) !== localSha)
      throw new Error("error/notebook-branch-mismatch");
    notebook.localSha = localSha;
    const descendsFrom = (oid: string, ancestor: string) =>
      git.isDescendent({ ...args, oid, ancestor });
    if (
      localSha === remoteSha ||
      (localSha && (await descendsFrom(localSha, remoteSha)))
    ) {
      if (headRef !== ref)
        await git.checkout({ ...args, ref, noCheckout: true });
      const cache = await this.generateChangesCache(notebook, true);
      const conflicts = Object.entries(cache)
        .filter(([file, bytes]) =>
          hasTextConflicts(mergeableText(file, bytes) ?? ""),
        )
        .map(([file]) => file);
      await pfs.storeTree(notebook.dir);
      notebook.remoteSha = remoteSha;
      notebook.fetchedAt = new Date();
      const ignoredUploadFile = await this.saveSyncState(notebook, []);
      return {
        status: localSha === remoteSha ? "up-to-date" : "pending-upload",
        ignoredUploadFile,
        numConflicts: conflicts.length,
        conflicts,
        cache,
      };
    }
    if (localSha && !(await descendsFrom(remoteSha, localSha)))
      throw new Error("error/notebook-history-diverged");
    const baseFiles = new Set(await filesAtCommit(notebook.dir, localSha));
    const remoteFiles = new Set(
      await git.listFiles({ fs, dir: notebook.dir, ref: remoteSha }),
    );
    const remoteRoots = new Set(
      [...remoteFiles].map((file) => file.split("/")[0]),
    );
    for (const directory of remoteRoots) {
      const kind = await this.untrackedRecoveryDirectoryKind(
        notebook,
        directory,
      );
      if (kind)
        throw new RecoveryDirectoryCollisionError(directory, kind === "owned");
    }
    const cache = await this.generateChangesCache(notebook);
    const isIgnored = ignoreCheck(notebook.dir);
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
      if (await pfs.exists(target)) {
        if ((await pfs.stats(target)).isDirectory())
          await collectUntracked(file);
        else if (
          !baseFiles.has(file) &&
          (!(file in cache) || (await isIgnored(file)))
        ) {
          // The matching-bytes exception applies to regular files.
          const parent = path.dirname(file);
          const { tree } = await git.readTree({
            ...args,
            oid: remoteSha,
            filepath: parent === "." ? undefined : parent,
          });
          const name = path.basename(file);
          const entry = tree.find((entry) => entry.path === name);
          if (entry?.mode !== "100644" && entry?.mode !== "100755")
            throw new NotebookConflictError([file]);
          const { blob } = await git.readBlob({ ...args, oid: entry.oid });
          const current =
            cache[file] ?? ((await pfs.readFile(target)) as Uint8Array);
          if (!sameBytes(current, blob))
            throw new NotebookConflictError([file]);
          delete cache[file];
        }
      }
      await this.cacheWorkingFileAncestor(notebook, file, cache);
    }
    const reserved = new Set([
      ...baseFiles,
      ...remoteFiles,
      ...Object.keys(cache),
    ]);
    const files: Cache = Object.create(null);
    const conflicts: string[] = [];
    const deletions: ConflictDeletions = Object.create(null);
    const relocated: Record<string, string> = Object.create(null);
    const overlaps = (a: string, b: string) =>
      a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
    const occupied = async (candidate: string) =>
      [...reserved].some((entry) => overlaps(entry, candidate)) ||
      (await pfs.exists(this.checkedPath(notebook, candidate)));
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
      } while (await occupied(copy));
      reserved.add(copy);
      return copy;
    };
    let ignoredCopiesDirectory: string | undefined;
    const localCopyPath = async (file: string) => {
      const copy = await copyPath(file, "local");
      if (!(await isIgnored(file))) return copy;
      // Moving a file out of a directory-scoped ignore rule must not make it
      // eligible for the next upload. Keep these copies in a separate ignored
      // directory, including its ignore file in the durable plan before bytes.
      // Skipping add only during replay would let the next pull stage them.
      if (!ignoredCopiesDirectory) {
        let suffix = 0;
        do {
          ignoredCopiesDirectory = recoveredDirectory(suffix++);
        } while (await occupied(ignoredCopiesDirectory));
        reserved.add(ignoredCopiesDirectory);
        files[`${ignoredCopiesDirectory}/.gitignore`] =
          new TextEncoder().encode(recoveredMarker);
      }
      return `${ignoredCopiesDirectory}/${copy}`;
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
          const copy = await localCopyPath(file);
          files[copy] = merged.bytes;
          relocated[file] = copy;
          conflicts.push(file, copy);
        }
        continue;
      }
      // Checkout also cannot remove an old directory over a working file.
      if (
        ours !== null &&
        !baseFiles.has(file) &&
        !remoteFiles.has(file) &&
        [...baseFiles].some((child) => child.startsWith(file + "/"))
      )
        throw new NotebookConflictError([file]);
      files[file] = merged.bytes;
      if (merged.conflict) conflicts.push(file);
      if (merged.deleted) deletions[file] = merged.deleted;
      if (merged.copy) {
        const copy = await copyPath(file, "remote");
        files[copy] = merged.copy;
        conflicts.push(copy);
      }
    }
    const overrides = new Map<string, string>();
    for (const file of new Set([
      ...baseFiles,
      ...remoteFiles,
      ...Object.keys(relocated),
    ])) {
      if (path.basename(file) !== ".gitignore") continue;
      const incoming = await blob(remoteSha, file, remoteFiles);
      if (
        !(file in relocated) &&
        sameBytes(await blob(localSha, file, baseFiles), incoming)
      )
        continue;
      this.checkedPath(notebook, file);
      const planned = file in files ? files[file] : incoming;
      // Match LightningFS's utf8 reads, including BOM handling.
      overrides.set(
        path.dirname(file),
        planned === null ? "" : decode(planned),
      );
    }
    const uploadCandidates: string[] = [];
    if (overrides.size) {
      const willBeIgnored = ignoreCheck(notebook.dir, overrides);
      // Include untracked drafts that Git leaves out of the status matrix.
      const checkDirectory = async (folder: string): Promise<void> => {
        for (const name of await pfs.readdir(path.join(notebook.dir, folder))) {
          if (name.toLowerCase() === ".git") continue;
          const file = path.join(folder, name);
          const target = this.checkedPath(notebook, file);
          if ((await fs.promises.lstat(target)).isDirectory()) {
            await checkDirectory(file);
            continue;
          }
          if (baseFiles.has(file) || remoteFiles.has(file) || file in relocated)
            continue;
          if (await isIgnored(file)) {
            if (!(await willBeIgnored(file)))
              throw new NotebookConflictError([file]);
          } else if (files[file] && (await willBeIgnored(file))) {
            uploadCandidates.push(file);
          }
        }
      };
      changedRules: for (const folder of overrides.keys()) {
        for (let parent = folder; parent !== ".";) {
          parent = path.dirname(parent);
          if (overrides.has(parent)) continue changedRules;
        }
        // A newly introduced scope may still be missing or sit below a file
        // or symlink. Only descend through directories in the current tree.
        let target = notebook.dir;
        for (const part of folder.split("/")) {
          target = path.join(target, part);
          const stats = await fs.promises
            .lstat(target)
            .catch(missingFileOrThrow);
          if (!stats?.isDirectory()) continue changedRules;
        }
        await checkDirectory(folder);
      }
    }
    for (const [file, copy] of Object.entries(relocated)) {
      if (baseFiles.has(file) || !(await isIgnored(file)))
        uploadCandidates.push(copy);
    }
    const recovery: PullRecovery = {
      version: 1,
      localSha,
      remoteSha,
      files,
      conflicts,
      deletions,
      relocated,
      uploadCandidates,
    };
    // Recovery references the fetched commit and its objects. Persist their
    // directory entries before publishing a plan a new page must replay.
    await pfs.storeTree(notebook.dir);
    await savePullRecovery(notebook._id, recovery);
    const ignoredUploadFile = await this.finishPull(notebook, recovery);
    return {
      numConflicts: conflicts.length,
      conflicts,
      deletions,
      cache,
      ignoredUploadFile,
    };
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
      ref: branchRef(notebook.gitBranch),
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

    if (!result.fetchHead) {
      // The next background check is due one fetch period from now.
      const entry = await this.notebookDB.get(notebook._id);
      const fetchedAt = new Date();
      await this.notebookDB.put({
        ...entry,
        fetchedAt,
        remoteSha: entry.remoteSha ?? entry.localSha,
      });
      notebook.fetchedAt = fetchedAt;
      return false;
    }
    await pfs.storeTree(notebook.dir);

    // Update notebook
    notebook.fetchedAt = new Date();
    notebook.remoteSha = result.fetchHead;
    await this.saveSyncState(notebook);

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
      notebook.remoteSha = n.remoteSha ?? n.localSha;
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
        const gitBranch = notebook.gitBranch || "master";
        try {
          notebook.localSha ??= await this.getGitSHA(
            notebook.dir,
            `refs/remotes/origin/${branchName(gitBranch)}`,
          );
          notebook.remoteSha ??= notebook.localSha;
          const args = { fs, dir: notebook.dir };
          const ref = branchRef(gitBranch);
          const localSha = await refSha(notebook.dir, ref);
          // Older notebooks may only have their branch tip in the registry.
          if (
            !localSha &&
            notebook.localSha &&
            (await git.currentBranch({ ...args, fullname: true })) === ref
          ) {
            await git.writeRef({ ...args, ref, value: notebook.localSha });
            await pfs.storeTree(notebook.dir);
          } else {
            notebook.localSha = localSha;
          }
          const pendingPull = await this.pendingPull(notebook);
          if (pendingPull) await this.finishPull(notebook, pendingPull);
          if (
            notebook.localSha &&
            !(await pfs.exists(path.join(notebook.dir, ".git/index")))
          ) {
            await git.add({ ...args, filepath: "." });
            await pfs.storeTree(notebook.dir);
          }
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
