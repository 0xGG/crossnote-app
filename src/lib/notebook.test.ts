import * as git from "isomorphic-git";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isStored } from "../test/storedTree";
import { fs, pfs } from "./fs";
import { Notebook, sameNoteText } from "./notebook";

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
    // Exact match: the settings' front matter must be taken out, and the
    // body must come back unmangled, which toContain-style assertions would
    // not tell.
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

  // The browser file system can list a file whose content was never stored,
  // and then reads it as nothing at all.
  it("reads a note listed without its content as empty", async () => {
    await pfs.writeFile("/notebooks/test/contentless.md", "# Listed");
    const readFile = vi
      .spyOn(pfs, "readFile")
      .mockResolvedValueOnce(undefined as unknown as string);
    try {
      const note = await notebook.getNote("contentless.md", true);
      expect(note.markdown).toBe("");
    } finally {
      readFile.mockRestore();
    }
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

  // A note is a file, and nothing goes under a file: on the browser file
  // system a note put there would be out of sight of every listing and of
  // git, as a folder on the user's disk refuses the same.
  it("will not move a note under another note", async () => {
    await notebook.writeNote("under-target.md", "# Target", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    await notebook.writeNote("under-moving.md", "# Moving", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });

    await expect(
      notebook.changeNoteFilePath("under-moving.md", "under-target.md/child"),
    ).rejects.toThrow("ENOTDIR");
    expect(await pfs.exists("/notebooks/test/under-moving.md")).toBe(true);
    expect(notebook.notes["under-moving.md"]).toBeDefined();
    expect(await pfs.exists("/notebooks/test/under-target.md/child.md")).toBe(
      false,
    );
  });

  it("will not write a note under another note", async () => {
    await notebook.writeNote("under-linked.md", "# Linked", {
      createdAt: new Date(),
      modifiedAt: new Date(),
    });

    await expect(
      notebook.writeNote("under-linked.md/new.md", "", {
        createdAt: new Date(),
        modifiedAt: new Date(),
      }),
    ).rejects.toThrow("ENOTDIR");
    expect(await pfs.exists("/notebooks/test/under-linked.md/new.md")).toBe(
      false,
    );
  });

  // The browser file system writes a file's content at once but its
  // directory tree only half a second after the last change, and a page
  // loaded next finds only what that tree says. A change to a note has to be
  // in the stored tree by the time it is reported done.
  describe("keeps the stored directory tree in step", () => {
    const config = () => ({ createdAt: new Date(), modifiedAt: new Date() });

    it("with a note it has just written", async () => {
      await notebook.writeNote("stored-new.md", "# New", config());
      expect(await isStored("/notebooks/test/stored-new.md")).toBe(true);
    });

    it("with the object git keeps for a note it has just saved", async () => {
      await notebook.writeNote("stored-saved.md", "# First", config());
      await fs.promises.flush();

      // Saving the note again stages it, which writes the new text as a new
      // object file; the staging area, already there, points at it at once.
      await notebook.writeNote("stored-saved.md", "# Second", config());
      const { oid } = await git.hashBlob({
        object: (await pfs.readFile("/notebooks/test/stored-saved.md", {
          encoding: "utf8",
        })) as string,
      });
      expect(
        await isStored(
          `/notebooks/test/.git/objects/${oid.slice(0, 2)}/${oid.slice(2)}`,
        ),
      ).toBe(true);
    });

    it("with a note it has just renamed", async () => {
      await notebook.writeNote("stored-before.md", "# Moving", config());
      await fs.promises.flush();

      await notebook.changeNoteFilePath("stored-before.md", "stored-after.md");
      expect(await isStored("/notebooks/test/stored-after.md")).toBe(true);
      expect(await isStored("/notebooks/test/stored-before.md")).toBe(false);
    });

    it("with a note it has just deleted", async () => {
      await notebook.writeNote("stored-deleted.md", "# Deleted", config());
      await fs.promises.flush();

      await notebook.deleteNote("stored-deleted.md");
      expect(await isStored("/notebooks/test/stored-deleted.md")).toBe(false);
    });

    it("with a note it has just brought back from git", async () => {
      const note = await notebook.writeNote(
        "stored-restored.md",
        "# Restored",
        config(),
      );
      await git.commit({
        fs,
        dir: notebook.dir,
        message: "Restored",
        author: { name: "Test", email: "test@example.com" },
      });
      await pfs.unlink("/notebooks/test/stored-restored.md");
      await fs.promises.flush();

      await notebook.checkoutNote(note);
      expect(await pfs.exists("/notebooks/test/stored-restored.md")).toBe(true);
      expect(await isStored("/notebooks/test/stored-restored.md")).toBe(true);
    });
  });

  // An editor keeps the text as it was typed; the notebook, once it has read
  // its notes again from disk, hands the note out less the settings it keeps
  // in the front matter.
  describe("sameNoteText", () => {
    // Each text as typed, and as a new reading hands it back.
    const written: Record<string, [string, string]> = {
      "a flow list": [
        "---\ntags: [a, b]\n---\n\nBody",
        "---\ntags: [a, b]\n---\n\nBody",
      ],
      "quotes and a date": [
        '---\ntitle: "Quoted: yes"\ndate: 2026-09-28\n---\nBody',
        '---\ntitle: "Quoted: yes"\ndate: 2026-09-28\n---\nBody',
      ],
      "a comment": [
        "---\n# kept in mind\ntags:\n  - a\n---\nBody",
        "---\n# kept in mind\ntags:\n  - a\n---\nBody",
      ],
      "a setting typed by hand": [
        "---\npinned: true\ncolor: red\n---\nBody",
        "---\ncolor: red\n---\nBody",
      ],
      "the older settings key": [
        "---\nnote:\n  pinned: true\nx: 1\n---\nBody",
        "---\nx: 1\n---\nBody",
      ],
      "aliases in a line": ["---\naliases: x, y\n---\nBody", "Body"],
      // Kept as it is, not dropped: it is the user's to put right.
      "front matter YAML cannot read": [
        "---\nbroken: [unclosed\n---\nBody",
        "---\nbroken: [unclosed\n---\nBody",
      ],
      "empty front matter": ["---\n---\nBody", "Body"],
      "no front matter": ["Body only", "Body only"],
    };

    it("takes the text a save and a new reading hand back as the same", async () => {
      // Settings that are off are kept as `false`, out of the text as well.
      const settings = [{}, { pinned: false, favorited: false }];
      let i = 0;
      for (const setting of settings) {
        for (const [layout, [text, read]] of Object.entries(written)) {
          i++;
          await notebook.writeNote(`same-${i}.md`, text, {
            createdAt: new Date(),
            modifiedAt: new Date(),
            ...setting,
          });
          await notebook.refreshNotes({
            dir: "./",
            includeSubdirectories: true,
          });
          const readBack = notebook.notes[`same-${i}.md`].markdown;
          const label = `${layout}, ${JSON.stringify(setting)}`;
          expect(readBack, label).toBe(read);
          expect(sameNoteText(text, readBack), label).toBe(true);
        }
      }
    });

    it("tells a change from the settings the notebook keeps", () => {
      const typed = "---\ntags: [a, b]\n---\n\nBody";
      // Settings, wherever in the front matter, are not the text.
      expect(
        sameNoteText(typed, "---\ntags: [a, b]\npinned: true\n---\n\nBody"),
      ).toBe(true);
      expect(
        sameNoteText(
          typed,
          "---\nmodified: 2026-01-01\ntags: [a, b]\n---\n\nBody",
        ),
      ).toBe(true);
      // Laid out anew, which the notebook does not do: changed elsewhere.
      expect(
        sameNoteText(typed, "---\ntags:\n    - a\n    - b\n---\n\nBody"),
      ).toBe(false);
      // The body changed.
      expect(
        sameNoteText(typed, "---\ntags: [a, b]\n---\n\nBody, edited"),
      ).toBe(false);
      expect(sameNoteText("Body", "Body only")).toBe(false);
    });
  });

  // A note's front matter is the user's, but for the settings the notebook
  // keeps in it. Opened, it shows as it is written, less those settings;
  // saved, it is written as it was given, and the settings after it.
  describe("keeps front matter as it was written", () => {
    // The times a save stamps, and those a file without them is given.
    const stamped = (text: string) =>
      text.replace(
        /^(created|modified): \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z(\r?)$/gm,
        "$1: <time>$2",
      );
    const stored = async (filePath: string) =>
      stamped(
        (await pfs.readFile(`/notebooks/test/${filePath}`, {
          encoding: "utf8",
        })) as string,
      );
    // A file the notebook writes its settings in front of, the text kept.
    const settingsBefore = (settings: string, text: string) =>
      `---\n${settings}created: <time>\nmodified: <time>\n---\n${text}`;

    const notes: {
      layout: string;
      file: string;
      // As the editor gets it.
      opened: string;
      // Saved with "Edit" typed at the end.
      edited: string;
      // Saved pinned, nothing typed.
      pinned: string;
    }[] = [
      {
        layout: "values YAML reads as other types",
        file: "---\nphone: 0123456789\nzip: 01234\nversion: 1.10\nhex: 0x1F\ndate: 2026-10-26\n---\nBody\n",
        opened:
          "---\nphone: 0123456789\nzip: 01234\nversion: 1.10\nhex: 0x1F\ndate: 2026-10-26\n---\nBody\n",
        edited:
          "---\nphone: 0123456789\nzip: 01234\nversion: 1.10\nhex: 0x1F\ndate: 2026-10-26\ncreated: <time>\nmodified: <time>\n---\nBody\nEdit",
        pinned:
          "---\nphone: 0123456789\nzip: 01234\nversion: 1.10\nhex: 0x1F\ndate: 2026-10-26\npinned: true\ncreated: <time>\nmodified: <time>\n---\nBody\n",
      },
      {
        layout: "comments, quotes, a block of text, anchors and a flow list",
        file: '---\n# A comment\ntitle: "a: b"\ndesc: |\n  line 1\n  line 2\nbase: &b\n  a: 1\nother: *b\ntags: [x, y]\n---\nBody\n',
        opened:
          '---\n# A comment\ntitle: "a: b"\ndesc: |\n  line 1\n  line 2\nbase: &b\n  a: 1\nother: *b\ntags: [x, y]\n---\nBody\n',
        edited:
          '---\n# A comment\ntitle: "a: b"\ndesc: |\n  line 1\n  line 2\nbase: &b\n  a: 1\nother: *b\ntags: [x, y]\ncreated: <time>\nmodified: <time>\n---\nBody\nEdit',
        pinned:
          '---\n# A comment\ntitle: "a: b"\ndesc: |\n  line 1\n  line 2\nbase: &b\n  a: 1\nother: *b\ntags: [x, y]\npinned: true\ncreated: <time>\nmodified: <time>\n---\nBody\n',
      },
      ...[
        ["half typed", "---\ntitle: Hi\ntags: [work, r3\n---\nBody\n"],
        ["indented with a tab", "---\ntitle: hi\n\tbad: 1\n---\nBody\n"],
        [
          // Each marker after a backslash (lib/crossnote.ts, pullNotebook).
          "conflict markers as the notebook's own merge writes them",
          "---\ntitle: T\n\\<<<<<<< ours\nmodified: 2026-01-01\n\\=======\nmodified: 2026-01-02\n\\>>>>>>> theirs\n---\nBody\n",
        ],
        [
          "conflict markers as git writes them",
          "---\ntitle: T\n<<<<<<< ours\nmodified: 2026-01-01\n=======\nmodified: 2026-01-02\n>>>>>>> theirs\n---\nBody\n",
        ],
        // Rules around a paragraph, or a list: text, not front matter.
        ["a paragraph between rules", "---\nIntro paragraph\n---\nBody\n"],
        ["a list between rules", "---\n- a\n- b\n---\nBody\n"],
        // Four dashes are a rule of the text, not the end of front matter.
        ["four dashes", "---\ntitle: x\n----\nBody\n"],
      ].map(([layout, file]) => ({
        layout: `front matter YAML cannot read: ${layout}`,
        file,
        opened: file,
        edited: settingsBefore("", `${file}Edit`),
        pinned: settingsBefore("pinned: true\n", file),
      })),
      {
        layout: "an empty block",
        file: "---\n---\nBody\n",
        opened: "Body\n",
        edited: settingsBefore("", "Body\nEdit"),
        pinned: settingsBefore("pinned: true\n", "Body\n"),
      },
      {
        layout: "Windows line endings",
        file: "---\r\ntitle: Hi\r\ntags: [a, b]\r\n---\r\nBody\r\nLine 2\r\n",
        opened: "---\r\ntitle: Hi\r\ntags: [a, b]\r\n---\r\nBody\r\nLine 2\r\n",
        edited:
          "---\r\ntitle: Hi\r\ntags: [a, b]\r\ncreated: <time>\r\nmodified: <time>\r\n---\r\nBody\r\nLine 2\r\nEdit",
        pinned:
          "---\r\ntitle: Hi\r\ntags: [a, b]\r\npinned: true\r\ncreated: <time>\r\nmodified: <time>\r\n---\r\nBody\r\nLine 2\r\n",
      },
      {
        layout: "a byte order mark",
        file: "\uFEFF---\ntitle: T\n---\nBody\n",
        opened: "\uFEFF---\ntitle: T\n---\nBody\n",
        edited:
          "\uFEFF---\ntitle: T\ncreated: <time>\nmodified: <time>\n---\nBody\nEdit",
        pinned:
          "\uFEFF---\ntitle: T\npinned: true\ncreated: <time>\nmodified: <time>\n---\nBody\n",
      },
      {
        layout: "settings typed by hand",
        file: "---\ncreated: 2026-01-01\ntitle: T\nmodified: 2026-01-02\n---\nBody\n",
        opened: "---\ntitle: T\n---\nBody\n",
        edited:
          "---\ntitle: T\ncreated: 2026-01-01\nmodified: <time>\n---\nBody\nEdit",
        pinned:
          "---\ntitle: T\ncreated: 2026-01-01\nmodified: <time>\npinned: true\n---\nBody\n",
      },
      {
        layout: "a setting that is off",
        file: "---\ntitle: T\npinned: false\n---\nBody\n",
        opened: "---\ntitle: T\n---\nBody\n",
        edited:
          "---\ntitle: T\npinned: false\ncreated: <time>\nmodified: <time>\n---\nBody\nEdit",
        pinned:
          "---\ntitle: T\npinned: true\ncreated: <time>\nmodified: <time>\n---\nBody\n",
      },
      {
        layout: "aliases in a line",
        file: "---\naliases: x, y\n---\nBody\n",
        opened: "Body\n",
        edited: settingsBefore("aliases: x, y\n", "Body\nEdit"),
        pinned: settingsBefore("aliases: x, y\npinned: true\n", "Body\n"),
      },
      {
        layout: "settings as the notebook wrote them",
        file: "---\ntags:\n    - a\naliases:\n    - x\npinned: true\ncreated: 2026-10-01T10:00:00.000Z\nmodified: 2026-10-02T10:00:00.000Z\n---\nBody\n",
        opened: "---\ntags:\n    - a\n---\nBody\n",
        edited:
          "---\ntags:\n    - a\naliases:\n    - x\npinned: true\ncreated: <time>\nmodified: <time>\n---\nBody\nEdit",
        pinned:
          "---\ntags:\n    - a\naliases:\n    - x\npinned: true\ncreated: <time>\nmodified: <time>\n---\nBody\n",
      },
      {
        layout: "no front matter",
        file: "Body only\n",
        opened: "Body only\n",
        edited: settingsBefore("", "Body only\nEdit"),
        pinned: settingsBefore("pinned: true\n", "Body only\n"),
      },
    ];

    notes.forEach(({ layout, file, opened, edited, pinned }, i) => {
      it(`with ${layout}`, async () => {
        const filePath = `kept-${i}.md`;
        await pfs.writeFile(`/notebooks/test/${filePath}`, file);
        const note = await notebook.getNote(filePath, true);
        expect(note.markdown).toBe(opened);

        await notebook.writeNote(filePath, `${note.markdown}Edit`, {
          ...note.config,
        });
        expect(await stored(filePath)).toBe(edited);
        const editedNote = await notebook.getNote(filePath, true);
        expect(editedNote.markdown).toBe(`${opened}Edit`);
        expect(sameNoteText(`${note.markdown}Edit`, editedNote.markdown)).toBe(
          true,
        );

        await pfs.writeFile(`/notebooks/test/${filePath}`, file);
        const unedited = await notebook.getNote(filePath, true);
        await notebook.writeNote(filePath, unedited.markdown, {
          ...unedited.config,
          pinned: true,
        });
        expect(await stored(filePath)).toBe(pinned);
        const pinnedNote = await notebook.getNote(filePath, true);
        expect(pinnedNote.markdown).toBe(opened);
        expect(pinnedNote.config.pinned).toBe(true);
      });
    });

    it("reads the settings it keeps, however they are written", async () => {
      await pfs.writeFile(
        "/notebooks/test/kept-settings.md",
        "---\ncreated: 2026-01-01\nmodified: 2026-01-02\npinned: false\nfavorited: true\nicon: ':star:'\naliases: x, y\n---\nBody\n",
      );
      const note = await notebook.getNote("kept-settings.md", true);
      expect(note.config).toEqual({
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        modifiedAt: new Date("2026-01-02T00:00:00.000Z"),
        pinned: false,
        favorited: true,
        icon: ":star:",
        aliases: ["x", "y"],
      });
    });

    it("keeps the settings while front matter is half typed", async () => {
      await notebook.writeNote("half-typed.md", "---\ntitle: T\n---\nBody", {
        createdAt: new Date(),
        modifiedAt: new Date(),
        pinned: true,
      });
      const note = await notebook.getNote("half-typed.md", true);

      // Saved as typing pauses with the list not yet closed.
      const halfTyped = "---\ntitle: T\ntags: [a\n---\nBody";
      await notebook.writeNote("half-typed.md", halfTyped, { ...note.config });
      const meanwhile = await notebook.getNote("half-typed.md", true);
      expect(meanwhile.markdown).toBe(halfTyped);
      expect(meanwhile.config.pinned).toBe(true);
      expect(meanwhile.config.createdAt).toEqual(note.config.createdAt);

      // And once it is.
      await notebook.writeNote(
        "half-typed.md",
        "---\ntitle: T\ntags: [a]\n---\nBody",
        { ...meanwhile.config },
      );
      expect(await stored("half-typed.md")).toBe(
        "---\ntitle: T\ntags: [a]\npinned: true\ncreated: <time>\nmodified: <time>\n---\nBody",
      );
    });
  });
});
