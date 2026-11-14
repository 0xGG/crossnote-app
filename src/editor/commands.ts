import { indentLess, indentMore } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import {
  EditorSelection,
  countColumn,
  type ChangeSpec,
  type EditorState,
  type StateCommand,
} from "@codemirror/state";

// How many of a mark's character stand in a row before a place, or after it.
function run(state: EditorState, at: number, char: string, step: 1 | -1) {
  let count = 0;
  for (
    let pos = step === 1 ? at : at - 1;
    pos >= 0 && pos < state.doc.length && state.sliceDoc(pos, pos + 1) === char;
    pos += step
  ) {
    count++;
  }
  return count;
}

// Whether a row of that many of the mark's character holds the mark: for
// "**" two or more, for "*" one, or three and more (one of them beside "**").
function holds(mark: string, count: number) {
  return mark.length === 1 ? count === 1 || count >= 3 : count >= mark.length;
}

/**
 * Puts a mark ("**", "*", "~~") around each selection, or takes it away where
 * the selection already has it around it, inside or just outside. With
 * nothing selected the pair is typed with the caret between, and taken away
 * again while it is still empty.
 */
export function toggleMark(mark: string): StateCommand {
  const char = mark[0];
  return ({ state, dispatch }) => {
    if (state.readOnly) {
      return false;
    }
    const transaction = state.changeByRange((range) => {
      const { from, to } = range;
      const text = state.sliceDoc(from, to);
      const size = mark.length;
      // Inside the selection: **text** selected whole.
      if (
        text.length >= size * 2 &&
        text.startsWith(mark) &&
        text.endsWith(mark) &&
        holds(mark, run(state, from, char, 1)) &&
        holds(mark, run(state, to, char, -1))
      ) {
        return {
          changes: [
            { from, to: from + size },
            { from: to - size, to },
          ],
          range: EditorSelection.range(from, to - size * 2),
        };
      }
      // Just outside it: the text between the marks selected, or the caret
      // in an empty pair.
      if (
        holds(mark, run(state, from, char, -1)) &&
        holds(mark, run(state, to, char, 1))
      ) {
        return {
          changes: [
            { from: from - size, to: from },
            { from: to, to: to + size },
          ],
          range: EditorSelection.range(from - size, to - size),
        };
      }
      const changes: ChangeSpec[] = [
        { from, insert: mark },
        { from: to, insert: mark },
      ];
      return {
        changes,
        range: EditorSelection.range(from + size, to + size),
      };
    });
    dispatch(
      state.update(transaction, { scrollIntoView: true, userEvent: "input" }),
    );
    return true;
  };
}

/** One step of indentation: four spaces, enough to nest under any list item. */
export const indentation = indentUnit.of("    ");

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/**
 * Tab: indents the lines of a selection, or the list item the caret is in;
 * anywhere else types spaces up to the next stop, four columns apart.
 */
export const indentOrTab: StateCommand = (target) => {
  const { state, dispatch } = target;
  if (state.readOnly) {
    return false;
  }
  if (
    state.selection.ranges.some(
      (range) =>
        !range.empty || LIST_ITEM.test(state.doc.lineAt(range.head).text),
    )
  ) {
    return indentMore(target);
  }
  dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.head);
        const column = countColumn(
          state.sliceDoc(line.from, range.head),
          state.tabSize,
        );
        const spaces = " ".repeat(4 - (column % 4));
        return {
          changes: { from: range.head, insert: spaces },
          range: EditorSelection.cursor(range.head + spaces.length),
        };
      }),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
};

export const outdent: StateCommand = (target) =>
  !target.state.readOnly && indentLess(target);
