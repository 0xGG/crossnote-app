// Front matter as people write it, a note of each kind, from the
// notebook's tests that it keeps front matter as it was written. Each is
// a whole file. An editor that replaces CodeMirror 5 is to keep them as
// they are too, though no test runs one over them yet.
export const frontMatterSamples = {
  "values YAML reads as other types":
    "---\nphone: 0123456789\nzip: 01234\nversion: 1.10\nhex: 0x1F\ndate: 2026-10-26\n---\nBody\n",
  "comments, quotes, a block of text, anchors and a flow list":
    '---\n# A comment\ntitle: "a: b"\ndesc: |\n  line 1\n  line 2\nbase: &b\n  a: 1\nother: *b\ntags: [x, y]\n---\nBody\n',
  "an empty block": "---\n---\nBody\n",
  "Windows line endings":
    "---\r\ntitle: Hi\r\ntags: [a, b]\r\n---\r\nBody\r\nLine 2\r\n",
  "a byte order mark": "\uFEFF---\ntitle: T\n---\nBody\n",
  "settings typed by hand":
    "---\ncreated: 2026-01-01\ntitle: T\nmodified: 2026-01-02\n---\nBody\n",
  "a setting that is off": "---\ntitle: T\npinned: false\n---\nBody\n",
  "aliases in a line": "---\naliases: x, y\n---\nBody\n",
  "settings as the notebook wrote them":
    "---\ntags:\n    - a\naliases:\n    - x\npinned: true\ncreated: 2026-10-01T10:00:00.000Z\nmodified: 2026-10-02T10:00:00.000Z\n---\nBody\n",
  "no front matter": "Body only\n",
};

// Front matter YAML cannot read, or that is not front matter at all: kept
// as it is, as text, with the notebook's settings in a block of their own
// before it.
export const unreadableFrontMatterSamples: [string, string][] = [
  ["half typed", "---\ntitle: Hi\ntags: [work, r3\n---\nBody\n"],
  ["indented with a tab", "---\ntitle: hi\n\tbad: 1\n---\nBody\n"],
  [
    // Each marker after a backslash (lib/crossnote.ts, pullNotebook).
    "conflict markers as the notebook's own merge writes them",
    "---\ntitle: T\n\\<<<<<<< ours\nmodified: 2026-01-01\n\\=======\nmodified: 2026-01-02\n\\>>>>>>> theirs\n---\nBody\n",
  ],
  [
    "conflict markers as git writes them",
    "---\ntitle: T\n<<<<<<< ours\nmodified: 2026-01-01\n=======\nmodified: 2026-01-02\n>>>>>>> theirs\n---\nBody\n",
  ],
  // Rules around a paragraph, or a list: text, not front matter.
  ["a paragraph between rules", "---\nIntro paragraph\n---\nBody\n"],
  ["a list between rules", "---\n- a\n- b\n---\nBody\n"],
  // Four dashes are a rule of the text, not the end of front matter.
  ["four dashes", "---\ntitle: x\n----\nBody\n"],
];
