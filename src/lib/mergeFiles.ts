// @ts-ignore
import diff3Merge from "diff3";
import path from "path-browserify";
import type { ConflictDeletions, FileBytes } from "./pullRecovery";

const textExtensions = new Set(
  "md markdown txt text json jsonc yaml yml toml ini cfg conf csv tsv xml html htm css scss less js jsx mjs cjs ts tsx py rb rs go java c h cpp hpp cs sh bash zsh ps1 sql vue svelte svg tex bib log".split(
    " ",
  ),
);
const textNames = new Set([
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".editorconfig",
  ".npmrc",
  ".prettierrc",
  ".eslintrc",
  "dockerfile",
  "makefile",
  "license",
  "readme",
]);
const encoder = new TextEncoder();

export function sameBytes(a: FileBytes, b: FileBytes): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.length === b.length &&
      a.every((byte, i) => byte === b[i]))
  );
}

export function mergeableText(file: string, bytes: FileBytes): string | null {
  if (bytes === null) return null;
  const name = path.basename(file).toLowerCase();
  if (!textNames.has(name) && !textExtensions.has(path.extname(name).slice(1)))
    return null;
  if (
    bytes.some(
      (byte) => (byte < 32 && ![9, 10, 12, 13].includes(byte)) || byte === 127,
    )
  )
    return null;
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    return sameBytes(encoder.encode(text), bytes) ? text : null;
  } catch {
    return null;
  }
}

export function mergeFile(
  file: string,
  base: FileBytes,
  ours: FileBytes,
  theirs: FileBytes,
):
  | { conflict: false; bytes: FileBytes }
  | { conflict: true; deleted?: "local" | "remote" } {
  if (sameBytes(ours, theirs) || sameBytes(base, theirs)) {
    return { conflict: false, bytes: ours };
  }
  if (sameBytes(base, ours)) {
    return { conflict: false, bytes: theirs };
  }
  const a = mergeableText(file, ours);
  const b = base === null ? "" : mergeableText(file, base);
  const c = mergeableText(file, theirs);
  if (a !== null && b !== null && c !== null) {
    const lines = (text: string): string[] =>
      text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const merged = diff3Merge(lines(a), lines(b), lines(c));
    let text = "";
    for (const part of merged) {
      if (part.conflict) return { conflict: true };
      text += part.ok.join("");
    }
    return { conflict: false, bytes: encoder.encode(text) };
  }
  if (ours === null) return { conflict: true, deleted: "local" };
  if (theirs === null) return { conflict: true, deleted: "remote" };
  return { conflict: true };
}

export class NotebookConflictError extends Error {
  constructor(
    readonly files: string[],
    readonly deletions: ConflictDeletions = {},
  ) {
    super("error/please-resolve-conflicts");
    this.name = "NotebookConflictError";
  }

  describe(
    deleted: (file: string, side: "local" | "remote") => string,
  ): string {
    return this.files
      .map((file) =>
        this.deletions[file] ? deleted(file, this.deletions[file]) : file,
      )
      .join(", ");
  }
}
