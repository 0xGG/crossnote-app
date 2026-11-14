// A place in an editor's text: the line, counted from 0, and the column on it
// in UTF-16 code units, the way JavaScript measures a string.
export type TextPosition = { line: number; ch: number };

// The few things the end-to-end tests do to an editor and read back from it.
// The app hangs one on the root element of each editor it makes, the element
// its test id names (noteEditor.ts), so that the tests drive the editor
// without knowing what it is made of. A change made through it is a change
// of the editor's text like any other, which the app answers as it answers
// typing.
export interface EditorHandle {
  // The whole text of the note the editor shows, as it would be written to
  // the note's file, line endings included.
  text(): string;
  // Puts text in place of all of it as one change. Where the caret is
  // afterwards is up to the editor, so a test that goes on to type puts it
  // somewhere first.
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
  // holds this text with, as the editor names them ("keyword", "strong" and
  // so on): none where that piece is drawn plain or inside a widget, or
  // where no single piece holds the text (it runs across two tokens, or is
  // not drawn). What is drawn, not what the editor would work out: a
  // language arriving changes it only once the editor has drawn the text
  // again.
  tokenTypes(text: string): string[];
}

// The element the handle hangs on.
export type EditorHost = HTMLElement & { editorHandle: EditorHandle };
