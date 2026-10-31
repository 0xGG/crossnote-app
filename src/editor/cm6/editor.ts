// R3-0 prototype, not for main: a CodeMirror 6 editor for a note, behind the
// handful of CodeMirror 5 calls NotePanel makes on the paths the risk check
// goes through (loading, saving, reloading, switching modes), so that those
// paths stay the app's own. What NotePanel does beyond them (hints, the
// table of contents, the math preview, image dialogs) is left out: NotePanel
// skips it for this editor.
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import type { EditorHost } from "../handle";
import { livePreview } from "./livePreview";
import { commentWidgets } from "./widgets";

type Listener = (...args: unknown[]) => void;
type Position = { line: number; ch: number };

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.6" },
  ".cm-content": { padding: "16px 0" },
  ".cm-line": { padding: "0 16px" },
  ".cm6-strong": { fontWeight: "bold" },
  ".cm6-em": { fontStyle: "italic" },
  ".cm6-strike": { textDecoration: "line-through" },
  ".cm6-code": { fontFamily: "monospace", background: "rgba(127,127,127,.15)" },
  ".cm6-link": { color: "#2a7ae2", textDecoration: "underline" },
  ".cm6-h1": { fontSize: "2em", fontWeight: "bold" },
  ".cm6-h2": { fontSize: "1.6em", fontWeight: "bold" },
  ".cm6-h3": { fontSize: "1.3em", fontWeight: "bold" },
  ".cm6-h4, .cm6-h5, .cm6-h6": { fontWeight: "bold" },
});

export class Cm6NoteEditor {
  readonly cm6 = true;
  readonly view: EditorView;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly preview = new Compartment();
  private readonly readOnly = new Compartment();

  constructor(textArea: HTMLTextAreaElement, text: string) {
    this.view = new EditorView({
      state: EditorState.create({
        doc: text,
        extensions: [
          history(),
          drawSelection(),
          // The default keymap leaves Ctrl-Shift-Z unbound on Windows, and an
          // unbound shifted key falls back to the unshifted one: undo.
          // CodeMirror 5 redoes on it.
          keymap.of([
            { key: "Mod-Shift-z", run: redo, preventDefault: true },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(classHighlighter),
          EditorView.lineWrapping,
          theme,
          this.preview.of([livePreview, commentWidgets]),
          this.readOnly.of(EditorState.readOnly.of(false)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.emit("changes", this);
            }
            if (update.selectionSet || update.docChanged) {
              this.emit("cursorActivity", this);
            }
          }),
        ],
      }),
    });
    textArea.style.display = "none";
    textArea.after(this.view.dom);
  }

  // Edit mode draws the live preview and the widgets; source code mode
  // takes both away. The text, the selection and the undo history stay.
  setLivePreview(on: boolean) {
    this.view.dispatch({
      effects: this.preview.reconfigure(
        on ? [livePreview, commentWidgets] : [],
      ),
    });
  }

  destroy() {
    this.view.destroy();
  }

  // The CodeMirror 5 calls NotePanel makes.
  getValue() {
    return this.view.state.doc.toString();
  }

  setValue(text: string) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
    });
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  getOption(name: string) {
    return name === "readOnly" ? this.view.state.readOnly : undefined;
  }

  setOption(name: string, value: unknown) {
    if (name === "readOnly") {
      this.view.dispatch({
        effects: this.readOnly.reconfigure(EditorState.readOnly.of(!!value)),
      });
    }
  }

  getWrapperElement() {
    return this.view.dom;
  }

  refresh() {
    this.view.requestMeasure();
  }

  focus() {
    this.view.focus();
  }

  getCursor(): Position {
    return this.position(this.view.state.selection.main.head);
  }

  setCursor(position: Position) {
    const at = this.offset(position);
    this.view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
  }

  getLine(line: number) {
    return this.view.state.doc.line(line + 1).text;
  }

  lastLine() {
    return this.view.state.doc.lines - 1;
  }

  position(offset: number): Position {
    const line = this.view.state.doc.lineAt(offset);
    return { line: line.number - 1, ch: offset - line.from };
  }

  offset({ line, ch }: Position) {
    const doc = this.view.state.doc;
    const at = doc.line(Math.min(Math.max(line + 1, 1), doc.lines));
    return at.from + Math.min(Math.max(ch, 0), at.length);
  }
}

export function isCm6(editor: unknown): editor is Cm6NoteEditor {
  return !!editor && (editor as Cm6NoteEditor).cm6 === true;
}

// The same handle src/editor/handle.ts hangs on a CodeMirror 5 editor.
export function attachCm6Handle(editor: Cm6NoteEditor, testId: string) {
  const view = editor.view;
  const root = view.dom as EditorHost;
  root.dataset.testid = testId;
  root.editorHandle = {
    text: () => view.state.doc.toString(),
    setText: (text) => editor.setValue(text),
    insert: (text) =>
      view.dispatch({
        ...view.state.replaceSelection(text),
        userEvent: "input.type",
      }),
    caret: () => editor.getCursor(),
    end: () => editor.position(view.state.doc.length),
    select: (anchor, head) =>
      view.dispatch({
        selection: {
          anchor: editor.offset(anchor),
          head: editor.offset(head ?? anchor),
        },
      }),
    selection: () => {
      const { from, to } = view.state.selection.main;
      return view.state.sliceDoc(from, to);
    },
    focus: () => view.focus(),
    tokenTypes: (text) => {
      const walker = document.createTreeWalker(
        view.contentDOM,
        NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.includes(text)) {
          return Array.from(node.parentElement?.classList ?? [])
            .filter((name) => name.startsWith("tok-"))
            .map((name) => name.slice("tok-".length));
        }
      }
      return [];
    },
  };
}
