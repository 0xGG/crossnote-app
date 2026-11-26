import * as git from "isomorphic-git";
import path from "path-browserify";
import { fs } from "./fs";
import { gitLinks, matchesSymlink } from "./gitLinks";

// git.status hashes the contents of the file a symlink points at. Compare
// the link itself with the index and HEAD, including dangling links.
async function symlinkEntryStatus(
  args: { fs: typeof fs; dir: string; cache: object },
  filepath: string,
  head: git.WalkerEntry | null,
  index: git.WalkerEntry | null,
) {
  const name = path.join(args.dir, filepath);
  const staged =
    (await index?.mode()) === 0o120000 ? await index.oid() : undefined;
  const committed =
    (await head?.mode()) === 0o120000 ? await head.oid() : undefined;
  if (staged && (await matchesSymlink(args, name, staged))) {
    if (!head) return "added";
    return committed === staged ? "unmodified" : "modified";
  }
  if (
    committed &&
    committed !== staged &&
    (await matchesSymlink(args, name, committed))
  )
    return index ? "*unmodified" : "*undeleted";
  if (!head) return "*added";
  return index ? "*modified" : "*undeletemodified";
}

export async function symlinkStatus(
  dir: string,
  filepath: string,
  cache: object,
) {
  const args = { fs, dir, cache };
  let status = "*added";
  await git.walk({
    ...args,
    trees: [git.TREE({ ref: "HEAD" }), git.STAGE()],
    map: async (file, [head, index]) => {
      if (file !== filepath)
        return file === "." || filepath.startsWith(file + "/")
          ? undefined
          : null;
      status = await symlinkEntryStatus(args, file, head, index);
      return null;
    },
  });
  return status;
}

export function checkedGitPath(dir: string, file: string) {
  if (
    file
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      ) ||
    file.includes("\\")
  )
    throw new Error("Invalid recovery file path");
  return path.resolve(dir, file);
}

export async function stageLocalFile(dir: string, filepath: string) {
  const args = { fs, dir, filepath };
  const relative = path.normalize(filepath);
  if (
    relative.includes("/") &&
    ((await gitLinks(dir, undefined, {}, relative)).size ||
      (await gitLinks(dir, "HEAD", {}, relative)).size)
  )
    return;
  // A notebook's ignore rules also govern local edits to tracked files.
  if (!(await git.isIgnored(args))) await git.add(args);
}
