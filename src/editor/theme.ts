import { syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { classHighlighter, tagHighlighter, tags } from "@lezer/highlight";
import "../render/preview-theme.css";
import "./editor-theme.css";
import { noteTags } from "./syntax";

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
  { tag: noteTags.math, class: "tok-math" },
  { tag: noteTags.wikiLink, class: "tok-wikiLink" },
  { tag: noteTags.hashtag, class: "tok-hashtag" },
  { tag: noteTags.footnote, class: "tok-footnote" },
  { tag: noteTags.marked, class: "tok-marked" },
  { tag: noteTags.inserted, class: "tok-inserted" },
]);

const MONOSPACE =
  'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// One look for the four themes: every colour is a variable the page sets by
// theme. The editor's root has one of two classes, by how it shows a note:
// cn-editor-live (markup hidden where the caret is not, headings in their
// sizes) and cn-editor-source (every character shown, in one size and the
// text's own font).
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
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },
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
  "&.cn-editor-live .tok-heading1": { fontSize: "2.25rem" },
  "&.cn-editor-live .tok-heading2": { fontSize: "1.75rem" },
  "&.cn-editor-live .tok-heading3": { fontSize: "1.5rem" },
  "&.cn-editor-live .tok-heading4": { fontSize: "1.24rem" },

  ".tok-wikiLink, .tok-footnote, .tok-hashtag": {
    color: "var(--preview-link)",
  },
  ".tok-math": { color: "var(--editor-number)" },
  ".tok-marked": { backgroundColor: "#ff0", color: "#000" },
  ".tok-inserted": { textDecoration: "underline" },

  // The live preview's own (livePreview.ts).
  ".cn-code": {
    fontFamily: MONOSPACE,
    fontSize: "0.85em",
    backgroundColor: "var(--preview-inset-background)",
    borderRadius: "3px",
    padding: "0.2em 0",
  },
  ".cn-sub": { verticalAlign: "sub", fontSize: "0.8em" },
  ".cn-sup": { verticalAlign: "super", fontSize: "0.8em" },
  ".cn-link": { color: "var(--preview-link)" },
  ".cn-hashtag, .cn-hashtag .tok-hashtag": {
    color: "var(--preview-tag-text)",
  },
  ".cn-hashtag": {
    backgroundColor: "var(--preview-tag-background)",
    borderRadius: "4px",
    padding: "0 4px",
    fontSize: "0.9em",
  },
  ".cn-math-source": { fontFamily: MONOSPACE, fontSize: "0.9em" },
  ".cn-math-display": {
    display: "inline-block",
    width: "100%",
    textAlign: "center",
  },
  ".cn-math-error": { color: "#ee7f49", fontWeight: "500" },
  ".cn-image": { maxWidth: "100%", verticalAlign: "bottom", cursor: "pointer" },
  ".cn-emoji img.emoji": {
    height: "1.2em",
    width: "1.2em",
    verticalAlign: "-0.2em",
  },
  ".cn-task": {
    margin: "0 0.4em 0 0",
    verticalAlign: "middle",
    cursor: "pointer",
  },
  ".cm-line.cn-codeblock": {
    fontFamily: MONOSPACE,
    fontSize: "0.85em",
    backgroundColor: "var(--preview-inset-background)",
  },
  ".cm-line.cn-table": { fontFamily: MONOSPACE, fontSize: "0.9em" },
  ".cm-line.cn-quote": {
    borderLeft: "4px solid var(--preview-border)",
    paddingLeft: "12px",
    color: "var(--preview-subtle)",
  },
  ".cm-line.cn-frontmatter": {
    fontFamily: MONOSPACE,
    fontSize: "0.85em",
    color: "var(--preview-subtle)",
  },

  // The list of completions (completion.ts).
  ".cm-tooltip": {
    color: "var(--preview-text)",
    backgroundColor: "var(--preview-background)",
    border: "1px solid var(--preview-border)",
    borderRadius: "4px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "inherit",
    maxHeight: "18em",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    padding: "6px 8px",
    minWidth: "200px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--editor-selection)",
    color: "var(--preview-strong)",
  },
  ".cm-tooltip.cn-math-preview": { padding: "4px 12px", maxWidth: "70vw" },
  ".cm-placeholder": { color: "var(--preview-subtle)", opacity: "0.7" },
  ".cn-completion-icon": {
    display: "inline-flex",
    width: "1.5em",
    marginRight: "6px",
    justifyContent: "center",
  },
  ".cn-completion-icon svg": { width: "1.2em", height: "1.2em" },
  ".cm-completionDetail": {
    marginLeft: "auto",
    paddingLeft: "1em",
    fontStyle: "normal",
    fontSize: "0.8em",
    color: "var(--preview-subtle)",
  },

  ".tok-keyword": { color: "var(--editor-keyword)" },
  ".tok-atom, .tok-bool, .tok-literal": { color: "var(--editor-atom)" },
  ".tok-number": { color: "var(--editor-number)" },
  ".tok-string": { color: "var(--editor-string)" },
  ".tok-string2": { color: "var(--editor-string-2)" },
  ".tok-comment": { color: "var(--editor-comment)" },
  ".tok-meta": { color: "var(--editor-meta)" },
  // Markdown's own marks are a kind of meta to the highlighter, and are
  // drawn quieter than a language's.
  ".tok-meta.tok-markup, .tok-markup .tok-meta, .tok-meta .tok-markup": {
    color: "var(--editor-markup)",
  },
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
