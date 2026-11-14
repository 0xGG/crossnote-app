import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  type EditorState,
  type Line,
  type StateCommand,
} from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

// The keys of a table: Tab and Shift+Tab go from cell to cell, Tab in the
// last cell starts a new row, and Enter starts a new row under the caret's,
// or ends the table when that row is empty. A table's columns are not put in
// line: its text stays as typed.

interface Cell {
  // Between the bars around the cell.
  from: number;
  to: number;
}

// The cells of a row, by its bars: one that a backslash comes before is
// text. A row need not start or end with a bar.
function cellsOf(line: Line, start: number): Cell[] {
  const bars: number[] = [];
  for (let i = start - line.from; i < line.text.length; i++) {
    if (line.text[i] === "\\") {
      i++;
    } else if (line.text[i] === "|") {
      bars.push(line.from + i);
    }
  }
  const end = line.from + line.text.trimEnd().length;
  const edges = [
    ...(bars[0] === start ? [] : [start - 1]),
    ...bars,
    ...(bars[bars.length - 1] === end - 1 ? [] : [end]),
  ];
  const cells: Cell[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    cells.push({ from: edges[i] + 1, to: edges[i + 1] });
  }
  return cells;
}

function tableAt(state: EditorState, pos: number): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  for (
    let node: SyntaxNode | null = tree.resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (node.name === "Table") {
      return node;
    }
  }
  // At the start of a row, the table is what comes after the place.
  for (
    let node: SyntaxNode | null = tree.resolveInner(pos, 1);
    node;
    node = node.parent
  ) {
    if (node.name === "Table") {
      return node;
    }
  }
  return null;
}

// The selection that puts the caret in a cell: its text selected, or the
// caret after the space that follows its bar when it has none.
function inCell(state: EditorState, cell: Cell) {
  const text = state.sliceDoc(cell.from, cell.to);
  const trimmed = text.trim();
  if (!trimmed) {
    return EditorSelection.cursor(cell.from + (text.length ? 1 : 0));
  }
  const from = cell.from + text.indexOf(trimmed);
  return EditorSelection.range(from, from + trimmed.length);
}

function emptyRow(indent: string, columns: number) {
  return `${indent}|${"   |".repeat(Math.max(columns, 1))}`;
}

function context(state: EditorState) {
  const { main } = state.selection;
  if (state.selection.ranges.length !== 1) {
    return null;
  }
  const table = tableAt(state, main.head);
  if (!table) {
    return null;
  }
  const line = state.doc.lineAt(main.head);
  const first = state.doc.lineAt(table.from);
  const last = state.doc.lineAt(table.to);
  const delimiter = table.getChild("TableDelimiter")!;
  const delimiterLine = state.doc.lineAt(delimiter.from);
  // The parser has already separated quote/list markers from row content.
  // The delimiter row carries the continuation prefix, even when the
  // header starts a list item with a bullet or number.
  const starts = new Map(
    [
      table.getChild("TableHeader")!,
      delimiter,
      ...table.getChildren("TableRow"),
    ].map((row) => [state.doc.lineAt(row.from).number, row.from]),
  );
  const rowCells = (line: Line) => cellsOf(line, starts.get(line.number)!);
  const cells = rowCells(line);
  // The cell the caret is in or at the end of; before the first bar, none.
  let index = -1;
  for (let i = 0; i < cells.length; i++) {
    if (main.head >= cells[i].from) {
      index = i;
    }
  }
  return {
    line,
    first,
    last,
    cells,
    index,
    columns: rowCells(first).length,
    indent: state.sliceDoc(delimiterLine.from, delimiter.from),
    rowCells,
    rowStart: starts.get(line.number)!,
    isDelimiter: (line: Line) => line.number === delimiterLine.number,
  };
}

function move(step: 1 | -1): StateCommand {
  return ({ state, dispatch }) => {
    const at = context(state);
    if (!at) {
      return false;
    }
    let { line } = at;
    let cells = at.cells;
    let index = at.index + step;
    // Past the row's end or start: the nearest row that is not the one of
    // dashes under the header.
    while (index < 0 || index >= cells.length) {
      const number = line.number + step;
      if (number < at.first.number) {
        return true;
      }
      if (number > at.last.number) {
        if (state.readOnly) {
          return true;
        }
        const row = emptyRow(at.indent, at.columns);
        dispatch(
          state.update({
            changes: { from: at.last.to, insert: `${state.lineBreak}${row}` },
            selection: EditorSelection.cursor(
              at.last.to + state.lineBreak.length + at.indent.length + 2,
            ),
            scrollIntoView: true,
            userEvent: "input",
          }),
        );
        return true;
      }
      line = state.doc.line(number);
      if (at.isDelimiter(line)) {
        continue;
      }
      cells = at.rowCells(line);
      index = step === 1 ? 0 : cells.length - 1;
      if (!cells.length) {
        return true;
      }
    }
    dispatch(
      state.update({
        selection: EditorSelection.create([inCell(state, cells[index])]),
        scrollIntoView: true,
        userEvent: "select",
      }),
    );
    return true;
  };
}

/** Tab in a table: to the next cell, or a new row after the last. */
export const nextTableCell = move(1);

/** Shift+Tab in a table: to the cell before. */
export const previousTableCell = move(-1);

/**
 * Enter in a table: a new row under the caret's (under the dashes, from the
 * header), or, from a row with nothing in its cells, the end of the table:
 * the row gives way to an empty line.
 */
export const continueTable: StateCommand = ({ state, dispatch }) => {
  const at = context(state);
  if (!at || state.readOnly || !state.selection.main.empty) {
    return false;
  }
  const { line } = at;
  const isHeader = line.number === at.first.number;
  if (
    !isHeader &&
    !at.isDelimiter(line) &&
    at.cells.every(({ from, to }) => !state.sliceDoc(from, to).trim())
  ) {
    dispatch(
      state.update({
        changes: { from: at.rowStart, to: line.to },
        selection: EditorSelection.cursor(at.rowStart),
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }
  const after =
    isHeader && at.last.number > at.first.number
      ? state.doc.line(at.first.number + 1)
      : line;
  dispatch(
    state.update({
      changes: {
        from: after.to,
        insert: `${state.lineBreak}${emptyRow(at.indent, at.columns)}`,
      },
      selection: EditorSelection.cursor(
        after.to + state.lineBreak.length + at.indent.length + 2,
      ),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};
