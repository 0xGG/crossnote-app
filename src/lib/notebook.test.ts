import * as git from "isomorphic-git";
import { beforeAll, describe, expect, it } from "vitest";
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
});
