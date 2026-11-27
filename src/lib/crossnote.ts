import * as git from "isomorphic-git";
import { decode } from "isomorphic-textencoder";
import ignore, { type Ignore } from "ignore";
import path from "path-browserify";
import PouchDB from "pouchdb";
import PouchdbFind from "pouchdb-find";
import { notebookNameFromGitURL, randomID } from "../utilities/utils";
import { fs, missingFileOrThrow, pfs } from "./fs";
import { checkedGitPath, stageLocalFile, symlinkStatus } from "./gitFiles";
import {
  resetIndex,
  resetTarget,
  RestorePersistenceError,
  restoreTree,
  type ResetPreview,
} from "./gitRestore";
import {
  assertGitLinkTransition,
  indexedGitLinkChildren,
  inspectWorkingPath,
  isWithinGitLink,
  matchesSymlink,
  parentGitTree,
} from "./gitLinks";
import {
  gitConnection,
  needsGitSettings,
  notebookGitConnection,
  repositoryAddress,
} from "./gitConnection";
import { Notebook } from "./notebook";
import {
  IgnoredUploadFileError,
  assertNotebookWritable,
  needsRecovery,
  notebookOperation,
} from "./notebookOperation";
import { mergeFile, NotebookConflictError, sameBytes } from "./mergeFiles";
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
  message?: string;
  onProgress?: (progress: git.GitProgressEvent) => void;
  onMessage?: (message: string) => void;
}

export interface PullNotebookArgs {
  notebook: Notebook;
  onProgress?: (progress: git.GitProgressEvent) => void;
  onMessage?: (message: string) => void;
}

export type FetchNotebookArgs = PullNotebookArgs;

export type PushNotebookResult =
  | "uploaded"
  | "uploaded-and-downloaded"
  | "confirmed"
  | "confirmed-and-downloaded"
  | "downloaded"
  | "up-to-date";

export class GitUploadError extends Error {
  constructor(
    public readonly phase: "download" | "prepare" | "push" | "finish",
    public readonly downloaded: boolean,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

interface PullNotebookResult {
  status?: "up-to-date" | "pending-upload";
  links?: GitLinkPaths;
  downloadedFrom?: string;
  cache: Cache;
}

type Cache = Record<string, FileBytes>;

async function workingEntry(dir: string, file: string) {
  checkedGitPath(dir, file);
  const { name, stats } = await inspectWorkingPath(dir, file);
  if (stats) return { relative: path.relative(dir, name), stats };
}

function checkReplayPath(file: string, symlinks: ReadonlyMap<string, string>) {
  if (isWithinGitLink(file, symlinks)) throw new NotebookConflictError([file]);
}

const indexRebuildMarker = (dir: string) =>
  path.join(dir, ".git/index.crossnote-rebuild");

// Clear the retry marker only after the complete replacement index is durable.
async function clearIndexRebuildMarker(dir: string) {
  const marker = indexRebuildMarker(dir);
  if (await fs.promises.lstat(marker).catch(missingFileOrThrow)) {
    await pfs.unlink(marker);
    await pfs.storeTree(dir);
  }
}

// The caller owns the notebook lock and has read the checkout's current tip.
async function rebuildNotebookIndex(dir: string, tip: string) {
  if (!tip) return;
  const index = path.join(dir, ".git/index");
  const marker = indexRebuildMarker(dir);
  const interrupted = await pfs.exists(marker);
  if (await fs.promises.lstat(index).catch(missingFileOrThrow)) {
    if (!interrupted) return;
    await pfs.unlink(index);
  }
  const args = { fs, dir, cache: {} };
  const { links, symlinks } = await parentGitTree(dir, tip, args.cache);
  if (links.size || symlinks.size) {
    const rows = await git.statusMatrix({
      ...args,
      fs: parentWorkingFs(dir, links),
      ref: tip,
    });
    // Keep the missing-index recovery active across partial writes and reloads.
    if (!interrupted) await pfs.writeFile(marker, "");
    const files: string[] = [];
    for (const [filepath, , work] of rows) {
      if (!work) continue;
      const oid = symlinks.get(filepath);
      const name = path.join(dir, filepath);
      // LightningFS normalizes link text. Keep the original Git blob when
      // the working link still points at the committed target.
      if (
        oid &&
        (await fs.promises.lstat(name)).isSymbolicLink() &&
        (await matchesSymlink(args, name, oid))
      ) {
        await git.updateIndex({
          ...args,
          filepath,
          oid,
          mode: 0o120000,
          add: true,
        });
      } else {
        files.push(filepath);
      }
    }
    if (files.length) await git.add({ ...args, filepath: files });
    for (const [filepath, oid] of links)
      await git.updateIndex({
        ...args,
        filepath,
        oid,
        mode: 0o160000,
        add: true,
      });
  } else {
    await git.add({ ...args, filepath: "." });
  }
  await pfs.storeTree(dir);
  if (links.size || symlinks.size || interrupted)
    await clearIndexRebuildMarker(dir);
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

// Match the working tree or a planned set of rules using Git's matcher.
// An excluded parent wins before a nested rule can re-include its children.
function ignoreCheck(dir: string, overrides?: Map<string, string | null>) {
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
        // The planned tree could not supply an ordinary file for this link.
        if (contents === null) return undefined;
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

// The plan and its immediate checkout share these reads under the notebook lock.
async function readPullTrees(
  dir: string,
  localSha: string,
  remoteSha: string,
  cache = {},
) {
  const blobEntries = { includeBlob: () => true };
  const target = await parentGitTree(dir, remoteSha, cache, blobEntries);
  const directories = new Set<string>();
  for (const link of target.links.keys()) {
    for (
      let parent = path.dirname(link);
      parent !== "." && !directories.has(parent);
      parent = path.dirname(parent)
    )
      directories.add(parent);
  }
  const includeBlob = target.links.size
    ? (file: string) =>
        directories.has(file) || isWithinGitLink(file, target.links)
    : undefined;
  const base = await parentGitTree(dir, localSha, cache, blobEntries);
  // An unchanged remote entry can be a file that the local edits replaced
  // with a directory, or a child of a directory replaced with a file.
  const incoming = new Set(
    [...target.files].filter((file) => {
      const next = target.blobs.get(file);
      if (!next) return target.links.get(file) !== base.links.get(file);
      const previous = base.blobs.get(file);
      return previous?.oid !== next.oid || previous.mode !== next.mode;
    }),
  );
  return {
    base,
    target,
    incoming,
    cache,
    readIndex: () => parentGitTree(dir, undefined, cache, { includeBlob }),
  };
}

const overlaps = (a: string, b: string) =>
  a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

async function readListedBlob(
  args: { fs: typeof fs; dir: string; cache: object },
  sha: string,
  file: string,
  listed: Set<string>,
): Promise<FileBytes> {
  return listed.has(file)
    ? (await git.readBlob({ ...args, oid: sha, filepath: file })).blob
    : null;
}

type ParentGitTree = Awaited<ReturnType<typeof parentGitTree>>;

// Checkout displaces a blob at, above, or below an incoming pointer.
function assertDisplacedBlobsMatch(base: ParentGitTree, index: ParentGitTree) {
  for (const [file, staged] of index.blobs) {
    const committed = base.blobs.get(file);
    if (committed?.mode !== staged.mode || committed.oid !== staged.oid)
      throw new NotebookConflictError([file]);
  }
}

type GitLinkPaths = ReadonlyMap<string, string> | ReadonlySet<string>;

// The Git walker lists a working directory before it checks the entry type.
// New pointers are also absent from HEAD and the index. Give Git a view in
// which these directories are leaves, without changing the notebook filesystem.
function parentWorkingFs(dir: string, links?: GitLinkPaths) {
  if (!links?.size) return fs;
  const promises = new Proxy(fs.promises, {
    get(target, property) {
      if (property === "readdir")
        return (name: string) =>
          links.has(path.relative(dir, name))
            ? Promise.resolve([])
            : target.readdir(name);
      return Reflect.get(target, property);
    },
  });
  return { promises };
}

async function prepareUploadIndex(
  dir: string,
  changes: Cache,
  links?: GitLinkPaths,
): Promise<boolean> {
  const args = { fs, dir, cache: {} };
  const isIgnored = ignoreCheck(dir);
  const unchecked = new Set<string>();
  for (const [file, , work, index] of await git.statusMatrix({
    ...args,
    fs: parentWorkingFs(dir, links),
  })) {
    if (
      work &&
      (work !== index || file in changes) &&
      (await isIgnored(file))
    ) {
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
  const privateStaged: string[] = [];
  const stagedLinks = new Set<string>();
  await git.walk({
    ...args,
    trees: [git.TREE({ ref: "HEAD" }), git.STAGE()],
    map: async (file, [head, entry]) => {
      const stagedType = await entry?.type();
      if (stagedType === "commit") stagedLinks.add(file);
      else if ((await head?.type()) === "commit")
        throw new NotebookConflictError([file]);
      if (unchecked.has(file) && (!head || (await head.type()) === "tree")) {
        // A directory in HEAD does not track a working file at that path.
        if (await fileVersion(entry)) privateStaged.push(file);
        unchecked.delete(file);
        return;
      }
      if (
        !hasStagedChanges &&
        (await fileVersion(head)) !== (await fileVersion(entry))
      )
        hasStagedChanges = true;
      // The index can hold older bytes even when Git reports matching stats.
      if (!unchecked.has(file)) return;
      const object = (await pfs.readFile(path.join(dir, file))) as Uint8Array;
      if ((await git.hashBlob({ object })).oid === (await entry?.oid()))
        unchecked.delete(file);
    },
  });
  const [child] = await indexedGitLinkChildren(dir, stagedLinks, args.cache);
  if (child) throw new NotebookConflictError([child]);
  for (const filepath of privateStaged) await git.remove({ ...args, filepath });
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
  private statusBatches = new Map<string, object>();

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
      notebook.gitUsername = "";
      notebook.gitPassword = "";
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
  }: CloneNotebookArgs): Promise<Notebook> {
    if (!gitURL.match(/^https?:\/\//) || !URL.canParse(gitURL)) {
      throw new Error("error/invalid-git-url-prefix");
    }

    const _id = randomID();
    const dir = `/notebooks/${_id}`;

    const gitBranch = branch.trim() || "master";
    const connection = gitConnection(
      gitURL,
      corsProxy?.trim() ?? "",
      username.trim(),
      password,
    );
    try {
      await git.clone({
        ...connection,
        fs,
        dir,
        ref: branchRef(gitBranch),
        depth,
        singleBranch: true,
      });
      const sha = await this.getGitSHA(
        dir,
        `refs/remotes/origin/${branchName(gitBranch)}`,
      );
      // Before the record, as for a notebook made here.
      await pfs.storeTree(dir);

      const notebook = new Notebook();
      notebook._id = _id;
      notebook.dir = dir;
      notebook.name = name || notebookNameFromGitURL(connection.url);
      notebook.gitURL = connection.url;
      notebook.gitBranch = gitBranch;
      notebook.gitCorsProxy = connection.corsProxy;
      notebook.gitUsername = username.trim();
      notebook.gitPassword = password;
      notebook.autoFetchPeriod = 3600000; // 60 minutes
      notebook.fetchedAt = new Date();
      notebook.localSha = sha;
      notebook.remoteSha = sha;
      await this.notebookDB.put(
        convertNotebookToNotebookDBEntry(notebook, null),
      );
      return notebook;
    } catch (error) {
      // A failed clone may have created only part of the directory.
      await pfs.rmdir(dir).catch(() => {});
      throw error;
    }
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
      const gitURL = repositoryAddress(record.gitURL);
      let changed =
        gitURL !== record.gitURL ||
        (record.gitUsername ?? "") !== settings.gitUsername ||
        (record.gitPassword ?? "") !== settings.gitPassword;
      if (gitURL) {
        const config = { fs, dir: notebook.dir, path: "remote.origin.url" };
        const origin = await git.getConfig(config);
        if (origin && origin !== repositoryAddress(origin)) {
          await git.setConfig({ ...config, value: gitURL });
          await pfs.storeTree(notebook.dir);
          changed = true;
        }
      }
      await this.notebookDB.put({ ...record, ...settings, gitURL });
      Object.assign(notebook, settings, { gitURL });
      if (changed) {
        return settings.gitUsername || settings.gitPassword
          ? "saved"
          : "cleared";
      }
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
  private async saveSyncState(notebook: Notebook) {
    const record = await this.notebookDB.get(notebook._id);
    record.fetchedAt = notebook.fetchedAt;
    record.remoteSha = notebook.remoteSha;
    record.localSha = notebook.localSha;
    await this.notebookDB.put(record, { force: true });
  }

  private async cacheWorkingFileAncestor(
    notebook: Notebook,
    file: string,
    cache: Cache,
    forStaging = false,
    headSymlinks?: ReadonlyMap<string, string>,
  ) {
    const parent = path.dirname(file);
    if (parent === ".") return;
    const entry = await workingEntry(notebook.dir, parent);
    if (entry && !entry.stats.isDirectory()) {
      const ancestor = entry.relative;
      if (entry.stats.isSymbolicLink()) {
        // generateChangesCache has already compared tracked links with HEAD
        // and the index. Checkout can replace this leaf with a directory.
        if (headSymlinks?.has(ancestor)) return true;
        throw new NotebookConflictError([ancestor]);
      }
      if (ancestor in cache) return true;
      const target = this.checkedPath(notebook, ancestor);
      // The parent has no tracked file in HEAD. On the no-checkout path a
      // null entry only removes it from the index, leaving the file on disk.
      if (forStaging && (await ignoreCheck(notebook.dir)(ancestor))) {
        cache[ancestor] = null;
        return true;
      }
      cache[ancestor] = new Uint8Array(
        (await pfs.readFile(target)) as Uint8Array,
      );
      return true;
    }
  }

  private async generateChangesCache(
    notebook: Notebook,
    includeStaged = false,
    gitCache: object = {},
    incomingLinks?: ReadonlyMap<string, string>,
    symlinks = {
      head: new Map<string, string>(),
      staged: new Map<string, string>(),
      remote: new Map<string, string>(),
    },
    missingIndex = false,
    indexCandidates?: Set<string>,
  ) {
    const cache: Cache = Object.create(null);
    const args = { fs, dir: notebook.dir, cache: gitCache };
    const links = new Set(incomingLinks?.keys());
    const stagedBlobs: string[] = [];
    if (includeStaged)
      await git.walk({
        ...args,
        trees: [git.TREE({ ref: "HEAD" }), git.STAGE()],
        map: async (file, [head, entry]) => {
          if ((await head?.mode()) === 0o120000)
            symlinks.head.set(file, await head.oid());
          if ((await entry?.mode()) === 0o120000)
            symlinks.staged.set(file, await entry.oid());
          const staged = await entry?.type();
          if (staged === "commit" || (await head?.type()) === "commit")
            links.add(file);
          else if (staged === "blob") stagedBlobs.push(file);
        },
      });
    const rows = await git.statusMatrix({
      ...args,
      fs: parentWorkingFs(notebook.dir, links),
      refresh: false,
    });
    if (stagedBlobs.length) {
      // A staged blob can be hidden by a restored working directory.
      const visible = new Set(rows.map(([file]) => file));
      for (const file of stagedBlobs) {
        if (visible.has(file) || isWithinGitLink(file, links)) continue;
        const target = this.checkedPath(notebook, file);
        if (
          (
            await fs.promises.lstat(target).catch(missingFileOrThrow)
          )?.isDirectory()
        )
          cache[file] = null;
      }
    }
    for (const [file, head, work, stage] of rows) {
      if (head === stage || !stage) indexCandidates?.delete(file);
      if (!missingIndex && stage !== head)
        checkReplayPath(file, symlinks.remote);
      if (isWithinGitLink(file, links)) continue;
      // When checkout is skipped the old index still exists. An upload must
      // stage the current working bytes even if an earlier edit was undone.
      const indexMatches = !includeStaged || head === stage;
      if (head === 0 && work === 0 && indexMatches) continue;
      const name = path.join(notebook.dir, file);
      const link = symlinks.head.get(file);
      if (work && (await fs.promises.lstat(name)).isSymbolicLink()) {
        if (
          link &&
          link === symlinks.staged.get(file) &&
          (await matchesSymlink(args, name, link))
        )
          continue;
        throw new NotebookConflictError([file]);
      }
      // The change cache holds regular files and deletions, not link objects.
      if ((link || symlinks.staged.has(file)) && work)
        throw new NotebookConflictError([file]);
      const bytes =
        work === 0
          ? null
          : new Uint8Array(
              (await pfs.readFile(
                path.resolve(notebook.dir, file),
              )) as Uint8Array,
            );
      // LightningFS can report the same stats for an equal-sized edit.
      // Compare working bytes before replacing files the matrix calls clean.
      if (head === work && indexMatches && notebook.localSha) {
        const base = await git.readBlob({
          ...args,
          oid: notebook.localSha,
          filepath: file,
        });
        if (sameBytes(bytes, base.blob)) continue;
      }
      cache[file] = bytes;
      // Git reports the deleted children but skips the file replacing their directory.
      if (!work)
        await this.cacheWorkingFileAncestor(
          notebook,
          file,
          cache,
          includeStaged,
        );
    }
    return { cache, links };
  }

  public pushNotebook(args: PushNotebookArgs): Promise<PushNotebookResult> {
    return notebookOperation(args.notebook.dir, () =>
      this.pushNotebookUnlocked(args),
    );
  }

  private async pushNotebookUnlocked({
    notebook,
    authorName = "crossnote",
    authorEmail = "anonymous@crossnote.com",
    message = "doc: Updated docs",
    onProgress,
    onMessage,
  }: PushNotebookArgs): Promise<PushNotebookResult> {
    const { localSha: before, remoteSha: priorRemote } = notebook;
    let phase: GitUploadError["phase"] = "download";
    let downloaded = false;
    try {
      const pull = await this.pullNotebookUnlocked({
        notebook,
        onProgress,
        onMessage,
      });
      downloaded = !pull.status;
      phase = "prepare";
      const args = { fs, dir: notebook.dir };
      if (pull.status) {
        // No checkout staged the working changes on this path.
        const changes = Object.entries(pull.cache);
        // Remove obsolete children before staging a file at their parent path.
        for (const [filepath, bytes] of changes) {
          if (bytes === null) await git.remove({ ...args, filepath });
        }
        for (const [filepath, bytes] of changes) {
          if (bytes !== null) await stageLocalFile(notebook.dir, filepath);
        }
      }
      if (await prepareUploadIndex(notebook.dir, pull.cache, pull.links)) {
        notebook.localSha = await git.commit({
          ...args,
          author: { name: authorName, email: authorEmail },
          message,
        });
        // The new commit belongs to this branch even if the network fails.
        await pfs.storeTree(notebook.dir);
        await this.saveSyncState(notebook);
      }
      if (notebook.localSha === notebook.remoteSha) {
        const confirmed =
          priorRemote &&
          before &&
          before !== priorRemote &&
          (before === notebook.localSha || before === pull.downloadedFrom) &&
          (await git
            .isDescendent({ ...args, oid: before, ancestor: priorRemote })
            .catch(() => false));
        if (downloaded)
          return confirmed ? "confirmed-and-downloaded" : "downloaded";
        return confirmed ? "confirmed" : "up-to-date";
      }

      phase = "push";
      const connection = notebookGitConnection(notebook);
      let replyReceived = false;
      let target = "";
      try {
        await git.push({
          ...args,
          ...connection,
          http: {
            async request(request) {
              const response = await connection.http.request(request);
              if (request.method === "POST" && response.statusCode === 200)
                replyReceived = true;
              return response;
            },
          },
          onPrePush: ({ remoteRef }) => {
            target = remoteRef.ref;
            return true;
          },
          onProgress,
          onMessage,
          ref: branchRef(notebook.gitBranch),
        });
      } catch (error) {
        // The client writes the local remote-tracking ref after receive-pack.
        if (
          replyReceived &&
          target &&
          !(error instanceof git.Errors.GitPushError)
        ) {
          const refs = await git
            .listServerRefs({
              ...connection,
              forPush: true,
              protocolVersion: 1,
              prefix: target,
            })
            .catch((): git.ServerRef[] => []);
          if (
            refs.some(
              ({ ref, oid }) => ref === target && oid === notebook.localSha,
            )
          )
            phase = "finish";
        }
        throw error;
      }
      phase = "finish";
      await pfs.storeTree(notebook.dir);
      notebook.fetchedAt = new Date();
      notebook.remoteSha = notebook.localSha;
      await this.saveSyncState(notebook);
      return downloaded ? "uploaded-and-downloaded" : "uploaded";
    } catch (error) {
      if (
        error instanceof NotebookConflictError ||
        error instanceof IgnoredUploadFileError
      ) {
        throw error;
      }
      throw new GitUploadError(phase, downloaded, error);
    }
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

  public previewReset(notebook: Notebook) {
    return notebookOperation(notebook.dir, async () => {
      assertNotebookWritable(notebook.dir);
      const target = await resetTarget(notebook.dir);
      const index = await resetIndex(notebook.dir);
      return {
        ...target,
        index,
        ...(await restoreTree(notebook.dir, target.sha)),
      };
    });
  }

  public resetToHead(notebook: Notebook, expected: ResetPreview) {
    return notebookOperation(notebook.dir, async () => {
      assertNotebookWritable(notebook.dir);
      const target = await resetTarget(notebook.dir);
      if (target.branch !== expected.branch || target.sha !== expected.sha)
        throw new Error("error/reset-target-changed");
      await restoreTree(notebook.dir, target.sha, {
        confirmed: expected,
      });
      try {
        await clearIndexRebuildMarker(notebook.dir);
      } catch (error) {
        throw new RestorePersistenceError(error);
      }
    });
  }

  public async hardResetNotebook(
    notebook: Notebook,
    sha: string,
    target: ParentGitTree,
    force = false,
    filepaths?: string[],
  ) {
    const ref = branchRef(notebook.gitBranch);
    const args = { fs, dir: notebook.dir, cache: {} };
    const links = target.links;

    await pfs.writeFile(path.resolve(notebook.dir, ".git", ref), sha);
    const replacing = new Set(filepaths ?? target.files);
    const indexed = new Set(await git.listFiles(args));
    const resetPaths = [...indexed].filter(
      (file) => replacing.has(file) || !target.files.has(file),
    );
    // Checkout batches missing entries when an existing regular file already
    // has the target bytes and mode. Leave all other local paths untouched.
    for (const [file, { mode, oid }] of target.blobs) {
      if (
        indexed.has(file) ||
        replacing.has(file) ||
        (mode !== 0o100644 && mode !== 0o100755)
      )
        continue;
      const entry = await workingEntry(notebook.dir, file);
      if (
        entry?.relative !== file ||
        !entry.stats.isFile() ||
        Boolean(entry.stats.mode & 0o111) !== (mode === 0o100755)
      )
        continue;
      const object = (await pfs.readFile(
        this.checkedPath(notebook, file),
      )) as Uint8Array;
      if ((await git.hashBlob({ object })).oid === oid) replacing.add(file);
    }
    if (resetPaths.length) await git.remove({ ...args, filepath: resetPaths });
    await git.checkout({
      ...args,
      ref,
      force,
      filepaths: filepaths && [...replacing],
      fs: parentWorkingFs(notebook.dir, links),
    });
    for (const [filepath, oid] of links) {
      await pfs.mkdirp(path.join(notebook.dir, filepath));
      await git.updateIndex({
        ...args,
        filepath,
        oid,
        mode: 0o160000,
        add: true,
      });
    }
    await pfs.storeTree(notebook.dir);
  }

  private checkedPath(notebook: Notebook, file: string): string {
    return checkedGitPath(notebook.dir, file);
  }

  private async restoreFilesFromCache(
    cache: Cache,
    notebook: Notebook,
  ): Promise<void> {
    // Remove old index entries before adding the children of a former file.
    // A directory or an ancestor file at a deleted path is the local replacement.
    const deleted: string[] = [];
    for (const [file, bytes] of Object.entries(cache)) {
      if (bytes !== null) continue;
      const entry = await workingEntry(notebook.dir, file);
      if (entry?.relative === file && !entry.stats.isDirectory())
        await pfs.unlink(this.checkedPath(notebook, file));
      deleted.push(file);
    }
    if (deleted.length)
      await git.remove({ fs, dir: notebook.dir, filepath: deleted });
    for (const [file, bytes] of Object.entries(cache)) {
      if (bytes === null) continue;
      const target = this.checkedPath(notebook, file);
      const entry = await workingEntry(notebook.dir, file);
      if (entry && (entry.relative !== file || !entry.stats.isFile()))
        throw new NotebookConflictError([file]);
      if (
        !entry ||
        !sameBytes((await pfs.readFile(target)) as Uint8Array, bytes)
      ) {
        await pfs.mkdirp(path.dirname(target));
        await pfs.writeFile(target, bytes);
      }
      await stageLocalFile(notebook.dir, file);
    }
  }

  private async pendingPull(
    notebook: Notebook,
  ): Promise<PullRecovery | undefined> {
    const pending = await readPullRecovery(notebook._id);
    if (pending) needsRecovery(notebook.dir, true);
    return pending;
  }

  private async finishPull(
    notebook: Notebook,
    recovery: PullRecovery,
    prepared?: Awaited<ReturnType<typeof readPullTrees>>,
  ): Promise<void> {
    // Only conflict-free plans are published. Reapply their checked bytes if
    // checkout or storage was interrupted while the notebook was locked.
    const trees =
      prepared ??
      (await readPullTrees(
        notebook.dir,
        recovery.localSha,
        recovery.remoteSha,
      ));
    const { target: targetTree, base } = trees;
    const { files: remoteFiles, links: remoteLinks } = targetTree;
    if (!prepared && (base.links.size || remoteLinks.size)) {
      await assertGitLinkTransition(
        notebook.dir,
        base.links,
        remoteLinks,
        base.files,
        (await refSha(notebook.dir, branchRef(notebook.gitBranch))) ===
          recovery.remoteSha
          ? { oid: recovery.remoteSha, files: remoteFiles, cache: trees.cache }
          : undefined,
      );
    }
    const files = recovery.files;
    for (const file of base.files) {
      if (
        !isWithinGitLink(file, base.links) &&
        !isWithinGitLink(file, remoteLinks) &&
        !remoteFiles.has(file) &&
        !Object.hasOwn(files, file)
      ) {
        const entry = await workingEntry(notebook.dir, file);
        if (entry?.relative === file && !entry.stats.isDirectory())
          await pfs.unlink(this.checkedPath(notebook, file));
      }
    }
    // Checkout cannot write a file over a directory, even when all its former
    // files have been removed. Only empty directories are disposable: an
    // unexpected file must stop recovery rather than be recursively deleted.
    const removeEmptyDirectory = async (dir: string): Promise<void> => {
      for (const entry of await pfs.readdir(dir)) {
        const child = path.join(dir, entry);
        if (!(await fs.promises.lstat(child)).isDirectory())
          throw new Error(`Unplanned file blocks Git checkout: ${child}`);
        await removeEmptyDirectory(child);
      }
      await pfs.rmdir(dir);
    };
    for (const file of trees.incoming) {
      if (remoteLinks.has(file)) continue;
      const target = this.checkedPath(notebook, file);
      if (
        (await pfs.exists(target)) &&
        (await fs.promises.lstat(target)).isDirectory()
      )
        await removeEmptyDirectory(target);
    }
    await this.hardResetNotebook(
      notebook,
      recovery.remoteSha,
      targetTree,
      true,
      [...trees.incoming],
    );
    // The index can be missing entries or still hold old staged versions.
    // Restore the target identities before staging the permitted local edits.
    const args = { fs, dir: notebook.dir, cache: {} };
    const staged = await parentGitTree(notebook.dir, undefined, args.cache, {
      includeBlob: () => true,
    });
    for (const [filepath, { oid, mode }] of targetTree.blobs) {
      const entry = staged.blobs.get(filepath);
      if (
        files[filepath] !== null &&
        (entry?.oid !== oid || entry.mode !== mode)
      )
        await git.updateIndex({ ...args, filepath, oid, mode, add: true });
    }
    await this.restoreFilesFromCache(files, notebook);
    await pfs.storeTree(notebook.dir);
    await clearIndexRebuildMarker(notebook.dir);
    notebook.localSha = recovery.remoteSha;
    notebook.remoteSha = recovery.remoteSha;
    notebook.fetchedAt = new Date();
    await this.saveSyncState(notebook);
    await deletePullRecovery(notebook._id);
    needsRecovery(notebook.dir, false);
  }

  public resumeNotebook(notebook: Notebook): Promise<boolean> {
    return notebookOperation(notebook.dir, async () => {
      const pending = await this.pendingPull(notebook);
      if (!pending) return false;
      await this.finishPull(notebook, pending);
      return true;
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
    onMessage,
  }: PullNotebookArgs): Promise<PullNotebookResult> {
    const previous = await this.pendingPull(notebook);
    if (previous) await this.finishPull(notebook, previous);
    const ref = branchRef(notebook.gitBranch);
    const fetched = await this.fetchGit({ notebook, onProgress, onMessage });
    const remoteSha = fetched.fetchHead;
    if (!remoteSha) throw new Error("error/remote-has-no-commits");
    const args = { fs, dir: notebook.dir, cache: {} };
    const localSha = await refSha(notebook.dir, ref);
    const headRef = await git.currentBranch({ ...args, fullname: true });
    // Synchronization uses the working files and index of this checkout.
    if (headRef !== ref && (await refSha(notebook.dir, "HEAD")) !== localSha)
      throw new Error("error/notebook-branch-mismatch");
    notebook.localSha = localSha;
    const missingIndex =
      !(await pfs.exists(path.join(notebook.dir, ".git/index"))) ||
      (await pfs.exists(indexRebuildMarker(notebook.dir)));
    const descendsFrom = (oid: string, ancestor: string) =>
      git.isDescendent({ ...args, oid, ancestor });
    if (
      localSha === remoteSha ||
      (localSha && (await descendsFrom(localSha, remoteSha)))
    ) {
      const baseline = missingIndex
        ? await parentGitTree(notebook.dir, localSha, args.cache)
        : undefined;
      const { cache, links } = await this.generateChangesCache(
        notebook,
        !missingIndex,
        args.cache,
        baseline?.links,
        baseline && {
          head: baseline.symlinks,
          staged: baseline.symlinks,
          remote: new Map(),
        },
      );
      if (missingIndex) await rebuildNotebookIndex(notebook.dir, localSha);
      if (headRef !== ref)
        await git.checkout({ ...args, ref, noCheckout: true });
      await pfs.storeTree(notebook.dir);
      notebook.remoteSha = remoteSha;
      notebook.fetchedAt = new Date();
      await this.saveSyncState(notebook);
      return {
        status: localSha === remoteSha ? "up-to-date" : "pending-upload",
        links,
        cache,
      };
    }
    if (localSha && !(await descendsFrom(remoteSha, localSha)))
      throw new Error("error/notebook-history-diverged");
    const trees = await readPullTrees(
      notebook.dir,
      localSha,
      remoteSha,
      args.cache,
    );
    const {
      files: remoteFiles,
      links: remoteLinks,
      symlinks: remoteSymlinks,
    } = trees.target;
    const {
      files: baseFiles,
      links: baseLinks,
      symlinks: headSymlinks,
    } = trees.base;
    const index = missingIndex ? trees.base : await trees.readIndex();
    const {
      links: stagedLinks,
      files: stagedFiles,
      symlinks: stagedSymlinks,
    } = index;
    const previousLinks = new Map([...baseLinks, ...stagedLinks]);
    if (previousLinks.size) {
      // An absent pointer in an existing index is a staged deletion.
      for (const file of previousLinks.keys()) {
        const staged = stagedLinks.get(file);
        if (staged === baseLinks.get(file)) continue;
        if (staged ? staged !== remoteLinks.get(file) : remoteFiles.has(file))
          throw new NotebookConflictError([file]);
      }
      // statusMatrix stops at a committed gitlink. A staged blob at or below
      // that path replaces the pointer and would be lost with the old index.
      for (const file of stagedFiles) {
        if (!stagedLinks.has(file) && isWithinGitLink(file, baseLinks))
          throw new NotebookConflictError([file]);
      }
      const children = missingIndex
        ? []
        : await indexedGitLinkChildren(notebook.dir, stagedLinks, args.cache);
      if (children.length) throw new NotebookConflictError(children);
    }
    await assertGitLinkTransition(
      notebook.dir,
      baseLinks,
      remoteLinks,
      new Set([...baseFiles, ...stagedFiles]),
    );
    assertDisplacedBlobsMatch(trees.base, index);
    const indexCandidates = missingIndex ? undefined : new Set(stagedFiles);
    const { cache, links } = await this.generateChangesCache(
      notebook,
      false,
      args.cache,
      remoteLinks,
      { head: headSymlinks, staged: stagedSymlinks, remote: remoteSymlinks },
      missingIndex,
      indexCandidates,
    );
    // Checkout replaces the index. A staged edit can differ from the working
    // file as well as both commits, including when the working file is gone.
    if (indexCandidates?.size) {
      await git.walk({
        ...args,
        trees: [
          git.TREE({ ref: localSha || "HEAD" }),
          git.STAGE(),
          git.TREE({ ref: remoteSha }),
        ],
        map: async (file, [base, stage, remote]) => {
          if (!indexCandidates.has(file) || (await stage?.type()) !== "blob")
            return;
          const staged = await stage.oid();
          if (
            staged === (await base?.oid()) ||
            staged === (await remote?.oid())
          )
            return;
          const local = cache[file];
          if (!local || staged !== (await git.hashBlob({ object: local })).oid)
            throw new NotebookConflictError([file]);
        },
      });
    }
    const isIgnored = ignoreCheck(notebook.dir);
    // A remote file may replace a local directory. Preserve untracked/ignored
    // children too; Git's status matrix need not include those files.
    const conflicts: string[] = [];
    const collectUntracked = async (dir: string): Promise<void> => {
      for (const name of await pfs.readdir(this.checkedPath(notebook, dir))) {
        const file = `${dir}/${name}`;
        if (previousLinks.has(file) || remoteLinks.has(file)) continue;
        const target = this.checkedPath(notebook, file);
        const stats = await fs.promises.lstat(target);
        if (stats.isDirectory()) await collectUntracked(file);
        else if (!baseFiles.has(file) && !(file in cache)) conflicts.push(file);
      }
    };
    for (const file of trees.incoming) {
      if (remoteLinks.has(file)) continue;
      if (
        await this.cacheWorkingFileAncestor(
          notebook,
          file,
          cache,
          false,
          headSymlinks,
        )
      )
        continue;
      const target = this.checkedPath(notebook, file);
      const stats = await fs.promises.lstat(target).catch(missingFileOrThrow);
      if (stats) {
        if (stats.isDirectory()) await collectUntracked(file);
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
          if (
            !stats.isFile() ||
            (entry?.mode !== "100644" && entry?.mode !== "100755")
          )
            throw new NotebookConflictError([file]);
          const { blob } = await git.readBlob({ ...args, oid: entry.oid });
          const current =
            cache[file] ?? ((await pfs.readFile(target)) as Uint8Array);
          if (!sameBytes(current, blob))
            throw new NotebookConflictError([file]);
          delete cache[file];
        }
      }
    }
    const files: Cache = Object.create(null);
    const deletions: ConflictDeletions = Object.create(null);
    for (const [file, ours] of Object.entries(cache)) {
      checkReplayPath(file, remoteSymlinks);
      this.checkedPath(notebook, file);
      const merged = mergeFile(
        file,
        await readListedBlob(args, localSha, file, baseFiles),
        ours,
        await readListedBlob(args, remoteSha, file, remoteFiles),
      );
      if (merged.conflict === true) {
        conflicts.push(file);
        if (merged.deleted) deletions[file] = merged.deleted;
        continue;
      }
      if (
        [...trees.incoming].some(
          (remote) => remote !== file && overlaps(remote, file),
        )
      ) {
        if (merged.bytes !== null) conflicts.push(file);
        continue;
      }
      files[file] = merged.bytes;
    }
    if (conflicts.length) throw new NotebookConflictError(conflicts, deletions);
    const recovery: PullRecovery = { version: 2, localSha, remoteSha, files };
    await this.checkPullIgnoreRules(notebook, recovery, trees, previousLinks);
    // Recovery references the fetched commit and its objects. Persist their
    // directory entries before publishing a plan a new page must replay.
    await pfs.storeTree(notebook.dir);
    await savePullRecovery(notebook._id, recovery);
    needsRecovery(notebook.dir, true);
    await this.finishPull(notebook, recovery, trees);
    return { cache, links, downloadedFrom: localSha };
  }

  private async checkPullIgnoreRules(
    notebook: Notebook,
    recovery: PullRecovery,
    trees: Awaited<ReturnType<typeof readPullTrees>>,
    previousLinks: GitLinkPaths,
  ): Promise<void> {
    const { localSha, remoteSha, files } = recovery;
    const { files: baseFiles, symlinks: headSymlinks } = trees.base;
    const {
      files: remoteFiles,
      symlinks: remoteSymlinks,
      links: remoteLinks,
    } = trees.target;
    const args = { fs, dir: notebook.dir, cache: trees.cache };
    const isIgnored = ignoreCheck(notebook.dir);
    const linkedRules = async (file: string): Promise<string | null> => {
      const resolved = new Map<string, string | null>([[".", "."]]);
      const lookup = async (
        logical: string,
        depth: number,
      ): Promise<string | null> => {
        const known = resolved.get(logical);
        if (known !== undefined) return known;
        // An unfinished lookup is a cycle. Bound nested link expansion too:
        // a growing loop can keep producing new logical paths.
        if (depth > 64) return null;
        resolved.set(logical, null);
        const dir = path.dirname(logical);
        const parent = await lookup(dir, depth);
        if (parent === null) return null;
        let entry: string | null = path.join(parent, path.basename(logical));
        const oid = remoteSymlinks.get(entry);
        if (oid) {
          const { blob } = await git.readBlob({ ...args, oid });
          const link = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
            blob,
          );
          if (path.isAbsolute(link)) return null;
          // CacheFS looks up the entry beneath the resolved parent, but a
          // relative link is based on the original logical directory.
          const pointed = path.join(dir, link);
          if (
            pointed
              .split("/")
              .some((part) => part === ".." || part.toLowerCase() === ".git")
          )
            return null;
          entry = await lookup(pointed, depth + 1);
        }
        resolved.set(logical, entry);
        return entry;
      };
      const target = await lookup(file, 0);
      if (target === null || isWithinGitLink(target, remoteLinks)) return null;
      if (Object.hasOwn(files, target))
        return files[target] === null ? "" : decode(files[target]);
      if (remoteFiles.has(target))
        return decode(
          (await git.readBlob({ ...args, oid: remoteSha, filepath: target }))
            .blob,
        );
      // Checkout removes the old target, or installs a directory at it or
      // a regular file above it. The resulting path supplies no rules.
      if (
        baseFiles.has(target) ||
        [...remoteFiles].some((file) => overlaps(file, target))
      )
        return "";
      const { name, stats } = await inspectWorkingPath(notebook.dir, target);
      if (stats?.isSymbolicLink()) return null;
      return stats?.isFile() && name === path.join(notebook.dir, target)
        ? ((await pfs.readFile(name, { encoding: "utf8" })) as string)
        : "";
    };
    const overrides = new Map<string, string | null>();
    for (const file of new Set([...baseFiles, ...remoteFiles])) {
      if (path.basename(file) !== ".gitignore") continue;
      const folder = path.dirname(file);
      if (remoteSymlinks.has(file)) {
        // The target can change even when the link itself does not.
        overrides.set(folder, await linkedRules(file));
        continue;
      }
      const incoming = await readListedBlob(args, remoteSha, file, remoteFiles);
      if (
        !headSymlinks.has(file) &&
        sameBytes(
          await readListedBlob(args, localSha, file, baseFiles),
          incoming,
        )
      )
        continue;
      this.checkedPath(notebook, file);
      const planned = Object.hasOwn(files, file) ? files[file] : incoming;
      // Match LightningFS's utf8 reads, including BOM handling.
      overrides.set(folder, planned === null ? "" : decode(planned));
    }
    const scopes = new Set(overrides.keys());
    if (scopes.size) {
      const willBeIgnored = ignoreCheck(notebook.dir, overrides);
      // Include untracked drafts that Git leaves out of the status matrix.
      const checkDirectory = async (folder: string): Promise<void> => {
        for (const name of await pfs.readdir(path.join(notebook.dir, folder))) {
          if (name.toLowerCase() === ".git") continue;
          const file = path.join(folder, name);
          if (previousLinks.has(file) || remoteLinks.has(file)) continue;
          const target = this.checkedPath(notebook, file);
          if ((await fs.promises.lstat(target)).isDirectory()) {
            await checkDirectory(file);
            continue;
          }
          if (remoteFiles.has(file)) {
            if (
              files[file] &&
              (await willBeIgnored(file)) !== false &&
              !sameBytes(
                files[file],
                await readListedBlob(args, remoteSha, file, remoteFiles),
              )
            )
              throw new NotebookConflictError([file]);
            continue;
          }
          if (baseFiles.has(file)) continue;
          if (await isIgnored(file)) {
            if (!(await willBeIgnored(file)))
              throw new NotebookConflictError([file]);
          } else if (files[file] && (await willBeIgnored(file)) !== false) {
            throw new NotebookConflictError([file]);
          }
        }
      };
      changedRules: for (const folder of scopes) {
        if (
          isWithinGitLink(folder, previousLinks) ||
          isWithinGitLink(folder, remoteLinks)
        )
          continue;
        for (let parent = folder; parent !== ".";) {
          parent = path.dirname(parent);
          if (scopes.has(parent)) continue changedRules;
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
  }

  private async fetchGit(
    { notebook, onProgress, onMessage }: FetchNotebookArgs,
    options?: { depth: number; tags: boolean },
  ) {
    try {
      const result = await git.fetch({
        fs,
        ...notebookGitConnection(notebook),
        dir: notebook.dir,
        singleBranch: true,
        ref: branchRef(notebook.gitBranch),
        ...options,
        onProgress,
        onMessage,
      });
      notebook.gitNeedsLogin = false;
      return result;
    } catch (error) {
      if (needsGitSettings(error)) notebook.gitNeedsLogin = true;
      throw error;
    }
  }

  public fetchNotebook(args: FetchNotebookArgs): Promise<boolean> {
    return notebookOperation(args.notebook.dir, () =>
      this.fetchNotebookUnlocked(args),
    );
  }

  private async fetchNotebookUnlocked({
    notebook,
    onProgress,
    onMessage,
  }: FetchNotebookArgs): Promise<boolean> {
    const localSha = notebook.localSha;
    const result = await this.fetchGit(
      { notebook, onProgress, onMessage },
      { depth: 1, tags: false },
    );

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
      notebook.gitURL = repositoryAddress(n.gitURL);
      notebook.gitBranch = n.gitBranch;
      notebook.gitCorsProxy = n.gitCorsProxy;
      notebook.gitUsername = n.gitUsername;
      notebook.gitPassword = n.gitPassword;
      notebook.autoFetchPeriod = n.autoFetchPeriod;
      notebook.fetchedAt = n.fetchedAt;
      notebook.remoteSha = n.remoteSha ?? n.localSha;
      notebook.localSha = n.localSha;

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
          await notebookOperation(notebook.dir, async () => {
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
            if (pendingPull) {
              try {
                await this.finishPull(notebook, pendingPull);
              } catch {
                // Keep Download available to retry. The pending plan still
                // owns the write lock and any partially restored index.
                return;
              }
            }
            await rebuildNotebookIndex(notebook.dir, notebook.localSha);
          });
        } catch (error) {
          // A named path conflict can be resolved from the notebook and retried.
          if (!(error instanceof NotebookConflictError)) notebooks[i] = null;
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
    // Cards requesting status in one render share Git's object and index
    // reads. A later batch starts fresh, even after an index rebuild.
    let cache = this.statusBatches.get(notebookPath);
    if (!cache) {
      cache = {};
      this.statusBatches.set(notebookPath, cache);
      queueMicrotask(() => this.statusBatches.delete(notebookPath));
    }
    const args = { fs, dir: notebookPath, filepath: filePath, cache };
    if (await git.isIgnored(args)) return "ignored";
    const stat = await fs.promises
      .lstat(path.join(notebookPath, filePath))
      .catch(missingFileOrThrow);
    if (stat?.isSymbolicLink())
      return symlinkStatus(notebookPath, filePath, cache);
    return git.status({ ...args, refresh: false });
  }
}
