/**
 * How a note's panel shows the note. The first, the editor that hides markup
 * away from the caret, keeps the name of the editor it once was: the name is
 * what the settings store.
 */
export enum EditorMode {
  EchoMD = "EchoMD",
  SourceCode = "SourceCode",
  Preview = "Preview",
}
