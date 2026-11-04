import type { MarkdownIt } from "markdown-it";

// The schemes a link goes out of the notebook with: web pages, and what the
// system opens (mail, phone calls).
const outside = /^(https?|mailto|tel):/i;
const scheme = /^[a-z][a-z\d+.-]*:/i;
// An address of another app's with a host or a path after "//"
// (zotero://, ftp://), which is no note's name, .md at its end or not.
const otherApp = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * Where a link written in a note points, for the preview. An address with a
 * scheme the notebook opens outside stays as it is. So does any other text
 * before a colon, but for a note's file (Re:Zero.md, C:notes.md: what ends
 * in .md, as the notebook counts a markdown link a note's, and has no "//"
 * after its colon), which is written as ./Re:Zero.md so that it is not read
 * as a scheme and dropped. Another app's address (zotero://select/x.md,
 * sms:) does nothing, as before:
 * ../../utilities/preview.ts openURL opens no other scheme, and the
 * sanitizer drops one it does not know.
 */
export function noteLinkTarget(target: string): string {
  return scheme.test(target) &&
    !outside.test(target) &&
    !otherApp.test(target) &&
    target.endsWith(".md")
    ? "./" + target
    : target;
}

export default function linkTargets(md: MarkdownIt) {
  md.core.ruler.push("link_targets", (state) => {
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        const href = token.type === "link_open" ? token.attrGet("href") : null;
        if (typeof href === "string") {
          token.attrSet("href", noteLinkTarget(href));
        }
      }
    }
  });
}
