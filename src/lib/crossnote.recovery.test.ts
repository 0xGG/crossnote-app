import * as git from "isomorphic-git";
import { afterEach, expect, it, vi } from "vitest";
import Crossnote, { convertNotebookToNotebookDBEntry } from "./crossnote";
import { fs, pfs } from "./fs";
import { assertNotebookWritable } from "./notebookOperation";
import { writeNoteOperation } from "./noteWrites";
import { readPullRecovery, savePullRecovery } from "./pullRecovery";

vi.mock("pouchdb", async () => {
  const browserBuild = "pouchdb/lib/index-browser.es.js";
  return await import(/* @vite-ignore */ browserBuild);
});

afterEach(() => vi.restoreAllMocks());

async function notebookWithIncomingCommit() {
  const app = new Crossnote();
  const notebook = await app.addNotebook({ name: "Stored drafts", gitURL: "" });
  const args = { fs, dir: notebook.dir };
  const author = { name: "Test", email: "test@example.test" };
  const commit = async (text: string) => {
    await pfs.writeFile(`${notebook.dir}/README.md`, text);
    await git.add({ ...args, filepath: "README.md" });
    return git.commit({ ...args, author, message: text });
  };
  const base = await commit("Base");
  const remote = await commit("Incoming");
  await git.writeRef({
    ...args,
    ref: "refs/heads/master",
    value: base,
    force: true,
  });
  await git.checkout({ ...args, ref: "master", force: true });
  notebook.localSha = base;
  notebook.remoteSha = base;
  notebook.gitURL = "http://fixture.test/recovery.git";
  const records = app["notebookDB"];
  await records.put({
    ...(await records.get(notebook._id)),
    ...convertNotebookToNotebookDBEntry(notebook, null),
  });
  vi.spyOn(git, "fetch").mockResolvedValue({
    fetchHead: remote,
    fetchHeadDescription: "master",
    defaultBranch: "master",
  });
  return { app, notebook, base, remote, args, records };
}

it("keeps a failed startup download available for retry with ordinary writes locked", async () => {
  const { app, notebook, base, remote } = await notebookWithIncomingCommit();
  const plan = {
    version: 2 as const,
    localSha: base,
    remoteSha: remote,
    files: {},
  };
  await savePullRecovery(notebook._id, plan);
  const checkout = vi
    .spyOn(app, "hardResetNotebook")
    .mockRejectedValueOnce(new Error("Disk full"));
  const reopened = (await app.listNotebooks()).find(
    (entry) => entry._id === notebook._id,
  )!;
  expect(checkout).toHaveBeenCalledOnce();
  expect(reopened).toBeDefined();
  reopened.initSearch();
  expect(await readPullRecovery(notebook._id)).toEqual(plan);
  const location = { notebookPath: reopened.dir, filePath: "README.md" };
  const write = vi.fn(() =>
    pfs.writeFile(`${reopened.dir}/README.md`, "Overwrite"),
  );
  await expect(writeNoteOperation(location, write)).rejects.toThrow(
    "recovery is pending",
  );
  expect(write).not.toHaveBeenCalled();
  const writes = vi.spyOn(pfs, "writeFile");
  expect((await reopened.getNote("README.md", true)).markdown).toBe("Base");
  expect(writes).not.toHaveBeenCalled();
  expect(
    await pfs.readFile(`${reopened.dir}/README.md`, { encoding: "utf8" }),
  ).toBe("Base");
  await app.pullNotebook({ notebook: reopened });
  expect(await readPullRecovery(notebook._id)).toBeUndefined();
  expect((await reopened.getNote("README.md", true)).markdown).toBe("Incoming");
  expect(() => assertNotebookWritable(reopened.dir)).not.toThrow();
});

it("opens and syncs a notebook without consuming its older recovery data", async () => {
  const { app, notebook, base, args, records } =
    await notebookWithIncomingCommit();
  const originalRecord = {
    ...(await records.get(notebook._id)),
    blockedUploadPaths: [".crossnote-recovered/draft.bin", "missing.bin"],
  };
  await records.put(originalRecord);
  const key = `pending/pull/${notebook._id}`;
  const legacy = JSON.stringify({
    localSha: base,
    cache: {
      "local-storage.md": { status: "added", markdown: "Private draft" },
    },
  });
  localStorage.setItem(key, legacy);
  const dbName = "crossnote-pull-recovery";
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pulls");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const privateBytes = new Uint8Array([0, 129, 255]);
  const stored = {
    version: 1,
    localSha: base,
    remoteSha: null as string | null,
    files: { "indexed-db.bin": privateBytes },
    conflicts: [] as string[],
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pulls", "readwrite");
      tx.objectStore("pulls").put(stored, notebook._id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    const openDB = vi.spyOn(indexedDB, "open");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const folders = {
      ".crossnote-recovery.local-abcdef12": "*\n",
      ".crossnote-recovered": "# Crossnote recovered files\n*\n",
    };
    for (const [folder, marker] of Object.entries(folders)) {
      await pfs.writeFile(`${notebook.dir}/${folder}/.gitignore`, marker);
      await pfs.writeFile(`${notebook.dir}/${folder}/draft.bin`, privateBytes);
    }
    const read = vi.spyOn(pfs, "readFile");
    const reopened = (await app.listNotebooks()).find(
      (n) => n._id === notebook._id,
    )!;
    expect(reopened).toBeDefined();
    await app.resumeNotebook(reopened);
    expect(openDB.mock.calls.map(([name]) => name)).not.toContain(dbName);
    expect(getItem).not.toHaveBeenCalledWith(key);
    expect(() => assertNotebookWritable(reopened.dir)).not.toThrow();
    expect(
      await pfs.readFile(`${notebook.dir}/README.md`, { encoding: "utf8" }),
    ).toBe("Base");
    await app.pullNotebook({ notebook: reopened });
    expect(
      await pfs.readFile(`${notebook.dir}/README.md`, { encoding: "utf8" }),
    ).toBe("Incoming");
    expect(await readPullRecovery(notebook._id)).toBeUndefined();
    await pfs.writeFile(`${notebook.dir}/publish.md`, "My new note");
    const push = vi
      .spyOn(git, "push")
      .mockResolvedValue({ ok: true, error: null, refs: {} });
    await expect(app.pushNotebook({ notebook: reopened })).resolves.toBe(
      "uploaded",
    );
    expect(push).toHaveBeenCalledOnce();
    expect(await records.get(notebook._id)).toMatchObject({
      blockedUploadPaths: originalRecord.blockedUploadPaths,
    });
    expect(await git.listFiles({ ...args, ref: reopened.localSha })).toEqual([
      "README.md",
      "publish.md",
    ]);
    for (const [folder, marker] of Object.entries(folders)) {
      const file = `${notebook.dir}/${folder}/draft.bin`;
      expect(read.mock.calls.some(([path]) => path === file)).toBe(false);
      expect(Array.from((await pfs.readFile(file)) as Uint8Array)).toEqual([
        ...privateBytes,
      ]);
      expect(
        await pfs.readFile(`${notebook.dir}/${folder}/.gitignore`, {
          encoding: "utf8",
        }),
      ).toBe(marker);
    }
    expect(await pfs.exists(`${notebook.dir}/local-storage.md`)).toBe(false);
    expect(await pfs.exists(`${notebook.dir}/indexed-db.bin`)).toBe(false);
    expect(openDB.mock.calls.map(([name]) => name)).not.toContain(dbName);
    expect(getItem).not.toHaveBeenCalledWith(key);
    expect(setItem.mock.calls.map(([name]) => name)).not.toContain(key);
    expect(removeItem).not.toHaveBeenCalledWith(key);
    expect(localStorage.getItem(key)).toBe(legacy);
    const retained = await new Promise<typeof stored>((resolve, reject) => {
      const request = db
        .transaction("pulls")
        .objectStore("pulls")
        .get(notebook._id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect({ ...retained, files: Object.keys(retained.files) }).toEqual({
      ...stored,
      files: ["indexed-db.bin"],
    });
    expect(Array.from(retained.files["indexed-db.bin"])).toEqual([
      ...privateBytes,
    ]);
  } finally {
    db.close();
  }
});
