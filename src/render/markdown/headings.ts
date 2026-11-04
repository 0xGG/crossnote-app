import type { MarkdownIt } from "markdown-it";
import { Attributes, parseAttributes } from "./attributes";
import { HeadingIdGenerator } from "./slug";

// One attribute in braces after a heading: #id, .class or key=value.
const attribute = String.raw`(?:[#.][^\s{}]+|[^\s{}=#.]+=(?:"[^"]*"|'[^']*'|[^\s{}"']+))`;

// {#id .class key=value} ending a heading's text. Braces holding anything
// else, as in "# Sets {a, b}", are the heading's text.
const trailingAttributes = new RegExp(
  String.raw`(?<!\S)\{\s*(${attribute}(?:\s+${attribute})*)\s*\}\s*$`,
);

// Each heading gets an id, and the class its attributes give it. The id is
// the one its attributes give, or one made from its text that no heading
// before it has (a second "Notes" gets Notes-1).
export default function headings(md: MarkdownIt) {
  md.core.ruler.after("block", "heading_attributes", (state) => {
    const ids = new HeadingIdGenerator();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "heading_open") {
        continue;
      }
      const inline = tokens[i + 1];
      let id: string | undefined;
      let classes: string | undefined;
      // Looked for only when the heading ends in "}"; the pattern takes the
      // brace's own place only after a space (or at the start), so that it
      // does not try every space before it.
      const match = inline.content.endsWith("}")
        ? trailingAttributes.exec(inline.content)
        : null;
      let attributes: Attributes | undefined;
      try {
        attributes = match ? parseAttributes(match[1]) : undefined;
      } catch {
        // Attributes that cannot be read are the heading's text.
      }
      if (match && attributes) {
        inline.content = inline.content.slice(0, match.index).trimEnd();
        id = typeof attributes.id === "string" ? attributes.id : undefined;
        classes =
          typeof attributes.class === "string" ? attributes.class : undefined;
      }
      if (id) {
        ids.reserve(id);
      } else {
        id = ids.generateId(inline.content);
      }
      tokens[i].attrSet("id", id);
      if (classes) {
        tokens[i].attrJoin("class", classes);
      }
    }
  });
}
