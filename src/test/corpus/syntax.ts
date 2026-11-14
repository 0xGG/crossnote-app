// The syntax the app reads and draws, a note of each kind: what markdown-it
// gives with the settings and plugins echomd sets up (links found in bare
// text, line breaks kept, footnotes, marks, insertions, sub- and
// superscript, task lists), and what echomd and the app add on top (wiki
// links, hashtags, math, emoji, diagrams), and what notes written for
// features since dropped hold (block references, widgets, slides), and what
// a note holds half typed, or written by another tool.
// Each is a whole file. Tests that the notebook keeps a note as written, and
// what it renders to, run over all of them; an editor that replaces
// CodeMirror 5 is to keep them as they are too, though no test runs one over
// them yet. Front matter has its own samples in frontMatter.ts.
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
    name: "the same links again",
    text: "[[README]] once\n\n[[README]] twice\n\n- #topic one\n- #topic two\n\n| a | b |\n| - | - |\n| [[README]] | [[README]] |\n",
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
    text: '<!-- @crossnote.audio -->\n\n<!-- @crossnote.youtube "videoID":"abc" -->\n\n<!-- @crossnote.kanban "board":{"columns":[{"id":1,"title":"A","cards":[{"id":2,"title":"C","description":"[outside](https://a.b/)"}]}]} -->\n\n<!-- @timer -->\n\n<!-- @timer "date":"Sat Nov 07 2026 10:00:00 GMT+0800" -->\n\n<!-- @crossnote.image -->\n\n<!-- @crossnote.ocr -->\n\n<!-- @crossnote.video "src":"https://a.b/v.mp4","poster":"https://a.b/p.png" -->\n\n<!-- @crossnote.bilibili "bvid":"1xx411c7mD" -->\n\n<!-- @crossnote.github_gist "url":"https://gist.github.com/a/b" -->\n\n<!-- @crossnote.kanban "board":{"columns":[{"title":"Don\'t forget","cards":[]}]} -->\n\n<!-- @ -->\n\n<!-- @timer {"date": 1} -->\n\nText <!--@timer--> in a line.\n',
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
    name: "an import comment",
    text: 'Before.\n\n<!-- @import "other.md" -->\n\nAfter.\n',
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
  {
    name: "links with odd addresses",
    text: "[a colon](Re:Zero.md), [a broken encoding](%E0%A4.md), [mail](mailto:a@b.c) and [[Other]]\n\n| a | b |\n|---|---|\n| [in a table](Table.md) | c |\n",
  },
  {
    name: "links in task items",
    text: "- [ ] read [[Book]] #reading\n- [x] see [the notes](notes.md)\n\n> - [ ] quoted [[Book]]\n",
  },
  // What a note holds while it is being typed, and what other tools write:
  // an editor keeps all of it as it is, whatever it makes of it.
  {
    name: "inline marks left unfinished",
    text: "**bold without an end\n\n*em and `code without an end\n\n~~struck and ==marked without an end\n\n[text](https://example.org\n\n![alt](./images/pic.png\n\n[[a wiki link without an end\n\n$x^2 without an end\n\nA footnote[^ without an end\n",
  },
  {
    name: "blocks left unfinished",
    text: "Before.\n\n$$\nE = mc^2\n\n| a | b\n| --- \n| c\n\n<details>\n<summary>Open\n\n- [ \n- [x\n\n<!-- a comment without an end\n\n```js\nconst open = 1;\n",
  },
  {
    name: "syntax of other tools",
    text: "::: warning\nA container.\n:::\n\n> [!NOTE]\n> A callout.\n\n{{< shortcode arg >}} and {% raw %}liquid{% endraw %} and %%hidden%%.\n\n@[toc](Contents)\n\n*[HTML]: an abbreviation\n\nTerm\n: A definition\n\n<Component prop={1} />\n\n![[Embedded note]] and [[Note#Heading]] and [[Note^block]].\n\n\\begin{align}\na &= b\n\\end{align}\n",
  },
  {
    name: "HTML comments",
    text: "<!-- a plain comment -->\n\nText <!-- inline --> more.\n\n<!--\nover\nlines\n-->\n\n<!-- TODO: with -- dashes inside -->\n\n<!---->\n\nAfter.\n",
  },
  {
    name: "quotes and dashes typed plain",
    text: "\"double\" and 'single' quotes, an en -- dash, an em --- dash, an ellipsis... (c) (tm) (r) +- and a -> b <- c => d.\n",
  },
  {
    name: "inline HTML and a table of uneven cells",
    text: 'A <span style="color: red">red</span> word, an <u>underlined</u> one, a break<br>and <img src="./images/pic.png" width="100"> in a line.\n\n| 名称 | Name |\n| :-- | --: |\n| 编辑器 | editor |\n| 长一点的内容，带 `code` 与 \\| 竖线 | x |\n|||\n',
  },
  {
    name: "characters of more than one code unit",
    text: "𠮷野家 😀 👨‍👩‍👧 é and a zero-width​space, a non-breaking space, and שלום from the right.\n\n#𠮷tag [[𠮷 note]] **😀**\n",
  },
  {
    name: "no line ending at the end",
    text: "# Title\n\nThe last line, without a newline",
  },
  {
    name: "blank lines and spaces at both ends",
    text: "\n\n  \nText with spaces after it   \n\t\n\n\n",
  },
  {
    name: "line endings of the old Mac OS",
    text: "# Title\r\rText\r- item\r",
  },
  {
    name: "line endings of two kinds",
    text: "One\r\nTwo\nThree\r\n\r\nFour\n",
  },
];
