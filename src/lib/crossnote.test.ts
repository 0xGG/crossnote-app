import * as git from "isomorphic-git";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isStored, readStored } from "../test/storedTree";
import Crossnote from "./crossnote";
import { fs, pfs } from "./fs";

// The app runs PouchDB's browser build, on IndexedDB. So do these tests, on
// the fake one, which also keeps the notebook records off the disk.
vi.mock("pouchdb", async () => {
  const browserBuild = "pouchdb/lib/index-browser.es.js";
  return await import(/* @vite-ignore */ browserBuild);
});

const author = { name: "Test", email: "test@example.com" };

// The browser file system writes a file's content at once but its directory
// tree only half a second after the last change, and a page loaded next
// finds only what that tree says. A notebook's folder has to be in the
// stored tree by the time the notebook is reported done.
describe("Crossnote keeps the stored directory tree in step", () => {
  let crossnote: Crossnote;

  beforeAll(() => {
    crossnote = new Crossnote();
  });

  it("with a new notebook's folder, before it records the notebook", async () => {
    // A record without its folder is a notebook that can take no notes.
    const records = crossnote["notebookDB"];
    const put = records.put.bind(records);
    const storedWhenRecorded: boolean[] = [];
    const recording = vi
      .spyOn(records, "put")
      .mockImplementation((async (entry: { dir?: string }) => {
        // The records' search index, set up when the class is built, is
        // written through the same call; only notebooks have a folder.
        if (entry.dir) {
          storedWhenRecorded.push(await isStored(`${entry.dir}/.git/HEAD`));
        }
        return put(entry as Parameters<typeof put>[0]);
      }) as unknown as typeof records.put);

    const notebook = await crossnote.addNotebook({
      name: "Stored",
      corsProxy: "",
      gitURL: "",
    });
    recording.mockRestore();

    // PouchDB can take the call again itself once its database is open, so
    // it may be seen more than once; every time, the folder was stored.
    expect(new Set(storedWhenRecorded)).toEqual(new Set([true]));
    expect(await isStored(`${notebook.dir}/.git/HEAD`)).toBe(true);
  });

  it("with a deleted notebook's folder gone", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Deleted",
      corsProxy: "",
      gitURL: "",
    });
    await fs.promises.flush();

    await crossnote.deleteNotebook(notebook._id);
    expect(await isStored(notebook.dir)).toBe(false);
  });

  it("with the staging area as a hard reset leaves it", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Reset",
      corsProxy: "",
      gitURL: "",
    });
    await pfs.writeFile(`${notebook.dir}/Kept.md`, "# Kept");
    await git.add({ fs, dir: notebook.dir, filepath: "Kept.md" });
    const sha = await git.commit({
      fs,
      dir: notebook.dir,
      message: "Kept",
      author,
    });
    await fs.promises.flush();

    // The reset deletes the staging area's file, content and all. A page
    // loaded before the tree is stored would still find the entry, pointing
    // at content that is gone: a staging area git cannot read.
    await crossnote.hardResetNotebook(notebook, sha);
    const index = `${notebook.dir}/.git/index`;
    const there = await pfs.exists(index);
    expect({
      stored: await isStored(index),
      readable: (await readStored(index)) !== undefined,
    }).toEqual({ stored: there, readable: there });
  });
});
