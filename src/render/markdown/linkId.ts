import type { MarkdownIt } from "markdown-it";
import forInline from "markdown-it-for-inline";
import { uslug } from "./slug";

// The tokens a reference names by id: wiki links, tags and markdown links.
const linkTypes = new Set(["wikilink", "tag", "link_open"]);

// Each markdown link gets an id from its address and its place among its
// block's tokens (link-README-md-1), as wiki links and tags get one from
// what they name and where in their block they start (wikilink-README-4).
// The same link at the same place in two blocks would share one, so the
// second gets "-2" after it, the third "-3", in the order of the note.
// The notebook keeps these ids (../links.ts) and the preview marks a
// reference by its id, both from the same tokens.
export default function linkId(md: MarkdownIt) {
  md.use(
    forInline,
    "link_with_id",
    "link_open",
    (tokens: any[], idx: number) => {
      const token = tokens[idx];
      const hrefIndex = token.attrIndex("href");
      if (hrefIndex >= 0) {
        const href = token.attrs[hrefIndex][1];
        token.attrPush(["id", "link-" + uslug(href) + "-" + idx]);
      }
    },
  );

  md.core.ruler.push("unique_link_ids", (state) => {
    const taken = new Set<string>();
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        const id = linkTypes.has(token.type) ? token.attrGet("id") : null;
        if (id === null || id === "") {
          continue;
        }
        let unique = String(id);
        for (let n = 2; taken.has(unique); n++) {
          unique = `${id}-${n}`;
        }
        taken.add(unique);
        token.attrSet("id", unique);
      }
    }
  });
}
