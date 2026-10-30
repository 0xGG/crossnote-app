import CodeMirror from "codemirror";
import "codemirror/mode/markdown/markdown";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { attachEditorHandle, type EditorHost } from "./handle";

describe("attachEditorHandle", () => {
  // jsdom lays nothing out. CodeMirror 5 draws no lines in an editor of no
  // size, and measures text ranges, which jsdom cannot, as it draws them; a
  // size and an empty box are enough for it to draw. What jsdom had is put
  // back afterwards.
  const element = HTMLElement.prototype;
  const range = Range.prototype;
  const stubs: [object, string, PropertyDescriptor][] = [
    ...["offsetHeight", "offsetWidth", "clientHeight", "clientWidth"].map(
      (name): [object, string, PropertyDescriptor] => [
        element,
        name,
        { configurable: true, get: () => 100 },
      ],
    ),
    [
      range,
      "getBoundingClientRect",
      { configurable: true, value: () => new DOMRect() },
    ],
    [
      range,
      "getClientRects",
      { configurable: true, value: (): DOMRect[] => [] },
    ],
  ];
  const kept = stubs.map(([target, name]) =>
    Object.getOwnPropertyDescriptor(target, name),
  );
  beforeAll(() => {
    for (const [target, name, stub] of stubs) {
      Object.defineProperty(target, name, stub);
    }
  });
  afterAll(() => {
    stubs.forEach(([target, name], i) => {
      if (kept[i]) {
        Object.defineProperty(target, name, kept[i]);
      } else {
        delete (target as Record<string, unknown>)[name];
      }
    });
  });

  let parent: HTMLElement;
  afterEach(() => parent.remove());

  function editorWith(value: string) {
    parent = document.body.appendChild(document.createElement("div"));
    const editor = CodeMirror(parent, { value, mode: "markdown" });
    attachEditorHandle(editor, "note-editor");
    const root = parent.querySelector<EditorHost>(
      '[data-testid="note-editor"]',
    )!;
    return { editor, root, handle: root.editorHandle };
  }

  it("names the editor's root element and hangs the handle there", () => {
    const { editor, root } = editorWith("");
    expect(root).toBe(editor.getWrapperElement());
    expect(root.editorHandle).toBeDefined();
  });

  it("reads and replaces the whole text", () => {
    const { editor, handle } = editorWith("One\nTwo");
    expect(handle.text()).toBe("One\nTwo");
    handle.setText("Three");
    expect(editor.getValue()).toBe("Three");
  });

  it("puts text in at the caret or in place of the selection", () => {
    const { handle } = editorWith("One\nTwo");
    handle.select(handle.end());
    handle.insert(" more");
    expect(handle.text()).toBe("One\nTwo more");
    expect(handle.caret()).toEqual({ line: 1, ch: "Two more".length });
    handle.select({ line: 0, ch: 0 }, { line: 0, ch: 3 });
    expect(handle.selection()).toBe("One");
    handle.insert("1");
    expect(handle.text()).toBe("1\nTwo more");
  });

  it("finds where the text ends", () => {
    const { handle } = editorWith("One\n\nThree lines");
    expect(handle.end()).toEqual({ line: 2, ch: "Three lines".length });
  });

  it("reads the kinds of token a piece of text is drawn with", () => {
    const { handle } = editorWith("Plain and **strong**");
    expect(handle.tokenTypes("strong")).toEqual(["strong"]);
    expect(handle.tokenTypes("Plain")).toEqual([]);
    expect(handle.tokenTypes("not there")).toEqual([]);
  });

  it("reads the token of the first piece of text that holds the text", () => {
    const { handle } = editorWith("Plain **Plain** and more");
    // The first is drawn plain, though a token further on holds it too.
    expect(handle.tokenTypes("Plain")).toEqual([]);
    // Across a plain piece and a token, no one token holds it.
    expect(handle.tokenTypes("Plain **")).toEqual([]);
  });
});
