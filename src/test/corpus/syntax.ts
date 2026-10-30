// The syntax the app reads and draws, a note of each kind: what markdown-it
// gives with the settings and plugins echomd sets up (links found in bare
// text, line breaks kept, footnotes, marks, insertions, sub- and
// superscript, task lists), and what echomd and the app add on top (wiki
// links, hashtags, block references, math, emoji, widgets, diagrams, slides).
// Each is a whole file. Tests that the notebook keeps a note as written, and
// what it renders to, run over all of them; an editor that replaces
// CodeMirror 5 keeps them as they are too. Front matter has its own samples
// in frontMatter.ts.
export const syntaxSamples: { name: string; text: string }[] = [
  {
    name: "headings, one with an id and a class",
    text: "# Title\n\n## Section {#custom-id .note}\n\nUnderlined title\n===\n\nText under it.\n",
  },
  {
    name: "line breaks",
    text: "One line\nthe next, kept as a break\n\nA paragraph  \nwith a hard break.\n",
  },
  {
    name: "emphasis and inline marks",
    text: "**bold** *em* _em_ ~~struck~~ ==marked== ++inserted++ H~2~O x^2^ `code`\n",
  },
  {
    name: "links, images and bare addresses",
    text: '[text](https://example.org "Title") [by reference][r] <https://example.org/angle> https://example.org/bare ![alt](./images/pic.png "Pic") [a note](./Other.md)\n\n[r]: https://example.org/ref "Ref title"\n',
  },
  {
    name: "wiki links",
    text: "See [[README]], [[folder/Other note]] and [[README|the readme]].\n",
  },
  {
    name: "hashtags and a block reference",
    text: "A note about #topic and #topic/sub.\n\nA paragraph to point at ^para-id\n",
  },
  {
    name: "lists and task lists",
    text: "- one\n- two\n  - nested\n* star\n\n1. first\n2. second\n\n- [ ] to do\n- [x] done\n",
  },
  {
    name: "a table",
    text: "| Left | Centre | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n",
  },
  {
    name: "quotes and a rule",
    text: "> quoted\n> more\n\n***\n\nAfter the rule.\n",
  },
  {
    name: "footnotes",
    text: "Text with a note[^1] and an inline one^[inline note].\n\n[^1]: The note.\n",
  },
  {
    name: "math",
    text: "Inline $x^2 + y^2$ and a block:\n\n$$\nE = mc^2\n$$\n",
  },
  {
    name: "emoji",
    text: "Happy :smile: and :+1:, and :not-an-emoji: left as it is.\n",
  },
  {
    name: "HTML",
    text: "Press <kbd>Ctrl</kbd>+<kbd>S</kbd>.\n\n<details>\n<summary>More</summary>\n\nHidden **text**.\n\n</details>\n",
  },
  {
    name: "widgets",
    text: '<!-- @crossnote.audio -->\n\n<!-- @crossnote.youtube "videoID":"abc" -->\n\n<!-- @crossnote.kanban "board":{"columns":[{"id":1,"title":"A","cards":[{"id":2,"title":"C","description":"[outside](https://a.b/)"}]}]} -->\n\n<!-- @timer -->\n',
  },
  {
    name: "code",
    text: "```js\nconst a = 1;\n```\n\n```bash {cmd=true}\necho $HOME\n```\n\n```\nno language\n```\n\n    indented code\n",
  },
  {
    name: "diagrams",
    text: '```mermaid\ngraph TD; A-->B\n```\n\n```echarts\n{"xAxis": {"data": ["a", "b"]}, "yAxis": {}, "series": [{"type": "bar", "data": [1, 2]}]}\n```\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```\n\n```wavedrom\n{"signal": [{"name": "clk", "wave": "p..."}]}\n```\n\n```vega-lite\n{"data": {"values": [{"a": 1}]}, "mark": "bar", "encoding": {"x": {"field": "a"}}}\n```\n',
  },
  {
    name: "slides and a page break",
    text: "<!-- slide -->\n\n# First slide\n\n<!-- slide -->\n\n# Second slide\n\n<!-- pagebreak -->\n\nAfter the break.\n",
  },
  {
    name: "slides with presentation settings",
    text: "---\npresentation:\n  theme: white.css\n---\n\n<!-- slide -->\n\n# Deck\n",
  },
  {
    name: "a table of contents marker",
    text: "[TOC]\n\n# One\n\n## Two\n",
  },
  {
    name: "Windows line endings",
    text: "# Title\r\n\r\nText\r\n- item\r\n",
  },
  {
    name: "indented with tabs",
    text: "- list\n\t- indented with a tab\n\n\tcode indented with a tab\n",
  },
];
