import type { MarkdownIt } from "markdown-it";

// The first word of the comment a block of HTML is. Read by hand rather
// than with one pattern, which takes seconds over a comment that is not
// closed and has many empty lines after it.
function commentSubject(html: string): string | null {
  if (!html.startsWith("<!--") || !html.endsWith("-->")) {
    return null;
  }
  const inside = html.slice(4, -3).trim();
  const space = inside.search(/\s/);
  return space < 0 ? inside : inside.slice(0, space);
}

// The HTML comment a note writes on a line of its own that means something:
// <!-- pagebreak --> or <!-- newpage --> breaks the page when printing.
// Other comments, those the widgets that are gone left in notes among them,
// are left as HTML, for the sanitizer to take out.
export default function comments(md: MarkdownIt) {
  md.core.ruler.after("block", "comments", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "html_block") {
        continue;
      }
      const subject = commentSubject(token.content.trim());
      if (subject === "pagebreak" || subject === "newpage") {
        token.type = "pagebreak";
      }
    }
  });

  md.renderer.rules.pagebreak = (tokens, idx) =>
    `<div class="pagebreak html2pdf__page-break" data-line="${tokens[idx].map?.[0] ?? 0}"> </div>\n`;
}
