import type { MarkdownIt } from "markdown-it";
import { Attributes, parseAttributes } from "./attributes";

/** A slide's attributes, from its <!-- slide --> comment, and its line. */
export type SlideConfig = Attributes & { lineNo: number };

// The comment a block of HTML is: its first word and the rest. Read by hand
// rather than with one pattern, which takes seconds over a comment that is
// not closed and has many empty lines after it.
function readComment(html: string): [string, string] | null {
  if (!html.startsWith("<!--") || !html.endsWith("-->")) {
    return null;
  }
  const inside = html.slice(4, -3).trim();
  const space = inside.search(/\s/);
  return space < 0
    ? [inside, ""]
    : [inside.slice(0, space), inside.slice(space).trim()];
}

function slideAttributes(text: string): Attributes {
  try {
    return text ? parseAttributes(text) : {};
  } catch {
    // Attributes that cannot be read give the slide none.
    return {};
  }
}

// HTML comments a note writes on lines of their own that mean something:
// <!-- slide --> starts a slide (and makes the note a deck) when it is not
// in a list or a quote, <!-- pagebreak --> or <!-- newpage --> breaks the
// page when printing, and <!-- @import "file" --> is shown as the text it
// says, as it is not followed. Other comments are left as HTML, for
// ./widget.ts to draw a widget's or for the sanitizer to take out.
export default function comments(md: MarkdownIt) {
  md.core.ruler.after("block", "comments", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "html_block") {
        continue;
      }
      const comment = readComment(token.content.trim());
      if (!comment) {
        continue;
      }
      const [subject, rest] = comment;
      if (subject === "pagebreak" || subject === "newpage") {
        token.type = "pagebreak";
      } else if (/^\.?slide:?$/.test(subject) && token.level === 0) {
        token.type = "slide";
        token.meta = {
          ...slideAttributes(rest),
          lineNo: token.map?.[0] ?? 0,
        } as SlideConfig;
      } else if (subject === "@import") {
        token.type = "import_comment";
        token.content = `${subject} ${rest}`.trim();
      }
    }
  });

  md.renderer.rules.pagebreak = (tokens, idx) =>
    `<div class="pagebreak html2pdf__page-break" data-line="${tokens[idx].map?.[0] ?? 0}"> </div>\n`;
  // A deck is cut at its slides (./slides.ts); they draw nothing themselves.
  md.renderer.rules.slide = () => "";
  md.renderer.rules.import_comment = (tokens, idx) =>
    `<p data-line="${tokens[idx].map?.[0] ?? 0}">${md.utils.escapeHtml(tokens[idx].content)}</p>\n`;
}
