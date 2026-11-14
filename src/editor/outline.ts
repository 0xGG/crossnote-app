import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { emojiOfShortName } from "../render/emoji";

/** A heading of a note, for its table of contents. */
export interface OutlineItem {
  /** The line the heading is on, from 0. */
  line: number;
  /** How many "#" it has. */
  level: number;
  /** What it says, without the markup in it. */
  text: string;
}

/** A heading's text as the table of contents shows it. */
export function headingText(markdown: string): string {
  return (
    markdown
      // Emphasis, strong, struck and code: what is inside.
      .replace(/([*_]{1,2}|~~|`+)(.+?)\1/g, "$2")
      // Backslashes of escapes, footnote references and images: nothing.
      .replace(
        /\\(?=.)|\[\^.+?\]|!\[((?:[^\\\]]|\\.)+)\](\(.+?\)| ?\[.+?\])?/g,
        "",
      )
      // Links and wiki links: their text.
      .replace(/\[((?:[^\\\]]|\\.)+)\](\(.+?\)| ?\[.+?\])/g, "$1")
      .replace(/\[\[(.+?)\]\]/g, "$1")
      .replace(
        /:([\w+-]+?):/g,
        (whole, name: string) => emojiOfShortName(name) ?? whole,
      )
  );
}

/**
 * A note's headings written with "#" at the start of a line, in order. What
 * looks like one inside a code block is not one: the parser decides.
 */
export function outline(state: EditorState): OutlineItem[] {
  const items: OutlineItem[] = [];
  const tree =
    ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  tree.iterate({
    enter: (node) => {
      const level = /^ATXHeading([1-6])$/.exec(node.name);
      if (!level) {
        // Headings are blocks; nothing in a line holds one.
        return node.name !== "Paragraph" && node.name !== "FencedCode";
      }
      const line = state.doc.lineAt(node.from);
      const found = /^(#+)\s+(.+?)(?:\s+#+)?\s*$/.exec(
        state.sliceDoc(node.from, node.to),
      );
      if (found) {
        items.push({
          line: line.number - 1,
          level: Number(level[1]),
          text: headingText(found[2]),
        });
      }
      return false;
    },
  });
  return items;
}
