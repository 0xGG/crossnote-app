import type { MarkdownIt } from "markdown-it";
import { uslug } from "./slug";

// [[note]] and [[note|words]]: a link to another note of the notebook.
export default function wikilink(md: MarkdownIt) {
  md.inline.ruler.before("autolink", "wikilink", (state, silent) => {
    if (!state.src.startsWith("[[", state.pos)) {
      return false;
    }
    const tag = "]]";
    let end = -1;
    let i = state.pos + tag.length;
    while (i < state.src.length) {
      if (state.src[i] === "\\") {
        i += 1;
      } else if (state.src.startsWith(tag, i)) {
        end = i;
        break;
      }
      i += 1;
    }
    if (end < 0) {
      return false;
    }
    const content = state.src.slice(state.pos + tag.length, end);
    if (!content || silent) {
      return false;
    }
    const token = state.push("wikilink", "", 0);
    token.content = content;
    token.attrPush(["id", "wikilink-" + uslug(content) + "-" + state.pos]);
    state.pos += content.length + 2 * tag.length;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, idx) => {
    const token = tokens[idx];
    const content = token.content;
    const id = token.attrGet("id") || "";
    if (!content) {
      return undefined as unknown as string;
    }
    const splits = content.split("|");
    let linkText: string, wikiLink: string;
    if (splits.length === 2) {
      wikiLink = splits[0].trim();
      linkText = splits[1].trim();
    } else {
      linkText = splits[0].trim();
      wikiLink = splits[0].trim();
    }
    const escape = md.utils.escapeHtml;
    return `<a id="${escape(String(id))}" href="${escape(wikiLink)}" data-wikilink-url="${escape(wikiLink)}">${escape(linkText)}</a>`;
  };
}
