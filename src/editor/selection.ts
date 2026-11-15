import { EditorView, Decoration } from "@codemirror/view";

// drawSelection paints behind content. Selected text in opaque quote/code
// backgrounds also needs its own paint, including secondary selections.
export const visibleSelection = EditorView.decorations.compute(
  ["selection", "doc"],
  (state) => {
    const ranges = [];
    for (const range of state.selection.ranges) {
      if (range.empty) continue;
      ranges.push(
        Decoration.mark({ class: "cn-selected-text" }).range(
          range.from,
          range.to,
        ),
      );
      for (
        let n = state.doc.lineAt(range.from).number;
        n <= state.doc.lineAt(range.to).number;
        n++
      ) {
        const line = state.doc.line(n);
        if (line.length === 0 && line.from < range.to)
          ranges.push(
            Decoration.line({ class: "cn-selected-empty" }).range(line.from),
          );
      }
    }
    return Decoration.set(ranges, true);
  },
);
