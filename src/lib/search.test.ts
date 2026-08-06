import { describe, expect, it } from "vitest";
import Search from "./search";

describe("Search", () => {
  it("finds a document by title", () => {
    const search = new Search();
    search.add("notes/hello.md", "Hello World");
    const results = search.search("hello");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toBe("notes/hello.md");
  });

  it("supports CJK titles", () => {
    const search = new Search();
    search.add("notes/cn.md", "交叉笔记");
    expect(search.search("交叉").length).toBeGreaterThan(0);
  });

  it("removes documents from the index", () => {
    const search = new Search();
    search.add("a.md", "Alpha");
    search.remove("a.md");
    expect(search.search("alpha")).toHaveLength(0);
  });

  it("makes notes findable by added aliases", () => {
    const search = new Search();
    search.add("a.md", "Alpha");
    search.addAlias("a.md", "Omega");
    expect(search.search("omega").length).toBeGreaterThan(0);
  });
});
