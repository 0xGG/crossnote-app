import { syntaxTree } from "@codemirror/language";
import {
  EditorView,
  Decoration,
  ViewPlugin,
  type DecorationSet,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";

// Markdown owns the code ranges even after an embedded language has loaded
// and replaced its monospace tokens with language-specific highlighting.
function codeLines(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const part of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: part.from,
      to: part.to,
      enter(node) {
        if (node.name !== "FencedCode" && node.name !== "CodeBlock") return;
        const doc = view.state.doc;
        const first = doc.lineAt(Math.max(node.from, part.from)).number;
        const last = doc.lineAt(Math.min(node.to - 1, part.to)).number;
        for (let n = first; n <= last; n++) {
          ranges.push(
            Decoration.line({ class: "cn-source-code" }).range(
              doc.line(n).from,
            ),
          );
        }
        return false;
      },
    });
  }
  return Decoration.set(ranges, true);
}

export const sourceCodeFont = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = codeLines(view);
    }
    update(update: import("@codemirror/view").ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = codeLines(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);
