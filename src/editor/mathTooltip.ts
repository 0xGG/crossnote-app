import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState } from "@codemirror/state";
import { showTooltip, type Tooltip } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { mathOf } from "./livePreview";
import { MathWidget } from "./widgets";

// While the caret is in a formula, which then shows as typed, the formula as
// it will read is shown above it, and follows what is typed.

interface Shown {
  // Where the formula starts and its text: the tooltip is kept while both
  // stay, so that moving the caret inside a formula does not draw it again.
  key: string;
  tooltip: Tooltip;
}

/** The formula the caret is in, as a tooltip above it; none elsewhere. */
export function formulaAtCaret(state: EditorState): Shown | null {
  const { main } = state.selection;
  if (!main.empty) {
    return null;
  }
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    for (
      let node: SyntaxNode | null = tree.resolveInner(main.head, side);
      node;
      node = node.parent
    ) {
      if (node.name === "Math") {
        const { tex, display } = mathOf(state, node);
        if (!tex) {
          return null;
        }
        const widget = new MathWidget(tex, display);
        return {
          key: `${node.from}:${state.sliceDoc(node.from, node.to)}`,
          tooltip: {
            pos: node.from,
            end: node.to,
            above: true,
            create: () => {
              const dom = document.createElement("div");
              dom.className = "cn-math-preview";
              dom.appendChild(widget.toDOM());
              return { dom };
            },
          },
        };
      }
    }
  }
  return null;
}

/** Shows the formula the caret is in, drawn, above it. */
export const mathTooltip = StateField.define<Shown | null>({
  create: formulaAtCaret,
  update: (value, transaction) => {
    if (
      !transaction.docChanged &&
      !transaction.selection &&
      syntaxTree(transaction.state) === syntaxTree(transaction.startState)
    ) {
      return value;
    }
    const next = formulaAtCaret(transaction.state);
    return value && next && value.key === next.key ? value : next;
  },
  provide: (field) =>
    showTooltip.from(field, (shown) => shown?.tooltip ?? null),
});
