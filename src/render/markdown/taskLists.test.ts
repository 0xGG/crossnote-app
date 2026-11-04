import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./index";

const boxes = (text: string) => {
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(text).html;
  return Array.from(element.querySelectorAll("input"), (input) => ({
    item: input.parentElement?.className,
    line: input.getAttribute("data-line"),
    checked: input.hasAttribute("checked"),
    disabled: input.hasAttribute("disabled"),
    text: input.parentElement?.textContent?.trim(),
  }));
};

describe("task lists", () => {
  it("draw a read-only box with the item's line, in a quote as elsewhere", () => {
    expect(boxes("- [ ] a\n- [x] b\n\n> 1. [X] c\n")).toEqual([
      {
        item: "task-list-item",
        line: "0",
        checked: false,
        disabled: true,
        text: "a",
      },
      {
        item: "task-list-item",
        line: "1",
        checked: true,
        disabled: true,
        text: "b",
      },
      {
        item: "task-list-item",
        line: "3",
        checked: true,
        disabled: true,
        text: "c",
      },
    ]);
  });

  it("leave a box written escaped as text", () => {
    expect(boxes("- \\[ ] not a task\n")).toEqual([]);
  });

  it("leave a box in code as text", () => {
    const text = "~~~\n- [ ] a\n~~~\n\n    - [ ] b\n";
    expect(boxes(text)).toEqual([]);
    const element = document.createElement("div");
    element.innerHTML = renderMarkdown(text).html;
    expect(
      Array.from(element.querySelectorAll("pre"), (pre) => pre.textContent),
    ).toEqual(["- [ ] a\n", "- [ ] b\n"]);
  });
});
