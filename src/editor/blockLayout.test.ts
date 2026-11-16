import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { blockSpacing, noteBlocks } from "./blockLayout";

function layout(doc: string, anchor = doc.length) {
  return blockSpacing(
    EditorState.create({
      doc,
      selection: { anchor },
      extensions: [noteBlocks],
    }),
  );
}

describe("preview block spacing", () => {
  it("keeps the first list heading's top margin without adding one to a root heading", () => {
    expect([...layout("- # Heading\n\nEND").before]).toEqual([[0, 24]]);
    expect([...layout("# Heading\n\nEND").before]).toEqual([]);
  });
  it("adds missing heading gaps and counts existing separating lines", () => {
    expect([...layout("# One\n## Two\nText").before]).toEqual([
      [1, 24],
      [2, 24],
    ]);
    expect([...layout("# One\n\n## Two\n\nText").blanks]).toEqual([
      [1, 24],
      [3, 24],
    ]);
    // Extra source lines remain available for intentional whitespace.
    expect([...layout("# One\n\n\nText").blanks]).toEqual([[1, 24]]);
  });

  it("matches code boundaries without needing blank source lines", () => {
    expect([
      ...layout("Before\n```js\nconst a = 1;\n```\nAfter").before,
    ]).toEqual([
      [1, 24],
      [4, 16],
    ]);
  });

  it("keeps both tight and loose list rows at the preview's item spacing", () => {
    expect([...layout("- one\n- two\n\nAfter").before]).toEqual([[1, 0]]);
    expect([...layout("- one\n- two\n\nAfter").blanks]).toEqual([[2, 16]]);
    expect([...layout("- one\n\n- two\n\nAfter").blanks]).toEqual([
      [1, 0],
      [3, 16],
    ]);
  });

  it("separates quote paragraphs without adding gaps to soft line breaks", () => {
    expect([...layout("> one\n> continued\n>\n> two\n\nAfter").blanks]).toEqual(
      [
        [2, 16],
        [4, 24],
      ],
    );
  });

  it("reserves the setext source underline inside the existing heading gap", () => {
    const doc = "Title\n=====\n\nAfter";
    const inactive = layout(doc);
    expect([...inactive.hiddenUnderlines]).toEqual([1]);
    expect([...inactive.blanks]).toEqual([[2, 24]]);
    const active = layout(doc, 1);
    expect([...active.hiddenUnderlines]).toEqual([]);
    expect([...active.blanks]).toEqual([[2, 0]]);
  });

  it("does not fold definitions or literal HTML between blocks", () => {
    expect(layout("One\n\n<div>literal</div>\n\nTwo").blanks.size).toBe(0);
    expect(layout("One\n\n[link]: /target\n\nTwo").blanks.size).toBe(0);
  });
});
