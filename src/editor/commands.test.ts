import {
  EditorSelection,
  EditorState,
  type StateCommand,
} from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { indentation, indentOrTab, outdent, toggleMark } from "./commands";

// Runs a command on a text in which "|" stands for the caret, or a pair of
// them for the ends of the selection; gives the text it leaves, marked the
// same way, or undefined where the command did nothing.
function run(command: StateCommand, marked: string, readOnly = false) {
  const anchor = marked.indexOf("|");
  const rest = marked.slice(0, anchor) + marked.slice(anchor + 1);
  const second = rest.indexOf("|", anchor);
  const doc =
    second < 0 ? rest : rest.slice(0, second) + rest.slice(second + 1);
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, second < 0 ? anchor : second),
    extensions: [EditorState.readOnly.of(readOnly), indentation],
  });
  const ran = command({
    state,
    dispatch: (transaction) => {
      state = transaction.state;
    },
  });
  if (!ran) {
    return undefined;
  }
  const { from, to } = state.selection.main;
  const text = state.doc.toString();
  return from === to
    ? `${text.slice(0, from)}|${text.slice(from)}`
    : `${text.slice(0, from)}|${text.slice(from, to)}|${text.slice(to)}`;
}

describe("toggleMark", () => {
  const strong = toggleMark("**");
  const emphasis = toggleMark("*");
  const struck = toggleMark("~~");

  it("puts the mark around what is selected, and keeps it selected", () => {
    expect(run(strong, "a |word| b")).toBe("a **|word|** b");
    expect(run(emphasis, "a |word| b")).toBe("a *|word|* b");
    expect(run(struck, "a |word| b")).toBe("a ~~|word|~~ b");
  });

  it("takes the mark away from around what is selected", () => {
    expect(run(strong, "a **|word|** b")).toBe("a |word| b");
    expect(run(emphasis, "a *|word|* b")).toBe("a |word| b");
    expect(run(struck, "a ~~|word|~~ b")).toBe("a |word| b");
  });

  it("takes the mark away when it is selected with the text", () => {
    expect(run(strong, "a |**word**| b")).toBe("a |word| b");
    expect(run(emphasis, "a |*word*| b")).toBe("a |word| b");
    expect(run(struck, "a |~~word~~| b")).toBe("a |word| b");
  });

  it("types an empty pair around the caret, and takes it away again", () => {
    expect(run(strong, "a | b")).toBe("a **|** b");
    expect(run(strong, "a **|** b")).toBe("a | b");
    expect(run(emphasis, "a | b")).toBe("a *|* b");
    expect(run(emphasis, "a *|* b")).toBe("a | b");
  });

  it("tells emphasis from strong by how many asterisks stand together", () => {
    // Strong text made emphasis as well, and back.
    expect(run(emphasis, "**|word|**")).toBe("***|word|***");
    expect(run(emphasis, "***|word|***")).toBe("**|word|**");
    // Emphasis made strong as well, and back.
    expect(run(strong, "*|word|*")).toBe("***|word|***");
    expect(run(strong, "***|word|***")).toBe("*|word|*");
  });

  it("marks each of several selections", () => {
    let state = EditorState.create({
      doc: "one two",
      selection: EditorSelection.create([
        EditorSelection.range(0, 3),
        EditorSelection.range(4, 7),
      ]),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    });
    strong({
      state,
      dispatch: (transaction) => {
        state = transaction.state;
      },
    });
    expect(state.doc.toString()).toBe("**one** **two**");
    expect(
      state.selection.ranges.map(({ from, to }) => state.sliceDoc(from, to)),
    ).toEqual(["one", "two"]);
  });

  it("leaves a read-only text alone", () => {
    expect(run(strong, "a |word| b", true)).toBeUndefined();
  });
});

describe("indentOrTab", () => {
  it("counts existing tabs and Unicode characters by display columns", () => {
    expect(run(indentOrTab, "\t|text")).toBe("\t    |text");
    expect(run(indentOrTab, "\ta|text")).toBe("\ta   |text");
    expect(run(indentOrTab, "😀|text")).toBe("😀   |text");
  });
  it("types spaces up to the next stop, four columns apart", () => {
    expect(run(indentOrTab, "|text")).toBe("    |text");
    expect(run(indentOrTab, "a|b")).toBe("a   |b");
    expect(run(indentOrTab, "abcd|")).toBe("abcd    |");
  });

  it("indents the list item the caret is in", () => {
    expect(run(indentOrTab, "- one\n- tw|o")).toBe("- one\n    - tw|o");
    expect(run(indentOrTab, "1. one\n2. tw|o")).toBe("1. one\n    2. tw|o");
    expect(run(indentOrTab, "- [ ] to |do")).toBe("    - [ ] to |do");
  });

  it("indents the lines of a selection", () => {
    expect(run(indentOrTab, "o|ne\ntw|o")).toBe("    o|ne\n    tw|o");
  });

  it("leaves a read-only text alone", () => {
    expect(run(indentOrTab, "|text", true)).toBeUndefined();
  });
});

describe("outdent", () => {
  it("takes one step of indentation from the caret's line", () => {
    expect(run(outdent, "- one\n    - tw|o")).toBe("- one\n- tw|o");
  });

  it("leaves a read-only text alone", () => {
    expect(run(outdent, "    te|xt", true)).toBeUndefined();
  });
});
