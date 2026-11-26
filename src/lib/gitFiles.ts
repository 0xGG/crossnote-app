import * as git from "isomorphic-git";
import path from "path-browserify";
import { fs } from "./fs";
import { gitLinks } from "./gitLinks";

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
