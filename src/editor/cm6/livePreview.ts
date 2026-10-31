// R3-0 prototype, not for main: the smallest live preview CodeMirror 6 can
// do for the risk check. Markup of emphasis, strong, strikethrough, inline
// code, links and ATX headings is hidden unless the selection touches the
// element it belongs to (for a heading, its line). Written for the check, no
// code borrowed.
import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

const hidden = Decoration.replace({});

// The element, the class it is drawn with, and the children that are its
// markup.
const inline: Record<string, { mark: Decoration; markup: string[] }> = {
  Emphasis: {
    mark: Decoration.mark({ class: "cm6-em" }),
    markup: ["EmphasisMark"],
  },
  StrongEmphasis: {
    mark: Decoration.mark({ class: "cm6-strong" }),
    markup: ["EmphasisMark"],
  },
  Strikethrough: {
    mark: Decoration.mark({ class: "cm6-strike" }),
    markup: ["StrikethroughMark"],
  },
  InlineCode: {
    mark: Decoration.mark({ class: "cm6-code" }),
    markup: ["CodeMark"],
  },
  Link: {
    mark: Decoration.mark({ class: "cm6-link" }),
    markup: ["LinkMark", "URL"],
  },
};

const headings = [1, 2, 3, 4, 5, 6].map((level) =>
  Decoration.line({ class: `cm6-h${level}` }),
);

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const touched = (from: number, to: number) =>
    state.selection.ranges.some(
      (range) => range.from <= to && range.to >= from,
    );
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "FencedCode" || node.name === "CodeBlock") {
          return false;
        }
        const element = inline[node.name];
        if (element) {
          ranges.push(element.mark.range(node.from, node.to));
          if (!touched(node.from, node.to)) {
            for (
              let child = node.node.firstChild;
              child;
              child = child.nextSibling
            ) {
              if (
                element.markup.includes(child.name) &&
                child.to > child.from
              ) {
                ranges.push(hidden.range(child.from, child.to));
              }
            }
          }
          return;
        }
        const heading = /^ATXHeading([1-6])$/.exec(node.name);
        if (heading) {
          const line = state.doc.lineAt(node.from);
          ranges.push(headings[Number(heading[1]) - 1].range(line.from));
          const mark = node.node.firstChild;
          if (mark?.name === "HeaderMark" && !touched(line.from, line.to)) {
            // The marks and the space after them.
            const end =
              state.sliceDoc(mark.to, mark.to + 1) === " "
                ? mark.to + 1
                : mark.to;
            ranges.push(hidden.range(mark.from, end));
          }
        }
      },
    });
  }
  return Decoration.set(ranges, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
