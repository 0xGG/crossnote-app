import { describe, expect, it } from "vitest";
// The emoji the app enables, as the preview and the notebook have them.
import "../emoji";
import { renderMarkdown } from "./index";

const parse = (text: string) => {
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(text).html;
  return element;
};

describe("emoji and addresses", () => {
  it("turn :short names: into emoji, and leave shortcuts as text", () => {
    expect(parse(":smile: :) <3 :D ;)\n").textContent?.trim()).toBe(
      "😄 :) <3 :D ;)",
    );
  });

  it("make links of addresses that say their scheme or are in angle brackets", () => {
    expect(
      Array.from(
        parse(
          "https://a.b/c mailto:x@y.z <u@v.w> x@y.z www.a.b README.md\n",
        ).querySelectorAll("a"),
        (a) => a.getAttribute("href"),
      ),
    ).toEqual(["https://a.b/c", "mailto:x@y.z", "mailto:u@v.w"]);
  });
});
