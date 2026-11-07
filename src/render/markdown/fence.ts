import type { MarkdownIt } from "markdown-it";

const TAGS_TO_REPLACE: { [char: string]: string } = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "\\": "&#x5C;",
};

export function escapeString(str = "") {
  return str.replace(/[&<>"'/\\]/g, (tag) => TAGS_TO_REPLACE[tag] || tag);
}

// A code block: its code, escaped, with the language its info string names
// first (anything after it, as ```js {cmd=true} has, means nothing), for
// the preview to highlight it or draw it as a diagram. Mermaid blocks are
// divs, their source in them as text.
export default function fence(md: MarkdownIt) {
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const language = token.info.trim().match(/^[^\s{]*/)[0];
    const content = escapeString(token.content);
    const finalBreak =
      idx < tokens.length && tokens[idx].type === "list_item_close" ? "\n" : "";
    if (language === "mermaid") {
      return `<div class="vickeymd-fence mermaid" data-language="mermaid">${content}</div>`;
    }
    return `<pre class="vickeymd-fence" data-language="${escapeString(language)}">${content}</pre>${finalBreak}`;
  };
}
