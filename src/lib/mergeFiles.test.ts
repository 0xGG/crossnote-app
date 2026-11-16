import { describe, expect, it } from "vitest";
import { mergeableText, mergeFile } from "./mergeFiles";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array | null) => new TextDecoder().decode(data!);

describe("file merge policy", () => {
  it.each([
    "notes.md",
    "a.txt",
    ".gitignore",
    "config.yaml",
    "assets/a.txt",
    "script.ts",
  ])("merges disjoint text edits in %s", (file) => {
    const merged = mergeFile(
      file,
      bytes("one\ntwo\nthree\n"),
      bytes("ONE\ntwo\nthree\n"),
      bytes("one\ntwo\nTHREE\n"),
    );
    expect(merged.conflict).toBe(false);
    expect(text(merged.bytes)).toBe("ONE\ntwo\nTHREE\n");
  });
  it.each(["image.png", "unknown", "data.custom"])(
    "keeps both versions of %s without decoding them",
    (file) => {
      const ours = new Uint8Array([0, 255, 129]);
      const theirs = new Uint8Array([0, 254, 130]);
      expect(mergeFile(file, new Uint8Array([0, 253]), ours, theirs)).toEqual({
        bytes: ours,
        copy: theirs,
        conflict: true,
      });
    },
  );
  it("does not mistake invalid UTF-8 or control bytes in a text filename for text", () => {
    for (const value of [[255], [0, 65], [65, 1], [0xc0, 0xaf]])
      expect(mergeableText("file.txt", new Uint8Array(value))).toBeNull();
    expect(mergeableText("file.txt", bytes("\ufeff中文\r\n"))).toBe(
      "\ufeff中文\r\n",
    );
  });
  it("does not conflict on equal or one-sided byte changes", () => {
    const base = new Uint8Array([255, 1]);
    const changed = new Uint8Array([254, 2]);
    expect(mergeFile("a.bin", base, changed, base)).toEqual({
      bytes: changed,
      conflict: false,
    });
    expect(mergeFile("a.bin", base, base, changed)).toEqual({
      bytes: changed,
      conflict: false,
    });
    expect(mergeFile("a.bin", base, changed, changed.slice())).toEqual({
      bytes: changed,
      conflict: false,
    });
  });
  it("distinguishes deletion from an empty file and preserves modified sides", () => {
    const base = bytes("base");
    const changed = bytes("changed");
    expect(mergeFile("a.bin", base, null, base)).toEqual({
      bytes: null,
      conflict: false,
    });
    expect(mergeFile("a.bin", base, base, null)).toEqual({
      bytes: null,
      conflict: false,
    });
    expect(mergeFile("a.bin", base, null, changed)).toEqual({
      bytes: changed,
      conflict: true,
      deleted: "local",
    });
    expect(mergeFile("a.bin", base, changed, null)).toEqual({
      bytes: changed,
      conflict: true,
      deleted: "remote",
    });
    expect(mergeFile("a.txt", null, new Uint8Array(), null)).toEqual({
      bytes: new Uint8Array(),
      conflict: false,
    });
  });
  it("retains text conflicts for the editor, including a later unchanged pull", () => {
    const merged = mergeFile(
      "a.md",
      bytes("base\n"),
      bytes("ours\n"),
      bytes("theirs\n"),
    );
    expect(merged.conflict).toBe(true);
    expect(text(merged.bytes)).toContain("\\<<<<<<< ours\nours\n");
    expect(text(merged.bytes)).toContain("theirs\n");
    const incoming = mergeFile(
      "a.md",
      bytes("base\n"),
      bytes("base\n"),
      merged.bytes,
    );
    expect(incoming.conflict).toBe(true);
    expect(incoming.bytes).toBe(merged.bytes);
    expect(
      mergeFile("a.md", bytes("theirs\n"), merged.bytes, bytes("theirs\n"))
        .conflict,
    ).toBe(true);
  });
});
