import type { MarkdownIt } from "markdown-it";

// The blocks that carry the line of the note's text they start on, 0-based,
// in a data-line attribute: for the outline to go to a heading, and for the
// preview to find where a block stands. Code blocks do not, as Prism's
// stylesheet gives pre[data-line] the room it highlights lines in.
const blocks = new Set([
  "paragraph_open",
  "heading_open",
  "blockquote_open",
  "bullet_list_open",
  "ordered_list_open",
  "list_item_open",
  "table_open",
  "tr_open",
  "hr",
]);

export default function lines(md: MarkdownIt) {
  md.core.ruler.after("block", "block_lines", (state) => {
    for (const token of state.tokens) {
      if (blocks.has(token.type) && token.map) {
        token.attrSet("data-line", String(token.map[0]));
      }
    }
  });
}
