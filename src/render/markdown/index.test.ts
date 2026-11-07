import { describe, expect, it, vi } from "vitest";
import { sanitizeHTML } from "../sanitize";
import { md, renderMarkdown } from "./index";

const parse = (text: string) => {
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(text).html;
  return element;
};

describe("the markdown stage", () => {
  it("reads a comment that is not closed, many empty lines long, at once", () => {
    const text = "# Notes\n\n<!-- todo" + "\n".repeat(3000) + "rest\n";
    const start = performance.now();
    renderMarkdown(text);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("runs a block of HTML left open on to an empty line, as CommonMark does", () => {
    const element = parse("<details>\n# Not a heading\n\n# A heading\n");
    expect(
      Array.from(element.querySelectorAll("h1"), (h1) => h1.textContent),
    ).toEqual(["A heading"]);
    expect(element.querySelector("details")?.textContent).toContain(
      "# Not a heading",
    );
  });

  it("says why the markdown stage failed", () => {
    const parse = vi.spyOn(md, "parse").mockImplementationOnce(() => {
      throw new Error("cannot read");
    });
    try {
      expect(renderMarkdown("text").html).toBe(
        "Failed to render markdown:\nError: cannot read",
      );
    } finally {
      parse.mockRestore();
    }
  });

  it("marks each block with the line it starts on, after a comment of many lines too", () => {
    const element = parse(
      "Intro\n\n<!--\nfoo\nbar\n-->\n\n# After\n\n- item\n",
    );
    expect(
      Array.from(element.querySelectorAll("[data-line]"), (block) => [
        block.tagName.toLowerCase(),
        block.getAttribute("data-line"),
      ]),
    ).toEqual([
      ["p", "0"],
      ["h1", "7"],
      ["ul", "9"],
      ["li", "9"],
    ]);
  });

  it("leaves what code blocks hold as it is", () => {
    const text =
      "~~~\n# not a heading\n<!-- slide -->\n<!-- pagebreak -->\n~~~\n";
    const element = parse(text);
    expect(element.querySelector("pre")?.textContent).toBe(
      "# not a heading\n<!-- slide -->\n<!-- pagebreak -->\n",
    );
  });

  it("draws a note that was a deck of slides as a note, its slide comments as any other comment", () => {
    const html = renderMarkdown(
      '<!-- slide -->\n# A\n\n<!-- .slide: data-background="red" -->\nB\n',
    ).html;
    expect(html).not.toContain("<section");
    const element = document.createElement("div");
    element.innerHTML = sanitizeHTML(html);
    expect(element.querySelector("h1")?.textContent).toBe("A");
    expect(element.textContent).not.toContain("slide");
  });

  it("draws a widget written without a space after the comment opens", () => {
    expect(
      parse("<!--@timer-->\n")
        .querySelector(".echomd-widget")
        ?.getAttribute("data-widget-name"),
    ).toBe("timer");
  });

  it("draws a block that ends in a # or a ^ after a space", () => {
    for (const text of [
      "Issue #\n",
      "x ^\n",
      "# Heading ^\n",
      "- item #\n",
      "| a | b #|\n|---|---|\n| c ^ | d |\n",
    ]) {
      expect(renderMarkdown(text).html).not.toContain("Failed");
    }
    expect(parse("Issue #\n").textContent?.trim()).toBe("Issue #");
  });

  it("keeps the space after a tag", () => {
    expect(parse("About #topic and #two words# here.\n").textContent).toBe(
      "About #topic and #two words# here.\n",
    );
  });

  it("shows [TOC] as the text it is", () => {
    expect(parse("[TOC]\n").textContent?.trim()).toBe("[TOC]");
  });
});
