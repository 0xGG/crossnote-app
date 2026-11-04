import type { MarkdownIt, Token } from "markdown-it";

// A list item whose text starts with [ ] or [x] is a task: the box becomes a
// checkbox, read-only, carrying the item's line (0-based), and the item gets
// the class task-list-item. Ticking a task is done in the editor.
export default function taskLists(md: MarkdownIt) {
  md.core.ruler.after("text_join", "task_lists", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      const item = tokens[i];
      const inline = tokens[i + 2];
      if (
        item.type !== "list_item_open" ||
        tokens[i + 1].type !== "paragraph_open" ||
        inline.type !== "inline"
      ) {
        continue;
      }
      // The box as the note writes it: an escaped "\[" is a plain "[" in the
      // text by now, and is not a box.
      const first = inline.children?.[0];
      const box = /^\[([ \txX])\][ \t]/.exec(inline.content);
      if (first?.type !== "text" || !box || !first.content.startsWith(box[0])) {
        continue;
      }
      first.content = first.content.slice(box[0].length);
      const checkbox: Token = new state.Token("task_checkbox", "input", 0);
      checkbox.meta = {
        checked: box[1] === "x" || box[1] === "X",
        line: item.map?.[0] ?? 0,
      };
      inline.children!.unshift(checkbox);
      item.attrJoin("class", "task-list-item");
    }
  });

  md.renderer.rules.task_checkbox = (tokens, idx) => {
    const { checked, line } = tokens[idx].meta as {
      checked: boolean;
      line: number;
    };
    return `<input type="checkbox" class="task-list-item-checkbox" data-line="${line}" disabled${checked ? " checked" : ""}> `;
  };
}
