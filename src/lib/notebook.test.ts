import * as git from "isomorphic-git";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fs, pfs } from "./fs";
import { Notebook } from "./notebook";

// Integration test of the data layer: lightning-fs running on
// fake-indexeddb, exercising note write/read, directory scanning and the
// search index - the same code paths the real app uses.
describe("Notebook", () => {
  let notebook: Notebook;

  beforeAll(async () => {
    await pfs.mkdirp("/notebooks/test");
    // Local notebooks are git-initialized on creation (see Crossnote.addNotebook)
    await git.init({ fs, dir: "/notebooks/test" });
    notebook = new Notebook();
    notebook._id = "test";
    notebook.dir = "/notebooks/test";
    notebook.name = "Test Notebook";
    notebook.initSearch();
    // Seed the notes that the discovery and search tests assert on, and scan
    // them in here, so that every test below stands alone - no test depends
    // on writes performed by an earlier one.
    await notebook.writeNote("hello.md", "# Hello World\n\nBody", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    await notebook.writeNote("pinned.md", "# Pinned", {
      createdAt: new Date(),
      modifiedAt: new Date(),
      pinned: true,
    });
    await notebook.refreshNotes({ dir: "./", includeSubdirectories: true });
  });

  it("writes a note and reads it back without front matter", async () => {
    const note = await notebook.writeNote(
      "roundtrip.md",
      "# Round Trip\n\nBody",
      {
        createdAt: new Date(),
        modifiedAt: new Date(),
      },
    );
    expect(note.filePath).toBe("roundtrip.md");

    const read = await notebook.getNote("roundtrip.md", true);
    // Exact match: front matter must be stripped, and the body must come
    // back unmangled (getNote prepends a "Please fix front-matter" banner
    // on YAML errors, which toContain-style assertions would let through).
    expect(read.markdown).toBe("# Round Trip\n\nBody");
    expect(read.markdown).not.toContain("created:");
  });

  it("persists note config as front matter", async () => {
    await notebook.writeNote("config.md", "# Config", {
      createdAt: new Date(),
      modifiedAt: new Date(),
      pinned: true,
    });
    const read = await notebook.getNote("config.md", true);
    expect(read.config.pinned).toBe(true);
    expect(read.markdown).toBe("# Config");
  });

  it("discovers notes on disk via refreshNotes", async () => {
    const notes = await notebook.refreshNotes({
      dir: "./",
      includeSubdirectories: true,
    });
    const filePaths = Object.keys(notes);
    expect(filePaths).toContain("hello.md");
    expect(filePaths).toContain("pinned.md");
  });

  it("indexes discovered notes for search", () => {
    const results = notebook.search.search("Hello");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toBe("hello.md");
  });

  it("returns null for a missing note", async () => {
    expect(await notebook.getNote("missing.md")).toBeNull();
  });

  it("leaves a note it cannot rename where it was", async () => {
    await notebook.writeNote("source.md", "See [[target]].", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    await notebook.writeNote("target.md", "# Target", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    expect(notebook.referenceMap.getReferredByNotesCount("target.md")).toBe(1);

    await expect(
      notebook.changeNoteFilePath("source.md", "target.md"),
    ).rejects.toThrow("error/target-file-already-exists");

    // Nothing moved, so the note is still listed, still found by search and
    // still links to its target.
    expect(notebook.notes["source.md"]).toBeDefined();
    expect(notebook.search.search("source").map((r) => r.filePath)).toContain(
      "source.md",
    );
    expect(notebook.referenceMap.getReferredByNotesCount("target.md")).toBe(1);
  });

  it("leaves a note where it was when the file system will not move it", async () => {
    await notebook.writeNote("refused.md", "See [[kept]].", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    await notebook.writeNote("kept.md", "# Kept", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    // As a folder on the user's disk does with a name it does not allow,
    // such as one with a colon on Windows.
    const rename = vi
      .spyOn(pfs, "rename")
      .mockRejectedValueOnce(new TypeError("Name is not allowed."));

    await expect(
      notebook.changeNoteFilePath("refused.md", "Q3: plans.md"),
    ).rejects.toThrow("Name is not allowed.");
    rename.mockRestore();

    expect(notebook.notes["refused.md"]).toBeDefined();
    expect(notebook.search.search("refused").map((r) => r.filePath)).toContain(
      "refused.md",
    );
    expect(notebook.referenceMap.getReferredByNotesCount("kept.md")).toBe(1);
  });

  it("moves a note to a path however it is written", async () => {
    await notebook.writeNote("loose.md", "# Loose", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });

    const note = await notebook.changeNoteFilePath(
      "loose.md",
      "./drafts//../tidy.md",
    );
    expect(note.filePath).toBe("tidy.md");
    expect(await pfs.exists("/notebooks/test/tidy.md")).toBe(true);
    expect(await pfs.exists("/notebooks/test/loose.md")).toBe(false);
    // Git takes only paths written plainly; it has the note under its new one.
    expect(
      await git.status({ fs, dir: "/notebooks/test", filepath: "tidy.md" }),
    ).toBe("added");
  });

  it("will not move a note out of its notebook", async () => {
    await notebook.writeNote("inside.md", "# Inside", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });

    await expect(
      notebook.changeNoteFilePath("inside.md", "../outside.md"),
    ).rejects.toThrow();
    expect(await pfs.exists("/notebooks/outside.md")).toBe(false);
    expect(await pfs.exists("/notebooks/test/inside.md")).toBe(true);
    expect(notebook.notes["inside.md"]).toBeDefined();
  });
});
