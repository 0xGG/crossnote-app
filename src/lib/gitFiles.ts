import * as git from "isomorphic-git";
import { fs } from "./fs";

export async function stageLocalFile(dir: string, filepath: string) {
  const args = { fs, dir, filepath };
  // A notebook's ignore rules also govern local edits to tracked files.
  if (!(await git.isIgnored(args))) await git.add(args);
}
