import * as git from "isomorphic-git";
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
};

const lstat = (file: string) =>
  fs.promises.lstat(file).catch(missingFileOrThrow);

// Follow only the directory entries seen in preflight, never a symlink or a
// new entry that appeared after the user confirmed the reset.
async function removeBlocker(file: string, displaced?: ReadonlySet<string>) {
  const stat = await lstat(file);
  if (stat?.isDirectory()) {
    for (const name of await pfs.readdir(file)) {
      const child = path.join(file, name);
      if (!displaced?.has(child)) throw new Error("error/reset-target-changed");
      await removeBlocker(child, displaced);
    }
    await fs.promises.rmdir(file);
  } else if (stat) await pfs.unlink(file);
}

async function listDisplacedEntries(folder: string, entries: Set<string>) {
  for (const name of await pfs.readdir(folder)) {
    const file = path.join(folder, name);
    entries.add(file);
    if ((await lstat(file))?.isDirectory())
      await listDisplacedEntries(file, entries);
  }
}

async function restoreBlob(
  args: { fs: typeof fs; dir: string; cache: object },
  file: string,
  mode: number,
  oid: string,
  work: Awaited<ReturnType<typeof lstat>>,
  displaced: ReadonlySet<string>,
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
  return async () => {
    const { blob } = await git.readBlob({ ...args, oid });
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
  const removeIndexEntry = async (filepath: string) => {
    await git.updateIndex({ ...args, filepath, remove: true, force: true });
  };
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
  const displaced = new Set<string>();
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
        removals.push(async () => {
          if (work && !work.isDirectory()) await pfs.unlink(full);
          await removeIndexEntry(file);
        });
      }
      if (!head) {
        if (work?.isDirectory() && (await index?.type()) === "tree")
          obsoleteDirectories.push(full);
        return;
      }
      if (mode === 0o40000) {
        if (!work?.isDirectory()) {
          if (work) changed.add(file);
          updates.push(async () => {
            await removeBlocker(full);
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
      }
      if (write || updateIndex) {
        changed.add(file);
        updates.push(async () => {
          await write?.();
          if (updateIndex)
            await git.updateIndex({
              ...args,
              filepath: file,
              mode,
              oid,
              add: true,
            });
        });
      }
    },
  });
  if (onlyFile) {
    if (!foundNote) throw new Error("error/no-committed-note");
    // A single-note restore can change only the note itself.
    for (const file of changed)
      if (file !== onlyFile) throw new NotebookConflictError([file]);
  }
  await assertGitLinkTransition(dir, oldLinks, links, staged);
  for (const folder of blockingDirectories) {
    if (onlyFile) {
      const [child] = await pfs.readdir(folder);
      if (child) throw new NotebookConflictError([path.join(onlyFile, child)]);
    } else {
      await listDisplacedEntries(folder, displaced);
    }
  }
  for (const file of displaced) changed.add(path.relative(dir, file));
  if (!onlyFile) {
    for (const file of await indexedGitLinkChildren(
      dir,
      oldLinks,
      args.cache,
    )) {
      changed.add(file);
      removals.push(() => removeIndexEntry(file));
    }
  }
  const files = [...changed].sort();
  if (apply) {
    if ("confirmed" in apply) {
      const confirmed = apply.confirmed;
      if (
        confirmed.files.length !== files.length ||
        files.some((file, i) => file !== confirmed.files[i]) ||
        !sameBytes(confirmed.index, await resetIndex(dir))
      )
        throw new Error("error/reset-target-changed");
    }
    // A committed file can replace a directory of staged children.
    for (const remove of removals) await remove();
    for (const folder of obsoleteDirectories.reverse())
      if (!(await pfs.readdir(folder)).length) await fs.promises.rmdir(folder);
    for (const update of updates) await update();
    try {
      await pfs.storeTree(dir);
    } catch (error) {
      throw new RestorePersistenceError(error);
    }
  }
  return files;
}
