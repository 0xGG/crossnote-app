import type { Editor, Mode } from "codemirror";

export enum EditorMode {
  EchoMD = "EchoMD",
  SourceCode = "SourceCode",
  Preview = "Preview",
}

/**
 * The CodeMirror mode behind the folding editor and the styled source view.
 * HyperMD tags every line it lays out (headings, quotes, tables, code
 * blocks) with a line class that the editor themes turn into typography.
 */
export const HYPERMD_MODE = { name: "hypermd", hashtag: true };

/**
 * The stock markdown mode: syntax colors only. It emits none of the HyperMD
 * line classes, so the theme typography never applies and the source reads as
 * the plain text it is. Notes carry a YAML front matter, which the wrapper
 * mode hands to the yaml mode; markdown alone would read the closing "---" as
 * a setext heading underline. The GitHub extensions match what the notes use.
 */
export const MARKDOWN_MODE = {
  name: "yaml-frontmatter",
  base: { name: "markdown", taskLists: true, strikethrough: true, emoji: true },
};

/**
 * Picks the CodeMirror mode for an editor mode. Both modes are shared
 * constants so that callers can compare by identity.
 */
export function codeMirrorModeFor(
  editorMode: EditorMode,
  plainTextSourceCode: boolean,
): typeof HYPERMD_MODE | typeof MARKDOWN_MODE {
  return editorMode === EditorMode.SourceCode && plainTextSourceCode
    ? MARKDOWN_MODE
    : HYPERMD_MODE;
}

/**
 * Applies the mode for an editor mode to a CodeMirror instance. Setting the
 * mode option re-tokenizes the whole document, so an editor that already
 * runs the wanted mode is left alone.
 */
export function applyCodeMirrorMode(
  editor: Editor,
  editorMode: EditorMode,
  plainTextSourceCode: boolean,
): void {
  const mode = codeMirrorModeFor(editorMode, plainTextSourceCode);
  if (editor.getOption("mode") !== mode) {
    editor.setOption("mode", mode);
  }
}

/** Whether the editor runs HyperMD right now (folding editor, styled source). */
export function runsHyperMD(editor: Editor): boolean {
  return editor.getMode().name === HYPERMD_MODE.name;
}

type KeyBinding = string | ((editor: Editor) => unknown);

/**
 * Guards a HyperMD key binding. HyperMD's editing commands read HyperMD
 * parser state (list stacks, table columns, style flags); the plain text
 * mode has none of it and they throw. While the editor runs another mode the
 * plain command runs instead.
 */
export function withPlainTextFallback(
  binding: KeyBinding,
  plain: (editor: Editor) => unknown,
): (editor: Editor) => unknown {
  return (editor) => {
    if (!runsHyperMD(editor)) {
      return plain(editor);
    }
    return typeof binding === "string"
      ? editor.execCommand(binding)
      : binding(editor);
  };
}

/**
 * The parser state of a line at the markdown level, the one that knows
 * whether the line is a heading of the note. HyperMD keeps it at the top;
 * the plain text mode wraps it in the front matter mode, so that one level
 * is unwrapped. Going deeper would land in a fenced code block's own mode,
 * and a heading inside a markdown fence is not the note's.
 */
export function markdownState(mode: Mode<unknown>, state: any): any {
  return mode.name === MARKDOWN_MODE.name && mode.innerMode
    ? mode.innerMode(state).state
    : state;
}
