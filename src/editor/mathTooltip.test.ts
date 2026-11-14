import { afterEach, describe, expect, it } from "vitest";
import { noteLanguage } from "./language";
import { formulaAtCaret, mathTooltip } from "./mathTooltip";
import { NoteDocument } from "./noteDocument";
import { NoteEditor } from "./noteEditor";
import { readToEnd, stateOf } from "./testText";

// The formula shown for the caret ("¦"): where its tooltip stands and what
// it draws, or null.
function shown(marked: string) {
  const found = formulaAtCaret(stateOf(marked, noteLanguage));
  if (!found) {
    return null;
  }
  const { dom } = found.tooltip.create(null);
  return {
    pos: found.tooltip.pos,
    above: found.tooltip.above,
    drawn: !!dom.querySelector(".cn-math-preview .katex, .katex"),
    display: !!dom.querySelector(".katex-display"),
  };
}

describe("the formula shown above the one being typed", () => {
  it("is the formula the caret is in, at its start", () => {
    expect(shown("A formula $x^¦2$ here")).toEqual({
      pos: 10,
      above: true,
      drawn: true,
      display: false,
    });
    expect(shown("$$\nE = ¦mc^2\n$$")?.display).toBe(true);
  });

  it("is shown with the caret at either end of the formula", () => {
    expect(shown("A ¦$x$ b")?.pos).toBe(2);
    expect(shown("A $x$¦ b")?.pos).toBe(2);
  });

  it("is not shown outside a formula, for a selection, or in code", () => {
    expect(shown("A ¦formula $x^2$ here")).toBeNull();
    expect(shown("A formula $¦x^¦2$ here")).toBeNull();
    expect(shown("`$x^¦2$`")).toBeNull();
  });

  describe("in an editor", () => {
    const editors: NoteEditor[] = [];
    afterEach(() => {
      for (const editor of editors.splice(0)) {
        editor.destroy();
      }
    });

    it("stays the same while the caret moves inside the formula, and follows what is typed", () => {
      const editor = new NoteEditor({
        parent: document.body,
        document: new NoteDocument("A formula $x^2$ here"),
        display: "live",
        testId: "note-editor",
      });
      editors.push(editor);
      readToEnd(editor.view);
      const field = () => editor.view.state.field(mathTooltip);
      expect(field()).toBeNull();
      editor.handle.select({ line: 0, ch: 11 });
      const first = field();
      expect(first).not.toBeNull();
      editor.handle.select({ line: 0, ch: 13 });
      expect(field()).toBe(first);
      editor.handle.insert("y");
      expect(field()).not.toBe(first);
      expect(field()?.key).toBe("10:$x^y2$");
      editor.handle.select({ line: 0, ch: 0 });
      expect(field()).toBeNull();
    });
  });
});
