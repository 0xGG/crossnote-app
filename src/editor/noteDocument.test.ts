import { EditorState, Transaction, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  frontMatterSamples,
  unreadableFrontMatterSamples,
} from "../test/corpus/frontMatter";
import { syntaxSamples } from "../test/corpus/syntax";
import { NoteDocument } from "./noteDocument";

const samples = [
  ...syntaxSamples,
  ...Object.entries(frontMatterSamples).map(([name, text]) => ({
    name: `front matter, ${name}`,
    text,
  })),
  ...unreadableFrontMatterSamples.map(([name, text]) => ({
    name: `front matter YAML cannot read, ${name}`,
    text,
  })),
];

const views: EditorView[] = [];

// A bare editor of the document: no keymap, no language.
function editorOf(
  document: NoteDocument,
  readOnly = false,
  extensions: Extension = [],
) {
  const view = new EditorView({
    parent: window.document.body,
    dispatchTransactions: document.dispatchTransactions,
    state: EditorState.create({
      doc: document.doc,
      extensions: [EditorState.readOnly.of(readOnly), extensions],
    }),
  });
  document.attach(view);
  views.push(view);
  return view;
}

function type(view: EditorView, text: string, at = view.state.doc.length) {
  view.dispatch({
    changes: { from: at, insert: text },
    userEvent: "input.type",
  });
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

describe("NoteDocument", () => {
  it.each(["\r\n", "\r"])(
    "uses file metadata when the visible body has no %j line ending",
    (lineBreak) => {
      const document = new NoteDocument("Body", lineBreak);
      const view = editorOf(document);
      type(view, "\nNext");
      expect(document.text()).toBe(`Body${lineBreak}Next`);
      // A reloaded empty body may come from a file using a different ending.
      const reloaded = lineBreak === "\r" ? "\r\n" : "\r";
      document.load("", reloaded);
      type(view, "\nFirst");
      expect(document.text()).toBe(`${reloaded}First`);
    },
  );

  describe("gives each note of the shared corpus back as it was written", () => {
    samples.forEach(({ name, text }) => {
      it(`with ${name}`, () => {
        expect(new NoteDocument(text).text()).toBe(text);
      });
    });
  });

  describe("keeps the rest of each note of the shared corpus when a word is typed at its end", () => {
    samples
      .filter(({ name }) => name !== "line endings of two kinds")
      .forEach(({ name, text }) => {
        it(`with ${name}`, () => {
          const document = new NoteDocument(text);
          type(editorOf(document), "Edit");
          expect(document.text()).toBe(`${text}Edit`);
        });
      });
  });

  it("ends the lines typed into a note as the note ends its own", () => {
    for (const lineBreak of ["\n", "\r\n", "\r"]) {
      const document = new NoteDocument(`One${lineBreak}Two${lineBreak}`);
      // However the typed text ends its lines.
      type(editorOf(document), "Three\nFour\r\nFive\rSix");
      expect(document.text()).toBe(
        ["One", "Two", "Three", "Four", "Five", "Six"].join(lineBreak),
      );
    }
  });

  it("ends lines with \\n in a note of one line", () => {
    const document = new NoteDocument("One");
    type(editorOf(document), "\nTwo");
    expect(document.text()).toBe("One\nTwo");
  });

  it("gives a note of two kinds of line ending the first kind throughout once it is edited, and its own bytes back when the edit is undone", () => {
    const text = "One\r\nTwo\nThree\r\n\r\nFour\n";
    const document = new NoteDocument(text);
    const view = editorOf(document);
    type(view, "Edit");
    expect(document.text()).toBe("One\r\nTwo\r\nThree\r\n\r\nFour\r\nEdit");
    expect(document.undo(view)).toBe(true);
    expect(document.text()).toBe(text);
  });

  it("makes a change typed in one editor in the note's other editors", () => {
    const document = new NoteDocument("One\n");
    const first = editorOf(document);
    const second = editorOf(document);
    type(first, "Two");
    expect(second.state.doc.toString()).toBe("One\nTwo");
    type(second, "Zero ", 0);
    expect(first.state.doc.toString()).toBe("Zero One\nTwo");
    expect(document.text()).toBe("Zero One\nTwo");
  });

  it("keeps the caret of another editor at its text when a change lands before it", () => {
    const document = new NoteDocument("One Two");
    const first = editorOf(document);
    const second = editorOf(document);
    second.dispatch({ selection: { anchor: 4 } });
    type(first, "Zero ", 0);
    expect(second.state.selection.main.head).toBe(9);
  });

  it("undoes and redoes from any editor of the note, what any of them typed", () => {
    const document = new NoteDocument("");
    const first = editorOf(document);
    const second = editorOf(document);
    type(first, "One");
    // Apart from the first in time, so that the two are two steps.
    vi.useFakeTimers({ now: Date.now() + 10_000 });
    try {
      type(second, " Two");
    } finally {
      vi.useRealTimers();
    }
    expect(document.undo(first)).toBe(true);
    expect(first.state.doc.toString()).toBe("One");
    expect(second.state.doc.toString()).toBe("One");
    expect(document.undo(second)).toBe(true);
    expect(first.state.doc.toString()).toBe("");
    expect(document.undo(second)).toBe(false);
    expect(document.redo(second)).toBe(true);
    expect(document.redo(second)).toBe(true);
    expect(first.state.doc.toString()).toBe("One Two");
    expect(document.redo(first)).toBe(false);
    expect(document.text()).toBe("One Two");
  });

  it("puts the selection a change was made from back in the editor that undoes it", () => {
    const document = new NoteDocument("One Two Three");
    const first = editorOf(document);
    const second = editorOf(document);
    first.dispatch({ selection: { anchor: 4, head: 7 } });
    first.dispatch({
      ...first.state.replaceSelection("2"),
      userEvent: "input.type",
    });
    expect(document.text()).toBe("One 2 Three");
    document.undo(second);
    const { anchor, head } = second.state.selection.main;
    expect([anchor, head]).toEqual([4, 7]);
  });

  it("gives the other editors a change without calling it the user's doing there", () => {
    const document = new NoteDocument("");
    const first = editorOf(document);
    const events: (string | undefined)[] = [];
    const second = editorOf(
      document,
      false,
      EditorView.updateListener.of((update) => {
        for (const transaction of update.transactions) {
          events.push(transaction.annotation(Transaction.userEvent));
        }
      }),
    );
    type(first, "/h");
    expect(second.state.doc.toString()).toBe("/h");
    expect(events).toEqual([undefined]);
  });

  it("does not undo from an editor that is read-only", () => {
    const document = new NoteDocument("");
    type(editorOf(document), "One");
    const readOnly = editorOf(document, true);
    expect(document.undo(readOnly)).toBe(false);
    expect(document.text()).toBe("One");
  });

  it("tells a change typed from a text loaded", () => {
    const document = new NoteDocument("One");
    const changes: boolean[] = [];
    const stop = document.onChange(({ loaded }) => changes.push(loaded));
    type(editorOf(document), " Two");
    document.load("Other");
    // The same text again is no change.
    document.load("Other");
    expect(changes).toEqual([false, true]);
    stop();
    document.load("Another");
    expect(changes).toEqual([false, true]);
  });

  it("gives the editors a loaded text as the difference from theirs", () => {
    const document = new NoteDocument("One\nTwo\nThree\n");
    const changed: [number, number, string][] = [];
    const view = editorOf(
      document,
      false,
      EditorView.updateListener.of((update) =>
        update.changes.iterChanges((from, to, _a, _b, inserted) =>
          changed.push([from, to, inserted.toString()]),
        ),
      ),
    );
    view.dispatch({ selection: { anchor: 10 } });
    document.load("One\nTwo and a half\nThree\n");
    expect(changed).toEqual([[7, 7, " and a half"]]);
    expect(view.state.doc.toString()).toBe("One\nTwo and a half\nThree\n");
    // The caret stays in "Three".
    expect(view.state.selection.main.head).toBe(21);
    expect(document.text()).toBe("One\nTwo and a half\nThree\n");
  });

  it("takes a loaded text's kind of line ending, its lines being the same", () => {
    const document = new NoteDocument("One\nTwo\n");
    const view = editorOf(document);
    const changes: boolean[] = [];
    document.onChange(({ loaded }) => changes.push(loaded));
    document.load("One\r\nTwo\r\n");
    expect(changes).toEqual([]);
    expect(document.text()).toBe("One\r\nTwo\r\n");
    type(view, "Three");
    expect(document.text()).toBe("One\r\nTwo\r\nThree");
  });

  it("does not undo a loaded text, and still undoes what was typed before it", () => {
    const document = new NoteDocument("One");
    const view = editorOf(document);
    type(view, " Two");
    document.load("Zero One Two");
    expect(document.undo(view)).toBe(true);
    expect(document.text()).toBe("Zero One");
    expect(document.undo(view)).toBe(false);
  });

  it("leaves an editor taken out of the note as it was", () => {
    const document = new NoteDocument("One");
    const first = editorOf(document);
    const view = new EditorView({
      dispatchTransactions: document.dispatchTransactions,
      state: EditorState.create({ doc: document.doc }),
    });
    views.push(view);
    const detach = document.attach(view);
    detach();
    type(first, " Two");
    expect(view.state.doc.toString()).toBe("One");
  });
});
