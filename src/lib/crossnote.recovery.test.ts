import * as git from "isomorphic-git";
import { expect, it, vi } from "vitest";
import Crossnote, { convertNotebookToNotebookDBEntry } from "./crossnote";
import { fs, pfs } from "./fs";

vi.mock("pouchdb", async () => {
  const browserBuild = "pouchdb/lib/index-browser.es.js";
  return await import(/* @vite-ignore */ browserBuild);
});

// Use the original storage format to exercise recovery during startup.
it("retains a legacy recovery record when startup cannot restore its files", async () => {
  const app = new Crossnote();
  const notebook = await app.addNotebook({ name: "Recover", gitURL: "" });
  await pfs.writeFile(`${notebook.dir}/README.md`, "Base");
  await git.add({ fs, dir: notebook.dir, filepath: "README.md" });
  const base = await git.commit({
    fs,
    dir: notebook.dir,
    message: "Base",
    author: { name: "Test", email: "test@example.test" },
  });
  notebook.localSha = base;
  notebook.remoteSha = base;
  notebook.gitURL = "http://fixture.test/recovery.git";
  const records = app["notebookDB"];
  await records.put({
    ...(await records.get(notebook._id)),
    ...convertNotebookToNotebookDBEntry(notebook, null),
  });
  const key = `pending/pull/${notebook._id}`;
  const pending = JSON.stringify({
    localSha: base,
    cache: {
      "unsaved.md": {
        status: "added",
        markdown: "Only recovery has this text",
      },
    },
  });
  localStorage.setItem(key, pending);
  const write = pfs.writeFile.bind(pfs);
  let attempted = false;
  const blocked = vi
    .spyOn(pfs, "writeFile")
    .mockImplementation(async (file, data) => {
      if (file === `${notebook.dir}/unsaved.md`) {
        attempted = true;
        throw new Error("Disk full");
      }
      return write(file, data);
    });
  try {
    await app.listNotebooks();
    expect(attempted).toBe(true);
    expect(localStorage.getItem(key)).toBe(pending);
  } finally {
    blocked.mockRestore();
  }
  await app.listNotebooks();
  expect(
    await pfs.readFile(`${notebook.dir}/unsaved.md`, { encoding: "utf8" }),
  ).toBe("Only recovery has this text");
  expect(localStorage.getItem(key)).toBeNull();
});
