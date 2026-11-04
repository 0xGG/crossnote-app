import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalContainers } from "../containers/global";
import { Note } from "../lib/note";
import { openURL } from "./preview";

const note = {
  notebookPath: "/notebooks/n",
  filePath: "folder/a.md",
} as Note;

describe("openURL", () => {
  const openNoteAtPath = vi.fn();
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    globalContainers.crossnoteContainer = {
      openNoteAtPath,
      getNotebookAtPath: () => "notebook",
    } as any;
    open = vi.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    globalContainers.crossnoteContainer = null;
    openNoteAtPath.mockReset();
    open.mockRestore();
  });

  it("opens another site in a new tab without a handle on this one", () => {
    openURL("https://example.org/page", note);
    expect(open).toHaveBeenCalledWith(
      "https://example.org/page",
      "_blank",
      "noopener",
    );
    expect(openNoteAtPath).not.toHaveBeenCalled();
  });

  it("opens a note by its path, from the notebook or from the note", () => {
    openURL("/top.md", note);
    openURL("sibling%20note.md", note);
    // A wiki link's target that starts like a scheme, as the preview keeps it.
    openURL("./Todo: groceries", note);
    expect(openNoteAtPath.mock.calls).toEqual([
      ["notebook", "top.md"],
      ["notebook", "folder/sibling note.md"],
      ["notebook", "folder/Todo: groceries"],
    ]);
    expect(open).not.toHaveBeenCalled();
  });

  it.each(["mailto:someone@example.org", "tel:+15550100"])(
    "hands %s to the system, as a click on the link would",
    (url) => {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      try {
        openURL(url, note);
        expect(click).toHaveBeenCalledTimes(1);
        expect((click.mock.contexts[0] as HTMLAnchorElement).href).toBe(url);
        expect(open).not.toHaveBeenCalled();
        expect(openNoteAtPath).not.toHaveBeenCalled();
      } finally {
        click.mockRestore();
      }
    },
  );

  it("opens a note whose address is not well percent-encoded as it is written", () => {
    openURL("100%.md", note);
    expect(openNoteAtPath).toHaveBeenCalledWith("notebook", "folder/100%.md");
  });

  it.each([
    "javascript:alert(1)//http://example.org/",
    "JavaScript:alert(1)",
    "data:text/html,https://example.org/",
    "#a-heading",
  ])("neither opens nor creates anything for %s", (url) => {
    openURL(url, note);
    expect(open).not.toHaveBeenCalled();
    expect(openNoteAtPath).not.toHaveBeenCalled();
  });
});
