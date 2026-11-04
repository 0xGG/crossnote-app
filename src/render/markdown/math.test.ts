import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./index";

describe("math", () => {
  it("shows the error of an expression KaTeX cannot read as text", () => {
    // The error quotes the expression, "<b" and all.
    const { html } = renderMarkdown("$a<b \\foo$ after\n");
    const element = document.createElement("div");
    element.innerHTML = html;
    const error = element.querySelector("span[style]");
    expect(error.textContent).toContain("Undefined control sequence: \\foo");
    expect(error.textContent).toContain("a<b");
    expect(element.querySelector("b")).toBeNull();
    expect(element.textContent).toContain(" after");
  });
});
