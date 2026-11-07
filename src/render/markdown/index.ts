import MarkdownIt from "markdown-it";
import { bare as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import ins from "markdown-it-ins";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import blockReference from "./blockReference";
import comments from "./comments";
import fence from "./fence";
import frontMatter from "./frontMatter";
import headings from "./headings";
import linkId from "./linkId";
import linkTargets from "./linkTargets";
import math from "./math";
import lines from "./lines";
import tag from "./tag";
import taskLists from "./taskLists";
import widget from "./widget";
import wikilink from "./wikilink";

// The markdown stage: a note's text to HTML. The preview and the notebook,
// which reads a note's links (../links.ts), parse the same text with the
// same markdown-it.

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: true,
});
frontMatter(md);
headings(md);
comments(md);
lines(md);
md.use(footnote);
taskLists(md);
md.use(mark);
md.use(ins);
md.use(sub);
md.use(sup);
tag(md);
math(md);
widget(md);
fence(md);
wikilink(md);
blockReference(md);
linkId(md);
linkTargets(md);

// Addresses become links when they say their scheme (https://, mailto:)
// or are written in angle brackets; a word that only looks like a domain
// (README.md) or an e-mail address does not.
md.linkify.set({ fuzzyEmail: false });

/**
 * Turns :short_name: into the emoji it names, from then on. Shortcuts such
 * as :) and <3 stay text.
 */
export function enableEmoji(emojiDefinitions: { [shortName: string]: string }) {
  md.use(emoji, { defs: emojiDefinitions });
}

export interface MarkdownStageOutput {
  html: string;
}

export function renderMarkdown(markdown: string): MarkdownStageOutput {
  try {
    return { html: md.render(markdown, {}) };
  } catch (error) {
    return { html: "Failed to render markdown:\n" + String(error) };
  }
}
