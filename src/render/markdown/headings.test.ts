import { describe, expect, it } from "vitest";
import { md, renderMarkdown } from "./index";

const headings = (text: string) => {
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(text).html;
  return Array.from(element.querySelectorAll("h1, h2"), (heading) => ({
    text: heading.textContent,
    id: heading.id,
    class: heading.getAttribute("class"),
  }));
};

describe("headings", () => {
  it("take the id and class their attributes give", () => {
    expect(headings("# Title {#top .wide}\n## Only an id {#only}\n")).toEqual([
      { text: "Title", id: "top", class: "wide" },
      { text: "Only an id", id: "only", class: null },
    ]);
  });

  it("keep braces that hold no attributes as text", () => {
    expect(headings("# Sets {a, b}\n")).toEqual([
      { text: "Sets {a, b}", id: "Sets-a,-b-", class: null },
    ]);
  });

  it("make an id no heading before them has, counting the ones given by hand", () => {
    expect(
      headings("# Notes {#Notes}\n# Notes\n# Notes\n").map(({ id }) => id),
    ).toEqual(["Notes", "Notes-1", "Notes-2"]);
  });

  it("read a long heading ending in a brace at once", () => {
    const text = "# a" + " ".repeat(32000) + "b}\n";
    const start = performance.now();
    expect(headings(text)).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("read attributes with lists in lists without running out of stack", () => {
    const text = "# T {a=" + "[".repeat(20000) + "}\n";
    expect(() => md.parse(text, {})).not.toThrow();
    expect(headings(text)).toHaveLength(1);
  });

  it("escape the id they are given", () => {
    expect(renderMarkdown('# T {#a"b}\n').html).toContain('id="a&quot;b"');
  });
});
