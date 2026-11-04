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

  it("reads the links of a note whose block ends in a # or a ^ after a space", () => {
    expect(
      findLinks("[[A]] issue #\n\n[[B]] x ^\n").map(({ target }) => target),
    ).toEqual(["A", "B"]);
  });

  it("takes no links from the front matter, which the preview does not draw", () => {
    const text = "---\nsee: '[[Hidden]] #hidden'\n---\n[[Shown]]\n";
    expect(findLinks(text).map(({ target }) => target)).toEqual(["Shown"]);
    expect(renderMarkdown(text).html).not.toContain("Hidden");
  });

  it("names a link as the preview does, the same one at the same place in two blocks apart", () => {
    const text = "[[a]] one\n\n[[a]] two\n\n- [[a]] three\n";
    const expected = ["wikilink-a-0", "wikilink-a-0-2", "wikilink-a-0-3"];
    expect(findLinks(text).map(({ elementId }) => elementId)).toEqual(expected);
    expect(ids(renderMarkdown(text).html)).toEqual(expected);
  });

  it("escapes what a link writes into the preview's attributes", () => {
    const element = document.createElement("div");
    element.innerHTML = renderMarkdown('[[My "note"|words]] #a"b\n').html;
    const [wikilink, tag] = Array.from(element.querySelectorAll("a"));
    expect(wikilink.getAttribute("data-wikilink-url")).toBe('My "note"');
    expect(wikilink.textContent).toBe("words");
    expect(tag.getAttribute("data-topic")).toBe('a"b');
  });

  it("escapes a block reference's name", () => {
    const element = document.createElement("div");
    element.innerHTML = renderMarkdown('Text ^x"y\n').html;
    expect(element.querySelector(".block-reference")?.id).toBe('x"y');
  });

  it("names the same markdown link at the same place in two blocks apart", () => {
    const text = "[x](a.md) one\n\n[x](a.md) two\n";
    const expected = ["link-a-md-0", "link-a-md-0-2"];
    expect(findLinks(text).map(({ elementId }) => elementId)).toEqual(expected);
    expect(ids(renderMarkdown(text).html)).toEqual(expected);
  });
});
