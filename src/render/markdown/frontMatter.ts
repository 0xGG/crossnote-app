import type { MarkdownIt } from "markdown-it";
import { findFrontMatter } from "../../lib/frontMatter";

// The front matter a note starts with, found as the notebook finds it
// (lib/frontMatter.ts): a token of its own, with the mapping it holds, which
// draws nothing and has no links in it. Front matter YAML cannot read is
// the note's text, and is drawn as text.
export default function frontMatter(md: MarkdownIt) {
  md.block.ruler.before(
    "table",
    "front_matter",
    (state, startLine, _endLine, silent) => {
      if (startLine !== 0 || state.parentType !== "root") {
        return false;
      }
      const found = findFrontMatter(state.src);
      if (!found) {
        return false;
      }
      if (!silent) {
        const token = state.push("front_matter", "", 0);
        token.block = true;
        token.hidden = true;
        token.map = [0, found.lineCount];
        token.meta = found.mapping;
      }
      state.line = found.lineCount;
      return true;
    },
  );
  md.renderer.rules.front_matter = () => "";
}
