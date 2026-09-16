import { describe, expect, it } from "vitest";
import {
  clampPaneSize,
  draggedPaneSize,
  KEYBOARD_STEP,
  keyedPaneSize,
} from "./SplitPane";

const BOUNDS = { minSize: 150, maxSize: 350 };

describe("clampPaneSize", () => {
  it("leaves a width inside the bounds alone", () => {
    expect(clampPaneSize(300, 150, 350)).toBe(300);
    expect(clampPaneSize(150, 150, 350)).toBe(150);
    expect(clampPaneSize(350, 150, 350)).toBe(350);
  });

  it("pulls a width outside the bounds back in", () => {
    expect(clampPaneSize(10, 150, 350)).toBe(150);
    expect(clampPaneSize(5000, 150, 350)).toBe(350);
  });

  it("falls back to the smallest width for a value that is not a number", () => {
    // What a missing or hand-edited localStorage entry parses to. Passing it
    // on would put `width: NaNpx` on the pane.
    expect(clampPaneSize(Number.NaN, 150, 350)).toBe(150);
    expect(clampPaneSize(Number.POSITIVE_INFINITY, 150, 350)).toBe(150);
  });
});

describe("draggedPaneSize", () => {
  const drag = (
    startSize: number,
    startPosition: number,
    position: number,
    primary: "first" | "second",
  ) =>
    draggedPaneSize({
      startSize,
      startPosition,
      position,
      primary,
      ...BOUNDS,
    });

  it("grows the second pane when the divider moves left", () => {
    expect(drag(300, 800, 760, "second")).toBe(340);
  });

  it("shrinks the second pane when the divider moves right", () => {
    expect(drag(300, 800, 840, "second")).toBe(260);
  });

  it("mirrors the direction when the first pane carries the width", () => {
    expect(drag(300, 800, 760, "first")).toBe(260);
    expect(drag(300, 800, 840, "first")).toBe(340);
  });

  it("sticks at a bound while the pointer keeps going", () => {
    expect(drag(300, 800, 700, "second")).toBe(350);
    expect(drag(300, 800, 200, "second")).toBe(350);
    expect(drag(300, 800, 1000, "second")).toBe(150);
    expect(drag(300, 800, 5000, "second")).toBe(150);
  });

  it("follows the pointer again from the position it stuck at", () => {
    // It stuck going left at 750, where the width first reached 350. Coming
    // back, 750 is where it lets go again - one pixel to the right of that is
    // already off the bound.
    expect(drag(300, 800, 750, "second")).toBe(350);
    expect(drag(300, 800, 751, "second")).toBe(349);
  });
});

describe("keyedPaneSize", () => {
  const key = (k: string, size: number, primary: "first" | "second") =>
    keyedPaneSize(k, size, { primary, ...BOUNDS });

  it("moves the divider one step, not the pane", () => {
    // Left grows the pane on the right and shrinks the one on the left.
    expect(key("ArrowLeft", 300, "second")).toBe(300 + KEYBOARD_STEP);
    expect(key("ArrowRight", 300, "second")).toBe(300 - KEYBOARD_STEP);
    expect(key("ArrowLeft", 300, "first")).toBe(300 - KEYBOARD_STEP);
    expect(key("ArrowRight", 300, "first")).toBe(300 + KEYBOARD_STEP);
  });

  it("stops at the bounds", () => {
    expect(key("ArrowLeft", 348, "second")).toBe(350);
    expect(key("ArrowRight", 152, "second")).toBe(150);
  });

  it("gives the pane its smallest and largest size with Home and End", () => {
    // Unlike the arrow keys these are about the pane, not the direction, so
    // they land on what the separator reports as its minimum and maximum.
    expect(key("Home", 300, "second")).toBe(150);
    expect(key("End", 300, "second")).toBe(350);
    expect(key("Home", 300, "first")).toBe(150);
    expect(key("End", 300, "first")).toBe(350);
  });

  it("returns null for a key it does not handle", () => {
    // The divider has to leave Tab, Enter and the rest to the browser.
    expect(key("Tab", 300, "second")).toBeNull();
    expect(key("ArrowUp", 300, "second")).toBeNull();
    expect(key("a", 300, "second")).toBeNull();
  });
});
