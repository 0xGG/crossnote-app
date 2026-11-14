import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownParser } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../render";
import { syntaxSamples } from "../test/corpus/syntax";
import { noteSyntax } from "./syntax";

const parser = (markdownLanguage.parser as MarkdownParser).configure(
  noteSyntax,
);

// The pieces of a text the parser reads as one of the kinds named, in the
// order they come, each as its kind and its text.
function found(text: string, ...kinds: string[]): [string, string][] {
  const pieces: [string, string][] = [];
  parser.parse(text).iterate({
    enter: ({ name, from, to }) => {
      if (kinds.includes(name)) {
        pieces.push([name, text.slice(from, to)]);
      }
    },
  });
  return pieces;
}

const texts = (text: string, kind: string) =>
  found(text, kind).map(([, piece]) => piece);

describe("the notes' syntax", () => {
  describe("math", () => {
    it("runs from one dollar sign to the next, and from two to the next two", () => {
      expect(
        texts("Inline $x^2 + y^2$ and $$E = mc^2$$ apart.", "Math"),
      ).toEqual(["$x^2 + y^2$", "$$E = mc^2$$"]);
      expect(found("$x$", "Math", "MathMark")).toEqual([
        ["Math", "$x$"],
        ["MathMark", "$"],
        ["MathMark", "$"],
      ]);
    });

    it("runs over the lines of a paragraph, not past its end", () => {
      expect(texts("A block:\n\n$$\nE = mc^2\n$$\n", "Math")).toEqual([
        "$$\nE = mc^2\n$$",
      ]);
      expect(texts("$$\nE = mc^2\n\nnot closed", "Math")).toEqual([]);
    });

    it("keeps a dollar sign after a backslash out of it, and needs something inside", () => {
      expect(texts("$a \\$ b$", "Math")).toEqual(["$a \\$ b$"]);
      expect(texts("$$ and $$$$", "Math")).toEqual(["$$ and $$"]);
      expect(texts("costs $5", "Math")).toEqual([]);
    });

    it("is not looked for in code", () => {
      expect(texts("`$x$` and\n\n```\n$y$\n```\n", "Math")).toEqual([]);
    });
  });

  describe("wiki links", () => {
    it("run from two brackets to the next two", () => {
      expect(
        texts(
          "See [[README]], [[folder/Other note]] and [[README|the readme]].",
          "WikiLink",
        ),
      ).toEqual([
        "[[README]]",
        "[[folder/Other note]]",
        "[[README|the readme]]",
      ]);
      expect(found("[[a]]", "WikiLinkMark")).toEqual([
        ["WikiLinkMark", "[["],
        ["WikiLinkMark", "]]"],
      ]);
    });

    it("need an end and something inside", () => {
      expect(texts("[[a wiki link without an end", "WikiLink")).toEqual([]);
      expect(texts("[[]] and [[x]]", "WikiLink")).toEqual(["[[x]]"]);
    });

    it("leave ordinary links as they are", () => {
      expect(texts("[text](https://example.org) [[note]]", "Link")).toEqual([
        "[text](https://example.org)",
      ]);
    });
  });

  describe("hashtags", () => {
    it("start after white space or at the start, and end at what ends one", () => {
      expect(texts("#topic and #topic/sub, not a#b.", "Hashtag")).toEqual([
        "#topic",
        "#topic/sub",
      ]);
      expect(texts("- #topic one", "Hashtag")).toEqual(["#topic"]);
      expect(texts("#𠮷tag [[𠮷 note]]", "Hashtag")).toEqual(["#𠮷tag"]);
    });

    it("take in words up to a closing sign", () => {
      expect(texts("#two words# after", "Hashtag")).toEqual(["#two words#"]);
    });

    it("are not a heading's marks, nor a sign alone", () => {
      expect(texts("# Title\n\n## Section\n\na # b\n", "Hashtag")).toEqual([]);
    });
  });

  describe("footnotes", () => {
    it("are a label after a caret in brackets, or text in brackets after a caret", () => {
      const text =
        "Text with a note[^1] and an inline one^[inline note].\n\n[^1]: The note.\n";
      expect(texts(text, "FootnoteReference")).toEqual(["[^1]", "[^1]"]);
      expect(texts(text, "InlineFootnote")).toEqual(["^[inline note]"]);
    });

    it("leave a caret's superscript as it is", () => {
      expect(texts("x^2^ and ^[a] and ^[b]", "Superscript")).toEqual(["^2^"]);
    });
  });

  describe("marked and inserted text", () => {
    it("lie between doubled signs", () => {
      const text = "==marked== ++inserted++ a == b and c ++ d";
      expect(texts(text, "Marked")).toEqual(["==marked=="]);
      expect(texts(text, "Inserted")).toEqual(["++inserted++"]);
      expect(found("==m==", "MarkedMark")).toHaveLength(2);
      expect(found("++i++", "InsertedMark")).toHaveLength(2);
    });

    it("hold other marks", () => {
      expect(found("==a **b** c==", "Marked", "StrongEmphasis")).toEqual([
        ["Marked", "==a **b** c=="],
        ["StrongEmphasis", "**b**"],
      ]);
    });
  });

  // What the editor reads as one of these, the preview draws as one: the
  // two count the same number of each in every note of the corpus.
  describe("agrees with the preview on the shared corpus", () => {
    const drawn = (html: string, selector: string) => {
      const element = document.createElement("div");
      element.innerHTML = html;
      return element.querySelectorAll(selector).length;
    };
    syntaxSamples.forEach(({ name, text }) => {
      it(`with ${name}`, () => {
        const { html } = renderMarkdown(text);
        expect(texts(text, "WikiLink")).toHaveLength(
          drawn(html, "a[data-wikilink-url]"),
        );
        expect(texts(text, "Hashtag")).toHaveLength(drawn(html, "a.tag"));
        expect(texts(text, "Math")).toHaveLength(drawn(html, ".katex-mathml"));
        expect(texts(text, "Marked")).toHaveLength(drawn(html, "mark"));
        expect(texts(text, "Inserted")).toHaveLength(drawn(html, "ins"));
      });
    });
  });
});
