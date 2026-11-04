import MarkdownIt from "markdown-it";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import ins from "markdown-it-ins";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import blockReference from "./blockReference";
import comments, { SlideConfig } from "./comments";
import fence from "./fence";
import frontMatter from "./frontMatter";
import headings from "./headings";
import linkId from "./linkId";
import math from "./math";
import lines from "./lines";
import { deckHTML } from "./slides";
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
    const env = {};
    const tokens = md.parse(markdown, env);
    // The front matter as markdown-it found it (./frontMatter.ts).
    const yamlConfig =
      (tokens.find(({ type }) => type === "front_matter")?.meta as
        Record<string, any> | undefined) ?? {};
    const render = (start: number, end: number) =>
      md.renderer.render(tokens.slice(start, end), md.options, env);
    const starts = tokens.flatMap((token, i) =>
      token.type === "slide" ? [i] : [],
    );
    if (!starts.length) {
      return { html: render(0, tokens.length), slideConfigs: [], yamlConfig };
    }
    const slides = starts.map((start, k) => ({
      config: tokens[start].meta as SlideConfig,
      html: render(start + 1, starts[k + 1] ?? tokens.length),
    }));
    return {
      html: deckHTML(render(0, starts[0]), slides),
      slideConfigs: slides.map(({ config }) => config),
      yamlConfig,
    };
  } catch (error) {
    return {
      html: "Failed to render markdown:\n" + JSON.stringify(error),
      slideConfigs: [],
      yamlConfig: {},
    };
  }
}
