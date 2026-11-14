import { defaultKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { indentation, indentOrTab, outdent, toggleMark } from "./commands";
import type { EditorHandle, EditorHost, TextPosition } from "./handle";
import type { NoteDocument } from "./noteDocument";
import { editorTheme } from "./theme";

/**
 * How an editor shows a note: "live" hides the markup of what the caret is
 * not in and draws the rest as it will read; "source" shows every character
 * with the text's typography and line numbers; "plain" shows them as plain
 * text in one size.
 */
export type EditorDisplay = "live" | "source" | "plain";

export interface NoteEditorOptions {
  /** The element the editor is put in, as its last child. */
  parent: HTMLElement;
  document: NoteDocument;
  display: EditorDisplay;
  /** The test id the editor's root element is named by. */
  testId: string;
  /** Ctrl+S (Cmd+S): the browser's own dialog is kept away either way. */
  onSave?: () => void;
  /** After the selection moves or the text under it changes. */
  onSelection?: (editor: NoteEditor) => void;
}

function displayExtensions(display: EditorDisplay): Extension {
  return [
    EditorView.editorAttributes.of({ class: `cn-editor-${display}` }),
    display === "live" ? [] : lineNumbers(),
  ];
}

/** An editor of a note's shared text: one per pane the note is open in. */
export class NoteEditor {
  readonly view: EditorView;
  readonly document: NoteDocument;
  readonly handle: EditorHandle;
  private shown: EditorDisplay;
  private readonly display = new Compartment();
  private readonly readOnly = new Compartment();
  private readonly detach: () => void;

  constructor({
    parent,
    document,
    display,
    testId,
    onSave,
    onSelection,
  }: NoteEditorOptions) {
    this.document = document;
    this.shown = display;
    this.view = new EditorView({
      parent,
      dispatchTransactions: document.dispatchTransactions,
      state: EditorState.create({
        doc: document.doc,
        extensions: [
          drawSelection(),
          indentation,
          keymap.of([
            // Undo and redo are the note's, not this editor's: the history
            // is shared by every editor of the note.
            {
              key: "Mod-z",
              run: (view) => document.undo(view),
              preventDefault: true,
            },
            {
              key: "Mod-y",
              run: (view) => document.redo(view),
              preventDefault: true,
            },
            // The default keymap leaves this one unbound on Windows.
            {
              key: "Mod-Shift-z",
              run: (view) => document.redo(view),
              preventDefault: true,
            },
            { key: "Mod-b", run: toggleMark("**"), preventDefault: true },
            { key: "Mod-i", run: toggleMark("*"), preventDefault: true },
            { key: "Mod-d", run: toggleMark("~~"), preventDefault: true },
            {
              key: "Mod-s",
              run: () => {
                onSave?.();
                return true;
              },
              preventDefault: true,
            },
            { key: "Tab", run: indentOrTab, shift: outdent },
            ...defaultKeymap,
          ]),
          // What the browser's own undo (its menu, a shaken phone) asks for.
          EditorView.domEventHandlers({
            beforeinput: (event, view) => {
              if (event.inputType === "historyUndo") {
                event.preventDefault();
                document.undo(view);
                return true;
              }
              if (event.inputType === "historyRedo") {
                event.preventDefault();
                document.redo(view);
                return true;
              }
              return false;
            },
          }),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          editorTheme,
          this.display.of(displayExtensions(display)),
          this.readOnly.of(EditorState.readOnly.of(false)),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
              onSelection?.(this);
            }
          }),
        ],
      }),
    });
    this.detach = document.attach(this.view);
    this.handle = this.attachHandle(testId);
  }

  /** Takes the editor off the page and out of its note's document. */
  destroy() {
    this.detach();
    this.view.destroy();
  }

  get shownAs(): EditorDisplay {
    return this.shown;
  }

  /** Changes how the note is shown; the text, selection and history stay. */
  show(display: EditorDisplay) {
    if (display !== this.shown) {
      this.shown = display;
      this.view.dispatch({
        effects: this.display.reconfigure(displayExtensions(display)),
      });
    }
  }

  setReadOnly(readOnly: boolean) {
    if (readOnly !== this.view.state.readOnly) {
      this.view.dispatch({
        effects: this.readOnly.reconfigure(EditorState.readOnly.of(readOnly)),
      });
    }
  }

  /**
   * Hides the editor or shows it again. Its own stylesheet says
   * `display: flex !important`, which only an important declaration on the
   * element itself gets past.
   */
  setHidden(hidden: boolean) {
    if (hidden) {
      this.view.dom.style.setProperty("display", "none", "important");
    } else {
      this.view.dom.style.removeProperty("display");
      this.view.requestMeasure();
    }
  }

  focus() {
    this.view.focus();
  }

  position(offset: number): TextPosition {
    const line = this.view.state.doc.lineAt(offset);
    return { line: line.number - 1, ch: offset - line.from };
  }

  /** The place in the text nearest a position, which may lie outside it. */
  offset({ line, ch }: TextPosition): number {
    const doc = this.view.state.doc;
    const at = doc.line(Math.min(Math.max(line + 1, 1), doc.lines));
    return at.from + Math.min(Math.max(ch, 0), at.length);
  }

  caret(): TextPosition {
    return this.position(this.view.state.selection.main.head);
  }

  /** Puts the caret on a line and brings the line to the top of the view. */
  revealLine(line: number) {
    const at = this.offset({ line, ch: 0 });
    this.view.dispatch({
      selection: { anchor: at },
      effects: EditorView.scrollIntoView(at, { y: "start" }),
    });
  }

  private attachHandle(testId: string): EditorHandle {
    const { view } = this;
    const root = view.dom as unknown as EditorHost;
    root.dataset.testid = testId;
    root.editorHandle = {
      text: () => this.document.text(),
      setText: (text) =>
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        }),
      insert: (text) =>
        view.dispatch({
          ...view.state.replaceSelection(text),
          userEvent: "input.type",
        }),
      caret: () => this.caret(),
      end: () => this.position(view.state.doc.length),
      select: (anchor, head) =>
        view.dispatch({
          selection: {
            anchor: this.offset(anchor),
            head: this.offset(head ?? anchor),
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
            const names = new Set<string>();
            // A token's classes are on the spans around its text, one
            // inside another where two highlighters name it.
            for (
              let element = node.parentElement;
              element && element !== view.contentDOM;
              element = element.parentElement
            ) {
              for (const name of Array.from(element.classList)) {
                if (name.startsWith("tok-")) {
                  names.add(name.slice("tok-".length));
                }
              }
            }
            return [...names];
          }
        }
        return [];
      },
    };
    return root.editorHandle;
  }
}
