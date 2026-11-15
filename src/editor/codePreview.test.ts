import { EditorState } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { codePreview, CodePreviewWidget } from "./codePreview";

function widgets(state: EditorState) {
  const result: CodePreviewWidget[] = [];
  for (const value of state.facet(EditorView.decorations)) {
    if (typeof value === "function") continue;
    for (const c = (value as DecorationSet).iter(); c.value; c.next()) {
      if (c.value.spec.widget instanceof CodePreviewWidget)
        result.push(c.value.spec.widget);
    }
  }
  return result;
}
const stateOf = (doc: string) =>
  EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [codePreview],
  });

describe("inactive code blocks", () => {
  it("leaves compact footnote labels outside the rendered code range", () => {
    const doc = "See[^a].\n\n[^a]: ```js\n    const a = 1;\n    ```\n\nEND";
    const state = stateOf(doc);
    const [widget] = widgets(state);
    expect(state.sliceDoc(state.doc.line(3).from, widget.block.from)).toBe(
      "[^a]: ",
    );
    expect(widget.block.code).toBe("const a = 1;\n");
    expect(
      widgets(
        state.update({ selection: { anchor: state.doc.line(3).from + 1 } })
          .state,
      ),
    ).toHaveLength(1);
    expect(
      widgets(state.update({ selection: { anchor: widget.block.from } }).state),
    ).toHaveLength(0);
  });
  it("keeps early footnote code in source order before later body code", () => {
    const doc =
      "See[^a].\n\n[^a]: footnote\n\n    ```js\n    const early = 1;\n    ```\n\nLater\n\n```js\nconst late = 2;\n```\n\nEND";
    const found = widgets(stateOf(doc));
    expect(found.map((w) => w.block.code)).toEqual([
      "const early = 1;\n",
      "const late = 2;\n",
    ]);
    expect(found[0].block.from).toBeLessThan(found[1].block.from);
  });
  it("does not mistake a footnote label inside fence info for its definition", () => {
    const doc =
      "See[^a].\n\n[^a]: body\n\n    ~~~js [^a]: ~~~\n    const a = 1;\n    ~~~\n\nEND";
    const state = stateOf(doc);
    expect(widgets(state)[0].block.from).toBe(state.doc.line(5).from);
  });
  it("uses the preview's code content and container structure without changing text", () => {
    const doc =
      "- item\n\n  > ```js\n  > const a = '<b>';\n  > ```\n\n    indented\n\nEND";
    const state = stateOf(doc);
    const found = widgets(state);
    expect(found[0].block.code).toBe("const a = '<b>';\n");
    expect(found[0].block.containers.map((p) => p.tag)).toEqual([
      "ul",
      "li",
      "blockquote",
    ]);
    expect(state.doc.toString()).toBe(doc);
  });
  it("opens only the selected block and updates ranges with edits", () => {
    const doc = "```js\na\n```\n\n```\nb\n```\n\nEND";
    const state = stateOf(doc);
    expect(widgets(state)).toHaveLength(2);
    const active = state.update({ selection: { anchor: 6 } }).state;
    expect(widgets(active).map((w) => w.block.code)).toEqual(["b\n"]);
    const edited = active.update({
      changes: { from: 6, to: 7, insert: "changed" },
    }).state;
    expect(widgets(edited)[0].block.from).toBe(19);
    expect(
      widgets(
        edited.update({ selection: { anchor: edited.doc.length } }).state,
      )[0].block.code,
    ).toBe("changed\n");
  });
  it("renders diagrams but keeps front matter and literal HTML fences as source", () => {
    const doc =
      "---\ntitle: x\n---\n\n```mermaid\ngraph TD\n```\n\n<div>\n```js\nliteral\n```\n</div>\n\n    plain\n\nEND";
    const found = widgets(stateOf(doc));
    expect(found).toHaveLength(2);
    expect(found[0].block.language).toBe("mermaid");
    expect(found[1].block.fenced).toBe(false);
    expect(found[1].block.code).toBe("plain\n");
  });
});
