import { describe, expect, it } from "vitest";
import type { Note } from "./note";
import type { Notebook } from "./notebook";
import { tagCompletions, wikiLinkCompletions } from "./noteCompletions";
import Search from "./search";
import { decodeLinkPath } from "../render/markdown/linkTargets";
import { linkAt } from "../editor/links";
import { noteLanguage } from "../editor/language";
import { stateOf } from "../editor/testText";

// A notebook as these read it: its search, over a few notes.
function notebookOf(
  notes: [filePath: string, title: string, aliases?: string[]][],
) {
  const search = new Search();
  for (const [filePath, title, aliases] of notes) {
    search.add(filePath, title, aliases);
  }
  return { search } as unknown as Notebook;
}

const notebook = notebookOf([
  ["README.md", "README"],
  ["Reading list.md", "Reading list"],
  ["folder/Other.md", "Other", ["Second name"]],
  ["folder/Deep.md", "Deep"],
]);
const atRoot = { notebookPath: "/notebooks/a", filePath: "Note.md" } as Note;
const inFolder = {
  notebookPath: "/notebooks/a",
  filePath: "folder/Note.md",
} as Note;

describe("tagCompletions", () => {
  it("gives root notes as tags, including while editing in a folder", () => {
    expect(tagCompletions(notebook, atRoot, "README")).toEqual(["#README"]);
    expect(tagCompletions(notebook, inFolder, "README")).toEqual(["#README"]);
  });

  it("finds them by the start of a word", () => {
    expect(tagCompletions(notebook, atRoot, "READM")).toEqual(["#README"]);
    expect(tagCompletions(notebook, atRoot, "rea").sort()).toEqual([
      "#README",
      "#Reading list#",
    ]);
  });

  it("closes a tag of more than one word with a number sign", () => {
    expect(tagCompletions(notebook, atRoot, "Reading")).toEqual([
      "#Reading list#",
    ]);
  });

  it("leaves out nested notes, including siblings, and gives none for nothing found", () => {
    expect(tagCompletions(notebook, atRoot, "Other")).toEqual([]);
    expect(tagCompletions(notebook, inFolder, "Other")).toEqual([]);
    expect(tagCompletions(notebook, atRoot, "zzz")).toEqual([]);
  });
});

describe("wikiLinkCompletions", () => {
  it("round-trips percent signs in filenames without changing the displayed name", () => {
    const notebook = notebookOf([["Plan%20A.md", "Plan%20A"]]);
    const [link] = wikiLinkCompletions(notebook, atRoot, "Plan");
    expect(link).toBe("[[Plan%2520A|Plan%20A]]");
    const state = stateOf(link + "¦", noteLanguage);
    expect(decodeLinkPath(linkAt(state, 3)!.target) + ".md").toBe(
      "Plan%20A.md",
    );
  });
  it("gives a note beside the one being edited by its name alone", () => {
    expect(wikiLinkCompletions(notebook, atRoot, "README")).toEqual([
      "[[README]]",
    ]);
    expect(wikiLinkCompletions(notebook, inFolder, "Deep")).toEqual([
      "[[Deep]]",
    ]);
  });

  it("gives a note elsewhere by its path from the note being edited, with its name", () => {
    expect(wikiLinkCompletions(notebook, atRoot, "Deep")).toEqual([
      "[[folder/Deep.md|Deep]]",
    ]);
    expect(wikiLinkCompletions(notebook, inFolder, "README")).toEqual([
      "[[../README.md|README]]",
    ]);
  });

  it("finds a note by the start of a word of its name or of an alias", () => {
    expect(wikiLinkCompletions(notebook, atRoot, "READM")).toEqual([
      "[[README]]",
    ]);
    expect(wikiLinkCompletions(notebook, atRoot, "rea").sort()).toEqual([
      "[[README]]",
      "[[Reading list]]",
    ]);
    expect(wikiLinkCompletions(notebook, atRoot, "Sec")).toEqual([
      "[[folder/Other.md|Second name]]",
    ]);
  });

  it("gives a note by the alias that has the words searched for", () => {
    expect(wikiLinkCompletions(notebook, atRoot, "Second")).toEqual([
      "[[folder/Other.md|Second name]]",
    ]);
  });

  it("gives none for nothing found", () => {
    expect(wikiLinkCompletions(notebook, atRoot, "zzz")).toEqual([]);
  });
});
