import { syntaxTree } from "@codemirror/language";
import {
  Facet,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { linkDestination } from "./links";
import {
  EmojiWidget,
  ImageWidget,
  MathWidget,
  TaskWidget,
  type ImageHost,
  type ImageMarkup,
} from "./widgets";

// The live preview: a note drawn as it will read, but for the piece the caret
// or the selection is in, which shows as typed. Markup is hidden, not taken
// out: the text under the editor is the note's, character for character.
//
// Not drawn here, and shown as typed: HTML in a line or a block, diagrams,
// and a table's columns in line.

/** What the app does for the live preview. */
export type LivePreviewHost = ImageHost;

export const livePreviewHost = Facet.define<LivePreviewHost, LivePreviewHost>({
  combine: (values) => values[0] ?? {},
});

const hidden = Decoration.replace({});

// An element of a line, the class it is drawn with, and the children that
// are its markup, hidden while the selection is elsewhere.
const INLINE: Record<string, { mark: Decoration; markup: string[] }> = {
  Emphasis: {
    mark: Decoration.mark({ class: "cn-em" }),
    markup: ["EmphasisMark"],
  },
  StrongEmphasis: {
    mark: Decoration.mark({ class: "cn-strong" }),
    markup: ["EmphasisMark"],
  },
  Strikethrough: {
    mark: Decoration.mark({ class: "cn-strike" }),
    markup: ["StrikethroughMark"],
  },
  InlineCode: {
    mark: Decoration.mark({ class: "cn-code" }),
    markup: ["CodeMark"],
  },
  Marked: {
    mark: Decoration.mark({ class: "cn-marked" }),
    markup: ["MarkedMark"],
  },
  Inserted: {
    mark: Decoration.mark({ class: "cn-inserted" }),
    markup: ["InsertedMark"],
  },
  Subscript: {
    mark: Decoration.mark({ class: "cn-sub" }),
    markup: ["SubscriptMark"],
  },
  Superscript: {
    mark: Decoration.mark({ class: "cn-sup" }),
    markup: ["SuperscriptMark"],
  },
  Autolink: {
    mark: Decoration.mark({ class: "cn-link" }),
    markup: ["LinkMark"],
  },
};

const link = Decoration.mark({ class: "cn-link" });
const wikiLink = Decoration.mark({ class: "cn-link cn-wikilink" });
const hashtag = Decoration.mark({ class: "cn-hashtag" });
const mathSource = Decoration.mark({ class: "cn-math-source" });

// Blocks whose lines are drawn with a class of their own.
const LINES: Record<string, Decoration> = {
  FencedCode: Decoration.line({ class: "cn-codeblock" }),
  CodeBlock: Decoration.line({ class: "cn-codeblock" }),
  Table: Decoration.line({ class: "cn-table" }),
  Blockquote: Decoration.line({ class: "cn-quote" }),
  Frontmatter: Decoration.line({ class: "cn-frontmatter" }),
};

// Blocks nothing in which is drawn as anything but what it is.
const OPAQUE = new Set([
  "FencedCode",
  "CodeBlock",
  "Frontmatter",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstructionBlock",
  "LinkReference",
]);

function children(node: SyntaxNode, ...names: string[]): SyntaxNode[] {
  const found: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.includes(child.name)) {
      found.push(child);
    }
  }
  return found;
}

/** What an Image node says: its alternative text, address and title. */
export function imageMarkup(
  state: EditorState,
  node: SyntaxNode,
): ImageMarkup | null {
  const marks = children(node, "LinkMark");
  const destination = linkDestination(state, node);
  if (!destination || marks.length < 2) {
    return null;
  }
  return {
    alt: state.sliceDoc(marks[0].to, marks[1].from),
    src: destination.target,
    title: destination.title,
  };
}

/** A formula's text, without its marks, and whether it is set apart. */
export function mathOf(state: EditorState, node: SyntaxNodeRef) {
  // The parser marks quote prefixes even inside a multiline formula. Only
  // those container marks come out; a greater-than sign in TeX stays.
  let text = "";
  let from = node.from;
  for (const mark of node.node.getChildren("QuoteMark")) {
    text += state.sliceDoc(from, mark.from);
    from = mark.to;
    if (/^[ \t]$/.test(state.sliceDoc(from, from + 1))) from++;
  }
  text += state.sliceDoc(from, node.to);
  const size = text.startsWith("$$") ? 2 : 1;
  return {
    tex: text.slice(size, text.length - size).trim(),
    display: size === 2,
  };
}

function oneLine(state: EditorState, from: number, to: number) {
  return state.doc.lineAt(from).to >= to;
}

/**
 * The decorations of the live preview for the parts of a text given, which
 * together are what an editor shows of it. Those that take the place of more
 * than one line are not among them (see formulas below).
 */
export function livePreviewDecorations(
  state: EditorState,
  parts: readonly { from: number; to: number }[],
): DecorationSet {
  const host = state.facet(livePreviewHost);
  const touched = (from: number, to: number) =>
    state.selection.ranges.some(
      (range) => range.from <= to && range.to >= from,
    );
  const ranges: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => {
    if (to > from) {
      ranges.push(hidden.range(from, to));
    }
  };
  for (const part of parts) {
    syntaxTree(state).iterate({
      from: part.from,
      to: part.to,
      enter: (node) => {
        const { name, from, to } = node;
        const lines = LINES[name];
        if (lines) {
          // A block that ends with a line break ends on the line before it.
          const end = to > from ? to - 1 : to;
          const last = state.doc.lineAt(Math.min(end, part.to)).number;
          for (
            let number = state.doc.lineAt(Math.max(from, part.from)).number;
            number <= last;
            number++
          ) {
            ranges.push(lines.range(state.doc.line(number).from));
          }
        }
        if (OPAQUE.has(name)) {
          return false;
        }
        const element = INLINE[name];
        if (element) {
          ranges.push(element.mark.range(from, to));
          if (!touched(from, to)) {
            for (const mark of children(node.node, ...element.markup)) {
              hide(mark.from, mark.to);
            }
          }
          return;
        }
        const heading = /^ATXHeading[1-6]$/.test(name);
        if (heading) {
          const line = state.doc.lineAt(from);
          const mark = node.node.firstChild;
          if (mark?.name === "HeaderMark" && !touched(line.from, line.to)) {
            // The marks and the space after them.
            hide(
              mark.from,
              state.sliceDoc(mark.to, mark.to + 1) === " "
                ? mark.to + 1
                : mark.to,
            );
          }
          return;
        }
        switch (name) {
          case "Link": {
            // Brackets alone are a link only if something later in the note
            // says where to; they are left as they are.
            const marks = children(node.node, "LinkMark");
            if (
              marks.length < 2 ||
              !(node.node.getChild("URL") || node.node.getChild("LinkLabel"))
            ) {
              return;
            }
            ranges.push(link.range(from, to));
            if (!touched(from, to) && oneLine(state, marks[1].from, to)) {
              hide(marks[0].from, marks[0].to);
              hide(marks[1].from, to);
            }
            return;
          }
          case "WikiLink": {
            ranges.push(wikiLink.range(from, to));
            if (!touched(from, to) && oneLine(state, from, to)) {
              // "[[note|text]]" shows its text.
              const parts = state.sliceDoc(from + 2, to - 2).split("|");
              hide(
                from,
                from + 2 + (parts.length === 2 ? parts[0].length + 1 : 0),
              );
              hide(to - 2, to);
            }
            return false;
          }
          case "Hashtag":
            ranges.push(hashtag.range(from, to));
            return false;
          case "Math":
            if (touched(from, to)) {
              ranges.push(mathSource.range(from, to));
            } else if (oneLine(state, from, to)) {
              const { tex, display } = mathOf(state, node);
              ranges.push(
                Decoration.replace({
                  widget: new MathWidget(tex, display),
                }).range(from, to),
              );
            }
            return false;
          case "Image": {
            const image = imageMarkup(state, node.node);
            if (image && !touched(from, to) && oneLine(state, from, to)) {
              ranges.push(
                Decoration.replace({
                  widget: new ImageWidget(image, host),
                }).range(from, to),
              );
            }
            return false;
          }
          case "Emoji": {
            const shortName = state.sliceDoc(from + 1, to - 1);
            if (!touched(from, to) && EmojiWidget.knows(shortName)) {
              ranges.push(
                Decoration.replace({
                  widget: new EmojiWidget(shortName),
                }).range(from, to),
              );
            }
            return false;
          }
          case "TaskMarker":
            if (!touched(from, to)) {
              ranges.push(
                Decoration.replace({
                  widget: new TaskWidget(
                    /[xX]/.test(state.sliceDoc(from + 1, from + 2)),
                  ),
                }).range(from, to),
              );
            }
            return false;
        }
      },
    });
  }
  return Decoration.set(ranges, true);
}

const inView = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = livePreviewDecorations(view.state, view.visibleRanges);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.state.facet(livePreviewHost) !==
          update.startState.facet(livePreviewHost) ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = livePreviewDecorations(
          update.state,
          update.view.visibleRanges,
        );
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// Formulas written over more than one line. What takes the place of a line
// break has to be known before the editor draws, for the whole text and not
// only what is in view, so these are kept with the editor's state: found
// again when the text or what the parser has read of it changes. Only
// paragraphs of more than one line with a "$" in them are looked into.
const SKIPPED = new Set([
  ...OPAQUE,
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
  "HorizontalRule",
  "Table",
]);

/** The formulas of more than one line in a text, each as its widget. */
export function longFormulas(state: EditorState): DecorationSet {
  const found: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      const { name, from, to } = node;
      if (SKIPPED.has(name)) {
        return false;
      }
      if (name === "Paragraph") {
        return (
          !oneLine(state, from, to) && state.sliceDoc(from, to).includes("$")
        );
      }
      if (name === "Math") {
        if (!oneLine(state, from, to)) {
          const { tex, display } = mathOf(state, node);
          found.push(
            Decoration.replace({
              widget: new MathWidget(tex, display),
            }).range(from, to),
          );
        }
        return false;
      }
    },
  });
  return Decoration.set(found);
}

const formulas = StateField.define<DecorationSet>({
  create: longFormulas,
  update: (value, transaction) =>
    transaction.docChanged ||
    syntaxTree(transaction.state) !== syntaxTree(transaction.startState)
      ? longFormulas(transaction.state)
      : value,
});

// Shown as typed while the selection is in one.
const formulasShown = EditorView.decorations.compute(
  [formulas, "selection"],
  (state) => {
    const all = state.field(formulas);
    return all.size === 0
      ? all
      : all.update({
          filter: (from, to) =>
            !state.selection.ranges.some(
              (range) => range.from <= to && range.to >= from,
            ),
        });
  },
);

/** The live preview, for an editor that shows a note that way. */
export const livePreview: Extension = [inView, formulas, formulasShown];
