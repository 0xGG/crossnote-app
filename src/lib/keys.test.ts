import { describe, expect, it } from "vitest";
import { isFinishingEnter } from "./keys";

const keydown = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("isFinishingEnter", () => {
  it("takes a plain Enter", () => {
    expect(isFinishingEnter(keydown({ key: "Enter", keyCode: 13 }))).toBe(true);
  });

  it("leaves an Enter that confirms a candidate to the input method", () => {
    // As Chromium sends it...
    expect(
      isFinishingEnter(
        keydown({ key: "Enter", keyCode: 13, isComposing: true }),
      ),
    ).toBe(false);
    // ...and as Safari does.
    expect(isFinishingEnter(keydown({ key: "Enter", keyCode: 229 }))).toBe(
      false,
    );
  });

  it("takes only the first keydown of an Enter held down", () => {
    // Holding the key repeats its keydown; only the press finishes anything.
    expect(
      isFinishingEnter(keydown({ key: "Enter", keyCode: 13, repeat: true })),
    ).toBe(false);
  });

  it("ignores other keys", () => {
    expect(isFinishingEnter(keydown({ key: "a", keyCode: 65 }))).toBe(false);
  });
});
