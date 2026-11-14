import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteDocument } from "./noteDocument";
import { NoteEditor, type NoteEditorOptions } from "./noteEditor";
import { readToEnd } from "./testText";

const editors: NoteEditor[] = [];

// A live editor of a text, the caret at its end.
function editorOf(text: string, options: Partial<NoteEditorOptions> = {}) {
  const editor = new NoteEditor({
    parent: document.body,
    document: new NoteDocument(text),
    display: "live",
    testId: "note-editor",
    ...options,
  });
  editors.push(editor);
  readToEnd(editor.view);
  editor.handle.select(editor.handle.end());
  return editor;
}

const drawn = (editor: NoteEditor, selector: string) =>
  Array.from(editor.view.contentDOM.querySelectorAll<HTMLElement>(selector));

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("the live preview's widgets, in an editor", () => {
  it("draw a formula with KaTeX, set apart or in the line", () => {
    const editor = editorOf("Inline $x^2$ and $$y^2$$ here\n\ntext");
    const formulas = drawn(editor, ".cn-math");
    expect(formulas).toHaveLength(2);
    expect(formulas[0].querySelector(".katex")).not.toBeNull();
    expect(formulas[0].classList.contains("cn-math-display")).toBe(false);
    expect(formulas[1].querySelector(".katex-display")).not.toBeNull();
    expect(formulas[1].classList.contains("cn-math-display")).toBe(true);
    // The note's text is still all there.
    expect(editor.handle.text()).toBe("Inline $x^2$ and $$y^2$$ here\n\ntext");
  });

  it("say what is wrong with a formula KaTeX cannot draw", () => {
    const editor = editorOf("$\\frac{$ x\n\ntext");
    const [formula] = drawn(editor, ".cn-math");
    expect(formula.classList.contains("cn-math-error")).toBe(true);
    expect(formula.textContent).toContain("ParseError");
  });

  it("draw a formula of more than one line, and its text when the caret goes in", () => {
    const editor = editorOf("$$\nE = mc^2\n$$\n\ntext");
    expect(drawn(editor, ".cn-math-display")).toHaveLength(1);
    expect(editor.view.contentDOM.textContent).not.toContain("$$");
    editor.handle.select({ line: 1, ch: 2 });
    expect(drawn(editor, ".cn-math-display")).toHaveLength(0);
    expect(editor.view.contentDOM.textContent).toContain("$$");
    editor.handle.select(editor.handle.end());
    expect(drawn(editor, ".cn-math-display")).toHaveLength(1);
  });

  it("take the live preview away in the source view, and bring it back", () => {
    const editor = editorOf("**bold** $x$ :smile:\n\ntext");
    expect(drawn(editor, ".cn-math")).toHaveLength(1);
    expect(editor.view.contentDOM.textContent).not.toContain("**");
    editor.show("source");
    expect(drawn(editor, ".cn-math, .cn-emoji, .cn-strong")).toHaveLength(0);
    expect(editor.view.contentDOM.textContent).toContain(
      "**bold** $x$ :smile:",
    );
    editor.show("live");
    expect(drawn(editor, ".cn-math")).toHaveLength(1);
  });

  it("draw an emoji as the preview draws one", () => {
    const editor = editorOf("Happy :smile:\n\ntext");
    const [emoji] = drawn(editor, ".cn-emoji");
    expect(emoji.title).toBe(":smile:");
    expect(emoji.querySelector("img.emoji")).not.toBeNull();
  });

  describe("a task's box", () => {
    it("is ticked as the task is", () => {
      const editor = editorOf("- [ ] to do\n- [x] done\n\ntext");
      expect(
        drawn(editor, "input.cn-task").map(
          (box) => (box as HTMLInputElement).checked,
        ),
      ).toEqual([false, true]);
    });

    it("ticks and clears the task on a click, as a change the note undoes", () => {
      const editor = editorOf("- [ ] to do\n- [x] done\n\ntext");
      drawn(editor, "input.cn-task")[0].click();
      expect(editor.handle.text()).toBe("- [x] to do\n- [x] done\n\ntext");
      readToEnd(editor.view);
      drawn(editor, "input.cn-task")[1].click();
      expect(editor.handle.text()).toBe("- [x] to do\n- [ ] done\n\ntext");
      readToEnd(editor.view);
      expect(
        drawn(editor, "input.cn-task").map(
          (box) => (box as HTMLInputElement).checked,
        ),
      ).toEqual([true, false]);
      editor.document.undo(editor.view);
      expect(editor.handle.text()).toBe("- [x] to do\n- [x] done\n\ntext");
    });

    it("leaves a read-only note as it is", () => {
      const editor = editorOf("- [ ] to do\n\ntext");
      editor.setReadOnly(true);
      drawn(editor, "input.cn-task")[0].click();
      expect(editor.handle.text()).toBe("- [ ] to do\n\ntext");
    });
  });

  describe("an image", () => {
    it("shows the address as written when the app does not load it", () => {
      const editor = editorOf(
        '![alt](https://example.org/a.png "Pic")\n\ntext',
      );
      const [image] = drawn(editor, "img.cn-image") as HTMLImageElement[];
      expect(image.getAttribute("src")).toBe("https://example.org/a.png");
      expect(image.alt).toBe("alt");
      expect(image.title).toBe("Pic");
    });

    it("is given to the app to load, with the address as written", () => {
      const loadImage = vi.fn((element: HTMLImageElement) => {
        element.src = "blob:loaded";
      });
      const editor = editorOf("![alt](./images/pic.png)\n\ntext", {
        images: { loadImage },
      });
      const [image] = drawn(editor, "img.cn-image") as HTMLImageElement[];
      expect(loadImage).toHaveBeenCalledWith(image, "./images/pic.png");
      expect(image.getAttribute("src")).toBe("blob:loaded");
    });

    it("tells the app of a click, with where its markup is", () => {
      const onImageClick = vi.fn();
      const editor = editorOf('Before ![alt](a.png "Pic") after\n\ntext', {
        images: { onImageClick },
      });
      const [image] = drawn(editor, "img.cn-image");
      const event = new MouseEvent("mousedown", {
        button: 0,
        bubbles: true,
        cancelable: true,
      });
      image.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(onImageClick).toHaveBeenCalledWith(
        { alt: "alt", src: "a.png", title: "Pic", from: 7, to: 26 },
        image,
      );
      // The caret has not moved into the image.
      expect(drawn(editor, "img.cn-image")).toHaveLength(1);
    });

    it("keeps its element while the text around it changes", () => {
      const editor = editorOf("![alt](a.png)\n\ntext");
      const [before] = drawn(editor, "img.cn-image");
      editor.handle.insert(" more");
      const [after] = drawn(editor, "img.cn-image");
      expect(after).toBe(before);
    });

    it("opens a reference image for editing and follows changes to its definition", () => {
      const onImageClick = vi.fn();
      const markup = "![alt][pic]";
      const editor = editorOf(`${markup}\n\n[pic]: a.png "Pic"\n\ntext`, {
        images: { onImageClick },
      });
      const [image] = drawn(editor, "img.cn-image");
      image.dispatchEvent(
        new MouseEvent("mousedown", {
          button: 0,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(onImageClick).toHaveBeenCalledWith(
        { alt: "alt", src: "a.png", title: "Pic", from: 0, to: markup.length },
        image,
      );
      const at = editor.view.state.doc.toString().indexOf("a.png");
      editor.view.dispatch({
        changes: { from: at, to: at + 5, insert: "b.png" },
      });
      expect(drawn(editor, "img.cn-image")[0].getAttribute("src")).toBe(
        "b.png",
      );
    });
  });
});
