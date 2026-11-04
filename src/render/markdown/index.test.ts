import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./index";

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

  it("starts slides only at comments outside lists and quotes, in each way they are written", () => {
    expect(
      renderMarkdown("- <!-- slide -->\n\n> <!-- slide -->\n").slideConfigs,
    ).toEqual([]);
    const element = parse(
      "<!-- .slide: -->\nA\n<!-- slide -->\nB\n<!-- slide vertical=true -->\nC\n",
    );
    expect(
      Array.from(element.querySelectorAll("section.slide"), (slide) => [
        slide.getAttribute("data-h"),
        slide.getAttribute("data-v"),
      ]),
    ).toEqual([
      ["0", "0"],
      ["1", "0"],
      ["1", "1"],
    ]);
  });

  it("gives a slide only the attributes its comment names properly", () => {
    const section = parse(
      '<!-- slide a/onclick="x" data-background="red" -->\nA\n',
    ).querySelector("section.slide");
    expect(section?.getAttribute("data-background")).toBe("red");
    expect(
      Array.from(section?.attributes ?? [], ({ name }) => name).sort(),
    ).toEqual(["class", "data-background", "data-h", "data-line", "data-v"]);
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
    const rendered = renderMarkdown(text);
    expect(rendered.slideConfigs).toEqual([]);
    const element = parse(text);
    expect(element.querySelector("pre")?.textContent).toBe(
      "# not a heading\n<!-- slide -->\n<!-- pagebreak -->\n",
    );
  });

  it("draws a deck whose text has the word its slides used to be cut at", () => {
    const element = parse(
      "<!-- slide -->\nA\n\n[MUMESLIDE]\n\n<!-- slide -->\nB\n",
    );
    expect(
      Array.from(element.querySelectorAll("section.slide"), (slide) =>
        slide.textContent?.trim(),
      ),
    ).toEqual(["A\n[MUMESLIDE]", "B"]);
  });

  it("keeps a slide's class beside slide, and its attributes escaped", () => {
    const element = parse(
      '<!-- slide class="dark" data-x="a&quot;b" -->\nA\n<!-- slide vertical=true -->\nB\n',
    );
    const [first, second] = Array.from(
      element.querySelectorAll("section.slide"),
    );
    expect(first.className).toBe("slide dark");
    expect(first.getAttribute("data-x")).toBe("a&quot;b");
    expect(first.hasAttribute("lineno")).toBe(false);
    expect(second.parentElement?.tagName).toBe("SECTION");
  });

  it("draws a widget written without a space after the comment opens", () => {
    expect(
      parse("<!--@timer-->\n")
        .querySelector(".echomd-widget")
        ?.getAttribute("data-widget-name"),
    ).toBe("timer");
  });

  it("shows [TOC] as the text it is", () => {
    expect(parse("[TOC]\n").textContent?.trim()).toBe("[TOC]");
  });
});
