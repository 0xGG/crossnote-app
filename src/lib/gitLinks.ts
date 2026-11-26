import * as git from "isomorphic-git";
import path from "path-browserify";
import { fs, missingFileOrThrow, pfs } from "./fs";
import { NotebookConflictError } from "./mergeFiles";

// Gitlinks are leaves of a parent repository even when their directories
// contain a populated checkout. Read their identity from Git, never from disk.
export async function parentGitTree(
  dir: string,
  ref?: string,
  cache = {},
  filepath?: string,
) {
  const links = new Map<string, string>();
  const files = new Set<string>();
  if (ref === "") return { links, files };
  await git.walk({
    fs,
    dir,
    cache,
    trees: [ref === undefined ? git.STAGE() : git.TREE({ ref })],
    map: async (file, [entry]) => {
      if (
        filepath &&
        file !== "." &&
        file !== filepath &&
        !filepath.startsWith(file + "/")
      )
        return null;
      const type = await entry.type();
      if (type === "commit") links.set(file, await entry.oid());
      if (type !== "tree") files.add(file);
    },
  });
  return { links, files };
}

export async function gitLinks(
  dir: string,
  ref?: string,
  cache = {},
  filepath?: string,
) {
  return (await parentGitTree(dir, ref, cache, filepath)).links;
}

export function isWithinGitLink(
  file: string,
  links: ReadonlyMap<string, string> | ReadonlySet<string>,
) {
  if (!links.size) return false;
  let current = "";
  for (const part of file.split("/")) {
    current = current ? current + "/" + part : part;
    if (links.has(current)) return true;
  }
  return false;
}

// A legacy index can contain both a pointer and its child. The tree walker
// hides the child, but the raw index still names it.
export async function indexedGitLinkChildren(
  dir: string,
  links: ReadonlyMap<string, string> | ReadonlySet<string>,
  cache = {},
) {
  if (!links.size) return [];
  return (await git.listFiles({ fs, dir, cache })).filter((file) =>
    isWithinGitLink(path.dirname(file), links),
  );
}

export async function matchesSymlink(
  args: { fs: typeof fs; dir: string; cache: object },
  name: string,
  oid: string,
) {
  const { blob } = await git.readBlob({ ...args, oid });
  // LightningFS normalizes the link text (for example "assets" to "./assets").
  const expected = new TextDecoder("utf-8", { ignoreBOM: true }).decode(blob);
  return (
    path.join(expected, ".") ===
    path.join(await args.fs.promises.readlink(name), ".")
  );
}

// A retry may find part or all of the incoming tree already on disk. Check
// only what exists beneath the old pointer, without following symlinks or
// opening a nested submodule's checkout.
async function matchesInstalledEntry(
  args: { fs: typeof fs; dir: string; cache: object },
  name: string,
  entry: git.TreeEntry,
): Promise<boolean> {
  const stats = await args.fs.promises.lstat(name);
  if (entry.type === "commit") return stats.isDirectory();
  if (entry.type === "tree") {
    if (!stats.isDirectory()) return false;
    const { tree } = await git.readTree({ ...args, oid: entry.oid });
    const entries = new Map(tree.map((child) => [child.path, child]));
    for (const child of await pfs.readdir(name)) {
      const expected = entries.get(child);
      if (
        !expected ||
        !(await matchesInstalledEntry(args, path.join(name, child), expected))
      )
        return false;
    }
    return true;
  }
  if (entry.mode === "120000")
    return stats.isSymbolicLink() && matchesSymlink(args, name, entry.oid);
  return (
    stats.isFile() &&
    (await git.hashBlob({ object: await args.fs.promises.readFile(name) }))
      .oid === entry.oid
  );
}

export async function assertGitLinkTransition(
  dir: string,
  previous: ReadonlyMap<string, string>,
  target: ReadonlyMap<string, string>,
  previousFiles: ReadonlySet<string>,
  installed?: { oid: string; files: ReadonlySet<string>; cache: object },
) {
  for (const file of previous.keys()) {
    if (target.has(file)) continue;
    const name = path.join(dir, file);
    const stats = await fs.promises.lstat(name).catch(missingFileOrThrow);
    // An empty pointer directory can be replaced on the first checkout.
    if (!stats || (stats.isDirectory() && !(await pfs.readdir(name)).length))
      continue;
    if (
      installed &&
      (installed.files.has(file) ||
        (stats.isDirectory() &&
          [...installed.files].some((child) => child.startsWith(file + "/"))))
    ) {
      const args = { fs, dir, cache: installed.cache };
      const parent = path.dirname(file);
      const { tree } = await git.readTree({
        ...args,
        oid: installed.oid,
        filepath: parent === "." ? undefined : parent,
      });
      const entry = tree.find((item) => item.path === path.basename(file));
      if (entry && (await matchesInstalledEntry(args, name, entry))) continue;
    }
    // Once this pointer disappears, its contents would be ordinary parent
    // files on the next upload even if checkout never overwrites them.
    throw new NotebookConflictError([file]);
  }
  for (const file of target.keys()) {
    let name = dir;
    for (const part of file.split("/")) {
      name = path.join(name, part);
      const stats = await fs.promises.lstat(name).catch(missingFileOrThrow);
      if (!stats) break;
      if (!stats.isDirectory()) throw new NotebookConflictError([file]);
    }
    if (
      !previous.has(file) &&
      [...previousFiles].some((old) => old.startsWith(file + "/")) &&
      (await pfs.exists(path.join(dir, file))) &&
      (await pfs.readdir(path.join(dir, file))).length
    )
      throw new NotebookConflictError([file]);
  }
}
