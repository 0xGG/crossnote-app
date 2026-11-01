import { describe, expect, it } from "vitest";
import { toReference } from "./reference";

const reference = {
  elementId: "wikilink-README-4",
  text: "README",
  link: "README.md",
};

describe("toReference", () => {
  it("takes a reference as the notebook keeps it", () => {
    const kept = { ...reference, lines: [2, 3], context: "See [[README]]." };
    expect(toReference(kept)).toEqual(kept);
  });

  it("reads the block from the tokens an older version kept", () => {
    expect(
      toReference({
        ...reference,
        parentToken: { map: [4, 6], content: "Third [[README]].", level: 1 },
        token: { type: "wikilink" },
      }),
    ).toEqual({
      ...reference,
      lines: [4, 6],
      context: "Third [[README]].",
    });
  });

  it.each([
    ["nothing", undefined],
    ["a string", "README.md"],
    ["no block", reference],
    ["a block with no lines", { ...reference, parentToken: { content: "x" } }],
    [
      "lines that are not lines",
      { ...reference, lines: [-1, "2"], context: "" },
    ],
    ["no link", { elementId: "x", text: "t", lines: [0, 1], context: "" }],
  ])("reads %s as no reference", (_, value) => {
    expect(toReference(value)).toBeUndefined();
  });
});
