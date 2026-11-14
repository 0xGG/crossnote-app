import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { languages } from "@codemirror/language-data";
import { noteSyntax } from "./syntax";

/**
 * A note's language: markdown with the notes' own syntax, code blocks in
 * their languages (each loaded when a note first names it), and YAML in the
 * front matter.
 */
export const noteLanguage = yamlFrontmatter({
  content: markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    extensions: noteSyntax,
  }),
});
