import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { noteLanguage } from "./language";
import { continueTable, nextTableCell, previousTableCell } from "./tables";
import { run } from "./testText";

// "¦" is the caret, or the two ends of the selection.
const readOnly = [noteLanguage, EditorState.readOnly.of(true)];

describe("a table's keys", () => {
  describe.each(["> ", "> > ", "  "])("inside %s", (prefix) => {
    const table = (last: string) =>
      `${prefix}| a | b |\n${prefix}| --- | --- |\n${prefix}${last}`;
    it.each([nextTableCell, continueTable])(
      "preserves the container and column count with %s",
      (command) => {
        expect(run(command, table("| c | d¦ |"), noteLanguage)).toBe(
          table(`| c | d |\n${prefix}| ¦  |   |`),
        );
      },
    );
    it("skips the delimiter in both directions", () => {
      expect(
        run(
          nextTableCell,
          `${prefix}| a | b¦ |\n${prefix}| --- | --- |\n${prefix}| c | d |`,
          noteLanguage,
        ),
      ).toBe(table("| ¦c¦ | d |"));
      expect(run(previousTableCell, table("| ¦c | d |"), noteLanguage)).toBe(
        `${prefix}| a | ¦b¦ |\n${prefix}| --- | --- |\n${prefix}| c | d |`,
      );
    });
    it("ends an empty table row without leaving its container", () => {
      expect(run(continueTable, table("| ¦ |   |"), noteLanguage)).toBe(
        `${prefix}| a | b |\n${prefix}| --- | --- |\n${prefix}¦`,
      );
    });
  });
  it("uses a list item's continuation indentation for new rows", () => {
    expect(
      run(continueTable, "- | a¦ | b |\n  | --- | --- |", noteLanguage),
    ).toBe("- | a | b |\n  | --- | --- |\n  | ¦  |   |");
  });
  describe("Tab", () => {
    it("goes to the next cell and selects what is in it", () => {
      expect(
        run(nextTableCell, "| a¦ | b |\n| --- | --- |\n", noteLanguage),
      ).toBe("| a | ¦b¦ |\n| --- | --- |\n");
    });

    it("goes from the header past the row of dashes", () => {
      expect(
        run(
          nextTableCell,
          "| a | b¦ |\n| --- | --- |\n| c | d |\n",
          noteLanguage,
        ),
      ).toBe("| a | b |\n| --- | --- |\n| ¦c¦ | d |\n");
    });

    it("puts the caret in a cell with nothing in it", () => {
      expect(
        run(nextTableCell, "| a¦ |   |\n| --- | --- |\n", noteLanguage),
      ).toBe("| a | ¦  |\n| --- | --- |\n");
    });

    it("starts a row after the last cell, as wide as the header", () => {
      expect(
        run(
          nextTableCell,
          "| a | b |\n| --- | --- |\n| c | d¦ |",
          noteLanguage,
        ),
      ).toBe("| a | b |\n| --- | --- |\n| c | d |\n| ¦  |   |");
    });

    it("keeps to the cell in a read-only note where a row would be added", () => {
      expect(
        run(nextTableCell, "| a | b |\n| --- | --- |\n| c | d¦ |", readOnly),
      ).toBe("| a | b |\n| --- | --- |\n| c | d¦ |");
    });

    it("reads rows without bars at their ends", () => {
      expect(
        run(nextTableCell, "a¦ | b\n--- | ---\nc | d\n", noteLanguage),
      ).toBe("a | ¦b¦\n--- | ---\nc | d\n");
    });

    it("takes a bar after a backslash as text", () => {
      expect(
        run(nextTableCell, "| a¦ | b \\| c |\n| --- | --- |\n", noteLanguage),
      ).toBe("| a | ¦b \\| c¦ |\n| --- | --- |\n");
    });

    it("is not the table's outside one", () => {
      expect(run(nextTableCell, "Text¦\n", noteLanguage)).toBeUndefined();
      expect(
        run(
          nextTableCell,
          "| a | b |\n| --- | --- |\n| c | d |\n\nText¦\n",
          noteLanguage,
        ),
      ).toBeUndefined();
    });
  });

  describe("Shift+Tab", () => {
    it("goes to the cell before", () => {
      expect(
        run(
          previousTableCell,
          "| a | b |\n| --- | --- |\n| c | d¦ |\n",
          noteLanguage,
        ),
      ).toBe("| a | b |\n| --- | --- |\n| ¦c¦ | d |\n");
    });

    it("goes from the first row under the dashes to the header", () => {
      expect(
        run(
          previousTableCell,
          "| a | b |\n| --- | --- |\n| c¦ | d |\n",
          noteLanguage,
        ),
      ).toBe("| a | ¦b¦ |\n| --- | --- |\n| c | d |\n");
    });

    it("stays in the first cell", () => {
      expect(
        run(
          previousTableCell,
          "| a¦ | b |\n| --- | --- |\n| c | d |\n",
          noteLanguage,
        ),
      ).toBe("| a¦ | b |\n| --- | --- |\n| c | d |\n");
    });
  });

  describe("Enter", () => {
    it("starts a row under the caret's", () => {
      expect(
        run(
          continueTable,
          "| a | b |\n| --- | --- |\n| c¦ | d |\n",
          noteLanguage,
        ),
      ).toBe("| a | b |\n| --- | --- |\n| c | d |\n| ¦  |   |\n");
    });

    it("starts the first row under the dashes, from the header", () => {
      expect(
        run(
          continueTable,
          "| a¦ | b |\n| --- | --- |\n| c | d |\n",
          noteLanguage,
        ),
      ).toBe("| a | b |\n| --- | --- |\n| ¦  |   |\n| c | d |\n");
    });

    it("ends the table from a row with nothing in it", () => {
      expect(
        run(
          continueTable,
          "| a | b |\n| --- | --- |\n| c | d |\n| ¦  |   |\n",
          noteLanguage,
        ),
      ).toBe("| a | b |\n| --- | --- |\n| c | d |\n¦\n");
    });

    it("keeps the indentation of a table that has some", () => {
      expect(
        run(
          continueTable,
          "- item\n\n  | a | b |\n  | --- | --- |\n  | c | d¦ |",
          noteLanguage,
        ),
      ).toBe(
        "- item\n\n  | a | b |\n  | --- | --- |\n  | c | d |\n  | ¦  |   |",
      );
    });

    it("is not the table's outside one, with a selection, or in a read-only note", () => {
      expect(run(continueTable, "Text¦\n", noteLanguage)).toBeUndefined();
      expect(
        run(
          continueTable,
          "| a | b |\n| --- | --- |\n| ¦c¦ | d |\n",
          noteLanguage,
        ),
      ).toBeUndefined();
      expect(
        run(continueTable, "| a | b |\n| --- | --- |\n| c¦ | d |\n", readOnly),
      ).toBeUndefined();
    });
  });
});
