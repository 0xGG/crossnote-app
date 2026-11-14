import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import {
  Annotation,
  EditorState,
  Text,
  Transaction,
  type ChangeSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// Marks a change an editor is given by its note's document, so that the
// editor does not hand it back.
const fromDocument = Annotation.define<boolean>();

const LINE_BREAK = /\r\n?|\n/;

function toDoc(text: string): Text {
  return Text.of(text.split(LINE_BREAK));
}

// The one change that makes one text of another: what lies between the start
// they share and the end they share.
function difference(from: Text, to: Text): ChangeSpec {
  const a = from.toString();
  const b = to.toString();
  const most = Math.min(a.length, b.length);
  let start = 0;
  while (start < most && a.charCodeAt(start) === b.charCodeAt(start)) {
    start++;
  }
  let end = 0;
  while (
    end < most - start &&
    a.charCodeAt(a.length - 1 - end) === b.charCodeAt(b.length - 1 - end)
  ) {
    end++;
  }
  return {
    from: start,
    to: a.length - end,
    insert: b.slice(start, b.length - end),
  };
}

export type NoteDocumentChange = {
  // Whether the text came from the file (load) and not from an editor.
  loaded: boolean;
};

/**
 * The text of one note, shared by every editor that shows the note: a change
 * made in one editor is made in the others, and they undo and redo from one
 * history, kept here.
 *
 * Line breaks: the lines are kept apart from what ends them. A note whose
 * line breaks are all of one kind (\n, \r\n or \r) reads back with that kind,
 * edited or not. One that mixes kinds reads back byte for byte while its
 * lines are those of the file, and with the file's first kind of line break
 * throughout once they are not.
 */
export class NoteDocument {
  private state: EditorState;
  private loadedText = "";
  private loadedDoc = Text.empty;
  private lineBreak = "\n";
  private readonly views = new Set<EditorView>();
  private readonly listeners = new Set<(change: NoteDocumentChange) => void>();

  constructor(text: string, lineBreak?: string) {
    this.keep(text, lineBreak);
    this.state = EditorState.create({
      doc: this.loadedDoc,
      extensions: [history()],
    });
  }

  private keep(text: string, lineBreak?: string) {
    this.loadedText = text;
    this.loadedDoc = toDoc(text);
    // A settings-only block may have held every newline in the file. Its
    // line ending still applies when the first newline is typed in the body.
    this.lineBreak = lineBreak ?? LINE_BREAK.exec(text)?.[0] ?? this.lineBreak;
  }

  /** The lines, for an editor to start from. */
  get doc(): Text {
    return this.state.doc;
  }

  /** The note's text as it is to be written to its file. */
  text(): string {
    return this.state.doc.eq(this.loadedDoc)
      ? this.loadedText
      : this.state.doc.sliceString(0, undefined, this.lineBreak);
  }

  /**
   * Takes the text of the note's file in place of what is here: the editors
   * are given the difference, as one change that is not one to undo, and
   * what was typed before it can still be undone where it still applies.
   */
  load(text: string, lineBreak?: string) {
    this.keep(text, lineBreak);
    if (this.loadedDoc.eq(this.state.doc)) {
      return;
    }
    this.commit(
      this.state.update({
        changes: difference(this.state.doc, this.loadedDoc),
        annotations: Transaction.addToHistory.of(false),
      }),
      { loaded: true },
    );
  }

  /** Calls back after each change to the lines; gives what ends that. */
  onChange(listener: (change: NoteDocumentChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Joins an editor made from `doc` with `dispatchTransactions` as its
   * dispatch; gives what takes it out again.
   */
  attach(view: EditorView): () => void {
    this.views.add(view);
    return () => {
      this.views.delete(view);
    };
  }

  /** An editor's dispatch: applies its transactions, and shares its changes. */
  readonly dispatchTransactions = (
    transactions: readonly Transaction[],
    view: EditorView,
  ) => {
    view.update(transactions);
    for (const transaction of transactions) {
      if (transaction.changes.empty || transaction.annotation(fromDocument)) {
        continue;
      }
      // The history keeps the selection a change was made from, to put it
      // back on undo: the editor's, as of this change.
      this.state = this.state.update({
        selection: transaction.startState.selection,
        annotations: Transaction.addToHistory.of(false),
      }).state;
      // What the history groups and splits its steps by.
      const annotations: Annotation<unknown>[] = [];
      const userEvent = transaction.annotation(Transaction.userEvent);
      if (userEvent !== undefined) {
        annotations.push(Transaction.userEvent.of(userEvent));
      }
      const addToHistory = transaction.annotation(Transaction.addToHistory);
      if (addToHistory !== undefined) {
        annotations.push(Transaction.addToHistory.of(addToHistory));
      }
      const isolate = transaction.annotation(isolateHistory);
      if (isolate !== undefined) {
        annotations.push(isolateHistory.of(isolate));
      }
      this.commit(
        this.state.update({
          changes: transaction.changes,
          selection: transaction.newSelection,
          annotations,
          filter: false,
        }),
        { loaded: false, from: view },
      );
    }
  };

  /** Undoes the last change to the note, whichever editor made it. */
  undo(view: EditorView): boolean {
    return (
      !view.state.readOnly &&
      undo({
        state: this.state,
        dispatch: (transaction) =>
          this.commit(transaction, { loaded: false, select: view }),
      })
    );
  }

  redo(view: EditorView): boolean {
    return (
      !view.state.readOnly &&
      redo({
        state: this.state,
        dispatch: (transaction) =>
          this.commit(transaction, { loaded: false, select: view }),
      })
    );
  }

  // Takes a transaction of the shared state, gives its changes to every
  // editor but the one they came from, and puts the selection it ends with
  // in the editor that asked for it (an undo's, a redo's).
  private commit(
    transaction: Transaction,
    {
      loaded,
      from,
      select,
    }: { loaded: boolean; from?: EditorView; select?: EditorView },
  ) {
    this.state = transaction.state;
    if (transaction.changes.empty) {
      return;
    }
    for (const view of this.views) {
      if (view === from) {
        continue;
      }
      // Not as the user's own doing in that editor: typing passed on as
      // typing would open a completion list at the caret of an editor
      // nobody is typing in.
      view.dispatch({
        changes: transaction.changes,
        annotations: [
          fromDocument.of(true),
          Transaction.addToHistory.of(false),
        ],
        filter: false,
        ...(view === select && transaction.selection
          ? { selection: transaction.selection, scrollIntoView: true }
          : {}),
      });
    }
    for (const listener of [...this.listeners]) {
      listener({ loaded });
    }
  }
}
