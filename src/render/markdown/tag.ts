import type { MarkdownIt } from "markdown-it";
import { uslug } from "./slug";

// What ends a tag ("-" and "_" do not).
export const StopRegExp = /[\s@#,.!$%^&*()[\]+=~`<>?\\，。]/;

// #tag, or #tag with spaces#: a link to the notes on that topic.
export default function tag(md: MarkdownIt) {
  md.inline.ruler.before("escape", "tag", (state, silent) => {
    if (!(
      (state.src[state.pos - 1] || "").match(/(^|\s)$/) &&
      state.src[state.pos] === "#" &&
      // A "#" that ends the text is not a tag.
      !(state.src[state.pos + 1] ?? " ").match(StopRegExp)
    )) {
      return false;
    }
    let end = -1;
    let i = state.pos + 1;
    while (i < state.src.length) {
      if (state.src[i].match(StopRegExp)) {
        end = i;
        let j = i + 1;
        while (j < state.src.length) {
          if (state.src[j] === "#") {
            if (
              j === state.src.length - 1 ||
              state.src[j + 1].match(StopRegExp)
            ) {
              end = j;
            }
            break;
          }
          j += 1;
        }
        break;
      } else if (state.src[i] === "\\") {
        i += 1;
      }
      i += 1;
    }
    if (end === -1) {
      end = i;
    }
    const content = state.src.slice(state.pos + 1, end);
    if (!content || silent) {
      return false;
    }
    const token = state.push("tag", "", 0);
    token.content = content.trim();
    token.attrPush(["id", "tag-" + uslug(content) + "-" + state.pos]);
    // The "#" that closes a tag with spaces is the tag's; what follows a
    // tag, a space too, is the text's.
    state.pos = state.src[end] === "#" ? end + 1 : end;
    return true;
  });

  md.renderer.rules.tag = (tokens, idx) => {
    const token = tokens[idx];
    const content = token.content || "";
    const id = token.attrGet("id") || "";
    if (!content) {
      return '<a class="tag tag-error" data-error="Invalid tag">loading...</a>';
    }
    const escape = md.utils.escapeHtml;
    return `<a id="${escape(String(id))}" class="tag tag-topic" data-topic="${escape(content)}">${escape(
      content.match(/\s/) ? "#" + content + "#" : "#" + content,
    )}</a>`;
  };
}
