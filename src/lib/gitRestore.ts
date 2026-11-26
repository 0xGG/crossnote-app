import * as git from "isomorphic-git";
import { GitIndexManager } from "isomorphic-git/managers";
import { FileSystem } from "isomorphic-git/models";
import path from "path-browserify";
import { fs, missingFileOrThrow, pfs } from "./fs";
import { checkedGitPath } from "./gitFiles";
import {
  assertGitLinkTransition,
  indexedGitLinkChildren,
  matchesSymlink,
} from "./gitLinks";
import { NotebookConflictError, sameBytes } from "./mergeFiles";

export class RestorePersistenceError extends Error {
  constructor(cause: unknown) {
    super("error/restore-persistence", { cause });
  }
}

export class RestoreApplyError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

export async function resetTarget(dir: string) {
  const args = { fs, dir };
  const branch = await git.currentBranch({ ...args, fullname: true });
  return {
    branch: branch || "HEAD",
    sha: await git.resolveRef({ ...args, ref: "HEAD" }),
  };
}

export const resetIndex = (dir: string) =>
  fs.promises.readFile(path.join(dir, ".git/index")).catch(missingFileOrThrow);

export type ResetPreview = Awaited<ReturnType<typeof resetTarget>> & {
  index: Awaited<ReturnType<typeof resetIndex>>;
  files: string[];
  displaced: Map<string, string>;
};

const lstat = (file: string) =>
  fs.promises.lstat(file).catch(missingFileOrThrow);

// Both checks use lstat so a symlink is always a leaf.
async function visitBlocker(
  file: string,
  check: (file: string, kind: string) => void,
  remove = false,
) {
  const stat = await lstat(file);
  if (!stat) return;
  check(file, stat.type);
  if (stat.isDirectory()) {
    for (const name of await pfs.readdir(file))
      await visitBlocker(path.join(file, name), check, remove);
    if (remove) await fs.promises.rmdir(file);
  } else if (remove) await pfs.unlink(file);
}

async function removeBlocker(
  file: string,
  displaced: ReadonlyMap<string, string>,
) {
  const verify = (name: string, kind: string) => {
    if (displaced.get(name) !== kind)
      throw new Error("error/reset-target-changed");
  };
  // Check all siblings before removing the first one, then verify again as
  // each entry is reached. An approved directory cannot become a new file.
  await visitBlocker(file, verify);
  await visitBlocker(file, verify, true);
}

async function restoreBlob(
  args: { fs: typeof fs; dir: string; cache: object },
  file: string,
  mode: number,
  oid: string,
  work: Awaited<ReturnType<typeof lstat>>,
  displaced: Map<string, string>,
) {
  const symlink = mode === 0o120000;
  const sameMode = symlink
    ? work?.isSymbolicLink()
    : work?.isFile() && Boolean(work.mode & 0o111) === (mode === 0o100755);
  if (sameMode && symlink) {
    if (await matchesSymlink(args, file, oid)) return;
  } else if (sameMode) {
    const bytes = await fs.promises.readFile(file);
    if (bytes && (await git.hashBlob({ object: bytes })).oid === oid) return;
  }
  if (work) displaced.set(file, work.type);
  return async () => {
    const { blob } = await git.readBlob({ ...args, oid });
    const current = await lstat(file);
    if (current?.type !== work?.type)
      throw new Error("error/reset-target-changed");
    if (work && (!sameMode || symlink)) await removeBlocker(file, displaced);
    if (symlink)
      await fs.promises.symlink(
        new TextDecoder("utf-8", { ignoreBOM: true }).decode(blob),
        file,
      );
    else await fs.promises.writeFile(file, blob, { mode: mode & 0o777 });
  };
}

// Inspect the Git paths and any directory a committed file would replace.
// Hash working bytes: LightningFS timestamps can alias an equal-size edit.
// All collision checks finish before the first write. Applying the same plan
// again after a partial failure converges on the same commit.
export async function restoreTree(
  dir: string,
  ref: string,
  apply?: { onlyFile: string } | { confirmed: ResetPreview },
) {
  const onlyFile = apply && "onlyFile" in apply ? apply.onlyFile : undefined;
  const args = { fs, dir, cache: {} };
  const indexChanges = new Map<string, { mode: number; oid: string } | null>();
  const inScope = (file: string) =>
    !onlyFile || file === onlyFile || onlyFile.startsWith(file + "/");
  const oldLinks = new Map<string, string>();
  const links = new Map<string, string>();
  const staged = new Set<string>();
  const directories = new Set(["."]);
  const changed = new Set<string>();
  const removals: (() => Promise<void>)[] = [];
  const obsoleteDirectories: string[] = [];
  const blockingDirectories: string[] = [];
  const displaced = new Map<string, string>();
  const installedBlobs = new Set<string>();
  const updates: (() => Promise<void>)[] = [];
  let foundNote = false;
  await git.walk({
    ...args,
    trees: [git.TREE({ ref }), git.STAGE()],
    map: async (file, [head, index]) => {
      if (file === ".") return;
      if (!inScope(file)) {
        if (onlyFile && file.startsWith(onlyFile + "/") && index)
          throw new NotebookConflictError([onlyFile]);
        return null;
      }
      if (
        onlyFile &&
        (await head?.type()) !== (file === onlyFile ? "blob" : "tree")
      )
        return null;
      const mode = await head?.mode();
      const full = checkedGitPath(dir, file);
      const work = directories.has(path.dirname(file))
        ? await lstat(full)
        : null;
      const indexMode = await index?.mode();
      if (mode === 0o160000) links.set(file, await head.oid());
      if (indexMode === 0o160000) oldLinks.set(file, await index.oid());
      if (indexMode && indexMode !== 0o40000) staged.add(file);
      if (work?.isDirectory() && mode !== 0o160000 && indexMode !== 0o160000)
        directories.add(file);
      if (staged.has(file) && (!mode || mode === 0o40000)) {
        changed.add(file);
        indexChanges.set(file, null);
        if (work && !work.isDirectory()) {
          displaced.set(full, work.type);
          removals.push(() => removeBlocker(full, displaced));
        }
      }
      if (!head) {
        if (work?.isDirectory() && (await index?.type()) === "tree")
          obsoleteDirectories.push(full);
        return;
      }
      if (mode === 0o40000) {
        if (!work?.isDirectory()) {
          if (work) {
            changed.add(file);
            displaced.set(full, work.type);
          }
          updates.push(async () => {
            await removeBlocker(full, displaced);
            await pfs.mkdir(full);
          });
        }
        return;
      }
      const oid = await head.oid();
      const updateIndex = indexMode !== mode || oid !== (await index?.oid());
      let write: (() => Promise<void>) | undefined;
      if (mode === 0o160000) {
        if (!work) write = () => pfs.mkdir(full);
      } else {
        if (file === onlyFile) foundNote = true;
        if (work?.isDirectory()) blockingDirectories.push(full);
        write = await restoreBlob(args, full, mode, oid, work, displaced);
        // A staged pointer may already have its committed blob on disk.
        // Only the index changes; no submodule directory is displaced.
        if (indexMode === 0o160000 && !write) installedBlobs.add(file);
      }
      if (write || updateIndex) {
        changed.add(file);
        if (write) updates.push(write);
        if (updateIndex) indexChanges.set(file, { mode, oid });
      }
    },
  });
  if (onlyFile) {
    if (!foundNote) throw new Error("error/no-committed-note");
    // A single-note restore can change only the note itself.
    for (const file of changed)
      if (file !== onlyFile) throw new NotebookConflictError([file]);
  }
  await assertGitLinkTransition(dir, oldLinks, links, staged, {
    oid: ref,
    files: installedBlobs,
    cache: args.cache,
  });
  for (const folder of blockingDirectories) {
    if (onlyFile) {
      const [child] = await pfs.readdir(folder);
      if (child) throw new NotebookConflictError([path.join(onlyFile, child)]);
    } else {
      await visitBlocker(folder, (name, kind) => displaced.set(name, kind));
    }
  }
  for (const file of displaced.keys()) changed.add(path.relative(dir, file));
  if (!onlyFile) {
    for (const file of await indexedGitLinkChildren(
      dir,
      oldLinks,
      args.cache,
    )) {
      // The joint walk already compared every visible index entry and
      // planned any missing entry required by HEAD.
      if (staged.has(file) || indexChanges.has(file)) continue;
      changed.add(file);
      indexChanges.set(file, null);
    }
  }
  const files = [...changed].sort();
  if (apply) {
    if ("confirmed" in apply) {
      const confirmed = apply.confirmed;
      if (
        confirmed.files.length !== files.length ||
        files.some((file, i) => file !== confirmed.files[i]) ||
        confirmed.displaced.size !== displaced.size ||
        [...displaced].some(
          ([name, kind]) => confirmed.displaced.get(name) !== kind,
        ) ||
        !sameBytes(confirmed.index, await resetIndex(dir))
      )
        throw new Error("error/reset-target-changed");
    }
    // A committed file can replace a directory of staged children.
    try {
      for (const remove of removals) await remove();
      for (const folder of obsoleteDirectories.reverse())
        if (!(await pfs.readdir(folder)).length)
          await fs.promises.rmdir(folder);
      for (const update of updates) await update();
      if (indexChanges.size) {
        await GitIndexManager.acquire(
          {
            fs: new FileSystem(fs),
            gitdir: path.join(dir, ".git"),
            cache: args.cache,
          },
          (index) => {
            for (const [filepath, entry] of indexChanges) {
              if (!entry) index.delete({ filepath });
              else
                index.insert({
                  filepath,
                  oid: entry.oid,
                  stats: {
                    mode: entry.mode,
                    ctime: new Date(0),
                    mtime: new Date(0),
                    dev: 0,
                    ino: 0,
                    uid: 0,
                    gid: 0,
                    size: 0,
                  },
                });
            }
          },
        );
      }
    } catch (error) {
      throw new RestoreApplyError(error);
    }
    try {
      await pfs.storeTree(dir);
    } catch (error) {
      throw new RestorePersistenceError(error);
    }
  }
  return { files, displaced };
}
