import { ensureSyntaxTree, forceParsing } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  type Extension,
  type StateCommand,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// For the editor's tests: a text written with "¦" where the caret is, or a
// pair of them at the ends of the selection.

/** The state of a text so marked, read by its language to the end. */
export function stateOf(marked: string, extensions: Extension = []) {
  marked = marked.replace(/\r\n?/g, "\n");
  const anchor = marked.indexOf("¦");
  if (anchor < 0) {
    throw new Error("no caret in the text");
  }
  const rest = marked.slice(0, anchor) + marked.slice(anchor + 1);
  const head = rest.indexOf("¦", anchor);
  const doc = head < 0 ? rest : rest.slice(0, head) + rest.slice(head + 1);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head < 0 ? anchor : head),
    extensions,
  });
  // A state starts with what its language read in a few milliseconds, which
  // on a busy machine is not all of a text; the rest is read here, and the
  // state after one more (empty) step is the one that has it.
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state.update({}).state;
}

/** A state's text, marked the same way. */
export function markedOf(state: EditorState) {
  const { from, to } = state.selection.main;
  const text = state.doc.toString();
  return from === to
    ? `${text.slice(0, from)}¦${text.slice(from)}`
    : `${text.slice(0, from)}¦${text.slice(from, to)}¦${text.slice(to)}`;
}

/**
 * Runs a command on a marked text; gives the text it leaves, marked, or
 * undefined where the command did nothing.
 */
export function run(
  command: StateCommand,
  marked: string,
  extensions: Extension = [],
) {
  let state = stateOf(marked, extensions);
  const ran = command({
    state,
    dispatch: (transaction) => {
      state = transaction.state;
    },
  });
  return ran ? markedOf(state) : undefined;
}

/**
 * Has an editor's language read the whole of its text now, and the editor
 * draw what it read. An editor starts with what its language read in a few
 * milliseconds and reads the rest when the page is idle, which a test that
 * looks at what is drawn straight away does not wait for.
 */
export function readToEnd(view: EditorView) {
  if (!forceParsing(view, view.state.doc.length, 5000)) {
    throw new Error("The editor's language did not read the text to its end");
  }
}
