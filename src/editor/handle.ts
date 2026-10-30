import type { Editor } from "codemirror";

// A place in an editor's text: the line, counted from 0, and the column on it
// in UTF-16 code units, the way JavaScript measures a string.
export type TextPosition = { line: number; ch: number };

// The few things the end-to-end tests do to an editor and read back from it.
// The app hangs one on the root element of each editor it makes, the element
// its test id names, so that the tests drive whatever editor the app has the
// same way: an editor that replaces CodeMirror 5 hangs the same handle, and
// the specs stay as they are. A change made through it is a change of the
// editor's text like any other, which the app answers as it answers typing.
// It goes in even where the editor takes no typing, such as a kanban card
// shown read-only: CodeMirror 5's read-only stops only what is typed. Whether
// the app then saves it is the app's to say; a note's editor does not save
// while it is read-only.
export interface EditorHandle {
  // The whole text the editor holds, its lines joined with \n.
  text(): string;
  // Puts text in place of all of it as one change. Where the caret is
  // afterwards is up to the editor (CodeMirror 5 puts it at the start), so a
  // test that goes on to type puts it somewhere first.
  setText(text: string): void;
  // Puts text in place of the selection, or at the caret, as one change: the
  // text as given, without what the editor adds as keys are typed (the
  // brackets it closes). The app answers it as it answers typing, a hint for
  // a "/" included.
  insert(text: string): void;
  caret(): TextPosition;
  // Where the text ends.
  end(): TextPosition;
  // Selects from anchor to head; given no head, puts the caret at anchor.
  select(anchor: TextPosition, head?: TextPosition): void;
  selection(): string;
  focus(): void;
  // The kinds of token the editor has drawn the first piece of text that
  // holds this text with, as the editor names them ("builtin", "strong" and
  // so on): none where that piece is drawn plain or inside a widget, or
  // where no single piece holds the text (it runs across two tokens, or is
  // not drawn). What is drawn, not what the editor would work out: a
  // language arriving changes it only once the editor has drawn the text
  // again.
  tokenTypes(text: string): string[];
}

// The element the handle hangs on.
export type EditorHost = HTMLElement & { editorHandle: EditorHandle };

// Hangs a handle on a CodeMirror 5 editor and names its root element by test
// id: "note-editor" for a note's editor, "card-editor" for a kanban card's.
export function attachEditorHandle(editor: Editor, testId: string) {
  const root = editor.getWrapperElement() as EditorHost;
  root.dataset.testid = testId;
  root.editorHandle = {
    text: () => editor.getValue(),
    setText: (text) => editor.setValue(text),
    insert: (text) => editor.replaceSelection(text),
    caret: () => {
      const { line, ch } = editor.getCursor();
      return { line, ch };
    },
    end: () => {
      const line = editor.lastLine();
      return { line, ch: editor.getLine(line).length };
    },
    select: (anchor, head) => editor.setSelection(anchor, head ?? anchor),
    selection: () => editor.getSelection(),
    focus: () => editor.focus(),
    tokenTypes: (text) => {
      // The lines as drawn; the editor's measuring copy of a line sits
      // beside them, not in them.
      const lines = root.querySelector(".CodeMirror-code");
      if (!lines) {
        return [];
      }
      const walker = document.createTreeWalker(lines, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.includes(text)) {
          return Array.from(node.parentElement?.classList ?? [])
            .filter((name) => name.startsWith("cm-"))
            .map((name) => name.slice("cm-".length));
        }
      }
      return [];
    },
  };
}
