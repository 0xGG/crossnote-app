import { describe, expect, it } from "vitest";
import Search, { tokenize } from "./search";

describe("tokenize", () => {
  // As the search has split them since 2021, with echomd's uslug.
  it.each([
    ["Hello_World-2026.notes", ["Hello", "World", "2026", "notes"]],
    [
      "2026-11-02 meeting notes.md",
      ["2026", "11", "02", "meeting", "notes", "md"],
    ],
    ["a/b c|d", ["a", "b", "c", "d"]],
    ["C++ & C#", ["C", "C"]],
    ["【R3】review_v2", ["R3", "review", "v2"]],
    [
      "交叉笔记（草稿）：第一版，完。",
      ["交", "叉", "笔", "记", "草", "稿", "第", "一", "版", "完"],
    ],
    // Other punctuation outside ASCII is a word of its own.
    ["日本語、テスト", ["日", "本", "語", "、", "テ", "ス", "ト"]],
    ["naïve café", ["na", "ï", "ve", "caf", "é"]],
    // A character of two code units is one word.
    ["😀 and 𠮷野家", ["😀", "and", "𠮷", "野", "家"]],
    ["", []],
  ])("splits %j into its words", (text, words) => {
    expect(tokenize(text)).toEqual(words);
  });
});

describe("Search", () => {
  it("finds a document by title", () => {
    const search = new Search();
    search.add("notes/hello.md", "Hello World");
    const results = search.search("hello");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toBe("notes/hello.md");
  });

  it("finds an emoji by itself, not by another that shares half its code units", () => {
    const search = new Search();
    search.add("notes/grin.md", "Grin 😀");
    search.add("notes/beam.md", "Beam 😁");
    expect(search.search("😀").map(({ filePath }) => filePath)).toEqual([
      "notes/grin.md",
    ]);
    expect(search.search("😁").map(({ filePath }) => filePath)).toEqual([
      "notes/beam.md",
    ]);
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
