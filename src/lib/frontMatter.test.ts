import { describe, expect, it } from "vitest";
import { readNoteText, writeNoteText } from "./frontMatter";

const created = new Date("2026-10-26T00:00:00.000Z");
const settings: [string, unknown][] = [
  ["pinned", true],
  ["created", created],
];

describe("readNoteText", () => {
  it("takes a setting out with the lines that belong to it", () => {
    const { text, settings } = readNoteText(
      '---\ntitle: T\n"aliases":\n  - x\n\n  - y\n\ntags: [a]\n---\nBody',
    );
    // The blank line inside the list goes with it, the one after stays.
    expect(text).toBe("---\ntitle: T\n\ntags: [a]\n---\nBody");
    expect(settings).toEqual({ aliases: ["x", "y"] });
  });

  it("keeps front matter that does not come apart as the text", () => {
    for (const file of [
      // On one line, a setting in it.
      "---\n{title: T, pinned: true}\n---\nBody",
      // A setting given twice.
      "---\npinned: true\ntitle: T\npinned: false\n---\nBody",
      // An anchor a setting shares.
      "---\nicon: &i ':star:'\nother: *i\n---\nBody",
    ]) {
      expect(readNoteText(file), file).toEqual({
        text: file,
        settings: {},
        unreadable: false,
      });
    }
  });

  it("tells front matter YAML cannot read from text between rules", () => {
    expect(readNoteText("---\ntags: [a\n---\nBody").unreadable).toBe(true);
    expect(readNoteText("---\nIntro\n---\nBody").unreadable).toBe(false);
    expect(readNoteText("---\n- a\n---\nBody").unreadable).toBe(false);
    expect(readNoteText("Body").unreadable).toBe(false);
  });

  it("leaves the older form of the settings in the text", () => {
    const file = "---\nnote:\n  pinned: true\nx: 1\n---\nBody";
    expect(readNoteText(file).text).toBe(file);
  });
});

describe("writeNoteText", () => {
  it("writes settings typed into the text where the note has none", () => {
    expect(
      writeNoteText("---\ntitle: T\nfavorited: yes\n---\nBody", settings, null),
    ).toBe(
      "---\ntitle: T\npinned: true\ncreated: 2026-10-26T00:00:00.000Z\nfavorited: yes\n---\nBody",
    );
  });

  it("turns the older form of the settings into the newer", () => {
    expect(
      writeNoteText(
        "---\nnote:\n  pinned: false\n  icon: ':star:'\nx: 1\n---\nBody",
        settings,
        null,
      ),
    ).toBe(
      "---\nx: 1\npinned: false\ncreated: 2026-10-26T00:00:00.000Z\nicon: ':star:'\n---\nBody",
    );
  });

  it("writes settings in their own front matter before one that does not come apart", () => {
    const text = "---\n{title: T}\n---\nBody";
    expect(writeNoteText(text, settings, null)).toBe(
      `---\npinned: true\ncreated: 2026-10-26T00:00:00.000Z\n---\n${text}`,
    );
  });

  it("writes settings that have not changed as the file had them", () => {
    const previous =
      "---\ntitle: T\ncreated: 2026-10-26\npinned: yes\n---\nBody";
    expect(
      writeNoteText(
        "---\ntitle: T\n---\nBody, edited",
        [
          ["pinned", "yes"],
          ["created", created],
        ],
        previous,
      ),
    ).toBe(
      "---\ntitle: T\ncreated: 2026-10-26\npinned: yes\n---\nBody, edited",
    );
  });

  it("leaves a text without settings to write as it is", () => {
    expect(writeNoteText("---\ntitle: T\n---\nBody", [], null)).toBe(
      "---\ntitle: T\n---\nBody",
    );
    expect(writeNoteText("Body", [], null)).toBe("Body");
  });
});
