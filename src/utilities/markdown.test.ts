import { describe, expect, it } from "vitest";
import { getTags, matter, matterStringify, sanitizeTag } from "./markdown";

describe("getTags", () => {
  it("extracts hash tags from markdown", () => {
    const tags = getTags("Hello #tag1 world and #中文标签 too");
    expect(tags).toContain("tag1");
    expect(tags).toContain("中文标签");
  });

  it("returns an empty array when there are no tags", () => {
    expect(getTags("plain text without tags")).toEqual([]);
  });
});

describe("sanitizeTag", () => {
  it("collapses whitespace and trims path segments", () => {
    expect(sanitizeTag("  foo /  bar ")).toBe("foo/bar");
  });

  it("drops empty path segments", () => {
    expect(sanitizeTag("foo//bar")).toBe("foo/bar");
  });
});

describe("matter", () => {
  it("parses front matter and strips it from the content", () => {
    const output = matter("---\nfavorited: true\n---\n# Hello");
    expect(output.data.favorited).toBe(true);
    expect(output.content).toBe("# Hello");
  });

  it("returns the whole document when there is no front matter", () => {
    const output = matter("# Just content");
    expect(output.data).toEqual({});
    expect(output.content).toBe("# Just content");
  });

  it("round-trips through matterStringify", () => {
    const md = matterStringify("# Body", { pinned: true });
    const parsed = matter(md);
    expect(parsed.data.pinned).toBe(true);
    expect(parsed.content.trim()).toBe("# Body");
  });
});
