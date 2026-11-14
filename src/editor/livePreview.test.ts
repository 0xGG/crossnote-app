import type { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { noteLanguage } from "./language";
import {
  livePreview,
  livePreviewDecorations,
  longFormulas,
} from "./livePreview";
import { stateOf } from "./testText";
import { EmojiWidget, ImageWidget, MathWidget, TaskWidget } from "./widgets";

// "¦" is the caret, or the two ends of the selection.
const stateFor = (marked: string) =>
  stateOf(marked, [noteLanguage, livePreview]);

// Every decoration the live preview gives a text: those for what is in view
// (here, all of it) and those kept with the state.
function decorations(state: EditorState): DecorationSet[] {
  return [
    livePreviewDecorations(state, [{ from: 0, to: state.doc.length }]),
    ...state
      .facet(EditorView.decorations)
      .filter((value): value is DecorationSet => typeof value !== "function"),
  ];
}

function describeWidget(widget: unknown) {
  if (widget instanceof MathWidget) {
    return `<math${widget.display ? "!" : ""} ${widget.tex}>`;
  }
  if (widget instanceof EmojiWidget) {
    return `<emoji ${widget.shortName}>`;
  }
  if (widget instanceof ImageWidget) {
    const { src, alt, title } = widget.image;
    return `<img ${src}|${alt}|${title}>`;
  }
  if (widget instanceof TaskWidget) {
    return widget.checked ? "<task x>" : "<task>";
  }
  return "";
}

// The text as the live preview shows it: what is hidden left out, and each
// widget as a tag in place of what it stands for.
function shown(marked: string) {
  const state = stateFor(marked);
  const replaced: { from: number; to: number; text: string }[] = [];
  for (const set of decorations(state)) {
    for (const cursor = set.iter(); cursor.value; cursor.next()) {
      if (cursor.value.point && cursor.to > cursor.from) {
        replaced.push({
          from: cursor.from,
          to: cursor.to,
          text: describeWidget(cursor.value.spec.widget),
        });
      }
    }
  }
  replaced.sort((a, b) => a.from - b.from);
  const text = state.doc.toString();
  let result = "";
  let at = 0;
  for (const { from, to, text: widget } of replaced) {
    if (from < at) {
      continue;
    }
    result += text.slice(at, from) + widget;
    at = to;
  }
  return result + text.slice(at);
}

// The classes the live preview draws pieces of the text with, each with its
// text, in the order they start.
function marks(marked: string): [string, string][] {
  const state = stateFor(marked);
  const found: [number, string, string][] = [];
  for (const set of decorations(state)) {
    for (const cursor = set.iter(); cursor.value; cursor.next()) {
      if (!cursor.value.point && cursor.value.spec.class) {
        found.push([
          cursor.from,
          cursor.value.spec.class,
          state.sliceDoc(cursor.from, cursor.to),
        ]);
      }
    }
  }
  return found
    .sort((a, b) => a[0] - b[0])
    .map(([, name, text]) => [name, text]);
}

// The class of each line that has one, by the line's number from 1.
function lineClasses(marked: string): Record<number, string> {
  const state = stateFor(marked);
  const found: Record<number, string> = {};
  for (const set of decorations(state)) {
    for (const cursor = set.iter(); cursor.value; cursor.next()) {
      if (cursor.value.point && cursor.to === cursor.from) {
        found[state.doc.lineAt(cursor.from).number] = cursor.value.spec.class;
      }
    }
  }
  return found;
}

describe("the live preview", () => {
  it("hides the marks of what the caret is not in", () => {
    expect(
      shown(
        "**bold** *em* _em_ ~~struck~~ ==marked== ++inserted++ H~2~O x^2^ `code`\n\n¦",
      ),
    ).toBe("bold em em struck marked inserted H2O x2 code\n\n");
  });

  it("shows the marks of what the caret is in, or beside", () => {
    expect(shown("a **bo¦ld** b *em*")).toBe("a **bold** b em");
    expect(shown("a **bold**¦ b *em*")).toBe("a **bold** b em");
    expect(shown("a ¦**bold** b *em*")).toBe("a **bold** b em");
    expect(shown("a **bold** ¦b *em*")).toBe("a bold b em");
  });

  it("shows the marks of everything a selection reaches", () => {
    expect(shown("a ¦**bold** b *e¦m* `code`")).toBe("a **bold** b *em* code");
  });

  it("draws each with a class", () => {
    expect(
      marks("**bold** *em* ~~struck~~ `code` ==marked== ++in++\n\n¦"),
    ).toEqual([
      ["cn-strong", "**bold**"],
      ["cn-em", "*em*"],
      ["cn-strike", "~~struck~~"],
      ["cn-code", "`code`"],
      ["cn-marked", "==marked=="],
      ["cn-inserted", "++in++"],
    ]);
  });

  describe("headings", () => {
    it("lose their signs and the space after, away from the caret's line", () => {
      expect(shown("# Title\n\n### Section\n\ntext¦")).toBe(
        "Title\n\nSection\n\ntext",
      );
    });

    it("keep them on the caret's line", () => {
      expect(shown("# Tit¦le\n\n## Section\n")).toBe("# Title\n\nSection\n");
    });

    it("keep the line of signs under an underlined one", () => {
      expect(shown("Title\n===\n\ntext¦")).toBe("Title\n===\n\ntext");
    });
  });

  describe("links", () => {
    it.each([
      '[text](\nhttps://example.org\n"Title")\n\nelsewhere¦',
      "[[target\n|label]]\n\nelsewhere¦",
    ])(
      "keeps multiline link markup visible and renders the editor: %s",
      (text) => {
        const view = new EditorView({
          state: stateFor(text),
          parent: document.body,
        });
        try {
          expect(shown(text)).toBe(text.replace("¦", ""));
          expect(view.contentDOM.textContent).toContain("elsewhere");
        } finally {
          view.destroy();
        }
      },
    );

    it("show their text alone", () => {
      expect(
        shown('[text](https://example.org "Title") and [by reference][r] ¦'),
      ).toBe("text and by reference ");
      expect(marks("[text](https://example.org) ¦")).toEqual([
        ["cn-link", "[text](https://example.org)"],
      ]);
    });

    it("show as typed with the caret in them", () => {
      expect(shown("[te¦xt](https://example.org) [other](b.md)")).toBe(
        "[text](https://example.org) other",
      );
    });

    it("lose the angle brackets around a bare address", () => {
      expect(shown("<https://example.org/angle> ¦")).toBe(
        "https://example.org/angle ",
      );
    });

    it("leave brackets that lead nowhere as they are", () => {
      expect(shown("array[0] and [ ] and [text] ¦")).toBe(
        "array[0] and [ ] and [text] ",
      );
      expect(marks("array[0] and [text] ¦")).toEqual([]);
    });
  });

  describe("wiki links and hashtags", () => {
    it("show a wiki link's note, or the text given for it", () => {
      expect(shown("[[README]] and [[README|the readme]] ¦")).toBe(
        "README and the readme ",
      );
      expect(shown("[[READ¦ME|the readme]]")).toBe("[[README|the readme]]");
    });

    it("draw both with their classes", () => {
      expect(marks("[[README]] #topic ¦")).toEqual([
        ["cn-link cn-wikilink", "[[README]]"],
        ["cn-hashtag", "#topic"],
      ]);
    });
  });

  describe("formulas", () => {
    it("are drawn in place of their text, in a line or set apart", () => {
      expect(shown("Inline $x^2 + y^2$ and $$E = mc^2$$ ¦")).toBe(
        "Inline <math x^2 + y^2> and <math! E = mc^2> ",
      );
    });

    it("show as typed with the caret in them", () => {
      expect(shown("Inline $x^2¦$ and $y$")).toBe("Inline $x^2$ and <math y>");
      expect(marks("$x¦$")).toEqual([["cn-math-source", "$x$"]]);
    });

    it("are drawn over more than one line", () => {
      expect(shown("A block:\n\n$$\nE = mc^2\n$$\n\ntext¦")).toBe(
        "A block:\n\n<math! E = mc^2>\n\ntext",
      );
    });

    it("of more than one line show as typed with the caret in them", () => {
      expect(shown("A block:\n\n$$\nE = ¦mc^2\n$$\n\ntext")).toBe(
        "A block:\n\n$$\nE = mc^2\n$$\n\ntext",
      );
    });

    it("of more than one line are found in paragraphs, lists and quotes, and not in code", () => {
      const state = stateFor(
        "$$\na\n$$\n\n- item $$\n  b\n  $$\n\n> $$\n> c\n> $$\n\n```\n$$\nd\n$$\n```\n\n$e$ ¦",
      );
      const found: string[] = [];
      for (
        const cursor = longFormulas(state).iter();
        cursor.value;
        cursor.next()
      ) {
        found.push((cursor.value.spec.widget as MathWidget).tex);
      }
      expect(found).toEqual(["a", "b", "c"]);
    });

    it("removes quote containers while retaining TeX greater-than signs", () => {
      const state = stateFor("> > $$\n> > a > b\n> > x > c\n> > $$\n\n¦");
      const formula = longFormulas(state).iter().value.spec
        .widget as MathWidget;
      expect(formula.tex).toBe("a > b\nx > c");
    });
  });

  describe("images", () => {
    it.each(["![alt][PIC]", "![pic][]", "![pic]"])(
      "resolves %s through its reference definition",
      (markup) => {
        const definition = '\n\n[pic]: <./images/pic.png> "Picture"\n\n';
        const alt = markup.includes("alt") ? "alt" : "pic";
        expect(shown(`${markup}${definition}¦`)).toBe(
          `<img ./images/pic.png|${alt}|Picture>${definition}`,
        );
      },
    );

    it("keeps unresolved references as text and uses the first matching definition", () => {
      expect(shown("![alt][missing]\n\n¦")).toBe("![alt][missing]\n\n");
      const definitions =
        '\n\n[pic]: first.png "First"\n[pic]: second.png "Second"\n\n';
      expect(shown(`![alt][pic]${definitions}¦`)).toBe(
        `<img first.png|alt|First>${definitions}`,
      );
    });

    it("are drawn in place of their text", () => {
      expect(shown('![alt](./images/pic.png "Pic") and ![](b.png) ¦')).toBe(
        "<img ./images/pic.png|alt|Pic> and <img b.png||> ",
      );
    });

    it("show as typed with the caret in them, or without an address", () => {
      expect(shown("![al¦t](a.png)")).toBe("![alt](a.png)");
      expect(shown("![alt](./images/pic.png\n\n¦")).toBe(
        "![alt](./images/pic.png\n\n",
      );
    });
  });

  describe("emoji", () => {
    it("are drawn in place of the short names the app knows", () => {
      expect(shown("Happy :smile: and :+1:, and :not-an-emoji: ¦")).toBe(
        "Happy <emoji smile> and <emoji +1>, and :not-an-emoji: ",
      );
    });

    it("show as typed with the caret in them", () => {
      expect(shown(":smi¦le:")).toBe(":smile:");
    });
  });

  describe("tasks", () => {
    it("have a box in place of their brackets", () => {
      expect(shown("- [ ] to do\n- [x] done\n- [X] too\n\n¦")).toBe(
        "- <task> to do\n- <task x> done\n- <task x> too\n\n",
      );
    });

    it("show their brackets with the caret in them", () => {
      expect(shown("- [¦ ] to do")).toBe("- [ ] to do");
    });

    it("are only in lists", () => {
      expect(shown("[ ] not a task\n\n¦")).toBe("[ ] not a task\n\n");
    });
  });

  describe("code, front matter, HTML", () => {
    it("are shown as typed", () => {
      const text =
        "---\ntitle: **T** $x$\n---\n\n```js\nconst a = '**b**'; // $x$ :smile:\n```\n\n    **indented** code\n\n<div>**html** $x$</div>\n\n<!-- **comment** -->\n\n";
      expect(shown(`${text}¦`)).toBe(text);
    });

    it("give their lines a class, as tables and quotes do", () => {
      expect(
        lineClasses(
          "---\ntitle: T\n---\n\n```js\ncode\n```\n\n| a | b |\n| - | - |\n\n> quoted\n> more\n\ntext¦",
        ),
      ).toEqual({
        1: "cn-frontmatter",
        2: "cn-frontmatter",
        3: "cn-frontmatter",
        5: "cn-codeblock",
        6: "cn-codeblock",
        7: "cn-codeblock",
        9: "cn-table",
        10: "cn-table",
        12: "cn-quote",
        13: "cn-quote",
      });
    });

    it("draw what is in a table's cells and a quote's lines", () => {
      expect(shown("| **a** | $x$ |\n| - | - |\n\n> **quoted**\n\n¦")).toBe(
        "| a | <math x> |\n| - | - |\n\n> quoted\n\n",
      );
    });
  });

  it("only gives decorations for the parts asked for", () => {
    const state = stateFor("**one**\n\n**two**\n\n**three**¦");
    const set = livePreviewDecorations(state, [{ from: 9, to: 16 }]);
    const found: string[] = [];
    for (const cursor = set.iter(); cursor.value; cursor.next()) {
      if (!cursor.value.point) {
        found.push(state.sliceDoc(cursor.from, cursor.to));
      }
    }
    expect(found).toEqual(["**two**"]);
  });

  describe("its widgets", () => {
    it("are equal to another of the same text, and not to one of another", () => {
      expect(new MathWidget("x", false).eq(new MathWidget("x", false))).toBe(
        true,
      );
      expect(new MathWidget("x", false).eq(new MathWidget("x", true))).toBe(
        false,
      );
      expect(new EmojiWidget("smile").eq(new EmojiWidget("smile"))).toBe(true);
      expect(new TaskWidget(true).eq(new TaskWidget(false))).toBe(false);
      const host = {};
      const image = { src: "a.png", alt: "", title: "" };
      expect(
        new ImageWidget(image, host).eq(new ImageWidget({ ...image }, host)),
      ).toBe(true);
      expect(
        new ImageWidget(image, host).eq(
          new ImageWidget({ ...image, src: "b.png" }, host),
        ),
      ).toBe(false);
    });
  });
});
