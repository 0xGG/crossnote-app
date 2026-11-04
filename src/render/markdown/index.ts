import MarkdownIt from "markdown-it";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import ins from "markdown-it-ins";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import { findFrontMatter } from "../../lib/frontMatter";
import blockReference from "./blockReference";
import fence from "./fence";
import frontMatter from "./frontMatter";
import headings from "./headings";
import linkId from "./linkId";
import math from "./math";
import { parseSlides } from "./slides";
import tag from "./tag";
import { SlideConfig, transformMarkdown } from "./transform";
import widget from "./widget";
import wikilink from "./wikilink";

// The markdown stage: a note's text to HTML, as echomd's preview drew it.
// The preview renders the text after ./transform.ts has rewritten it; the
// notebook reads a note's links straight from the text with the same
// markdown-it (../links.ts).

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: true,
});
frontMatter(md);
headings(md);
md.use(footnote);
md.use(taskLists);
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

/** Turns :short_name: into the emoji it names, from then on. */
export function enableEmoji(emojiDefinitions: { [shortName: string]: string }) {
  md.use(emoji, { defs: emojiDefinitions });
}

export interface MarkdownStageOutput {
  html: string;
  slideConfigs: SlideConfig[];
  /** The mapping the note's front matter holds, {} when it has none. */
  yamlConfig: Record<string, any>;
}

export function renderMarkdown(markdown: string): MarkdownStageOutput {
  try {
    const { slideConfigs, outputString } = transformMarkdown(markdown);
    const yamlConfig = findFrontMatter(markdown)?.mapping ?? {};
    let html = md.render(outputString);
    if (slideConfigs.length) {
      html = parseSlides(html, slideConfigs);
    }
    return { html, slideConfigs, yamlConfig };
  } catch (error) {
    return {
      html: "Failed to render markdown:\n" + JSON.stringify(error),
      slideConfigs: [],
      yamlConfig: {},
    };
  }
}
