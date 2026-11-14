import { describe, expect, it } from "vitest";
import { noteLanguage } from "./language";
import { linkAt } from "./links";
import { stateOf } from "./testText";

// The link at the caret ("¦").
function at(marked: string) {
  const state = stateOf(marked, noteLanguage);
  return linkAt(state, state.selection.main.head);
}

describe("linkAt", () => {
  it.each([
    ["[te¦xt](a\\(b\\).md)", "a(b).md"],
    ["[te¦xt][r]\n\n[r]: a\\(b\\).md", "a(b).md"],
    ["[te¦xt](a&amp;b.md)", "a&b.md"],
    ["[te¦xt](Re:Zero.md)", "./Re:Zero.md"],
    ["[te¦xt](a>)", "a>"],
    [String.raw`[te¦xt](a\>)`, "a>"],
    ["[te¦xt][r]\n\n[r]: a>", "a>"],
    [String.raw`[te¦xt][r]` + "\n\n" + String.raw`[r]: a\>`, "a>"],
    [String.raw`[te¦xt](<a\>>)`, "a>"],
    [String.raw`[te¦xt](\<a>)`, "<a>"],
    ["[te¦xt](<a>)", "a"],
  ])("resolves Markdown destinations like the preview: %s", (text, target) => {
    expect(at(text)).toEqual({ kind: "link", target });
  });
  it("gives the address of a link, from its text or its address", () => {
    expect(at('[te¦xt](https://example.org "Title")')).toEqual({
      kind: "link",
      target: "https://example.org",
    });
    expect(at("[text](./Other¦.md)")).toEqual({
      kind: "link",
      target: "./Other.md",
    });
    expect(at("[text](<a b.md>)¦")).toEqual({ kind: "link", target: "a b.md" });
  });

  it("gives a bare address, in angle brackets or not", () => {
    expect(at("<https://example.org/an¦gle>")).toEqual({
      kind: "link",
      target: "https://example.org/angle",
    });
    expect(at("see https://example.org/ba¦re now")).toEqual({
      kind: "link",
      target: "https://example.org/bare",
    });
  });

  it("gives a bare address without a scheme as the preview takes it, not as a note's path", () => {
    expect(at("see www.example.org/pa¦ge now")).toEqual({
      kind: "link",
      target: "http://www.example.org/page",
    });
    expect(at("see www.example.org:8080/pa¦ge now")).toEqual({
      kind: "link",
      target: "http://www.example.org:8080/page",
    });
    expect(at("write to me@exam¦ple.org now")).toBeNull();
    expect(at("write to <me@exam¦ple.org> now")).toEqual({
      kind: "link",
      target: "mailto:me@example.org",
    });
    expect(at("write to mailto:me@exam¦ple.org now")).toEqual({
      kind: "link",
      target: "mailto:me@example.org",
    });
  });

  it("gives the address a reference is given elsewhere in the note", () => {
    const rest = '\n\n[r]: https://example.org/ref "Ref title"\n';
    expect(at(`[by refe¦rence][r]${rest}`)).toEqual({
      kind: "link",
      target: "https://example.org/ref",
    });
    expect(at(`[R¦][]${rest}`)).toEqual({
      kind: "link",
      target: "https://example.org/ref",
    });
    expect(at(`[¦r]${rest}`)).toEqual({
      kind: "link",
      target: "https://example.org/ref",
    });
  });

  it("gives none for brackets that lead nowhere", () => {
    expect(at("[te¦xt] and [other][missing]")).toBeNull();
    expect(at("[text] and [oth¦er][missing]")).toBeNull();
  });

  it("gives the note a wiki link names", () => {
    expect(at("See [[READ¦ME]].")).toEqual({ kind: "wiki", target: "README" });
    expect(at("[[folder/Other note | the ¦text]]")).toEqual({
      kind: "wiki",
      target: "folder/Other note",
    });
  });

  it("gives a hashtag's text", () => {
    expect(at("about #top¦ic/sub.")).toEqual({
      kind: "hashtag",
      target: "topic/sub",
    });
    expect(at("#two wor¦ds# after")).toEqual({
      kind: "hashtag",
      target: "two words",
    });
  });

  it("gives none outside a link, or for an image", () => {
    expect(at("plain ¦text [link](a.md)")).toBeNull();
    expect(at("![al¦t](a.png)")).toBeNull();
    expect(at("`[co¦de](a.md)`")).toBeNull();
  });
});
