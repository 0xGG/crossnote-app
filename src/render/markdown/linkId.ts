import type { MarkdownIt } from "markdown-it";
import forInline from "markdown-it-for-inline";
import { uslug } from "./slug";

// Each markdown link gets an id from its address and its place among its
// block's tokens: link-README-md-1.
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
}
