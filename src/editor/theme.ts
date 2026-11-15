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

const MONOSPACE = "var(--note-code-font)";

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
    fontFamily: "var(--note-text-font)",
    lineHeight: "1.5",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },
  ".cm-content": {
    padding: "4px 0",
    caretColor: "var(--preview-strong)",
  },
  ".cm-line": { padding: "0 var(--note-inline-padding)" },
  ".cn-selected-text, .cn-selected-text *, .cn-selected-empty": {
    backgroundColor: "var(--editor-selection) !important",
  },
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

  ".tok-strong": { fontWeight: "700", color: "var(--preview-strong)" },
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
  ".cm-line.cn-heading-line": { lineHeight: "1.2", fontWeight: "600" },
  ".cm-line.cn-heading-1": { fontSize: "2.25rem", paddingBottom: "0.3rem" },
  ".cm-line.cn-heading-2": { fontSize: "1.75rem", paddingBottom: "0.3rem" },
  ".cm-line.cn-heading-3": { fontSize: "1.5rem" },
  ".cm-line.cn-heading-4": { fontSize: "1.24rem" },
  ".cm-line.cn-heading-5, .cm-line.cn-heading-6": { fontSize: "1rem" },

  ".tok-wikiLink, .tok-footnote, .tok-hashtag": {
    color: "var(--preview-link)",
  },
  ".tok-math": { color: "var(--editor-number)" },
  ".tok-marked": { backgroundColor: "#ff0", color: "#000" },
  ".tok-inserted": { textDecoration: "underline" },

  // The live preview's own (livePreview.ts).
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
    fontSize: "16px",
  },
  ".cm-line.cn-table": { fontFamily: MONOSPACE, fontSize: "0.9em" },
  ".cm-line.cn-quote": {
    borderLeft: "4px solid var(--preview-border)",
    marginLeft: "calc(var(--note-inline-padding) + var(--cn-quote-inset, 0px))",
    marginRight: "var(--note-inline-padding)",
    paddingLeft: "calc(15px + (var(--cn-quote-depth) - 1) * 19px)",
    paddingRight: "15px",
    backgroundColor: "var(--preview-inset-background)",
    backgroundImage:
      "repeating-linear-gradient(to right, var(--preview-border) 0 4px, transparent 4px 19px)",
    backgroundPosition: "15px 0",
    backgroundSize: "calc((var(--cn-quote-depth) - 1) * 19px) 100%",
    backgroundRepeat: "no-repeat",
    color: "var(--preview-subtle)",
  },
  ".cn-source-code": { fontFamily: MONOSPACE },
  ".cn-code-preview": {
    padding: "0 var(--note-inline-padding)",
    cursor: "text",
    userSelect: "text",
    whiteSpace: "normal",
  },
  ".cn-code-preview pre": { marginBottom: "0" },
  ".cn-code-preview blockquote, .cn-code-preview ul, .cn-code-preview ol": {
    marginTop: "0",
    marginBottom: "0",
  },
  ".cn-list-marker": {
    display: "inline-block",
    width: "2em",
    textIndent: "0",
    boxSizing: "border-box",
  },
  ".cn-list-marker-native": {
    display: "list-item",
    listStylePosition: "outside",
    marginLeft: "2em",
    width: "0",
  },
  ".cn-list-marker-native::before": { content: '"\\200b"' },
  ".cn-rule": {
    display: "inline-block",
    width: "100%",
    height: "4px",
    backgroundColor: "var(--preview-border)",
    verticalAlign: "middle",
  },
  ".cm-line.cn-setext-mark": { fontSize: "16px", lineHeight: "1.5" },
  ".cn-setext-mark .tok-heading": {
    fontSize: "inherit",
    lineHeight: "inherit",
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
