import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./index";
import { findLinks } from "./links";

const ids = (html: string) => {
  const element = document.createElement("div");
  element.innerHTML = html;
  return Array.from(element.querySelectorAll("[id]"), ({ id }) => id);
};

describe("findLinks", () => {
  it("finds wiki links, hashtags and markdown links with what they show", () => {
    expect(
      findLinks(
        "See [[Other|the other]] and #idea.\n\n[a note](./b.md) [web](https://example.org)\n",
      ),
    ).toEqual([
      {
        kind: "wikilink",
        target: "Other",
        text: "the other",
        elementId: "wikilink-Other-the-other-4",
        lines: [0, 1],
        context: "See [[Other|the other]] and #idea.",
      },
      {
        kind: "tag",
        target: "idea",
        text: "idea",
        elementId: "tag-idea-28",
        lines: [0, 1],
        context: "See [[Other|the other]] and #idea.",
      },
      {
        kind: "link",
        target: "./b.md",
        text: "a note",
        elementId: expect.stringMatching(/^link-/),
        lines: [2, 3],
        context: "[a note](./b.md) [web](https://example.org)",
      },
      {
        kind: "link",
        target: "https://example.org",
        text: "web",
        elementId: expect.stringMatching(/^link-/),
        lines: [2, 3],
        context: "[a note](./b.md) [web](https://example.org)",
      },
    ]);
  });

  it("names a link as the preview does, the same one at the same place in two blocks alike", () => {
    // Telling these apart waits for the notebook and the preview to read
    // the same text.
    const text = "[[a]] one\n\n[[a]] two\n";
    expect(findLinks(text).map(({ elementId }) => elementId)).toEqual([
      "wikilink-a-0",
      "wikilink-a-0",
    ]);
    expect(ids(renderMarkdown(text).html)).toEqual([
      "wikilink-a-0",
      "wikilink-a-0",
    ]);
  });
});
