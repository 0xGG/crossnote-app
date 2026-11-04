import type { MarkdownIt } from "markdown-it";

// What ends a block reference.
const BlockReferenceStopRegExp = /[\s@#,.!$%^&*()[\]_+=~`<>?\\，。]/;

// ^name at the end of a line: the block's name, for links to point to.
export default function blockReference(md: MarkdownIt) {
  md.inline.ruler.before("escape", "block_reference", (state) => {
    if (!(
      (state.src[state.pos - 1] || "").match(/(^|\s)$/) &&
      state.src[state.pos] === "^" &&
      !state.src[state.pos + 1].match(BlockReferenceStopRegExp)
    )) {
      return false;
    }
    let end = -1;
    let i = state.pos + 1;
    while (i < state.src.length) {
      if (state.src[i].match(BlockReferenceStopRegExp)) {
        if (state.src[i] !== "\n") {
          return false;
        }
        end = i;
        break;
      } else if (state.src[i] === "\\") {
        i += 1;
      }
      i += 1;
    }
    if (end === -1) {
      end = i;
    }
    const content = state.src.slice(state.pos, end);
    const token = state.push("block_reference", "", 0);
    token.content = content;
    token.attrPush(["id", content.slice(1)]);
    state.pos = end;
    return true;
  });

  md.renderer.rules.block_reference = (tokens, idx) => {
    const token = tokens[idx];
    const content = token.content || "";
    const id = token.attrGet("id") || "";
    return `<span class="block-reference" id="${id}">${content}</span>`;
  };
}
