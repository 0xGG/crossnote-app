import { syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { classHighlighter, tagHighlighter, tags } from "@lezer/highlight";
import "../render/preview-theme.css";
import "./editor-theme.css";

// The names the standard class highlighter leaves out, and markdown uses.
const markdownHighlighter = tagHighlighter([
  { tag: tags.heading1, class: "tok-heading1" },
  { tag: tags.heading2, class: "tok-heading2" },
  { tag: tags.heading3, class: "tok-heading3" },
  { tag: tags.heading4, class: "tok-heading4" },
  { tag: tags.heading5, class: "tok-heading5" },
  { tag: tags.heading6, class: "tok-heading6" },
  { tag: tags.strikethrough, class: "tok-strikethrough" },
  { tag: tags.monospace, class: "tok-monospace" },
  { tag: tags.quote, class: "tok-quote" },
  { tag: tags.contentSeparator, class: "tok-rule" },
  { tag: tags.processingInstruction, class: "tok-markup" },
  { tag: tags.list, class: "tok-list" },
  { tag: tags.tagName, class: "tok-tagName" },
  { tag: tags.attributeName, class: "tok-attributeName" },
]);

const MONOSPACE =
  'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// One look for the four themes: every colour is a variable the page sets by
// theme. The editor's root has one of three classes, by how it shows a note:
// cn-editor-live (markup hidden where the caret is not), cn-editor-source
// (markup shown, with the text's typography) and cn-editor-plain (markup
// shown, as plain text in one size).
const look = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "16px",
    color: "var(--preview-text)",
    backgroundColor: "var(--preview-background)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Noto Sans SC", "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    lineHeight: "1.6",
  },
  "&.cn-editor-plain .cm-scroller": { fontFamily: MONOSPACE },
  ".cm-content": {
    padding: "16px 0",
    caretColor: "var(--preview-strong)",
  },
  ".cm-line": { padding: "0 16px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--preview-strong)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--editor-selection)" },
  ".cm-gutters": {
    color: "var(--editor-gutter)",
    backgroundColor: "var(--preview-background)",
    border: "none",
    fontFamily: MONOSPACE,
    fontSize: "13px",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 16px" },

  ".tok-strong": { fontWeight: "600", color: "var(--preview-strong)" },
  ".tok-emphasis": { fontStyle: "italic" },
  ".tok-strikethrough": {
    textDecoration: "line-through",
    color: "var(--preview-subtle)",
  },
  ".tok-monospace": { fontFamily: MONOSPACE },
  ".tok-link, .tok-url": { color: "var(--preview-link)" },
  ".tok-quote": { color: "var(--preview-subtle)" },
  ".tok-markup, .tok-rule": { color: "var(--editor-markup)" },
  ".tok-heading": {
    fontWeight: "600",
    color: "var(--preview-strong)",
    lineHeight: "1.2",
  },
  "&:not(.cn-editor-plain) .tok-heading1": { fontSize: "2.25rem" },
  "&:not(.cn-editor-plain) .tok-heading2": { fontSize: "1.75rem" },
  "&:not(.cn-editor-plain) .tok-heading3": { fontSize: "1.5rem" },
  "&:not(.cn-editor-plain) .tok-heading4": { fontSize: "1.24rem" },

  ".tok-keyword": { color: "var(--editor-keyword)" },
  ".tok-atom, .tok-bool, .tok-literal": { color: "var(--editor-atom)" },
  ".tok-number": { color: "var(--editor-number)" },
  ".tok-string": { color: "var(--editor-string)" },
  ".tok-string2": { color: "var(--editor-string-2)" },
  ".tok-comment": { color: "var(--editor-comment)" },
  ".tok-meta": { color: "var(--editor-meta)" },
  ".tok-operator": { color: "var(--editor-operator)" },
  ".tok-variableName": { color: "var(--editor-variable)" },
  ".tok-variableName.tok-definition, .tok-propertyName.tok-definition, .tok-macroName":
    { color: "var(--editor-definition)" },
  ".tok-typeName, .tok-className, .tok-namespace, .tok-labelName": {
    color: "var(--editor-type)",
  },
  ".tok-tagName": { color: "var(--editor-tag)" },
  ".tok-attributeName": { color: "var(--editor-attribute)" },
  ".tok-invalid": { color: "red" },
});

/** The editor's look, and the classes it draws tokens with ("tok-…"). */
export const editorTheme: Extension = [
  look,
  syntaxHighlighting(classHighlighter),
  syntaxHighlighting(markdownHighlighter),
];
