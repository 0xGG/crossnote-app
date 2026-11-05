import katex from "katex";
// The styles and fonts the math KaTeX draws needs, in the page.
import "katex/dist/katex.min.css";
import type { MarkdownIt } from "markdown-it";

// $inline$ and $$display$$ math, drawn by KaTeX as the note renders; an
// expression KaTeX cannot read shows its error in its place, as text: the
// error quotes the expression.
function parseMath(
  content: string | null,
  displayMode: boolean,
  escapeHtml: (text: string) => string,
) {
  if (!content) {
    return "";
  }
  try {
    return katex.renderToString(content, { displayMode });
  } catch (error) {
    return `<span style="color: #ee7f49; font-weight: 500;">${escapeHtml(String(error))}</span>`;
  }
}

export default function math(md: MarkdownIt) {
  md.inline.ruler.before("escape", "math", (state, silent) => {
    let openTag: string | null = null;
    let closeTag: string | null = null;
    let displayMode = true;
    if (state.src.startsWith("$$", state.pos)) {
      openTag = closeTag = "$$";
    } else if (state.src.startsWith("$", state.pos)) {
      openTag = closeTag = "$";
      displayMode = false;
    }
    if (!openTag || !closeTag) {
      return false;
    }
    let end = -1;
    let i = state.pos + openTag.length;
    while (i < state.src.length) {
      if (state.src.startsWith(closeTag, i)) {
        end = i;
        break;
      } else if (state.src[i] === "\\") {
        i += 1;
      }
      i += 1;
    }
    if (end < 0) {
      return false;
    }
    const content = state.src.slice(state.pos + openTag.length, end);
    if (!content || silent) {
      return false;
    }
    const token = state.push("math", "", 0);
    token.content = content.trim();
    token.meta = { displayMode };
    state.pos += content.length + openTag.length + closeTag.length;
    return true;
  });

  md.renderer.rules.math = (tokens, idx) =>
    parseMath(
      tokens[idx] ? tokens[idx].content : null,
      (tokens[idx].meta as { displayMode: boolean }).displayMode,
      md.utils.escapeHtml,
    );
}
