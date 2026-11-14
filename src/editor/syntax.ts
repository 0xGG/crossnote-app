import { Tag, tags } from "@lezer/highlight";
import type {
  DelimiterType,
  InlineContext,
  MarkdownConfig,
} from "@lezer/markdown";

// What the notes write beyond the markdown CodeMirror 6 reads by itself
// (CommonMark, GFM, sub- and superscript, emoji short names): math, wiki
// links, hashtags, footnotes, marked and inserted text. Each is found the
// way the preview finds it (render/markdown), so that what the editor draws
// as one of them is what the preview draws as one.

/** The tags the editor's theme colours these with. */
export const noteTags = {
  math: Tag.define(),
  wikiLink: Tag.define(tags.link),
  hashtag: Tag.define(),
  footnote: Tag.define(tags.link),
  marked: Tag.define(),
  inserted: Tag.define(),
};

const DOLLAR = 36;
const BACKSLASH = 92;
const HASH = 35;
const EXCLAMATION = 33;
const COLON = 58;
const OPEN_BRACKET = 91;
const CLOSE_BRACKET = 93;
const CARET = 94;
const EQUALS = 61;
const PLUS = 43;

// "$…$" in a line, "$$…$$" set apart: from one mark to the next of its kind,
// a backslash keeping the character after it out of the search, with
// something between the two (render/markdown/math.ts).
const math: MarkdownConfig = {
  defineNodes: [
    { name: "Math", style: noteTags.math },
    { name: "MathMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "Math",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== DOLLAR) {
          return -1;
        }
        const size = cx.char(pos + 1) === DOLLAR ? 2 : 1;
        let end = -1;
        for (let i = pos + size; i < cx.end; i++) {
          const char = cx.char(i);
          if (
            char === DOLLAR &&
            (size === 1 || cx.char(i + 1) === DOLLAR) &&
            i + size <= cx.end
          ) {
            end = i;
            break;
          }
          if (char === BACKSLASH) {
            i++;
          }
        }
        if (end <= pos + size) {
          return -1;
        }
        return cx.addElement(
          cx.elt("Math", pos, end + size, [
            cx.elt("MathMark", pos, pos + size),
            cx.elt("MathMark", end, end + size),
          ]),
        );
      },
    },
  ],
};

// Where the "]]" of a wiki link that starts at a place is, or -1.
function wikiLinkEnd(cx: InlineContext, start: number) {
  for (let i = start + 2; i + 1 < cx.end; i++) {
    const char = cx.char(i);
    if (char === BACKSLASH) {
      i++;
    } else if (char === CLOSE_BRACKET && cx.char(i + 1) === CLOSE_BRACKET) {
      return i;
    }
  }
  return -1;
}

// "[[note]]" and "[[note|text]]" (render/markdown/wikilink.ts).
const wikiLink: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: noteTags.wikiLink },
    { name: "WikiLinkMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx, next, pos) {
        // "![[note]]" is an exclamation mark and a wiki link, not the start
        // of an image: the mark is passed over as text.
        if (
          next === EXCLAMATION &&
          cx.char(pos + 1) === OPEN_BRACKET &&
          cx.char(pos + 2) === OPEN_BRACKET &&
          wikiLinkEnd(cx, pos + 1) > pos + 3
        ) {
          return pos + 1;
        }
        if (next !== OPEN_BRACKET || cx.char(pos + 1) !== OPEN_BRACKET) {
          return -1;
        }
        const end = wikiLinkEnd(cx, pos);
        if (end <= pos + 2) {
          return -1;
        }
        return cx.addElement(
          cx.elt("WikiLink", pos, end + 2, [
            cx.elt("WikiLinkMark", pos, pos + 2),
            cx.elt("WikiLinkMark", end, end + 2),
          ]),
        );
      },
    },
  ],
};

// What ends a hashtag (render/markdown/tag.ts, StopRegExp).
const HASHTAG_STOP = /[\s@#,.!$%^&*()[\]+=~`<>?\\，。]/;

// "#topic", after the start of the text or white space, up to the next
// character that ends one; and "#two words#", where the next "#" after that
// character is itself followed by one, or ends the text.
const hashtag: MarkdownConfig = {
  defineNodes: [{ name: "Hashtag", style: noteTags.hashtag }],
  parseInline: [
    {
      name: "Hashtag",
      before: "Escape",
      parse(cx, next, pos) {
        if (
          next !== HASH ||
          !(pos === cx.offset || /\s/.test(cx.slice(pos - 1, pos))) ||
          pos + 1 >= cx.end ||
          HASHTAG_STOP.test(cx.slice(pos + 1, pos + 2))
        ) {
          return -1;
        }
        const text = cx.slice(pos, cx.end);
        let end = -1;
        let i = 1;
        for (; i < text.length; i++) {
          if (HASHTAG_STOP.test(text[i])) {
            end = i;
            const closing = text.indexOf("#", i + 1);
            if (
              closing >= 0 &&
              (closing === text.length - 1 ||
                HASHTAG_STOP.test(text[closing + 1]))
            ) {
              end = closing;
            }
            break;
          }
          if (text[i] === "\\") {
            i++;
          }
        }
        if (end === -1) {
          end = Math.min(i, text.length);
        }
        if (end <= 1) {
          return -1;
        }
        return cx.addElement(
          cx.elt("Hashtag", pos, pos + (text[end] === "#" ? end + 1 : end)),
        );
      },
    },
  ],
};

// "[^label]", a reference to a footnote or the start of its text, and
// "^[text]", a footnote written in place.
const footnote: MarkdownConfig = {
  defineNodes: [
    { name: "FootnoteReference", style: noteTags.footnote },
    { name: "InlineFootnote", style: noteTags.footnote },
  ],
  parseInline: [
    {
      name: "FootnoteReference",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== OPEN_BRACKET || cx.char(pos + 1) !== CARET) {
          return -1;
        }
        const found = /^\[\^[^\s\]]+\]/.exec(cx.slice(pos, cx.end));
        return found
          ? cx.addElement(
              cx.elt("FootnoteReference", pos, pos + found[0].length),
            )
          : -1;
      },
    },
    {
      name: "InlineFootnote",
      before: "Superscript",
      parse(cx, next, pos) {
        if (next !== CARET || cx.char(pos + 1) !== OPEN_BRACKET) {
          return -1;
        }
        const found = /^\^\[[^\]\n]+\]/.exec(cx.slice(pos, cx.end));
        return found
          ? cx.addElement(cx.elt("InlineFootnote", pos, pos + found[0].length))
          : -1;
      },
    },
  ],
};

// ":short_name:" of an emoji, with the signs some names have ("+1", "-1",
// "e-mail"), which the parser's own emoji leaves out. Whether a name is an
// emoji's is for whoever draws it to say.
const shortName: MarkdownConfig = {
  parseInline: [
    {
      name: "ShortName",
      before: "Emoji",
      parse(cx, next, pos) {
        if (next !== COLON) {
          return -1;
        }
        const found = /^:[\w+-]+:/.exec(cx.slice(pos, cx.end));
        return found
          ? cx.addElement(cx.elt("Emoji", pos, pos + found[0].length))
          : -1;
      },
    },
  ],
};

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\xA1‐-‧]/;

// A pair of doubled characters around text, opened and closed by the rules
// strikethrough goes by in @lezer/markdown (GFM's flanking rules).
function paired(
  name: string,
  char: number,
  style: Tag,
  delimiter: DelimiterType,
): MarkdownConfig {
  return {
    defineNodes: [
      { name, style },
      { name: `${name}Mark`, style: tags.processingInstruction },
    ],
    parseInline: [
      {
        name,
        after: "Emphasis",
        parse(cx: InlineContext, next: number, pos: number) {
          if (
            next !== char ||
            cx.char(pos + 1) !== char ||
            cx.char(pos + 2) === char
          ) {
            return -1;
          }
          const before = cx.slice(pos - 1, pos);
          const after = cx.slice(pos + 2, pos + 3);
          const spaceBefore = /\s|^$/.test(before);
          const spaceAfter = /\s|^$/.test(after);
          const punctuationBefore = PUNCTUATION.test(before);
          const punctuationAfter = PUNCTUATION.test(after);
          return cx.addDelimiter(
            delimiter,
            pos,
            pos + 2,
            !spaceAfter &&
              (!punctuationAfter || spaceBefore || punctuationBefore),
            !spaceBefore &&
              (!punctuationBefore || spaceAfter || punctuationAfter),
          );
        },
      },
    ],
  };
}

/** The notes' own syntax, for the markdown parser. */
export const noteSyntax: MarkdownConfig[] = [
  math,
  wikiLink,
  hashtag,
  footnote,
  shortName,
  // "==marked==" and "++inserted++".
  paired("Marked", EQUALS, noteTags.marked, {
    resolve: "Marked",
    mark: "MarkedMark",
  }),
  paired("Inserted", PLUS, noteTags.inserted, {
    resolve: "Inserted",
    mark: "InsertedMark",
  }),
];
