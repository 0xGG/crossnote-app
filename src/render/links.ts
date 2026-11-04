import type { Token } from "markdown-it";
// The emoji the markdown stage turns :short names: into change how it names
// links and what follows a link, so they are set up here as for the preview.
import "./emoji";
import { md } from "./markdown";

// What a note links to, as the markdown stage reads it: the notebook keeps
// these as the note's references, and the preview marks one by the id of
// the element it draws it as. The markdown stage names that element by the
// link and where it stands in its block (wikilink-README-4), so the same
// link at the same place in two blocks shares an id, and the preview marks
// the first. Both read the same tokens of the same text.

export interface NoteLink {
  /** A wiki link, a hashtag, or a markdown link followed by its words. */
  kind: "wikilink" | "tag" | "link";
  /** Where it points, as the note writes it: the note, the tag, the address. */
  target: string;
  /** The words it shows. */
  text: string;
  /** The id of the element the preview draws it as. */
  elementId: string;
  /** The lines of the token it stands in, 0-based, the last not included. */
  lines: [number, number];
  /** That token's text. */
  context: string;
}

// Each token in turn, with the token whose children it is among.
function eachToken(
  tokens: Token[],
  visit: (tokens: Token[], i: number, parent: Token | null) => boolean,
  parent: Token | null = null,
) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!visit(tokens, i, parent) && token.children?.length) {
      eachToken(token.children, visit, token);
    }
  }
}

// A link the notebook keeps: a markdown link only when words follow it.
const isLink = (tokens: Token[], i: number) =>
  tokens[i].type === "wikilink" ||
  tokens[i].type === "tag" ||
  (tokens[i].type === "link_open" && tokens[i + 1]?.type === "text");

/** The links in a note's text, in the order it has them. */
export function findLinks(text: string): NoteLink[] {
  const links: NoteLink[] = [];
  eachToken(md.parse(text, {}), (tokens, i, parent) => {
    if (!isLink(tokens, i)) {
      return false;
    }
    const token = tokens[i];
    const found = {
      elementId: String(token.attrGet("id") || ""),
      lines: [parent?.map?.[0] ?? 0, parent?.map?.[1] ?? 0] as [number, number],
      context: parent?.content ?? "",
    };
    if (token.type === "wikilink") {
      const [target, words] = token.content.split("|");
      links.push({
        kind: "wikilink",
        target: target.trim(),
        text: (words ?? target).trim(),
        ...found,
      });
    } else if (token.type === "tag") {
      const tag = token.content.trim();
      links.push({ kind: "tag", target: tag, text: tag, ...found });
    } else if (token.attrs?.[0]?.[0] === "href") {
      links.push({
        kind: "link",
        target: String(token.attrs[0][1]),
        text: tokens[i + 1].content.trim(),
        ...found,
      });
    }
    return true;
  });
  return links;
}
