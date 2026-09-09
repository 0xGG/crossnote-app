import { describe, expect, it } from "vitest";
import { matter, matterStringify } from "./markdown";

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
