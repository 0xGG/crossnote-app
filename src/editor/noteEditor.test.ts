import { forceParsing } from "@codemirror/language";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syntaxSamples } from "../test/corpus/syntax";
import type { EditorHost } from "./handle";
import { NoteDocument } from "./noteDocument";
import {
  NoteEditor,
  type EditorDisplay,
  type NoteEditorOptions,
} from "./noteEditor";

const editors: NoteEditor[] = [];

it("passes decoded image destinations and titles to the image host", () => {
  const loadImage = vi.fn();
  const editor = editorOf('\n![photo](a\\(b\\).png "A \\"quoted\\" photo")', {
    images: { loadImage },
  });
  expect(loadImage).toHaveBeenCalledWith(
    expect.any(HTMLImageElement),
    "a(b).png",
  );
  expect(
    editor.view.dom.querySelector("img.cn-image")?.getAttribute("title"),
  ).toBe('A "quoted" photo');
});

it.each([
  "![photo](a>)",
  String.raw`![photo](a\>)`,
  "![photo][p]\n\n[p]: a>",
  String.raw`![photo][p]` + "\n\n" + String.raw`[p]: a\>`,
])("keeps a trailing angle in the image destination: %s", (text) => {
  const loadImage = vi.fn();
  editorOf("\n" + text, { images: { loadImage } });
  expect(loadImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), "a>");
});

it("reloads image hosts without replacing text, selection or undo history", () => {
  let folder = "a";
  const loadImage = vi.fn((element: HTMLImageElement, src: string) => {
    element.src = `https://example.com/${folder}/${src}`;
  });
  const editor = editorOf("\n![photo](picture.png)", { images: { loadImage } });
  editor.view.dispatch({
    changes: { from: 0, insert: "typed" },
    selection: { anchor: 2 },
  });
  const text = editor.document.doc;
  const changed = vi.fn();
  const stop = editor.document.onChange(changed);
  expect(
    editor.view.dom.querySelector("img.cn-image")?.getAttribute("src"),
  ).toBe("https://example.com/a/picture.png");
  folder = "b";
  editor.refreshImages();
  expect(
    editor.view.dom.querySelector("img.cn-image")?.getAttribute("src"),
  ).toBe("https://example.com/b/picture.png");
  expect(editor.document.doc).toBe(text);
  expect(editor.view.state.selection.main.head).toBe(2);
  expect(changed).not.toHaveBeenCalled();
  stop();
  editor.document.undo(editor.view);
  expect(editor.document.text()).toBe("\n![photo](picture.png)");
});

function editorOf(
  text: string | NoteDocument,
  options: Partial<NoteEditorOptions> = {},
) {
  const editor = new NoteEditor({
    parent: document.body,
    document: typeof text === "string" ? new NoteDocument(text) : text,
    display: "live",
    testId: "note-editor",
    ...options,
  });
  editors.push(editor);
  // The tests look at what is drawn straight away: read to the end first.
  expect(forceParsing(editor.view, editor.view.state.doc.length, 5000)).toBe(
    true,
  );
  return editor;
}

// A key pressed in the editor; gives whether the editor kept it from the
// browser.
function press(
  editor: NoteEditor,
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    // A browser gives the key's code as well: it tells the editor the letter
    // under Shift, and Escape and Tab from the rest.
    keyCode:
      key.length === 1
        ? key.toUpperCase().charCodeAt(0)
        : ({ Tab: 9, Enter: 13, Escape: 27 }[key] ?? 0),
    ...modifiers,
    bubbles: true,
    cancelable: true,
  });
  editor.view.contentDOM.dispatchEvent(event);
  return { prevented: event.defaultPrevented };
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("NoteEditor", () => {
  it("names its root element by the test id and hangs the handle on it", () => {
    const editor = editorOf("One");
    const root = document.querySelector<EditorHost>(
      '[data-testid="note-editor"]',
    );
    expect(root).toBe(editor.view.dom);
    expect(root?.editorHandle).toBe(editor.handle);
  });

  describe("its handle", () => {
    it("reads the text as the note's document has it, line endings included", () => {
      const editor = editorOf("One\r\nTwo\r\n");
      expect(editor.handle.text()).toBe("One\r\nTwo\r\n");
    });

    it("puts a text in place of all of it as a change the note undoes", () => {
      const editor = editorOf("One");
      editor.handle.setText("Two\nThree");
      expect(editor.handle.text()).toBe("Two\nThree");
      expect(editor.document.undo(editor.view)).toBe(true);
      expect(editor.handle.text()).toBe("One");
    });

    it("puts text at the caret, or in place of the selection", () => {
      const editor = editorOf("One Three");
      editor.handle.select({ line: 0, ch: 4 });
      editor.handle.insert("Two ");
      expect(editor.handle.text()).toBe("One Two Three");
      expect(editor.handle.caret()).toEqual({ line: 0, ch: 8 });
      editor.handle.select({ line: 0, ch: 0 }, { line: 0, ch: 3 });
      expect(editor.handle.selection()).toBe("One");
      editor.handle.insert("1");
      expect(editor.handle.text()).toBe("1 Two Three");
    });

    it("counts lines from 0 and columns in UTF-16 code units", () => {
      const editor = editorOf("One\n😀 Two\nThree");
      expect(editor.handle.end()).toEqual({ line: 2, ch: 5 });
      editor.handle.select({ line: 1, ch: 3 }, { line: 1, ch: 6 });
      expect(editor.handle.selection()).toBe("Two");
      expect(editor.handle.caret()).toEqual({ line: 1, ch: 6 });
    });

    it("takes a position outside the text as the nearest place in it", () => {
      const editor = editorOf("One\nTwo");
      editor.handle.select({ line: 9, ch: 9 });
      expect(editor.handle.caret()).toEqual({ line: 1, ch: 3 });
      editor.handle.select({ line: 0, ch: 9 });
      expect(editor.handle.caret()).toEqual({ line: 0, ch: 3 });
    });

    it("names the kinds of token a piece of text is drawn with", () => {
      const editor = editorOf("# Title\n\nSome **bold** text\n");
      expect(editor.handle.tokenTypes("Title")).toEqual(
        expect.arrayContaining(["heading", "heading1"]),
      );
      expect(editor.handle.tokenTypes("bold")).toContain("strong");
      expect(editor.handle.tokenTypes("Some")).toEqual([]);
      expect(editor.handle.tokenTypes("not there")).toEqual([]);
    });
  });

  describe("how it shows a note", () => {
    const shown = (editor: NoteEditor) =>
      (["live", "source"] as EditorDisplay[]).filter((display) =>
        editor.view.dom.classList.contains(`cn-editor-${display}`),
      );
    const numbered = (editor: NoteEditor) =>
      !!editor.view.dom.querySelector(".cm-lineNumbers");

    it("is marked on its root element, with line numbers beside the source", () => {
      const editor = editorOf("One");
      expect(shown(editor)).toEqual(["live"]);
      expect(numbered(editor)).toBe(false);
      editor.show("source");
      expect(shown(editor)).toEqual(["source"]);
      expect(numbered(editor)).toBe(true);
      // Without them where the app asks for none, and with them again.
      editor.show("source", false);
      expect(shown(editor)).toEqual(["source"]);
      expect(numbered(editor)).toBe(false);
      editor.show("source", true);
      expect(numbered(editor)).toBe(true);
      editor.show("live");
      expect(shown(editor)).toEqual(["live"]);
      expect(numbered(editor)).toBe(false);
      expect(editor.shownAs).toBe("live");
    });

    it("changes without touching the text, the selection or what can be undone", () => {
      const editor = editorOf("One");
      editor.handle.select({ line: 0, ch: 3 });
      editor.handle.insert(" Two");
      const changes: boolean[] = [];
      editor.document.onChange(({ loaded }) => changes.push(loaded));
      editor.show("source");
      editor.show("live");
      expect(changes).toEqual([]);
      expect(editor.handle.caret()).toEqual({ line: 0, ch: 7 });
      expect(editor.document.undo(editor.view)).toBe(true);
      expect(editor.handle.text()).toBe("One");
    });
  });

  it("hides past its own stylesheet's display, and shows again", () => {
    const editor = editorOf("One");
    editor.setHidden(true);
    expect(editor.view.dom.style.getPropertyValue("display")).toBe("none");
    expect(editor.view.dom.style.getPropertyPriority("display")).toBe(
      "important",
    );
    editor.setHidden(false);
    expect(editor.view.dom.style.getPropertyValue("display")).toBe("");
  });

  it("keeps a read-only note from the keys that change it, not from being read", () => {
    const editor = editorOf("One");
    editor.handle.select({ line: 0, ch: 0 }, { line: 0, ch: 3 });
    editor.setReadOnly(true);
    press(editor, "b", { ctrlKey: true });
    expect(editor.handle.text()).toBe("One");
    editor.setReadOnly(false);
    press(editor, "b", { ctrlKey: true });
    expect(editor.handle.text()).toBe("**One**");
  });

  describe("its keys", () => {
    it("mark the selection: Ctrl+B strong, Ctrl+I emphasis, Ctrl+D struck", () => {
      for (const [key, marked] of [
        ["b", "**One**"],
        ["i", "*One*"],
        ["d", "~~One~~"],
      ]) {
        const editor = editorOf("One");
        editor.handle.select({ line: 0, ch: 0 }, { line: 0, ch: 3 });
        expect(press(editor, key, { ctrlKey: true })).toEqual({
          prevented: true,
        });
        expect(editor.handle.text()).toBe(marked);
      }
    });

    it("undo with Ctrl+Z, and redo with Ctrl+Y and with Ctrl+Shift+Z", () => {
      for (const redo of [
        { key: "y", ctrlKey: true },
        { key: "Z", ctrlKey: true, shiftKey: true },
      ]) {
        const editor = editorOf("One");
        editor.handle.select(editor.handle.end());
        editor.handle.insert(" Two");
        expect(press(editor, "z", { ctrlKey: true }).prevented).toBe(true);
        expect(editor.handle.text()).toBe("One");
        const { key, ...modifiers } = redo;
        expect(press(editor, key, modifiers).prevented).toBe(true);
        expect(editor.handle.text()).toBe("One Two");
      }
    });

    it("undo in one pane what was typed in another pane of the note", () => {
      const note = new NoteDocument("One");
      const first = editorOf(note);
      const second = editorOf(note, { testId: "other-editor" });
      first.handle.select(first.handle.end());
      first.handle.insert(" Two");
      expect(second.handle.text()).toBe("One Two");
      press(second, "z", { ctrlKey: true });
      expect(first.view.state.doc.toString()).toBe("One");
    });

    it("keep Ctrl+S from the browser and tell the app", () => {
      const onSave = vi.fn();
      const editor = editorOf("One", { onSave });
      expect(press(editor, "s", { ctrlKey: true })).toEqual({
        prevented: true,
      });
      expect(onSave).toHaveBeenCalledTimes(1);
      // With nothing to tell, the browser's dialog is still kept away.
      expect(press(editorOf("Two"), "s", { ctrlKey: true }).prevented).toBe(
        true,
      );
    });

    it("indent a list item with Tab and take the indentation back with Shift+Tab", () => {
      const editor = editorOf("- one\n- two");
      editor.handle.select({ line: 1, ch: 5 });
      press(editor, "Tab");
      expect(editor.handle.text()).toBe("- one\n    - two");
      press(editor, "Tab", { shiftKey: true });
      expect(editor.handle.text()).toBe("- one\n- two");
    });

    it("go on with a list on Enter", () => {
      const editor = editorOf("- one");
      editor.handle.select(editor.handle.end());
      press(editor, "Enter");
      expect(editor.handle.text()).toBe("- one\n- ");
    });

    it("leave Tab to the browser right after Escape, to move on from the editor", () => {
      const editor = editorOf("One");
      expect(press(editor, "Tab").prevented).toBe(true);
      expect(editor.handle.text()).toBe("    One");
      press(editor, "Escape");
      expect(press(editor, "Tab").prevented).toBe(false);
      expect(editor.handle.text()).toBe("    One");
      // Once another key has been pressed, Tab is the editor's again.
      press(editor, "a");
      expect(press(editor, "Tab").prevented).toBe(true);
    });
  });

  it("tells when the selection moves and when the text under it changes", () => {
    const onSelection = vi.fn();
    const editor = editorOf("One", { onSelection });
    editor.handle.select({ line: 0, ch: 2 });
    expect(onSelection).toHaveBeenCalledTimes(1);
    expect(onSelection).toHaveBeenLastCalledWith(editor);
    editor.handle.insert("x");
    expect(onSelection).toHaveBeenCalledTimes(2);
  });

  it("puts the caret on a line asked for", () => {
    const editor = editorOf("One\nTwo\nThree");
    editor.revealLine(2);
    expect(editor.handle.caret()).toEqual({ line: 2, ch: 0 });
  });

  it("stops taking the note's changes once destroyed", () => {
    const note = new NoteDocument("One");
    const first = editorOf(note);
    const second = new NoteEditor({
      parent: document.body,
      document: note,
      display: "live",
      testId: "other-editor",
    });
    second.destroy();
    expect(document.querySelector('[data-testid="other-editor"]')).toBeNull();
    first.handle.select(first.handle.end());
    first.handle.insert(" Two");
    expect(note.text()).toBe("One Two");
  });

  describe("its language", () => {
    it("colours a code block in its language once the language has loaded, without touching the note", async () => {
      const text =
        "```js\nconst a = 1;\n```\n\n```bash {cmd=true}\necho hi\n```\n";
      const editor = editorOf(text);
      const changes: boolean[] = [];
      editor.document.onChange(({ loaded }) => changes.push(loaded));
      await vi.waitFor(
        () => expect(editor.handle.tokenTypes("const")).toContain("keyword"),
        { timeout: 10_000 },
      );
      await vi.waitFor(
        () => expect(editor.handle.tokenTypes("echo")).not.toEqual([]),
        { timeout: 10_000 },
      );
      expect(changes).toEqual([]);
      expect(editor.handle.text()).toBe(text);
    });

    it("leaves a code block of a language it does not know plain", () => {
      const editor = editorOf("```mermaid\ngraph TD; A-->B\n```\n");
      expect(editor.handle.tokenTypes("graph")).toEqual(["monospace"]);
    });

    it("reads front matter as YAML, and the note under it as markdown", () => {
      const editor = editorOf("---\ntitle: T\n---\n\n# Heading\n\n- one");
      expect(editor.handle.tokenTypes("title")).not.toEqual([]);
      expect(editor.handle.tokenTypes("Heading")).toContain("heading1");
      editor.handle.select(editor.handle.end());
      press(editor, "Enter");
      expect(editor.handle.text()).toBe(
        "---\ntitle: T\n---\n\n# Heading\n\n- one\n- ",
      );
    });

    it("colours the notes' own syntax", () => {
      const editor = editorOf("$x$ [[README]] #topic ==marked== ++in++ [^1]", {
        display: "source",
      });
      expect(editor.handle.tokenTypes("x")).toContain("math");
      expect(editor.handle.tokenTypes("README")).toContain("wikiLink");
      expect(editor.handle.tokenTypes("#topic")).toContain("hashtag");
      expect(editor.handle.tokenTypes("marked")).toContain("marked");
      expect(editor.handle.tokenTypes("in")).toContain("inserted");
      expect(editor.handle.tokenTypes("[^1]")).toContain("footnote");
    });
  });

  describe("leaves each note of the shared corpus as it was written", () => {
    (["live", "source"] as EditorDisplay[]).forEach((display) => {
      syntaxSamples.forEach(({ name, text }) => {
        it(`shown ${display}, with ${name}`, () => {
          const note = new NoteDocument(text);
          const changes: boolean[] = [];
          note.onChange(({ loaded }) => changes.push(loaded));
          const editor = editorOf(note, { display });
          // The caret through the note, start to end.
          editor.handle.select({ line: 0, ch: 0 });
          editor.handle.select(editor.handle.end());
          editor.handle.select({ line: 0, ch: 0 }, editor.handle.end());
          expect(changes).toEqual([]);
          expect(note.text()).toBe(text);
        });
      });
    });
  });
});
