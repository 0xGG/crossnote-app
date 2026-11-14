import { describe, expect, it } from "vitest";
import { markedOf, stateOf } from "./testText";

describe("marked test documents", () => {
  it.each(["\r\n", "\r", "\n"])(
    "maps selections after %j line endings",
    (eol) => {
      expect(markedOf(stateOf(`a${eol}b¦`))).toBe("a\nb¦");
      expect(markedOf(stateOf(`a¦${eol}b¦c`))).toBe("a¦\nb¦c");
    },
  );
});
