import type { MarkdownIt } from "markdown-it";
import { normalizeBlockInfo, parseBlockInfo } from "./blockInfo";

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

// A code block: its code, escaped, with what its info string says in
// attributes, for the preview to highlight it or draw it as a diagram.
// Mermaid and wavedrom blocks are divs, their source in them as text.
export default function fence(md: MarkdownIt) {
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info.trim();
    const parsedInfo = parseBlockInfo(info);
    const normalizedInfo = normalizeBlockInfo(parsedInfo);
    const content = escapeString(token.content);
    const finalBreak =
      idx < tokens.length && tokens[idx].type === "list_item_close" ? "\n" : "";
    const infoAttributes = `data-parsed-info="${escapeString(JSON.stringify(parsedInfo))}" data-normalized-info="${escapeString(JSON.stringify(normalizedInfo))}"`;
    if (
      parsedInfo.language === "mermaid" ||
      parsedInfo.language === "wavedrom"
    ) {
      return `<div class="vickeymd-fence ${parsedInfo.language}" ${infoAttributes}>${content}</div>`;
    }
    return `<pre data-role="codeBlock" class="vickeymd-fence" data-info="${escapeString(info)}" ${infoAttributes}>${content}</pre>${finalBreak}`;
  };
}
