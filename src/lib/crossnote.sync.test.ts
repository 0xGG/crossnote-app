import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { afterEach, expect, it, vi } from "vitest";
import { isStored, readStored } from "../test/storedTree";
import Crossnote, { convertNotebookToNotebookDBEntry } from "./crossnote";
import { EventType, globalEmitter } from "./event";
import { RecoveryDirectoryCollisionError } from "./recoveryDirectory";
import { fs, pfs } from "./fs";
import { parentGitTree } from "./gitLinks";
import { RestorePersistenceError } from "./gitRestore";
import { NotebookConflictError } from "./mergeFiles";
import type { Notebook } from "./notebook";
import { assertNotebookWritable } from "./notebookOperation";
import { writeNoteOperation } from "./noteWrites";
import * as recovery from "./pullRecovery";

vi.mock("pouchdb", async () => {
  const browserBuild = "pouchdb/lib/index-browser.es.js";
  return await import(/* @vite-ignore */ browserBuild);
});
afterEach(() => vi.restoreAllMocks());
const author = { name: "Test", email: "test@example.test" };
const bytes = (text: string) => new TextEncoder().encode(text);
const binary = new Uint8Array([137, 80, 0, 255, 128]);
const changed = new Uint8Array([137, 80, 0, 254, 129, 1]);
const remoteBytes = new Uint8Array([137, 80, 0, 253, 130, 2]);

async function saveNotebookFixture(app: Crossnote, notebook: Notebook) {
  const records = app["notebookDB"];
  await records.put({
    ...(await records.get(notebook._id)),
    ...convertNotebookToNotebookDBEntry(notebook, null),
  });
}

async function repository(
  remote: Record<string, Uint8Array | null> = {},
  extraBaseFiles: Record<string, Uint8Array> = {},
) {
  const app = new Crossnote();
  const notebook = await app.addNotebook({ name: "Sync", gitURL: "" });
  const initial = {
    "README.md": bytes("# Kept\n"),
    "assets/a.bin": binary,
    "removed.txt": bytes("delete me\n"),
    ...extraBaseFiles,
  };
  const removeFile = async (file: string) => {
    await pfs.unlink(`${notebook.dir}/${file}`);
    const parts = file.split("/");
    parts.pop();
    while (parts.length) {
      const dir = `${notebook.dir}/${parts.join("/")}`;
      if ((await pfs.readdir(dir)).length) break;
      await pfs.rmdir(dir);
      parts.pop();
    }
  };
  for (const [file, data] of Object.entries(initial)) {
    await pfs.writeFile(`${notebook.dir}/${file}`, data);
    await git.add({ fs, dir: notebook.dir, filepath: file });
  }
  const base = await git.commit({
    fs,
    dir: notebook.dir,
    message: "Base",
    author,
  });
  let theirs = base;
  if (Object.keys(remote).length) {
    for (const [file, data] of Object.entries(remote)) {
      if (data === null) {
        await removeFile(file);
        await git.remove({ fs, dir: notebook.dir, filepath: file });
      } else {
        await pfs.writeFile(`${notebook.dir}/${file}`, data);
        await git.add({ fs, dir: notebook.dir, filepath: file });
      }
    }
    theirs = await git.commit({
      fs,
      dir: notebook.dir,
      message: "Remote",
      author,
    });
    // Return this fixture to its original shape before simulating a fetch.
    for (const [file, data] of Object.entries(remote)) {
      if (data !== null && !(file in initial)) await removeFile(file);
    }
    await app.hardResetNotebook(
      notebook,
      base,
      await parentGitTree(notebook.dir, base),
      true,
    );
    for (const [file, data] of Object.entries(initial)) {
      await pfs.writeFile(`${notebook.dir}/${file}`, data);
    }
    await git.add({ fs, dir: notebook.dir, filepath: "." });
  }
  notebook.gitURL = "http://fixture.test/notebook.git";
  notebook.localSha = base;
  notebook.remoteSha = base;
  await saveNotebookFixture(app, notebook);
  vi.spyOn(git, "fetch").mockResolvedValue({
    fetchHead: theirs,
    fetchHeadDescription: "master",
    defaultBranch: "master",
    headers: {},
  });
  return {
    app,
    notebook,
    base,
    theirs,
    // LightningFS decorates read buffers with toString. Compare byte values,
    // not that helper or the IndexedDB clone's prototype realm.
    read: async (file: string) =>
      Array.from((await pfs.readFile(`${notebook.dir}/${file}`)) as Uint8Array),
  };
}

const emptyRemote: git.FetchResult = {
  fetchHead: null,
  fetchHeadDescription: null,
  defaultBranch: null,
};

it("keeps staged regular bytes when the incoming path becomes a symlink", async () => {
  const file = "Shortcut.md";
  const { app, notebook, base, read } = await repository(
    {},
    { [file]: bytes("old note") },
  );
  const args = { fs, dir: notebook.dir };
  const { tree } = await git.readTree({ ...args, oid: base });
  const link = await git.writeBlob({ ...args, blob: bytes("README.md") });
  const remote = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Link the shortcut",
    tree: await git.writeTree({
      ...args,
      tree: tree.map((entry) =>
        entry.path === file ? { ...entry, mode: "120000", oid: link } : entry,
      ),
    }),
  });
  vi.mocked(git.fetch).mockResolvedValue({ ...emptyRemote, fetchHead: remote });
  await pfs.writeFile(notebook.dir + "/" + file, "local note");
  await git.add({ ...args, filepath: file });
  const index = await read(".git/index");
  await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
    files: [file],
  });
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  expect(await read(".git/index")).toEqual(index);
  expect(await read(file)).toEqual([...bytes("local note")]);
  expect(await read("README.md")).toEqual([...bytes("# Kept\n")]);

  await pfs.writeFile(notebook.dir + "/" + file, "old note");
  await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
    files: [file],
  });
  expect(await read(".git/index")).toEqual(index);

  await recovery.savePullRecovery(notebook._id, {
    version: 1,
    localSha: base,
    remoteSha: remote,
    files: { [file]: bytes("pending note") },
    conflicts: [],
    deletions: {},
  });
  await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
    files: [file],
  });
  expect(await read(".git/index")).toEqual(index);
  expect(await read("README.md")).toEqual([...bytes("# Kept\n")]);
});

it.each(["present", "missing", "staged deletion", "retargeted without index"])(
  "treats a tracked directory symlink as a leaf during a download (%s)",
  async (state) => {
    const { app, notebook, read } = await repository();
    const args = { fs, dir: notebook.dir };
    const name = notebook.dir + "/Alias";
    await fs.promises.symlink("assets", name);
    const link = await git.writeBlob({ ...args, blob: bytes("assets") });
    await git.updateIndex({
      ...args,
      filepath: "Alias",
      oid: link,
      mode: 0o120000,
      add: true,
    });
    const base = await git.commit({ ...args, author, message: "Add alias" });
    const { tree } = await git.readTree({ ...args, oid: base });
    const oid = await git.writeBlob({ ...args, blob: bytes("updated note") });
    const remote = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Update note",
      tree: await git.writeTree({
        ...args,
        tree: tree.map((entry) =>
          entry.path === "README.md" ? { ...entry, oid } : entry,
        ),
      }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: remote,
    });
    if (state === "staged deletion")
      await git.remove({ ...args, filepath: "Alias" });
    if (state === "missing" || state === "retargeted without index")
      await pfs.unlink(notebook.dir + "/.git/index");
    if (state === "retargeted without index") {
      await pfs.unlink(name);
      await fs.promises.symlink("removed.txt", name);
    }
    if (state === "staged deletion" || state === "retargeted without index") {
      const index =
        state === "staged deletion" ? await read(".git/index") : null;
      await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
        files: ["Alias"],
      });
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
      expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
      if (index) expect(await read(".git/index")).toEqual(index);
      expect(await fs.promises.readlink(name)).toBe(
        index ? "./assets" : "./removed.txt",
      );
      expect(await read("README.md")).toEqual([...bytes("# Kept\n")]);
      return;
    }
    const listing = vi.spyOn(fs.promises, "readdir");
    await app.pullNotebook({ notebook });
    expect(listing).toHaveBeenCalledWith(notebook.dir + "/assets");
    expect(listing).not.toHaveBeenCalledWith(name);
    expect(await fs.promises.readlink(name)).toBe("./assets");
    expect((await parentGitTree(notebook.dir)).symlinks.get("Alias")).toBe(
      link,
    );
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(remote);
    expect(await read("README.md")).toEqual([...bytes("updated note")]);
    expect(await git.listFiles(args)).toEqual(
      await git.listFiles({ ...args, ref: remote }),
    );
  },
);

it("downloads a clean symlink change to a directory and back", async () => {
  const { app, notebook } = await repository();
  const args = { fs, dir: notebook.dir };
  const file = "Alias";
  const name = notebook.dir + "/" + file;
  await fs.promises.symlink("assets", name);
  await git.add({ ...args, filepath: file });
  const base = await git.commit({ ...args, author, message: "Link to assets" });
  const { tree } = await git.readTree({ ...args, oid: base });
  const note = await git.writeBlob({ ...args, blob: bytes("ordinary note") });
  const folder = await git.writeTree({
    ...args,
    tree: [{ path: "note.md", type: "blob", mode: "100644", oid: note }],
  });
  const incoming = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Track alias directory",
    tree: await git.writeTree({
      ...args,
      tree: tree.map((entry) =>
        entry.path === file
          ? { path: file, mode: "040000", type: "tree", oid: folder }
          : entry,
      ),
    }),
  });
  vi.mocked(git.fetch).mockResolvedValue({
    ...emptyRemote,
    fetchHead: incoming,
  });
  await pfs.unlink(name);
  await fs.promises.symlink("README.md", name);
  await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
    files: [file],
  });
  expect(await fs.promises.readlink(name)).toBe("./README.md");
  await pfs.unlink(name);
  await fs.promises.symlink("assets", name);
  await app.pullNotebook({ notebook });
  expect(await pfs.readFile(name + "/note.md", { encoding: "utf8" })).toBe(
    "ordinary note",
  );
  expect(await git.listFiles(args)).toEqual(
    await git.listFiles({ ...args, ref: incoming }),
  );
  const reverse = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Restore link to assets",
    tree: await git.writeTree({ ...args, tree }),
  });
  vi.mocked(git.fetch).mockResolvedValue({
    ...emptyRemote,
    fetchHead: reverse,
  });
  await app.pullNotebook({ notebook });
  expect(await fs.promises.readlink(name)).toBe("./assets");
  expect(await git.listFiles(args)).toEqual(
    await git.listFiles({ ...args, ref: reverse }),
  );
});

it("requires a new reset preview after rebuilding the index over a draft", async () => {
  const { app, notebook, read } = await repository();
  const draft = "nested/draft.md";
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(notebook.dir + "/" + draft, "untracked draft");
  const preview = await app.previewReset(notebook);
  expect(preview.files).not.toContain(draft);
  await pfs.unlink(notebook.dir + "/.git/index");
  await app.listNotebooks();
  expect(await git.listFiles(args)).toContain(draft);
  const rebuilt = await read(".git/index");
  await expect
    .soft(app.resetToHead(notebook, preview))
    .rejects.toThrow("error/reset-target-changed");
  expect.soft(await pfs.exists(notebook.dir + "/" + draft)).toBe(true);
  expect.soft(await read(".git/index")).toEqual(rebuilt);
  const second = await app.previewReset(notebook);
  expect(second.files).toContain(draft);
  await pfs.writeFile(notebook.dir + "/" + draft, "new staged content");
  await git.add({ ...args, filepath: draft });
  const revised = await read(".git/index");
  await expect(app.resetToHead(notebook, second)).rejects.toThrow(
    "error/reset-target-changed",
  );
  expect(await read(".git/index")).toEqual(revised);
  expect(
    await pfs.readFile(notebook.dir + "/" + draft, { encoding: "utf8" }),
  ).toBe("new staged content");
  const third = await app.previewReset(notebook);
  await pfs.writeFile(notebook.dir + "/README.md", "another working edit");
  await expect(app.resetToHead(notebook, third)).rejects.toThrow(
    "error/reset-target-changed",
  );
  expect(await read(".git/index")).toEqual(revised);
  expect(
    await pfs.readFile(notebook.dir + "/README.md", { encoding: "utf8" }),
  ).toBe("another working edit");
  await app.resetToHead(notebook, await app.previewReset(notebook));
  expect(await git.listFiles(args)).not.toContain(draft);
  expect(await pfs.exists(notebook.dir + "/" + draft)).toBe(false);
});

it("reports a change when a link disappears or becomes a file during a status read", async () => {
  const { app, notebook, read } = await repository();
  const args = { fs, dir: notebook.dir };
  const file = "Shortcut.md";
  const name = notebook.dir + "/" + file;
  await fs.promises.symlink("README.md", name);
  await git.add({ ...args, filepath: file });
  await git.commit({ ...args, author, message: "Track a relative shortcut" });
  const index = await read(".git/index");
  const status = () => app.getStatus(notebook.dir, file);
  const readlink = fs.promises.readlink.bind(fs.promises);
  const link = vi.spyOn(fs.promises, "readlink");
  for (const replacement of [false, true]) {
    expect(await status()).toBe("unmodified");
    link.mockImplementationOnce(async (path) => {
      await pfs.unlink(path);
      if (replacement) await pfs.writeFile(path, "ordinary note");
      return readlink(path);
    });
    await expect.soft(status()).resolves.toBe("*modified");
    expect(await status()).toBe(replacement ? "*modified" : "*deleted");
    if (replacement) await pfs.unlink(name);
    await fs.promises.symlink("README.md", name);
  }
  const failure = new Error("Link read failed");
  link.mockRejectedValueOnce(failure);
  await expect(status()).rejects.toBe(failure);
  expect(await status()).toBe("unmodified");
  expect(await read(".git/index")).toEqual(index);
  expect(await read("README.md")).toEqual([...bytes("# Kept\n")]);
});

it("shares status reads within a notebook batch and observes later index changes", async () => {
  const { app, notebook, read } = await repository();
  const args = { fs, dir: notebook.dir };
  const status = vi.spyOn(git, "status");
  const readStatus = () => app.getStatus(notebook.dir, "README.md");
  expect(
    await Promise.all([
      readStatus(),
      app.getStatus(notebook.dir, "assets/a.bin"),
    ]),
  ).toEqual(["unmodified", "unmodified"]);
  const batch = status.mock.calls[0][0].cache;
  expect(batch).toBeDefined();
  expect(status.mock.calls[1][0].cache).toBe(batch);
  await pfs.writeFile(notebook.dir + "/README.md", "longer edited note");
  expect(await readStatus()).toBe("*modified");
  expect(status.mock.calls[2][0].cache).not.toBe(batch);
  await git.add({ ...args, filepath: "README.md" });
  expect(await readStatus()).toBe("modified");
  await pfs.unlink(notebook.dir + "/.git/index");
  expect(await readStatus()).toBe("*undeletemodified");
  await app.listNotebooks();
  expect(await readStatus()).toBe("modified");
  await git.checkout({
    ...args,
    ref: "HEAD",
    filepaths: ["README.md"],
    force: true,
  });
  expect(await readStatus()).toBe("unmodified");
  // Recreating identical bytes changes the file stats. Displaying its status
  // must still leave the on-disk index alone.
  const index = await read(".git/index");
  const file = notebook.dir + "/README.md";
  await pfs.unlink(file);
  await pfs.writeFile(file, "# Kept\n");
  expect(await readStatus()).toBe("unmodified");
  expect(await read(".git/index")).toEqual(index);
});

it("only fills missing blob entries when staging a fast-forward checkout", async () => {
  const { app, notebook, theirs } = await repository({
    "new.md": bytes("remote note"),
  });
  const args = { fs, dir: notebook.dir };
  const checkout = app.hardResetNotebook.bind(app);
  const populateIndex = git.add;
  vi.spyOn(app, "hardResetNotebook").mockImplementation(async (...params) => {
    await checkout(...params);
    // Model a partial checkout index with two skipped working files.
    await populateIndex({ ...args, filepath: "." });
    await git.remove({ ...args, filepath: "README.md" });
    await git.remove({ ...args, filepath: "assets/a.bin" });
  });
  const add = vi.spyOn(git, "add");
  await app.pullNotebook({ notebook });
  const staged = add.mock.calls.map(([options]) => options.filepath);
  expect(staged).toHaveLength(1);
  expect(staged[0]).toEqual(
    expect.arrayContaining(["README.md", "assets/a.bin"]),
  );
  expect(staged[0]).toHaveLength(2);
  expect(await git.listFiles(args)).toEqual(
    await git.listFiles({ ...args, ref: theirs }),
  );
});

it("records an empty remote check and lets a manual pull retry immediately", async () => {
  const { app, notebook, base, theirs, read } = await repository({
    "new.md": bytes("remote"),
  });
  await pfs.writeFile(`${notebook.dir}/README.md`, "local edit");
  await pfs.storeTree(notebook.dir);
  notebook.fetchedAt = new Date(0);
  notebook.autoFetchPeriod = 3600000;
  await saveNotebookFixture(app, notebook);
  // Another tab can change settings while this notebook is still open.
  const registered = await app["notebookDB"].get(notebook._id);
  await app["notebookDB"].put({ ...registered, name: "Renamed" });
  const before = await app["notebookDB"].get(notebook._id);
  const started = Date.now();
  const write = vi.spyOn(pfs, "writeFile");
  vi.mocked(git.fetch)
    .mockResolvedValueOnce(emptyRemote)
    .mockResolvedValueOnce(emptyRemote);
  expect(await app.fetchNotebook({ notebook })).toBe(false);
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "error/remote-has-no-commits",
  );
  const checked = await app["notebookDB"].get(notebook._id);
  expect(notebook.fetchedAt.getTime()).toBeGreaterThanOrEqual(started);
  expect(new Date(checked.fetchedAt)).toEqual(notebook.fetchedAt);
  expect(checked).toEqual({
    ...before,
    fetchedAt: checked.fetchedAt,
    _rev: checked._rev,
  });
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  expect(write).not.toHaveBeenCalled();
  expect(await git.resolveRef({ fs, dir: notebook.dir, ref: "HEAD" })).toBe(
    base,
  );
  await app.pullNotebook({ notebook });
  expect(notebook.localSha).toBe(theirs);
  expect(await read("README.md")).toEqual([...bytes("local edit")]);
  expect(await read("new.md")).toEqual([...bytes("remote")]);
  expect(await app["notebookDB"].get(notebook._id)).toMatchObject({
    name: "Renamed",
    localSha: theirs,
    remoteSha: theirs,
  });
});

it("pulls a first commit into an empty clone with a staged local note", async () => {
  vi.spyOn(http, "request").mockImplementationOnce(async ({ url }) => ({
    url,
    statusCode: 200,
    statusMessage: "OK",
    headers: { "content-type": "application/x-git-upload-pack-advertisement" },
    body: (async function* () {
      yield bytes("001e# service=git-upload-pack\n00000000");
    })(),
  }));
  const app = new Crossnote();
  const notebook = await app.cloneNotebook({
    gitURL: "http://fixture.test/empty.git",
    corsProxy: "",
  });
  expect(notebook.localSha).toBe("");
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(`${notebook.dir}/nested/local.md`, "staged locally");
  await notebook.storeNote("nested/local.md");
  expect(await git.listFiles(args)).toEqual(["nested/local.md"]);

  // Supply the fetched objects without changing this clone's index or HEAD.
  const oid = await git.writeBlob({ ...args, blob: bytes("remote first") });
  const tree = await git.writeTree({
    ...args,
    tree: [{ mode: "100644", path: "remote.md", type: "blob", oid }],
  });
  const signature = { ...author, timestamp: 1700000000, timezoneOffset: 0 };
  const first = await git.writeCommit({
    ...args,
    commit: {
      tree,
      parent: [],
      author: signature,
      committer: signature,
      message: "First",
    },
  });
  vi.spyOn(git, "fetch").mockResolvedValue({
    fetchHead: first,
    fetchHeadDescription: "master",
    defaultBranch: "master",
  });
  const write = pfs.writeFile.bind(pfs);
  const interrupt = vi
    .spyOn(pfs, "writeFile")
    .mockImplementation(async (file, data) => {
      if (file === `${notebook.dir}/nested/local.md`)
        throw new Error("Interrupted first pull");
      return write(file, data);
    });
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "Interrupted first pull",
  );
  expect((await recovery.readPullRecovery(notebook._id))?.localSha).toBe("");
  interrupt.mockRestore();
  const reopened = (await app.listNotebooks()).find(
    (n) => n._id === notebook._id,
  )!;
  expect(reopened.localSha).toBe(first);
  expect(
    await pfs.readFile(`${notebook.dir}/nested/local.md`, { encoding: "utf8" }),
  ).toBe("staged locally");
  expect(
    await pfs.readFile(`${notebook.dir}/remote.md`, { encoding: "utf8" }),
  ).toBe("remote first");
  vi.spyOn(git, "push").mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({
    notebook: reopened,
    authorName: author.name,
    authorEmail: author.email,
  });
  expect(await git.listFiles({ ...args, ref: "HEAD" })).toEqual([
    "nested/local.md",
    "remote.md",
  ]);
});

it("recovers a legacy cache without resetting an unborn branch", async () => {
  const app = new Crossnote();
  const notebook = await app.addNotebook({ name: "Unborn", gitURL: "" });
  notebook.gitURL = "http://fixture.test/empty.git";
  await saveNotebookFixture(app, notebook);
  const key = `pending/pull/${notebook._id}`;
  localStorage.setItem(
    key,
    JSON.stringify({
      localSha: "",
      cache: {
        "legacy.md": {
          status: "added",
          markdown: "saved before a first commit",
        },
      },
    }),
  );
  const reopened = (await app.listNotebooks()).find(
    (n) => n._id === notebook._id,
  )!;
  expect(reopened.localSha).toBe("");
  expect(await pfs.exists(`${notebook.dir}/.git/refs/heads/master`)).toBe(
    false,
  );
  expect(
    await pfs.readFile(`${notebook.dir}/legacy.md`, { encoding: "utf8" }),
  ).toBe("saved before a first commit");
  expect(localStorage.getItem(key)).toBeNull();
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
});

it("reopens a notebook left with only an empty fetch marker and retries its background check", async () => {
  const { app, notebook, base, theirs } = await repository({
    "new.md": bytes("remote"),
  });
  await app["notebookDB"].put({
    ...(await app["notebookDB"].get(notebook._id)),
    remoteSha: null,
  });
  const write = vi.spyOn(pfs, "writeFile");
  const reopened = (await app.listNotebooks()).find(
    (n) => n._id === notebook._id,
  )!;
  expect(reopened.remoteSha).toBe(base);
  expect(
    write.mock.calls.filter(
      ([file]) =>
        file.startsWith(notebook.dir + "/") &&
        !file.startsWith(notebook.dir + "/.git/"),
    ),
  ).toEqual([]);
  vi.mocked(git.fetch).mockResolvedValueOnce(emptyRemote);
  expect(await app.fetchNotebook({ notebook: reopened })).toBe(false);
  expect((await app["notebookDB"].get(notebook._id)).remoteSha).toBe(base);
  expect(await app.fetchNotebook({ notebook: reopened })).toBe(true);
  expect((await app["notebookDB"].get(notebook._id)).remoteSha).toBe(theirs);
});

it.each(["missing", "known"])(
  "preserves newer registry settings when recovering a %s remote revision",
  async (revision) => {
    const { app, notebook, base, theirs } = await repository({
      "new.md": bytes("remote"),
    });
    const plan: recovery.PullRecovery = {
      version: 1,
      localSha: base,
      remoteSha: base,
      files: {},
      conflicts: [],
    };
    Reflect.set(plan, "remoteSha", null);
    await recovery.savePullRecovery(notebook._id, plan);

    // A second tab has updated the registry since this notebook was opened.
    const db = app["notebookDB"];
    await db.put({
      ...(await db.get(notebook._id)),
      name: "Renamed",
      gitURL: "https://example.test/renamed.git",
      localSha: revision === "missing" ? theirs : base,
      remoteSha: revision === "missing" ? null : theirs,
    });
    const before = await db.get(notebook._id);
    await app.resumeNotebook(notebook);
    const after = await db.get(notebook._id);
    expect(after).toEqual({ ...before, remoteSha: theirs, _rev: after._rev });
    if (revision === "known") expect(after._rev).toBe(before._rev);
    expect(notebook.remoteSha).toBe(theirs);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  },
);

it("reopens an old empty-remote plan without losing working, committed or recovery-only bytes", async () => {
  const { app, notebook, base, theirs, read } = await repository({
    "new.md": bytes("remote"),
  });
  await app["notebookDB"].put({
    ...(await app["notebookDB"].get(notebook._id)),
    remoteSha: null,
  });
  // listFiles(null) read the index. With a tracked file removed from that
  // index but still on disk, the old replay unlinked it before reset failed.
  await git.remove({ fs, dir: notebook.dir, filepath: "README.md" });
  await pfs.unlink(`${notebook.dir}/README.md`);
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "/live.md\n");
  await pfs.writeFile(`${notebook.dir}/live.md`, "newer working text");
  await pfs.writeFile(`${notebook.dir}/folder`, "now a file");
  await pfs.writeFile(
    `${notebook.dir}/.crossnote-recovered/keep.md`,
    "unrelated folder",
  );
  // Existing files are protected here, but the pending copies would be visible.
  await pfs.writeFile(
    `${notebook.dir}/.crossnote-recovered/.gitignore`,
    "# Crossnote recovered files\n*\n!recovered-*.md\n",
  );
  await pfs.unlink(`${notebook.dir}/removed.txt`);
  await git.remove({ fs, dir: notebook.dir, filepath: "removed.txt" });
  const oldPlan: recovery.PullRecovery = {
    version: 1,
    localSha: base,
    remoteSha: base,
    files: {
      "missing/cache.bin": changed,
      "folder/old.md": bytes("child from before"),
      "live.md": bytes("earlier recovery text"),
      "removed.txt": null,
    },
    conflicts: [],
  };
  // Reproduce the old persisted shape through the same IndexedDB store.
  Reflect.set(oldPlan, "remoteSha", null);
  await recovery.savePullRecovery(notebook._id, oldPlan);
  const remove = vi
    .spyOn(recovery, "deletePullRecovery")
    .mockRejectedValueOnce(new Error("Interrupted cleanup"));
  await expect(app.resumeNotebook(notebook)).rejects.toThrow(
    "Interrupted cleanup",
  );
  const interrupted = await recovery.readPullRecovery(notebook._id);
  expect(interrupted?.remoteSha).toBeNull();
  expect(Array.from(interrupted!.files["missing/cache.bin"]!)).toEqual([
    ...changed,
  ]);
  expect(
    Array.from((await readStored(`${notebook.dir}/missing/cache.bin`))!),
  ).toEqual([...changed]);
  remove.mockRestore();
  const reopened = (await app.listNotebooks()).find(
    (n) => n._id === notebook._id,
  );
  expect(reopened).toBeDefined();
  expect(reopened!.remoteSha).toBe(base);
  expect((await app["notebookDB"].get(notebook._id)).remoteSha).toBe(base);
  expect(await read("README.md")).toEqual([...bytes("# Kept\n")]);
  expect(await read("missing/cache.bin")).toEqual([...changed]);
  expect(await read("live.md")).toEqual([...bytes("newer working text")]);
  const copies = ".crossnote-recovered-1";
  expect(await read(`${copies}/recovered-live.md`)).toEqual([
    ...bytes("earlier recovery text"),
  ]);
  expect(await read(`${copies}/recovered-old.md`)).toEqual([
    ...bytes("child from before"),
  ]);
  expect(await read("folder")).toEqual([...bytes("now a file")]);
  expect(await read(".crossnote-recovered/keep.md")).toEqual([
    ...bytes("unrelated folder"),
  ]);
  expect(await pfs.exists(`${notebook.dir}/.crossnote-recovered-2`)).toBe(
    false,
  );
  expect(await pfs.exists(`${notebook.dir}/removed.txt`)).toBe(false);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  expect(await git.resolveRef({ fs, dir: notebook.dir, ref: "HEAD" })).toBe(
    base,
  );
  await app.pullNotebook({ notebook: reopened! });
  expect(reopened!.localSha).toBe(theirs);
  expect(await read("missing/cache.bin")).toEqual([...changed]);
  vi.spyOn(git, "push").mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({
    notebook: reopened!,
    authorName: author.name,
    authorEmail: author.email,
  });
  const committed = await git.listFiles({ fs, dir: notebook.dir, ref: "HEAD" });
  expect(committed.filter((file) => file.startsWith(copies + "/"))).toEqual([]);
  expect(committed).not.toContain("live.md");
  expect(committed).not.toContain("removed.txt");
});

it.each([
  ["recovered-note.md", "# Crossnote recovered files\n*\n"],
  [".gitignore", "# Crossnote recovered files\n*\n# local comment\n"],
  [".gitignore", "# Crossnote recovered files\r\n*\r\n"],
  [".gitignore", "# Crossnote recovered files \t\n*\n"],
  [".gitignore", "# Crossnote recovered files\n*\t\n"],
  [".gitignore", "# Crossnote recovered files\n*\n!absent.md\n"],
  [".gitignore", "# Crossnote recovered files\n*\n!*.md\nrecovered-*.md\n"],
  ["", "!recovered-note.md\n# Crossnote recovered files\n*\n"],
])(
  "preserves an ignored recovery directory when the remote claims %j",
  async (collision, marker) => {
    const directory = ".crossnote-recovered";
    const remotePath = collision ? `${directory}/${collision}` : directory;
    const { app, notebook, read, theirs } = await repository(
      { [remotePath]: bytes("remote content") },
      {
        ".gitignore": bytes("# Root rules\n"),
        "recovered-note.md": bytes("public note with the same name"),
      },
    );
    const original = `${directory}/recovered-note.md`;
    await pfs.writeFile(`${notebook.dir}/${directory}/.gitignore`, marker);
    await pfs.writeFile(`${notebook.dir}/${original}`, "private note");
    await pfs.writeFile(
      `${notebook.dir}/${directory}/recovered-data.bin`,
      binary,
    );
    const args = { fs, dir: notebook.dir };
    const beforeIndex = await read(".git/index");
    const beforeHead = await git.resolveRef({ ...args, ref: "HEAD" });
    const save = vi.spyOn(recovery, "savePullRecovery");
    const upload = vi
      .spyOn(git, "push")
      .mockResolvedValue({ ok: true, error: null, refs: {} });
    for (const sync of [
      () => app.pullNotebook({ notebook }),
      () => app.pushNotebook({ notebook }),
    ]) {
      const error = await sync().catch((error) => error);
      expect(error).toBeInstanceOf(RecoveryDirectoryCollisionError);
      expect(error.directory).toBe(directory);
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(beforeHead);
      expect(await read(".git/index")).toEqual(beforeIndex);
      expect(await read(original)).toEqual([...bytes("private note")]);
    }
    expect(save).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    const snapshot = await app.readRecoveryFiles(notebook, directory);
    expect([...snapshot.get(".gitignore")!]).toEqual([...bytes(marker)]);
    expect([...snapshot.get("recovered-data.bin")!]).toEqual([...binary]);
    await app.releaseRecoveryFiles(notebook, directory, snapshot, () => true);
    await app.pushNotebook({ notebook });
    expect(await read(remotePath)).toEqual([...bytes("remote content")]);
    const uploaded = await git.readCommit({ ...args, oid: notebook.localSha });
    const remote = await git.readCommit({ ...args, oid: theirs });
    expect(uploaded.commit.tree).toBe(remote.commit.tree);
  },
);

it.each([
  "*\n# my local directory\n",
  "# Crossnote recovered files\n*.tmp\n",
  "# Crossnote recovered files\n*\n!recovered-note.md\n",
  "# Crossnote recovered files\n *\n",
  "# Crossnote recovered files\n*\\ \n",
])(
  "leaves a user-managed directory with ignore rules %j in place",
  async (marker) => {
    const directory = ".crossnote-recovered";
    const { app, notebook, read } = await repository({
      [`${directory}/remote.md`]: bytes("remote note"),
    });
    await pfs.writeFile(`${notebook.dir}/${directory}/.gitignore`, marker);
    const note = `${directory}/recovered-note.md`;
    await pfs.writeFile(`${notebook.dir}/${note}`, "local note");
    await expect(app.readRecoveryFiles(notebook, directory)).rejects.toThrow(
      "error/recovery-files-changed",
    );
    await app.pullNotebook({ notebook });
    expect(await read(note)).toEqual([...bytes("local note")]);
    expect(await pfs.exists(`${notebook.dir}/.crossnote-recovered-1`)).toBe(
      false,
    );
  },
);

it.each([
  ".crossnote-recovery.local-abcdef12",
  ".crossnote-recovery.local-abcdef12-1",
])(
  "pauses for an untracked legacy directory %s without claiming its contents",
  async (directory) => {
    const { app, notebook, read } = await repository({
      [`${directory}/remote.md`]: bytes("remote fixture"),
    });
    await pfs.writeFile(`${notebook.dir}/${directory}/.gitignore`, "*\n");
    const save = vi
      .spyOn(recovery, "savePullRecovery")
      .mockRejectedValue(new Error("unexpected plan"));
    await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
      directory,
      canRelease: false,
    });
    expect(save).not.toHaveBeenCalled();
    const snapshot = await app.readRecoveryFiles(notebook, directory);
    expect([...snapshot.get(".gitignore")!]).toEqual([...bytes("*\n")]);
    await expect(
      app.releaseRecoveryFiles(notebook, directory, snapshot, () => true),
    ).rejects.toThrow("error/recovery-files-changed");
    expect(await read(`${directory}/.gitignore`)).toEqual([...bytes("*\n")]);
    save.mockRestore();
    vi.mocked(git.fetch).mockResolvedValueOnce({
      fetchHead: notebook.localSha,
      defaultBranch: "master",
      fetchHeadDescription: "master",
    });
    await app.pullNotebook({ notebook });
    expect(await read(`${directory}/.gitignore`)).toEqual([...bytes("*\n")]);
  },
);

it("validates the whole recovery snapshot and open documents before releasing files", async () => {
  const { app, notebook, read } = await repository();
  const dir = ".crossnote-recovered-2";
  const root = `${notebook.dir}/${dir}`;
  const marker = "# Crossnote recovered files\n*\n";
  await pfs.writeFile(`${root}/.gitignore`, marker);
  await pfs.writeFile(`${root}/assets/recovered.bin`, binary);
  const snapshot = await app.readRecoveryFiles(notebook, dir);
  await expect(
    app.releaseRecoveryFiles(notebook, dir, snapshot, () => false),
  ).rejects.toThrow("error/close-recovery-notes");
  expect(await read(`${dir}/assets/recovered.bin`)).toEqual([...binary]);
  await pfs.writeFile(`${root}/assets/recovered.bin`, changed);
  await expect(
    app.releaseRecoveryFiles(notebook, dir, snapshot, () => true),
  ).rejects.toThrow("error/recovery-files-changed");
  expect(await read(`${dir}/assets/recovered.bin`)).toEqual([...changed]);
  await pfs.writeFile(`${root}/assets/recovered.bin`, binary);
  await pfs.writeFile(`${root}/second.md`, "added");
  await expect(
    app.releaseRecoveryFiles(notebook, dir, snapshot, () => true),
  ).rejects.toThrow("error/recovery-files-changed");
  expect(await read(`${dir}/second.md`)).toEqual([...bytes("added")]);
  const latest = await app.readRecoveryFiles(notebook, dir);
  await app.releaseRecoveryFiles(notebook, dir, latest, () => true);
  expect(await pfs.exists(root)).toBe(false);
});

it("protects a newly tracked recovery directory from a stale release", async () => {
  const dir = ".crossnote-recovered";
  const { app, notebook, read } = await repository({
    [`${dir}/remote.md`]: bytes("remote"),
  });
  const marker = `${notebook.dir}/${dir}/.gitignore`;
  await pfs.writeFile(marker, "# Crossnote recovered files\n*\n");
  const snapshot = await app.readRecoveryFiles(notebook, dir);
  await pfs.writeFile(marker, "");
  await git.add({ fs, dir: notebook.dir, filepath: `${dir}/.gitignore` });
  await pfs.writeFile(marker, snapshot.get(".gitignore")!);
  await expect(
    app.releaseRecoveryFiles(notebook, dir, snapshot, () => true),
  ).rejects.toThrow("error/recovery-files-changed");
  await app.pullNotebook({ notebook });
  expect(await read(`${dir}/remote.md`)).toEqual([...bytes("remote")]);
});

it.each([false, true])(
  "refreshes deleted notes and aliases after release (interrupted: %s)",
  async (interrupted) => {
    const { app, notebook } = await repository();
    const directory = ".crossnote-recovered";
    const file = directory + "/note.md";
    await pfs.writeFile(
      `${notebook.dir}/${directory}/.gitignore`,
      "# Crossnote recovered files\n*\n",
    );
    await pfs.writeFile(
      `${notebook.dir}/${file}`,
      "---\naliases: keptalias\n---\n[readme](../README.md)",
    );
    await notebook.refreshNotes({ dir: "./", includeSubdirectories: true });
    expect(await notebook.getNote(file)).toBeDefined();
    expect(
      notebook.search.search("keptalias").map((hit) => hit.filePath),
    ).toEqual([file]);
    expect(await notebook.getReferredByNotes("README.md")).toHaveProperty([
      file,
    ]);
    const snapshot = await app.readRecoveryFiles(notebook, directory);
    const refresh = vi.spyOn(notebook, "refreshNotes");
    const notify = vi.spyOn(globalEmitter, "emit");
    await expect(
      app.releaseRecoveryFiles(notebook, directory, snapshot, () => false),
    ).rejects.toThrow("error/close-recovery-notes");
    expect(refresh).not.toHaveBeenCalled();
    if (interrupted)
      vi.spyOn(fs.promises, "rmdir").mockRejectedValueOnce(
        new Error("Interrupted release"),
      );
    const release = app.releaseRecoveryFiles(
      notebook,
      directory,
      snapshot,
      () => true,
    );
    if (interrupted)
      await expect(release).rejects.toThrow("Interrupted release");
    else await release;
    expect(await pfs.exists(`${notebook.dir}/${file}`)).toBe(false);
    expect(await notebook.getNote(file)).toBeNull();
    expect(notebook.notes).not.toHaveProperty([file]);
    expect(notebook.search.search("keptalias")).toEqual([]);
    expect(await notebook.getReferredByNotes("README.md")).not.toHaveProperty([
      file,
    ]);
    expect(notify).toHaveBeenCalledWith(
      EventType.DeletedNote,
      expect.objectContaining({
        notebookPath: notebook.dir,
        noteFilePath: file,
      }),
    );
    expect(notify).not.toHaveBeenCalledWith(
      EventType.PerformedGitOperation,
      expect.anything(),
    );
  },
);

it("keeps the marker when releasing a recovery directory fails and permits a fresh retry", async () => {
  const { app, notebook, read } = await repository();
  const dir = ".crossnote-recovered";
  const root = `${notebook.dir}/${dir}`;
  const marker = "# Crossnote recovered files\n*\n";
  await pfs.writeFile(`${root}/.gitignore`, marker);
  await pfs.writeFile(`${root}/recovered.bin`, binary);
  const snapshot = await app.readRecoveryFiles(notebook, dir);
  vi.spyOn(fs.promises, "rmdir").mockRejectedValueOnce(
    new Error("Interrupted release"),
  );
  await expect(
    app.releaseRecoveryFiles(notebook, dir, snapshot, () => true),
  ).rejects.toThrow("Interrupted release");
  expect(await read(`${dir}/.gitignore`)).toEqual([...bytes(marker)]);
  const remaining = await app.readRecoveryFiles(notebook, dir);
  expect([...remaining.keys()]).toEqual([".gitignore"]);
  await app.releaseRecoveryFiles(notebook, dir, remaining, () => true);
  expect(await pfs.exists(root)).toBe(false);
});

it.each([
  [".crossnote-recovered-1", "# Crossnote recovered files\n*\n"],
  [".crossnote-recovery.local-abcdef12", "*\n"],
])(
  "replays a previously persisted recovery directory relocation to %s on startup",
  async (moved, rules) => {
    const dir = ".crossnote-recovered";
    const { app, notebook, base, theirs, read } = await repository({
      [dir]: bytes("remote"),
    });
    const marker = bytes(rules);
    await pfs.writeFile(`${notebook.dir}/${dir}/.gitignore`, marker);
    await pfs.writeFile(`${notebook.dir}/${dir}/recovered.bin`, binary);
    await recovery.savePullRecovery(notebook._id, {
      version: 1,
      localSha: base,
      remoteSha: theirs,
      files: {
        [`${moved}/.gitignore`]: marker,
        [`${moved}/recovered.bin`]: binary,
      },
      relocated: {
        [`${dir}/.gitignore`]: `${moved}/.gitignore`,
        [`${dir}/recovered.bin`]: `${moved}/recovered.bin`,
      },
      conflicts: [],
    });
    const reopened = (await app.listNotebooks()).find(
      (n) => n._id === notebook._id,
    );
    expect(reopened?.localSha).toBe(theirs);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    expect(await read(dir)).toEqual([...bytes("remote")]);
    expect(await read(`${moved}/recovered.bin`)).toEqual([...binary]);
    expect(await read(`${moved}/.gitignore`)).toEqual([...marker]);
  },
);

it("keeps working and staged changes on an unchanged remote without replacing the worktree", async () => {
  const { app, notebook, read } = await repository();
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
  await pfs.writeFile(`${notebook.dir}/assets/new.bin`, remoteBytes);
  await git.add({ fs, dir: notebook.dir, filepath: "assets/new.bin" });
  await pfs.unlink(`${notebook.dir}/removed.txt`);
  await git.remove({ fs, dir: notebook.dir, filepath: "removed.txt" });
  const plan = vi.spyOn(recovery, "savePullRecovery");
  const reset = vi.spyOn(app, "hardResetNotebook");
  const index = await read(".git/index");
  const result = await app.pullNotebook({ notebook });
  expect(result.status).toBe("up-to-date");
  expect(reset).not.toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
  expect(await read(".git/index")).toEqual(index);
  expect(result.numConflicts).toBe(0);
  expect(await read("assets/a.bin")).toEqual([...changed]);
  expect(await read("assets/new.bin")).toEqual([...remoteBytes]);
  expect(await pfs.exists(`${notebook.dir}/removed.txt`)).toBe(false);
  expect(
    new TextDecoder().decode(new Uint8Array(await read("README.md"))),
  ).toBe("# Kept\n");
  expect(await isStored(`${notebook.dir}/assets/new.bin`)).toBe(true);
  expect(
    Array.from((await readStored(`${notebook.dir}/assets/new.bin`))!),
  ).toEqual([...remoteBytes]);
  expect(await git.listFiles({ fs, dir: notebook.dir })).toEqual([
    "README.md",
    "assets/a.bin",
    "assets/new.bin",
  ]);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  expect(localStorage.getItem(`pending/pull/${notebook._id}`)).toBeNull();
  const reopened = (await app.listNotebooks()).find(
    (item) => item._id === notebook._id,
  )!;
  expect(reopened.localSha).toBe(notebook.localSha);
  expect(await read(".git/index")).toEqual(index);
});

it("keeps both binary sides, avoids an existing copy name and stops this push", async () => {
  const { app, notebook, theirs, read } = await repository({
    "assets/a.bin": remoteBytes,
    "removed.txt": null,
  });
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
  const existing = `assets/a.remote-${theirs.slice(0, 8)}.bin`;
  await pfs.writeFile(`${notebook.dir}/${existing}`, bytes("unrelated"));
  await git.add({ fs, dir: notebook.dir, filepath: existing });
  const push = vi.spyOn(git, "push");
  await expect(
    app.pushNotebook({
      notebook,
      ...author,
      authorName: author.name,
      authorEmail: author.email,
    }),
  ).rejects.toBeInstanceOf(NotebookConflictError);
  expect(push).not.toHaveBeenCalled();
  expect(await read("assets/a.bin")).toEqual([...changed]);
  expect(await read(existing)).toEqual([...bytes("unrelated")]);
  expect(await read(`assets/a.remote-${theirs.slice(0, 8)}-1.bin`)).toEqual([
    ...remoteBytes,
  ]);
  expect(await pfs.exists(`${notebook.dir}/removed.txt`)).toBe(false);
});

it("preserves equal-sized edits made in the same second as checkout", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1700000000100);
  const ours = new Uint8Array([137, 80, 0, 254, 129]);
  const { app, notebook, read } = await repository();
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, ours);
  await app.pullNotebook({ notebook });
  expect(await read("assets/a.bin")).toEqual([...ours]);
});

it("moves a local file aside when the remote replaces it with a directory and replays the same plan", async () => {
  const { app, notebook, theirs, read } = await repository({
    "removed.txt": null,
    "removed.txt/child.md": bytes("remote child"),
  });
  await pfs.writeFile(`${notebook.dir}/removed.txt`, bytes("local edit"));
  const copy = `removed.local-${theirs.slice(0, 8)}.txt`;
  // A directory at the first proposed copy name must also be avoided.
  await pfs.writeFile(`${notebook.dir}/${copy}/keep.md`, bytes("unrelated"));
  const kept = `removed.local-${theirs.slice(0, 8)}-1.txt`;
  const write = pfs.writeFile.bind(pfs);
  const failing = vi
    .spyOn(pfs, "writeFile")
    .mockImplementation(async (file, data) => {
      if (file.endsWith(kept)) throw new Error("Copy write failed");
      return write(file, data);
    });
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "Copy write failed",
  );
  const plan = await recovery.readPullRecovery(notebook._id);
  expect(plan?.relocated).toEqual({ "removed.txt": kept });
  expect(plan?.files["removed.txt"]).toBeUndefined();
  expect([...plan!.files[kept]!]).toEqual([...bytes("local edit")]);
  failing.mockRestore();
  const reopened = (await new Crossnote().listNotebooks()).find(
    (n) => n._id === notebook._id,
  );
  expect(reopened?.localSha).toBe(theirs);
  expect(await read(kept)).toEqual([...bytes("local edit")]);
  expect(await read("removed.txt/child.md")).toEqual([
    ...bytes("remote child"),
  ]);
  expect(await read(`${copy}/keep.md`)).toEqual([...bytes("unrelated")]);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
});

it("preserves changed and ignored children when a remote file replaces their directory", async () => {
  const { app, notebook, theirs, read } = await repository({
    "assets/a.bin": null,
    "assets": bytes("remote file"),
    ".gitignore": bytes("*.ignored\n"),
  });
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "*.ignored\n");
  await pfs.writeFile(
    `${notebook.dir}/assets/nested/private.ignored`,
    bytes("keep ignored"),
  );
  const result = await app.pullNotebook({ notebook });
  expect(result.conflicts).toContain("assets/a.bin");
  expect(await read("assets")).toEqual([...bytes("remote file")]);
  expect(await read(`a.local-${theirs.slice(0, 8)}.bin`)).toEqual([...changed]);
  expect(
    await read(
      `.crossnote-recovered/private.local-${theirs.slice(0, 8)}.ignored`,
    ),
  ).toEqual([...bytes("keep ignored")]);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
});

it.each(["incoming", "existing"] as const)(
  "names a relocated edit blocked by an %s ignore rule on upload after reopening",
  async (rule) => {
    const privateRule = "*.ignored\n";
    const copyRule = "*.local-*\n";
    const { app, notebook, theirs, read } = await repository(
      {
        "assets/a.bin": null,
        "assets": bytes("remote file"),
        ".gitignore": bytes(privateRule + copyRule),
      },
      {
        ".gitignore": bytes(
          privateRule + (rule === "existing" ? copyRule : ""),
        ),
      },
    );
    await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
    await pfs.writeFile(
      `${notebook.dir}/assets/nested/private.ignored`,
      "private draft",
    );
    const copy = `a.local-${theirs.slice(0, 8)}.bin`;
    const privateCopy = `.crossnote-recovered/private.local-${theirs.slice(0, 8)}.ignored`;
    const result = await app.pullNotebook({ notebook });
    expect(result.conflicts).toContain(copy);
    expect(await read(copy)).toEqual([...changed]);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();

    const restarted = new Crossnote();
    const reopened = (await restarted.listNotebooks()).find(
      (entry) => entry._id === notebook._id,
    )!;
    await pfs.writeFile(`${notebook.dir}/README.md`, "unrelated edit");
    const args = { fs, dir: notebook.dir };
    let sent: string | undefined;
    const push = vi.spyOn(git, "push").mockImplementation(async ({ ref }) => {
      const target = await git.expandRef({ ...args, ref: ref! });
      sent = await git.resolveRef({ ...args, ref: target });
      return { ok: true, error: null, refs: {} };
    });
    await expect(
      restarted.pushNotebook({ notebook: reopened }),
    ).rejects.toMatchObject({
      filepath: copy,
    });
    expect(push).not.toHaveBeenCalled();
    expect(result.ignoredUploadFile).toBe(copy);
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(theirs);

    await pfs.writeFile(`${notebook.dir}/.gitignore`, privateRule);
    await restarted.pushNotebook({ notebook: reopened });
    expect(push).toHaveBeenCalledOnce();
    expect(sent).toBe(reopened.remoteSha);
    const { blob } = await git.readBlob({
      ...args,
      oid: sent!,
      filepath: copy,
    });
    expect([...blob]).toEqual([...changed]);
    expect(await git.listFiles({ ...args, ref: sent! })).not.toContain(
      privateCopy,
    );
    expect(await read(privateCopy)).toEqual([...bytes("private draft")]);
  },
);

it("keeps reporting an ignored tracked edit after download relocates it", async () => {
  const file = "assets/a.bin";
  const { app, notebook, theirs, read } = await repository(
    { [file]: null, assets: bytes("remote file") },
    { ".gitignore": bytes("assets/a.bin\nassets/private.bin\n") },
  );
  await pfs.writeFile(`${notebook.dir}/${file}`, changed);
  await pfs.writeFile(`${notebook.dir}/assets/private.bin`, binary);
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  const suffix = `local-${theirs.slice(0, 8)}.bin`;
  const copy = `.crossnote-recovered/a.${suffix}`;
  const privateCopy = `.crossnote-recovered/private.${suffix}`;
  const result = await app.pullNotebook({ notebook });
  expect(result.conflicts).toContain(copy);
  expect(await read(copy)).toEqual([...changed]);

  const restarted = new Crossnote();
  const reopened = (await restarted.listNotebooks()).find(
    (entry) => entry._id === notebook._id,
  )!;
  await pfs.writeFile(`${notebook.dir}/README.md`, "unrelated edit");
  await expect(
    restarted.pushNotebook({ notebook: reopened }),
  ).rejects.toMatchObject({ filepath: copy });
  expect(push).not.toHaveBeenCalled();
  expect(result.ignoredUploadFile).toBe(copy);

  const restored = "restored.bin";
  await pfs.rename(`${notebook.dir}/${copy}`, `${notebook.dir}/${restored}`);
  await restarted.pushNotebook({ notebook: reopened });
  expect(push).toHaveBeenCalledOnce();
  const args = { fs, dir: notebook.dir };
  const { blob } = await git.readBlob({
    ...args,
    oid: reopened.remoteSha,
    filepath: restored,
  });
  expect([...blob]).toEqual([...changed]);
  expect(
    await git.listFiles({ ...args, ref: reopened.remoteSha }),
  ).not.toContain(privateCopy);
  expect(await read(privateCopy)).toEqual([...binary]);
});

it("keeps an ignored local file when the remote introduces a directory at its path", async () => {
  const { app, notebook, theirs, read } = await repository({
    "private.ignored/remote.md": bytes("remote"),
  });
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "*.ignored\n");
  await pfs.writeFile(
    `${notebook.dir}/private.ignored`,
    bytes("private bytes"),
  );
  const result = await app.pullNotebook({ notebook });
  expect(result.conflicts).toContain("private.ignored");
  expect(
    await read(
      `.crossnote-recovered/private.local-${theirs.slice(0, 8)}.ignored`,
    ),
  ).toEqual([...bytes("private bytes")]);
  expect(await read("private.ignored/remote.md")).toEqual([...bytes("remote")]);
});

it("keeps directory-ignored recovery bytes out of replay and later upload commits", async () => {
  const { app, notebook, theirs, read } = await repository({
    "private": bytes("remote file"),
    ".gitignore": bytes("private/\n"),
  });
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "private/\n");
  await pfs.writeFile(
    `${notebook.dir}/private/credentials.txt`,
    bytes("secret"),
  );
  const occupied = ".crossnote-recovered";
  await pfs.writeFile(
    `${notebook.dir}/${occupied}/keep.txt`,
    bytes("unrelated"),
  );
  const write = pfs.writeFile.bind(pfs);
  const failing = vi
    .spyOn(pfs, "writeFile")
    .mockImplementation(async (file, data) => {
      if (file.includes(`credentials.local-${theirs.slice(0, 8)}`))
        throw new Error("Private copy write failed");
      return write(file, data);
    });
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "Private copy write failed",
  );
  const plan = await recovery.readPullRecovery(notebook._id);
  const copy = plan!.conflicts.find((file) =>
    file.endsWith(`credentials.local-${theirs.slice(0, 8)}.txt`),
  )!;
  expect([...plan!.files[copy]!]).toEqual([...bytes("secret")]);
  expect(copy).toMatch(/^\.crossnote-recovered-1\//);
  expect(plan!.files[".crossnote-recovered-1/.gitignore"]).toEqual(
    bytes("# Crossnote recovered files\n*\n"),
  );
  failing.mockRestore();
  const restarted = new Crossnote();
  const reopened = (await restarted.listNotebooks()).find(
    (n) => n._id === notebook._id,
  )!;
  expect(reopened.localSha).toBe(theirs);
  expect(await read(copy)).toEqual([...bytes("secret")]);
  expect(await read("private")).toEqual([...bytes("remote file")]);
  expect(await read(`${occupied}/keep.txt`)).toEqual([...bytes("unrelated")]);
  expect(await git.listFiles({ fs, dir: notebook.dir })).not.toContain(copy);
  expect(await git.status({ fs, dir: notebook.dir, filepath: copy })).toBe(
    "ignored",
  );
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  // The plan is gone now: the next pull and a recursive add must still leave
  // these bytes out of the index, rather than protecting just the first replay.
  await restarted.pullNotebook({ notebook: reopened });
  await git.add({ fs, dir: notebook.dir, filepath: "." });
  expect(await git.listFiles({ fs, dir: notebook.dir })).not.toContain(copy);
  vi.spyOn(git, "push").mockResolvedValue({ ok: true, error: null, refs: {} });
  await restarted.pushNotebook({
    notebook: reopened,
    authorName: author.name,
    authorEmail: author.email,
  });
  const committed = await git.listFiles({ fs, dir: notebook.dir, ref: "HEAD" });
  expect(committed).not.toContain(copy);
  expect(
    committed.some((file) =>
      file.startsWith(`${copy.slice(0, copy.lastIndexOf("/"))}/`),
    ),
  ).toBe(false);
  expect(await read(copy)).toEqual([...bytes("secret")]);
});

it("keeps a path-ignored file private when it must move for a remote directory", async () => {
  const { app, notebook, theirs, read } = await repository({
    "private.txt/remote.md": bytes("remote"),
  });
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "/private.txt\n");
  await pfs.writeFile(`${notebook.dir}/private.txt`, bytes("secret"));
  const result = await app.pullNotebook({ notebook });
  const copy = result.conflicts.find((file) =>
    file.endsWith(`private.local-${theirs.slice(0, 8)}.txt`),
  )!;
  expect(await read(copy)).toEqual([...bytes("secret")]);
  expect(await git.listFiles({ fs, dir: notebook.dir })).not.toContain(copy);
  await app.pullNotebook({ notebook });
  expect(await git.listFiles({ fs, dir: notebook.dir })).not.toContain(copy);
  expect(await read("private.txt/remote.md")).toEqual([...bytes("remote")]);
});

it("does not replay a local deletion over a remote directory", async () => {
  const { app, notebook, read } = await repository({
    "removed.txt": null,
    "removed.txt/child.md": bytes("remote child"),
  });
  await pfs.unlink(`${notebook.dir}/removed.txt`);
  const result = await app.pullNotebook({ notebook });
  expect(result.numConflicts).toBe(0);
  expect(await read("removed.txt/child.md")).toEqual([
    ...bytes("remote child"),
  ]);
  expect(await git.listFiles({ fs, dir: notebook.dir })).toContain(
    "removed.txt/child.md",
  );
});

it("keeps recovery after a failed restore, retries at startup and reuses the same conflict copy", async () => {
  const { app, notebook, read, theirs } = await repository({
    "assets/a.bin": remoteBytes,
  });
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
  const original = pfs.writeFile.bind(pfs);
  const writing = vi
    .spyOn(pfs, "writeFile")
    .mockImplementation(async (file, data) => {
      if (file.includes(".remote-")) throw new Error("Disk full");
      return original(file, data);
    });
  await expect(app.pullNotebook({ notebook })).rejects.toThrow("Disk full");
  const pending = await recovery.readPullRecovery(notebook._id);
  expect(Array.from(pending!.files["assets/a.bin"]!)).toEqual([...changed]);
  expect(() => assertNotebookWritable(notebook.dir)).toThrow("recovery");
  expect(
    (await app.listNotebooks()).find((item) => item._id === notebook._id),
  ).toBeUndefined();
  expect(JSON.stringify(await recovery.readPullRecovery(notebook._id))).toBe(
    JSON.stringify(pending),
  );
  writing.mockRestore();
  // Remove the originals: success must come from durable recovery, not a
  // checkout which happened to leave modified or new working files alone.
  await pfs.unlink(`${notebook.dir}/assets/a.bin`);
  const next = new Crossnote();
  const reopened = (await next.listNotebooks()).find(
    (item) => item._id === notebook._id,
  );
  expect(reopened?.localSha).toBe(theirs);
  expect(await read("assets/a.bin")).toEqual([...changed]);
  expect(await read(`assets/a.remote-${theirs.slice(0, 8)}.bin`)).toEqual([
    ...remoteBytes,
  ]);
  expect(
    (await pfs.readdir(`${notebook.dir}/assets`)).filter((file) =>
      file.includes(".remote-"),
    ),
  ).toHaveLength(1);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  expect(() => assertNotebookWritable(notebook.dir)).not.toThrow();
});

it("retains recovery when Git reports a refused checkout write", async () => {
  const { app, notebook, read } = await repository({
    "README.md": bytes("Remote text\n"),
  });
  const original = fs.promises.writeFile.bind(fs.promises);
  let failures = 0;
  const failWrite: typeof fs.promises.writeFile = async (
    file,
    data,
    options,
  ) => {
    if (file === `${notebook.dir}/README.md`) {
      failures++;
      throw new Error("Checkout write refused");
    }
    return original(file, data, options);
  };
  // Git caches bound methods by filesystem identity. Give this real checkout
  // a fresh adapter so the injected failure reaches its actual write loop.
  const checkout = git.checkout;
  vi.spyOn(git, "checkout").mockImplementationOnce((args) =>
    checkout({
      ...args,
      fs: {
        promises: new Proxy(fs.promises, {
          get(target, key) {
            if (key === "writeFile") return failWrite;
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
      },
    }),
  );
  await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
    code: "MultipleGitError",
    data: {
      errors: [expect.objectContaining({ message: "Checkout write refused" })],
    },
  });
  // Git's write helper retries once after mkdir; both attempts must fail.
  expect(failures).toBe(2);
  expect(await recovery.readPullRecovery(notebook._id)).toBeDefined();
  expect(await read("README.md")).toEqual([...bytes("# Kept\n")]);
  await app.resumeNotebook(notebook);
  expect(await read("README.md")).toEqual([...bytes("Remote text\n")]);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
});

it("syncs and recovers names containing colons in the browser file system", async () => {
  const { app, notebook, base, read } = await repository();
  const file = "Meeting: plan.md";
  await pfs.writeFile(`${notebook.dir}/${file}`, "Draft");
  await app.pullNotebook({ notebook });
  expect(await read(file)).toEqual([...bytes("Draft")]);
  localStorage.setItem(
    `pending/pull/${notebook._id}`,
    JSON.stringify({
      localSha: base,
      cache: { [file]: { status: "modified", markdown: "Recovered" } },
    }),
  );
  await app.resumeNotebook(notebook);
  expect(await read(file)).toEqual([...bytes("Recovered")]);
});

it("retains deletion intent in interrupted recovery and reports it on retry", async () => {
  const { app, notebook } = await repository({
    "assets/a.bin": null,
    "removed.txt": bytes("Remote modified\n"),
  });
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
  await pfs.unlink(`${notebook.dir}/removed.txt`);
  vi.spyOn(app, "hardResetNotebook").mockRejectedValueOnce(
    new Error("Interrupted"),
  );
  await expect(app.pullNotebook({ notebook })).rejects.toThrow("Interrupted");
  const deletions = { "assets/a.bin": "remote", "removed.txt": "local" };
  expect(
    (await recovery.readPullRecovery(notebook._id))?.deletions,
  ).toMatchObject(deletions);
  await expect(app.resumeNotebook(notebook)).rejects.toMatchObject({
    deletions,
  });
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
});

it("persists fetched objects before publishing a recovery plan", async () => {
  const { app, notebook, theirs } = await repository({
    "new.md": bytes("remote"),
  });
  const object = `${notebook.dir}/.git/objects/pack/new-fetch.pack`;
  vi.mocked(git.fetch).mockImplementationOnce(async () => {
    await pfs.writeFile(object, binary);
    return {
      fetchHead: theirs,
      fetchHeadDescription: "master",
      defaultBranch: "master",
      headers: {},
    };
  });
  const save = recovery.savePullRecovery;
  const publish = vi
    .spyOn(recovery, "savePullRecovery")
    .mockImplementationOnce(async (id, plan) => {
      expect(Array.from((await readStored(object)) ?? [])).toEqual([...binary]);
      return save(id, plan);
    });
  await app.pullNotebook({ notebook });
  expect(publish).toHaveBeenCalledOnce();
});

it("does not reset when durable recovery cannot be written", async () => {
  const { app, notebook, read } = await repository({
    "new.md": bytes("remote"),
  });
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
  vi.spyOn(recovery, "savePullRecovery").mockRejectedValueOnce(
    new Error("Quota exceeded"),
  );
  const reset = vi.spyOn(app, "hardResetNotebook");
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "Quota exceeded",
  );
  expect(reset).not.toHaveBeenCalled();
  expect(await read("assets/a.bin")).toEqual([...changed]);
});

it("reads legacy pending text, retaining it when recovery fails", async () => {
  const { app, notebook, base, read } = await repository();
  const key = `pending/pull/${notebook._id}`;
  localStorage.setItem(
    key,
    JSON.stringify({
      localSha: base,
      cache: { "nested/old.txt": { status: "added", markdown: "legacy\r\n" } },
    }),
  );
  const original = pfs.writeFile.bind(pfs);
  const writing = vi
    .spyOn(pfs, "writeFile")
    .mockImplementation(async (file, data) => {
      if (file.endsWith("/old.txt")) throw new Error("refused");
      return original(file, data);
    });
  await app.listNotebooks();
  expect(localStorage.getItem(key)).not.toBeNull();
  expect(await recovery.readPullRecovery(notebook._id)).toBeDefined();
  writing.mockRestore();
  await app.listNotebooks();
  expect(await read("nested/old.txt")).toEqual([...bytes("legacy\r\n")]);
  expect(await isStored(`${notebook.dir}/nested/old.txt`)).toBe(true);
  expect(localStorage.getItem(key)).toBeNull();
});

it("clears read sign-in after a rejected push and retries the original commit", async () => {
  const { app, notebook, base, read } = await repository();
  const args = { fs, dir: notebook.dir };
  const head = () => git.resolveRef({ ...args, ref: "refs/heads/master" });
  const note = "saved before upload\r\n";
  await pfs.writeFile(`${notebook.dir}/README.md`, note);
  await git.add({ ...args, filepath: "README.md" });
  const unauthorized = Object.assign(new Error("Sign-in required"), {
    data: { statusCode: 401 },
  });
  vi.mocked(git.fetch).mockRejectedValueOnce(unauthorized);
  await expect(app.fetchNotebook({ notebook })).rejects.toBe(unauthorized);
  expect(notebook.gitNeedsLogin).toBe(true);

  const rejected = Object.assign(new Error("Remote rejected"), {
    data: { statusCode: 403 },
  });
  const attempts: string[] = [];
  const push = vi.spyOn(git, "push").mockImplementation(async () => {
    attempts.push(await head());
    if (attempts.length === 1) throw rejected;
    return { ok: true, error: null, refs: {} };
  });
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    phase: "push",
    cause: rejected,
  });
  expect(notebook.gitNeedsLogin).toBe(false);
  const [pending] = attempts;
  expect(
    (await git.readCommit({ ...args, oid: pending })).commit.parent,
  ).toEqual([base]);
  expect([
    ...(await git.readBlob({ ...args, oid: pending, filepath: "README.md" }))
      .blob,
  ]).toEqual([...bytes(note)]);
  expect(await head()).toBe(pending);
  expect(
    new TextDecoder()
      .decode(await readStored(`${notebook.dir}/.git/refs/heads/master`))
      .trim(),
  ).toBe(pending);
  expect(await app["notebookDB"].get(notebook._id)).toMatchObject({
    localSha: pending,
    remoteSha: base,
  });

  // A stale registry entry must not move the actual branch on startup.
  const entry = await app["notebookDB"].get(notebook._id);
  await app["notebookDB"].put({ ...entry, localSha: base });
  const write = vi.spyOn(pfs, "writeFile");
  const reopened = (await app.listNotebooks()).find(
    (n) => n._id === notebook._id,
  )!;
  expect(reopened.localSha).toBe(pending);
  expect(await head()).toBe(pending);
  expect(await read("README.md")).toEqual([...bytes(note)]);
  expect(
    write.mock.calls.filter(
      ([file]) =>
        file.startsWith(notebook.dir + "/") &&
        !file.startsWith(notebook.dir + "/.git/"),
    ),
  ).toEqual([]);
  const reset = vi.spyOn(app, "hardResetNotebook");
  const plan = vi.spyOn(recovery, "savePullRecovery");
  await app.pullNotebook({ notebook: reopened });
  expect(await head()).toBe(pending);
  await app.pushNotebook({ notebook: reopened });
  expect(push).toHaveBeenCalledTimes(2);
  expect(attempts).toEqual([pending, pending]);
  expect(reset).not.toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
  expect(await app["notebookDB"].get(notebook._id)).toMatchObject({
    localSha: pending,
    remoteSha: pending,
  });
});

it("confirms a commit already received after a lost reply without another push", async () => {
  const { app, notebook } = await repository();
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(`${notebook.dir}/README.md`, "sent before disconnect");
  const push = vi
    .spyOn(git, "push")
    .mockRejectedValueOnce(new Error("Lost reply"));
  await expect(app.pushNotebook({ notebook })).rejects.toThrow("Lost reply");
  const pending = await git.resolveRef({ ...args, ref: "HEAD" });
  vi.mocked(git.fetch).mockResolvedValueOnce({
    ...emptyRemote,
    fetchHead: pending,
  });
  const commit = vi.spyOn(git, "commit");
  await expect(app.pushNotebook({ notebook })).resolves.toBe("confirmed");
  expect(push).toHaveBeenCalledTimes(1);
  expect(commit).not.toHaveBeenCalled();
  expect(await app["notebookDB"].get(notebook._id)).toMatchObject({
    localSha: pending,
    remoteSha: pending,
  });
});

it("retries the pending commit when later staged edits have been undone in the worktree", async () => {
  const { app, notebook } = await repository();
  const args = { fs, dir: notebook.dir };
  const path = `${notebook.dir}/README.md`;
  await pfs.writeFile(path, "saved");
  const push = vi
    .spyOn(git, "push")
    .mockRejectedValueOnce(new Error("Offline"));
  await expect(app.pushNotebook({ notebook })).rejects.toThrow("Offline");
  const pending = notebook.localSha;
  await pfs.writeFile(path, "discarded");
  await git.add({ ...args, filepath: "README.md" });
  await pfs.writeFile(path, "saved");
  await pfs.writeFile(`${notebook.dir}/draft.md`, "discarded file");
  await git.add({ ...args, filepath: "draft.md" });
  await pfs.unlink(`${notebook.dir}/draft.md`);
  push.mockResolvedValueOnce({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(notebook.remoteSha).toBe(pending);
  expect(
    await git.listFiles({ ...args, ref: notebook.remoteSha }),
  ).not.toContain("draft.md");
});

it("keeps a pending commit when an ignore rule prevents staging a recreated tracked note", async () => {
  const { app, notebook, theirs, read } = await repository({
    ".gitignore": bytes("README.md\nprivate.md\n"),
  });
  notebook.initSearch();
  await app.pullNotebook({ notebook });
  await pfs.writeFile(`${notebook.dir}/removed.txt`, "pending edit");
  const push = vi
    .spyOn(git, "push")
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await expect(app.pushNotebook({ notebook })).rejects.toThrow("Offline");
  const args = { fs, dir: notebook.dir };
  const pending = await git.resolveRef({ ...args, ref: "HEAD" });
  expect(pending).not.toBe(theirs);
  await notebook.deleteNote("README.md");
  await notebook.writeNote("README.md", "Recreated note", {
    createdAt: new Date(),
    modifiedAt: new Date(),
  });
  await pfs.writeFile(`${notebook.dir}/private.md`, "stay private");
  const recreated = await read("README.md");
  expect(new TextDecoder().decode(Uint8Array.from(recreated))).toContain(
    "Recreated note",
  );
  await expect(app.pushNotebook({ notebook })).rejects.toThrow(
    "error/notebook-file-ignored",
  );
  expect(push).toHaveBeenCalledTimes(1);
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(pending);
  expect(await read("README.md")).toEqual(recreated);
  expect(notebook.remoteSha).toBe(theirs);
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "private.md\n");
  await app.pushNotebook({ notebook });
  expect(
    (await git.readCommit({ ...args, oid: notebook.remoteSha })).commit.parent,
  ).toEqual([pending]);
  expect([
    ...(
      await git.readBlob({
        ...args,
        oid: notebook.remoteSha,
        filepath: "README.md",
      })
    ).blob,
  ]).toEqual(recreated);
  expect(
    await git.listFiles({ ...args, ref: notebook.remoteSha }),
  ).not.toContain("private.md");
});

it("names a new note excluded by an incoming ignore rule before uploading other edits", async () => {
  const { app, notebook, theirs, read } = await repository(
    { ".gitignore": bytes("new.md\nother.md\nprivate.md\n") },
    { ".gitignore": bytes("private.md\n") },
  );
  await pfs.writeFile(`${notebook.dir}/new.md`, "new note");
  await pfs.writeFile(`${notebook.dir}/other.md`, "second new note");
  await pfs.writeFile(`${notebook.dir}/visible.md`, "still eligible");
  await pfs.writeFile(`${notebook.dir}/private.md`, "private draft");
  await pfs.writeFile(`${notebook.dir}/removed.txt`, "another edit");
  const savePlan = vi.spyOn(recovery, "savePullRecovery");
  let sent: string | undefined;
  const push = vi.spyOn(git, "push").mockImplementation(async ({ ref }) => {
    const args = { fs, dir: notebook.dir };
    const target = await git.expandRef({ ...args, ref: ref! });
    sent = await git.resolveRef({ ...args, ref: target });
    return { ok: true, error: null, refs: {} };
  });
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    filepath: "new.md",
  });
  expect(push).not.toHaveBeenCalled();
  expect(notebook.localSha).toBe(theirs);
  expect(await read("new.md")).toEqual([...bytes("new note")]);
  expect(savePlan).toHaveBeenCalledWith(
    notebook._id,
    expect.objectContaining({ uploadCandidates: ["new.md", "other.md"] }),
  );
  // Reopening and retrying with the same rule still reports the omitted note.
  const restarted = new Crossnote();
  const reopened = (await restarted.listNotebooks()).find(
    (n) => n._id === notebook._id,
  )!;
  await expect(
    restarted.pushNotebook({ notebook: reopened }),
  ).rejects.toMatchObject({
    filepath: "new.md",
  });
  expect(push).not.toHaveBeenCalled();
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "other.md\nprivate.md\n");
  await expect(
    restarted.pushNotebook({ notebook: reopened }),
  ).rejects.toMatchObject({ filepath: "other.md" });
  expect(push).not.toHaveBeenCalled();
  await pfs.unlink(`${notebook.dir}/other.md`);
  await restarted.pushNotebook({ notebook: reopened });
  expect(push).toHaveBeenCalledOnce();
  expect(sent).toBe(reopened.remoteSha);
  const args = { fs, dir: notebook.dir, oid: sent! };
  expect(await git.listFiles({ ...args, ref: sent! })).not.toContain(
    "private.md",
  );
  expect(await read("private.md")).toEqual([...bytes("private draft")]);
  expect([
    ...(await git.readBlob({ ...args, filepath: "new.md" })).blob,
  ]).toEqual([...bytes("new note")]);
  expect([
    ...(await git.readBlob({ ...args, filepath: "visible.md" })).blob,
  ]).toEqual([...bytes("still eligible")]);
});

it.each([false, true])(
  "recovers upload eligibility from an older pull plan (working directory replaces a file: %s)",
  async (replaced) => {
    const { app, notebook, base, theirs, read } = await repository(
      {
        ...(replaced ? { notes: null } : {}),
        "notes/.gitignore": bytes("new.md\n"),
      },
      {
        ".gitignore": bytes("private.md\n"),
        ...(replaced ? { notes: bytes("old file") } : {}),
      },
    );
    if (replaced) await pfs.unlink(`${notebook.dir}/notes`);
    const files = {
      "notes/new.md": bytes("selected note"),
      "private.md": bytes("private draft"),
    };
    for (const [file, data] of Object.entries(files))
      await pfs.writeFile(`${notebook.dir}/${file}`, data);
    await recovery.savePullRecovery(notebook._id, {
      version: 1,
      localSha: base,
      remoteSha: theirs,
      files,
      conflicts: [],
    });
    vi.spyOn(app, "hardResetNotebook").mockRejectedValueOnce(
      new Error("Interrupted checkout"),
    );
    await expect(app.resumeNotebook(notebook)).rejects.toThrow(
      "Interrupted checkout",
    );
    expect(
      (await recovery.readPullRecovery(notebook._id))?.uploadCandidates,
    ).toEqual(["notes/new.md"]);
    const push = vi
      .spyOn(git, "push")
      .mockResolvedValue({ ok: true, error: null, refs: {} });
    await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
      filepath: "notes/new.md",
    });
    expect(push).not.toHaveBeenCalled();
    expect(await read("notes/new.md")).toEqual([...files["notes/new.md"]]);
    expect(await read("private.md")).toEqual([...files["private.md"]]);
  },
);

it("unstages a new draft ignored after an interrupted upload without deleting its working copy", async () => {
  const { app, notebook, read } = await repository({
    ".gitignore": bytes("README.md\n"),
  });
  await app.pullNotebook({ notebook });
  await pfs.writeFile(`${notebook.dir}/draft.md`, "local draft");
  await pfs.writeFile(`${notebook.dir}/README.md`, "edited note");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    filepath: "README.md",
  });
  const args = { fs, dir: notebook.dir };
  expect(await git.listFiles(args)).toContain("draft.md");
  expect(push).not.toHaveBeenCalled();
  await pfs.writeFile(`${notebook.dir}/.gitignore`, "draft.md\n");
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  expect(
    await git.listFiles({ ...args, ref: notebook.remoteSha }),
  ).not.toContain("draft.md");
  expect(await git.listFiles(args)).not.toContain("draft.md");
  expect(await read("draft.md")).toEqual([...bytes("local draft")]);
  expect([
    ...(
      await git.readBlob({
        ...args,
        oid: notebook.remoteSha,
        filepath: "README.md",
      })
    ).blob,
  ]).toEqual([...bytes("edited note")]);
});

it("retries the pending commit after a staged replacement is undone by restoring the directory", async () => {
  const { app, notebook, read } = await repository();
  const args = { fs, dir: notebook.dir };
  const push = vi
    .spyOn(git, "push")
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await pfs.writeFile(`${notebook.dir}/README.md`, "pending edit");
  await expect(app.pushNotebook({ notebook })).rejects.toThrow("Offline");
  const pending = notebook.localSha;
  const parent = `${notebook.dir}/assets`;
  await pfs.rmdir(parent);
  await git.remove({ ...args, filepath: "assets/a.bin" });
  await pfs.writeFile(parent, "discarded replacement");
  await git.add({ ...args, filepath: "assets" });
  expect(await git.listFiles(args)).toContain("assets");
  await pfs.unlink(parent);
  await pfs.writeFile(parent + "/a.bin", binary);
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledTimes(2);
  expect(notebook.remoteSha).toBe(pending);
  expect(await git.listFiles(args)).not.toContain("assets");
  expect(await read("assets/a.bin")).toEqual([...binary]);
  expect([
    ...(
      await git.readBlob({
        ...args,
        oid: notebook.remoteSha,
        filepath: "assets/a.bin",
      })
    ).blob,
  ]).toEqual([...binary]);
});

it.each([
  { staged: false, match: false },
  { staged: false, match: true },
  { staged: true, match: false },
  { staged: true, match: true },
])(
  "checks an ignored draft at the exact incoming path (staged: $staged, matching bytes: $match)",
  async ({ staged, match }) => {
    const { app, notebook, base, theirs, read } = await repository(
      { ".gitignore": null, "draft.md": bytes("remote note") },
      { ".gitignore": bytes("draft.md\n") },
    );
    const args = { fs, dir: notebook.dir };
    expect([
      ...(await git.readBlob({ ...args, oid: theirs, filepath: "draft.md" }))
        .blob,
    ]).toEqual([...bytes("remote note")]);
    const draft = `${notebook.dir}/draft.md`;
    const content = bytes(match ? "remote note" : "local note");
    if (staged) {
      const rule = `${notebook.dir}/.gitignore`;
      await pfs.writeFile(rule, "");
      await pfs.writeFile(
        draft,
        bytes(match ? "earlier staged draft" : "remote note"),
      );
      await git.add({ ...args, filepath: "draft.md" });
      await pfs.writeFile(rule, "draft.md\n");
    }
    await pfs.writeFile(draft, content);
    expect((await git.listFiles(args)).includes("draft.md")).toBe(staged);
    expect(await read(".gitignore")).toEqual([...bytes("draft.md\n")]);
    if (match) {
      await app.pullNotebook({ notebook });
      expect(notebook.localSha).toBe(theirs);
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(theirs);
      expect(await pfs.exists(`${notebook.dir}/.gitignore`)).toBe(false);
    } else {
      await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
        files: ["draft.md"],
      });
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
      expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    }
    expect(await read("draft.md")).toEqual([...content]);
  },
);

it("keeps a regular ignored draft when the incoming entry is a symlink with matching bytes", async () => {
  const file = "draft.md";
  const target = bytes("README.md");
  const { app, notebook, base, theirs, read } = await repository(
    { ".gitignore": null, [file]: target },
    { ".gitignore": bytes(file + "\n") },
  );
  const args = { fs, dir: notebook.dir };
  const { tree } = await git.readTree({ ...args, oid: theirs });
  const link = await git.commit({
    ...args,
    author,
    message: "Add link",
    noUpdateBranch: true,
    tree: await git.writeTree({
      ...args,
      tree: tree.map((entry) =>
        entry.path === file ? { ...entry, mode: "120000" } : entry,
      ),
    }),
  });
  expect(
    (await git.readTree({ ...args, oid: link })).tree.find(
      (entry) => entry.path === file,
    )?.mode,
  ).toBe("120000");
  vi.mocked(git.fetch).mockResolvedValue({ ...emptyRemote, fetchHead: link });
  await pfs.writeFile(`${notebook.dir}/${file}`, target);
  const result = await app.pullNotebook({ notebook }).catch((error) => error);
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
  expect((await fs.promises.lstat(`${notebook.dir}/${file}`)).isFile()).toBe(
    true,
  );
  expect(await read(file)).toEqual([...target]);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  expect(result).toMatchObject({ files: [file] });
});

it("uploads a note deletion when only an ignored draft remains in its former path", async () => {
  const { app, notebook, base, read } = await repository(
    {},
    { ".gitignore": bytes("private.md\n") },
  );
  const args = { fs, dir: notebook.dir };
  notebook.initSearch();
  await notebook.deleteNote("README.md");
  await notebook.writeNote("README.md/private.md", "private draft", {
    createdAt: new Date(),
    modifiedAt: new Date(),
  });
  const savedDraft = await read("README.md/private.md");
  expect(await app.getStatus(notebook.dir, "README.md/private.md")).toBe(
    "ignored",
  );
  expect(await git.listFiles(args)).not.toContain("README.md");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  expect(
    (await git.readCommit({ ...args, oid: notebook.remoteSha })).commit.parent,
  ).toEqual([base]);
  const files = await git.listFiles({ ...args, ref: notebook.remoteSha });
  expect(files).not.toContain("README.md");
  expect(files).not.toContain("README.md/private.md");
  expect(await read("README.md/private.md")).toEqual(savedDraft);
});

async function submoduleRepository(parent?: string) {
  const app = new Crossnote();
  const notebook = await app.addNotebook({ name: "Sync", gitURL: "" });
  const args = { fs, dir: notebook.dir };
  // Keep fixture setup out of the Git index cache used by the application.
  const setup = { ...args, fs: { promises: fs.promises } };
  const note = notebook.dir + "/README.md";
  await pfs.writeFile(note, "original note");
  await git.add({ ...setup, filepath: "README.md" });
  const base = await git.commit({ ...setup, author, message: "Base" });
  const { tree } = await git.readTree({ ...setup, oid: base });
  const submodule = {
    path: "vendor",
    type: "commit" as const,
    mode: "160000",
    oid: base,
  };
  const root = parent
    ? {
        path: parent,
        type: "tree" as const,
        mode: "040000",
        oid: await git.writeTree({ ...setup, tree: [submodule] }),
      }
    : submodule;
  const tip = await git.commit({
    ...setup,
    author,
    message: "Add submodule",
    tree: await git.writeTree({ ...setup, tree: [...tree, root] }),
  });
  await git.checkout({ ...setup, ref: "refs/heads/master" });
  notebook.gitURL = "https://example.test/notebook.git";
  notebook.localSha = tip;
  notebook.remoteSha = tip;
  await saveNotebookFixture(app, notebook);
  vi.spyOn(git, "fetch").mockResolvedValue({
    ...emptyRemote,
    fetchHead: tip,
  });
  return { app, notebook, args, tip, tree, submodule, note };
}

async function interruptPointerRebuild(app: Crossnote, notebook: Notebook) {
  const update = git.updateIndex;
  const fault = vi
    .spyOn(git, "updateIndex")
    .mockImplementation(async (args) => {
      if (args.dir === notebook.dir && args.filepath === "vendor") {
        await pfs.storeTree(notebook.dir);
        throw new Error("Interrupted pointer insertion");
      }
      return update(args);
    });
  try {
    expect((await app.listNotebooks()).map((entry) => entry._id)).not.toContain(
      notebook._id,
    );
  } finally {
    fault.mockRestore();
  }
}

it.each(["inspect", "unlink", "flush"])(
  "reports an applied reset when the rebuild marker fails to %s",
  async (phase) => {
    const { app, notebook, note, submodule } = await submoduleRepository();
    const index = notebook.dir + "/.git/index";
    const marker = index + ".crossnote-rebuild";
    await pfs.unlink(index);
    await interruptPointerRebuild(app, notebook);
    expect(await pfs.exists(marker)).toBe(true);
    await pfs.writeFile(note, "draft to discard");
    const target = await app.previewReset(notebook);
    const cause = new Error("Marker " + phase + " failed");
    if (phase === "inspect") {
      const lstat = fs.promises.lstat.bind(fs.promises);
      vi.spyOn(fs.promises, "lstat").mockImplementation(
        async (name, ...rest) => {
          if (name === marker) throw cause;
          return lstat(name, ...rest);
        },
      );
    } else if (phase === "unlink") {
      const unlink = pfs.unlink.bind(pfs);
      vi.spyOn(pfs, "unlink").mockImplementation(async (name) => {
        if (name === marker) throw cause;
        return unlink(name);
      });
    } else {
      const store = pfs.storeTree.bind(pfs);
      vi.spyOn(pfs, "storeTree").mockImplementation(async (dir) => {
        if (dir === notebook.dir && !(await pfs.exists(marker))) throw cause;
        return store(dir);
      });
    }
    const result = app.resetToHead(notebook, target);
    await expect(result).rejects.toBeInstanceOf(RestorePersistenceError);
    await expect(result).rejects.toHaveProperty("cause", cause);
    expect(await pfs.readFile(note, { encoding: "utf8" })).toBe(
      "original note",
    );
    expect((await parentGitTree(notebook.dir)).links.get("vendor")).toBe(
      submodule.oid,
    );
    vi.restoreAllMocks();
    await app.resetToHead(notebook, await app.previewReset(notebook));
    expect(await pfs.exists(marker)).toBe(false);
  },
);

it.each(["reset", "download"])(
  "keeps a staged version on reopen after %s replaces an interrupted index rebuild",
  async (operation) => {
    const { app, notebook, args, tree, submodule, note } =
      await submoduleRepository();
    const index = notebook.dir + "/.git/index";
    await pfs.unlink(index);
    await interruptPointerRebuild(app, notebook);
    expect(await git.listFiles(args)).toEqual(["README.md"]);

    if (operation === "reset") {
      const target = await app.previewReset(notebook);
      expect(target.files).toContain("vendor");
      const write = fs.promises.writeFile.bind(fs.promises);
      const interrupted = vi
        .spyOn(fs.promises, "writeFile")
        .mockImplementation((file, data, options) => {
          if (file === index) throw new Error("Interrupted reset");
          return write(file, data, options);
        });
      await expect(app.resetToHead(notebook, target)).rejects.toThrow(
        "Interrupted reset",
      );
      expect(await pfs.exists(index + ".crossnote-rebuild")).toBe(true);
      interrupted.mockRestore();
      await app.resetToHead(notebook, target);
      expect((await parentGitTree(notebook.dir)).links.get("vendor")).toBe(
        submodule.oid,
      );
    } else {
      const incoming = await git.commit({
        ...args,
        author,
        noUpdateBranch: true,
        message: "Remove the empty submodule",
        tree: await git.writeTree({ ...args, tree }),
      });
      vi.mocked(git.fetch).mockResolvedValue({
        ...emptyRemote,
        fetchHead: incoming,
      });
      await app.pullNotebook({ notebook });
      expect(notebook.localSha).toBe(incoming);
      expect((await parentGitTree(notebook.dir)).links.size).toBe(0);
    }
    const staged = bytes("staged note");
    await pfs.writeFile(note, staged);
    await notebook.storeNote("README.md");
    const savedIndex = await pfs.readFile(index);
    const working = bytes("later working note");
    await pfs.writeFile(note, working);
    await pfs.storeTree(notebook.dir);
    expect(
      (await new Crossnote().listNotebooks()).map((entry) => entry._id),
    ).toContain(notebook._id);
    expect(
      await git.walk({
        ...args,
        trees: [git.STAGE()],
        map: async (file, [entry]) =>
          file === "README.md" ? entry.oid() : undefined,
      }),
    ).toEqual([(await git.hashBlob({ object: staged })).oid]);
    expect([...(await pfs.readFile(index))]).toEqual([...savedIndex]);
    expect([...(await pfs.readFile(note))]).toEqual([...working]);
  },
);

it.each([0, 8])(
  "checks out both new and populated gitlinks with %s notes",
  async (count) => {
    const { app, notebook, args, tree, submodule } =
      await submoduleRepository();
    const files = Array.from({ length: count }, (_, i) => ({
      ...tree[0],
      path: `note-${i}.md`,
    }));
    const next = { ...submodule, oid: "2".repeat(40) };
    const another = { ...submodule, path: "new-link", oid: "3".repeat(40) };
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Replace notes",
      tree: await git.writeTree({ ...args, tree: [...files, next, another] }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    await pfs.writeFile(notebook.dir + "/vendor/local.bin", binary);
    const checkout = vi.spyOn(git, "checkout");
    await app.pullNotebook({ notebook });
    expect(checkout.mock.calls).toHaveLength(1);
    expect(checkout.mock.calls[0][0].filepaths).toBeUndefined();
    const index = await parentGitTree(notebook.dir);
    expect(index.links).toEqual(
      new Map([
        ["vendor", next.oid],
        ["new-link", another.oid],
      ]),
    );
    expect([...index.files].sort()).toEqual(
      [...files.map((file) => file.path), "vendor", "new-link"].sort(),
    );
    expect([
      ...(await pfs.readFile(notebook.dir + "/vendor/local.bin")),
    ]).toEqual([...binary]);
  },
);

it.each(["download", "upload"])(
  "completes a marked partial index before %s in an open notebook",
  async (operation) => {
    const { app, notebook, args, tree, submodule } =
      await submoduleRepository();
    const index = notebook.dir + "/.git/index";
    await pfs.unlink(index);
    await interruptPointerRebuild(app, notebook);
    expect(await git.listFiles(args)).toEqual(["README.md"]);
    expect(await pfs.exists(index + ".crossnote-rebuild")).toBe(true);
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Keep the pointer",
      tree: await git.writeTree({
        ...args,
        tree: [...tree, submodule, { ...tree[0], path: "remote.md" }],
      }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    if (operation === "upload") await app.pushNotebook({ notebook });
    else await app.pullNotebook({ notebook });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect((await parentGitTree(notebook.dir)).links.get("vendor")).toBe(
      submodule.oid,
    );
    expect(await pfs.exists(index + ".crossnote-rebuild")).toBe(false);
  },
);

it.each([
  ["reopen", true],
  ["reopen", false],
  ["marked", true],
  ["marked", false],
] as const)(
  "rebuilds clean and changed symlink entries (%s, gitlink %s)",
  async (entry, withPointer) => {
    const { app, notebook, base } = await repository();
    const { dir } = notebook;
    const args = { fs, dir };
    const target = await git.writeBlob({ ...args, blob: bytes("README.md") });
    for (const filepath of ["Alias.md", "Other.md"])
      await git.updateIndex({
        ...args,
        filepath,
        oid: target,
        mode: 0o120000,
        add: true,
      });
    if (withPointer)
      await git.updateIndex({
        ...args,
        filepath: "vendor",
        oid: base,
        mode: 0o160000,
        add: true,
      });
    const tip = await git.commit({ ...args, author, message: "Add aliases" });
    await git.checkout({ ...args, ref: "master", force: true });
    notebook.localSha = notebook.remoteSha = tip;
    await saveNotebookFixture(app, notebook);
    const { tree } = await git.readTree({ ...args, oid: tip });
    const note = tree.find((item) => item.path === "README.md")!;
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Add another note",
      tree: await git.writeTree({
        ...args,
        tree: [...tree, { ...note, path: "incoming.md" }],
      }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    await pfs.unlink(dir + "/Other.md");
    await fs.promises.symlink("removed.txt", dir + "/Other.md");
    const index = dir + "/.git/index";
    await pfs.unlink(index);
    if (entry === "reopen") await app.listNotebooks();
    else await pfs.writeFile(index + ".crossnote-rebuild", "");
    await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
      files: ["Other.md"],
    });
    const staged = await parentGitTree(dir);
    expect(staged.symlinks.get("Alias.md")).toBe(target);
    expect(staged.symlinks.get("Other.md")).toBe(
      (await git.hashBlob({ object: bytes("./removed.txt") })).oid,
    );
    expect(staged.links.get("vendor")).toBe(withPointer ? base : undefined);
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
    await git.checkout({
      ...args,
      ref: "HEAD",
      filepaths: ["Other.md"],
      force: true,
    });
    await app.pullNotebook({ notebook });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect(await app.getStatus(dir, "Alias.md")).toBe("unmodified");
  },
);

it("lists the current branch after waiting for an interrupted download", async () => {
  const { app, notebook, args, tree } = await submoduleRepository();
  const incoming = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Remove the empty submodule",
    tree: await git.writeTree({ ...args, tree }),
  });
  let started!: () => void, resume!: () => void, queued!: () => void;
  const fetching = new Promise<void>((resolve) => {
    started = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    queued = resolve;
  });
  vi.mocked(git.fetch).mockImplementationOnce(async () => {
    started();
    await proceed;
    return { ...emptyRemote, fetchHead: incoming };
  });
  const pull = app.pullNotebook({ notebook });
  await fetching;
  const lockPath = pfs.notebookLockPath.bind(pfs);
  vi.spyOn(pfs, "notebookLockPath").mockImplementation((dir) => {
    if (dir === notebook.dir) queued();
    return lockPath(dir);
  });
  const listing = app.listNotebooks();
  await waiting;
  vi.spyOn(git, "checkout").mockRejectedValueOnce(
    new Error("Interrupted checkout"),
  );
  const failure = expect(pull).rejects.toThrow("Interrupted checkout");
  resume();
  await failure;
  const listed = (await listing).find((entry) => entry._id === notebook._id);
  expect({
    listed: listed?.localSha,
    head: await git.resolveRef({ ...args, ref: "HEAD" }),
    files: await git.listFiles(args),
    pending: Boolean(await recovery.readPullRecovery(notebook._id)),
  }).toEqual({
    listed: incoming,
    head: incoming,
    files: ["README.md"],
    pending: false,
  });
});

it.each(["complete", "missing", "interrupted"])(
  "protects a committed submodule when uploading a note (%s index)",
  async (index) => {
    const { app, notebook, args, submodule, note } =
      await submoduleRepository();
    const edit = bytes("ordinary edit");
    await pfs.writeFile(notebook.dir + "/vendor/local.bin", binary);
    await notebook.storeNote("vendor/local.bin");
    let session = app;
    let active = notebook;
    if (index !== "complete") {
      await pfs.unlink(notebook.dir + "/.git/index");
      await pfs.storeTree(notebook.dir);
      if (index === "interrupted") {
        const add = vi.spyOn(git, "add");
        await interruptPointerRebuild(app, notebook);
        expect(add).toHaveBeenCalledWith(
          expect.objectContaining({
            dir: notebook.dir,
            filepath: ["README.md"],
          }),
        );
      }
      session = new Crossnote();
      active = (await session.listNotebooks()).find(
        (entry) => entry._id === notebook._id,
      )!;
    }
    expect(await git.listFiles(args)).toEqual(["README.md", "vendor"]);
    await pfs.writeFile(note, edit);
    let sent: string | undefined;
    const push = vi.spyOn(git, "push").mockImplementation(async ({ ref }) => {
      const target = await git.expandRef({ ...args, ref: ref! });
      sent = await git.resolveRef({ ...args, ref: target });
      return { ok: true, error: null, refs: {} };
    });
    await session.pushNotebook({ notebook: active });
    expect(push).toHaveBeenCalledOnce();
    expect(sent).toBe(active.remoteSha);
    expect((await git.readTree({ ...args, oid: sent! })).tree).toContainEqual(
      submodule,
    );
    expect(await git.listFiles({ ...args, ref: sent! })).toEqual([
      "README.md",
      "vendor",
    ]);
    expect([
      ...(await git.readBlob({ ...args, oid: sent!, filepath: "README.md" }))
        .blob,
    ]).toEqual([...edit]);
    expect([
      ...((await pfs.readFile(
        notebook.dir + "/vendor/local.bin",
      )) as Uint8Array),
    ]).toEqual([...binary]);
  },
);

it.each([
  ["pull", "file"],
  ["upload", "file"],
  ["pull", "directory"],
  ["upload", "directory"],
])(
  "retries a failed %s after a gitlink was replaced by a %s",
  async (operation, shape) => {
    const { app, notebook, args, tree, tip, submodule } =
      await submoduleRepository();
    const directory = shape === "directory";
    const filepath = directory ? "vendor/note.md" : "vendor";
    const name = notebook.dir + "/" + filepath;
    const blob = {
      ...tree[0],
      path: "note.md",
      oid: await git.writeBlob({ ...args, blob: binary }),
    };
    const entry = directory
      ? {
          mode: "040000",
          type: "tree" as const,
          path: "vendor",
          oid: await git.writeTree({
            ...args,
            tree: [blob, { ...submodule, path: "nested" }],
          }),
        }
      : { ...blob, path: "vendor" };
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Replace pointer with " + shape,
      tree: await git.writeTree({ ...args, tree: [...tree, entry] }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    const run = () =>
      operation === "pull"
        ? app.pullNotebook({ notebook })
        : app.pushNotebook({ notebook });
    if (!directory) await pfs.rmdir(name);
    await pfs.writeFile(name, binary);
    // Even matching bytes at the original pointer path are unexpected before checkout.
    await expect(run()).rejects.toMatchObject({ files: ["vendor"] });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    await pfs.unlink(name);
    if (!directory) await pfs.mkdir(name);
    vi.spyOn(app["notebookDB"], "put").mockRejectedValueOnce(
      new Error("Could not save notebook"),
    );
    await expect(run()).rejects.toThrow("Could not save notebook");
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect([...((await pfs.readFile(name)) as Uint8Array)]).toEqual([
      ...binary,
    ]);
    expect(await recovery.readPullRecovery(notebook._id)).toMatchObject({
      remoteSha: incoming,
    });
    expect(() => assertNotebookWritable(notebook.dir)).toThrow("recovery");
    await pfs.writeFile(name, changed);
    await expect(run()).rejects.toMatchObject({ files: ["vendor"] });
    expect([...((await pfs.readFile(name)) as Uint8Array)]).toEqual([
      ...changed,
    ]);
    expect(await recovery.readPullRecovery(notebook._id)).toBeDefined();
    await pfs.writeFile(name, binary);
    if (directory) {
      const extra = notebook.dir + "/vendor/local.bin";
      await pfs.writeFile(extra, changed);
      await expect(run()).rejects.toMatchObject({ files: ["vendor"] });
      expect([...((await pfs.readFile(extra)) as Uint8Array)]).toEqual([
        ...changed,
      ]);
      expect(await recovery.readPullRecovery(notebook._id)).toBeDefined();
      expect(() => assertNotebookWritable(notebook.dir)).toThrow("recovery");
      await pfs.unlink(extra);
      await pfs.mkdir(extra);
      await expect(run()).rejects.toMatchObject({ files: ["vendor"] });
      expect(await pfs.readdir(extra)).toEqual([]);
      await pfs.rmdir(extra);
      // A nested pointer owns its checkout, including its local files.
      await pfs.writeFile(notebook.dir + "/vendor/nested/local.bin", changed);
    }
    await run();
    if (directory) {
      expect([
        ...((await pfs.readFile(
          notebook.dir + "/vendor/nested/local.bin",
        )) as Uint8Array),
      ]).toEqual([...changed]);
    }
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    expect(() => assertNotebookWritable(notebook.dir)).not.toThrow();
    expect([...((await pfs.readFile(name)) as Uint8Array)]).toEqual([
      ...binary,
    ]);
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect(await git.status({ ...args, filepath })).toBe("unmodified");
  },
);

it.each(["vendor", "section"])("retries a folder alias at %s", async (root) => {
  const { app, notebook, args, tree } = await submoduleRepository(
    root === "section" ? root : undefined,
  );
  const link = {
    ...tree[0],
    mode: "120000",
    path: root,
    oid: await git.writeBlob({ ...args, blob: bytes("assets") }),
  };
  const assets = {
    type: "tree" as const,
    mode: "040000",
    path: "assets",
    oid: await git.writeTree({
      ...args,
      tree: [
        {
          path: "vendor",
          type: "tree",
          mode: "040000",
          oid: await git.writeTree({ ...args, tree }),
        },
      ],
    }),
  };
  const incoming = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Replace pointer with symlink",
    tree: await git.writeTree({ ...args, tree: [...tree, assets, link] }),
  });
  vi.mocked(git.fetch).mockResolvedValue({
    ...emptyRemote,
    fetchHead: incoming,
  });
  vi.spyOn(app["notebookDB"], "put").mockRejectedValueOnce(
    new Error("Could not save notebook"),
  );
  const run = () => app.pullNotebook({ notebook });
  await expect(run()).rejects.toThrow("Could not save notebook");
  const name = notebook.dir + "/" + root;
  expect(await fs.promises.readlink(name)).toBe("./assets");
  await pfs.unlink(name);
  await fs.promises.symlink("README.md", name);
  await expect(run()).rejects.toMatchObject({ files: [root] });
  expect(await fs.promises.readlink(name)).toBe("./README.md");
  await pfs.unlink(name);
  await fs.promises.symlink("assets", name);
  await run();
  expect(await fs.promises.readlink(name)).toBe("./assets");
  expect(
    await pfs.readFile(notebook.dir + "/assets/vendor/README.md", {
      encoding: "utf8",
    }),
  ).toBe("original note");
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
});

it.each(["file", "removed"])(
  "stops before replacing a populated submodule (%s)",
  async (shape) => {
    const { app, notebook, args, tree, tip } = await submoduleRepository();
    await pfs.writeFile(notebook.dir + "/vendor/local.bin", binary);
    const entries =
      shape === "file" ? [...tree, { ...tree[0], path: "vendor" }] : tree;
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Replace pointer",
      tree: await git.writeTree({ ...args, tree: entries }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    const index = await pfs.readFile(notebook.dir + "/.git/index");
    await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
      files: ["vendor"],
    });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
    expect([
      ...((await pfs.readFile(notebook.dir + "/.git/index")) as Uint8Array),
    ]).toEqual([...index]);
    expect([
      ...((await pfs.readFile(
        notebook.dir + "/vendor/local.bin",
      )) as Uint8Array),
    ]).toEqual([...binary]);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  },
);

it("retires ignored upload blocks inside an incoming submodule and keeps sibling drafts blocked", async () => {
  const draft = "vendor/draft.md";
  const sibling = "vendor-extra/draft.md";
  const { app, notebook, theirs, read } = await repository({
    ".gitignore": bytes("draft.md\n"),
  });
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(notebook.dir + "/" + draft, binary);
  await pfs.writeFile(notebook.dir + "/" + sibling, changed);
  await app.pullNotebook({ notebook });
  const record = () => app["notebookDB"].get(notebook._id);
  expect((await record()).blockedUploadPaths?.sort()).toEqual(
    [draft, sibling].sort(),
  );

  const { tree } = await git.readTree({ ...args, oid: theirs });
  const pointer = {
    path: "vendor",
    type: "commit" as const,
    mode: "160000",
    oid: theirs,
  };
  const incoming = await git.commit({
    ...args,
    author,
    message: "Add pointer",
    noUpdateBranch: true,
    parent: [theirs],
    tree: await git.writeTree({ ...args, tree: [...tree, pointer] }),
  });
  vi.mocked(git.fetch).mockResolvedValue({
    ...emptyRemote,
    fetchHead: incoming,
  });
  await app.pullNotebook({ notebook });
  expect((await record()).blockedUploadPaths).toEqual([sibling]);

  // Older versions may have kept the nested draft in the registry after pulling.
  await app["notebookDB"].put({
    ...(await record()),
    blockedUploadPaths: [draft, sibling],
  });
  const restarted = new Crossnote();
  const active = (await restarted.listNotebooks()).find(
    (entry) => entry._id === notebook._id,
  )!;
  const edit = bytes("unrelated edit");
  await pfs.writeFile(notebook.dir + "/README.md", edit);
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await expect(
    restarted.pushNotebook({ notebook: active }),
  ).rejects.toMatchObject({ filepath: sibling });
  expect(push).not.toHaveBeenCalled();
  expect(await read(sibling)).toEqual([...changed]);
  await pfs.unlink(notebook.dir + "/" + sibling);
  await restarted.pushNotebook({ notebook: active });
  expect(push).toHaveBeenCalledOnce();
  expect(
    (await git.readTree({ ...args, oid: active.remoteSha })).tree,
  ).toContainEqual(pointer);
  expect([
    ...(
      await git.readBlob({
        ...args,
        oid: active.remoteSha,
        filepath: "README.md",
      })
    ).blob,
  ]).toEqual([...edit]);
  expect(await read(draft)).toEqual([...binary]);
  expect(await git.listFiles({ ...args, ref: active.remoteSha })).not.toContain(
    draft,
  );
});

async function incomingSubmodule(
  baseFiles: Record<string, Uint8Array> = {},
  parent?: string,
) {
  const fixture = await repository({}, baseFiles);
  const { notebook, base } = fixture;
  const args = { fs, dir: notebook.dir };
  const { tree } = await git.readTree({ ...args, oid: base });
  const pointer = {
    path: "vendor",
    type: "commit" as const,
    mode: "160000",
    oid: base,
  };
  const root = parent
    ? {
        path: parent,
        type: "tree" as const,
        mode: "040000",
        oid: await git.writeTree({ ...args, tree: [pointer] }),
      }
    : pointer;
  const incoming = await git.commit({
    ...args,
    author,
    message: "Add pointer",
    noUpdateBranch: true,
    tree: await git.writeTree({
      ...args,
      tree: [...tree.filter((entry) => entry.path !== root.path), root],
    }),
  });
  vi.mocked(git.fetch).mockResolvedValue({
    ...emptyRemote,
    fetchHead: incoming,
  });
  return { ...fixture, args, incoming, pointer };
}

it.each([
  ["pull", false],
  ["upload", false],
  ["pull", true],
  ["upload", true],
] as const)(
  "protects an index-only ancestor of an incoming pointer during %s (tracked: %s)",
  async (operation, tracked) => {
    const file = "Notes.md";
    const { app, notebook, args, base, incoming, pointer, read } =
      await incomingSubmodule(tracked ? { [file]: binary } : {}, file);
    const name = notebook.dir + "/" + file;
    await pfs.writeFile(name, changed);
    await git.add({ ...args, filepath: file });
    await pfs.unlink(name);
    const index = await read(".git/index");
    const run =
      operation === "pull"
        ? app.pullNotebook({ notebook })
        : app.pushNotebook({ notebook });
    await expect(run).rejects.toMatchObject({ files: [file] });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
    expect(await read(".git/index")).toEqual(index);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    expect(() => assertNotebookWritable(notebook.dir)).not.toThrow();
    if (tracked)
      await git.updateIndex({
        ...args,
        filepath: file,
        oid: (await git.hashBlob({ object: binary })).oid,
        mode: 0o100644,
      });
    else await git.remove({ ...args, filepath: file });
    // A staged sibling with the same text prefix can still be downloaded over.
    await pfs.writeFile(notebook.dir + "/Notes", changed);
    await git.add({ ...args, filepath: "Notes" });
    await app.pullNotebook({ notebook });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect(
      (await parentGitTree(notebook.dir)).links.get("Notes.md/vendor"),
    ).toBe(pointer.oid);
    expect(await read("Notes")).toEqual([...changed]);
  },
);

it.each(["pull", "upload"])(
  "checks the base directory before planning a %s with a matching staged pointer",
  async (operation) => {
    const child = "vendor/a.md";
    const { app, notebook, args, base, read, incoming, pointer } =
      await incomingSubmodule({ [child]: binary });
    await git.remove({ ...args, filepath: child });
    await git.updateIndex({
      ...args,
      filepath: "vendor",
      mode: 0o160000,
      oid: pointer.oid,
      add: true,
    });
    const index = await read(".git/index");
    const run = () =>
      operation === "pull"
        ? app.pullNotebook({ notebook })
        : app.pushNotebook({ notebook });
    await expect(run()).rejects.toMatchObject({ files: ["vendor"] });
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    expect(() => assertNotebookWritable(notebook.dir)).not.toThrow();
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
    expect(await read(".git/index")).toEqual(index);
    expect(await read(child)).toEqual([...binary]);
    await pfs.unlink(notebook.dir + "/" + child);
    await run();
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect((await parentGitTree(notebook.dir)).links.get("vendor")).toBe(
      pointer.oid,
    );
  },
);

it.each(["pull", "upload"])(
  "keeps a staged draft when %s moves a submodule into its former directory",
  async (operation) => {
    const { app, notebook, args, tree, submodule, tip } =
      await submoduleRepository();
    const nested = await git.writeTree({
      ...args,
      tree: [{ ...submodule, path: "nested" }],
    });
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Move pointer",
      tree: await git.writeTree({
        ...args,
        tree: [
          ...tree,
          { path: "vendor", type: "tree", mode: "040000", oid: nested },
        ],
      }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    const file = "vendor/nested/draft.md";
    const name = notebook.dir + "/" + file;
    await git.remove({ ...args, filepath: "vendor" });
    await pfs.writeFile(name, changed);
    await git.add({ ...args, filepath: file });
    await pfs.unlink(name);
    await pfs.rmdir(notebook.dir + "/vendor/nested");
    const indexPath = notebook.dir + "/.git/index";
    const index = await pfs.readFile(indexPath);
    const run = () =>
      operation === "pull"
        ? app.pullNotebook({ notebook })
        : app.pushNotebook({ notebook });
    await expect(run()).rejects.toMatchObject({ files: [file] });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
    expect([...(await pfs.readFile(indexPath))]).toEqual([...index]);
    expect(await git.listFiles(args)).toContain(file);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    expect(() => assertNotebookWritable(notebook.dir)).not.toThrow();
    await git.remove({ ...args, filepath: file });
    await run();
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect((await parentGitTree(notebook.dir)).links.get("vendor/nested")).toBe(
      submodule.oid,
    );
  },
);

it.each(["pull", "upload"])(
  "preserves an index-only blob beneath an incoming pointer during %s",
  async (operation) => {
    const tracked = "vendor/tracked.md";
    const draft = "vendor/draft.md";
    const { app, notebook, args, base, read, pointer, incoming } =
      await incomingSubmodule({ [tracked]: binary });
    const run = () =>
      operation === "pull"
        ? app.pullNotebook({ notebook })
        : app.pushNotebook({ notebook });
    const original = await git.hashBlob({ object: binary });
    const staged = await git.hashBlob({ object: changed });
    await pfs.unlink(notebook.dir + "/" + tracked);
    for (const file of [draft, tracked]) {
      const name = notebook.dir + "/" + file;
      await pfs.writeFile(name, changed);
      await git.add({ ...args, filepath: file });
      await pfs.unlink(name);
      const index = await read(".git/index");
      await expect(run()).rejects.toMatchObject({ files: [file] });
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
      expect(await read(".git/index")).toEqual(index);
      expect([
        ...(await git.readBlob({ ...args, oid: staged.oid })).blob,
      ]).toEqual([...changed]);
      expect(await pfs.readdir(notebook.dir + "/vendor")).toEqual([]);
      expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
      expect(() => assertNotebookWritable(notebook.dir)).not.toThrow();
      if (file === draft) await git.remove({ ...args, filepath: file });
    }
    // An unchanged index entry cannot lose unique staged bytes.
    await git.updateIndex({
      ...args,
      filepath: tracked,
      oid: original.oid,
      mode: 0o100644,
    });
    await run();
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect((await parentGitTree(notebook.dir)).links.get("vendor")).toBe(
      pointer.oid,
    );
  },
);

it.each([
  [0o100644, 0o120000],
  [0o120000, 0o100644],
  [0o100644, 0o100755],
  [0o100755, 0o100644],
])(
  "preserves a staged mode change below an incoming pointer (%i to %i)",
  async (headMode, stagedMode) => {
    const filepath = "vendor/alias.md";
    const target = bytes("../README.md");
    const { app, notebook, args, base, incoming, pointer, read } =
      await incomingSubmodule({ [filepath]: target });
    const oid = (await git.hashBlob({ object: target })).oid;
    let local = base;
    let remote = incoming;
    if (headMode !== 0o100644) {
      await git.updateIndex({ ...args, filepath, oid, mode: headMode });
      local = await git.commit({
        ...args,
        author,
        message: "Track the original file mode",
      });
      const { commit } = await git.readCommit({ ...args, oid: incoming });
      remote = await git.commit({
        ...args,
        author,
        tree: commit.tree,
        noUpdateBranch: true,
        message: "Replace the directory with a submodule",
      });
      vi.mocked(git.fetch).mockResolvedValue({
        ...emptyRemote,
        fetchHead: remote,
      });
    }
    await pfs.unlink(notebook.dir + "/" + filepath);
    await git.updateIndex({
      ...args,
      filepath,
      oid,
      mode: stagedMode,
    });
    const index = await read(".git/index");
    await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
      files: [filepath],
    });
    expect(await read(".git/index")).toEqual(index);
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(local);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    expect(await pfs.readdir(notebook.dir + "/vendor")).toEqual([]);
    await git.updateIndex({ ...args, filepath, oid, mode: headMode });
    await app.pullNotebook({ notebook });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(remote);
    expect((await parentGitTree(notebook.dir)).links.get("vendor")).toBe(
      pointer.oid,
    );
    expect(await read("README.md")).toEqual([...bytes("# Kept\n")]);
  },
);

it("keeps a staged draft before an incoming submodule occupies its directory", async () => {
  const { app, notebook, args, base, read } = await incomingSubmodule();
  await pfs.writeFile(notebook.dir + "/vendor/draft.md", binary);
  await notebook.storeNote("vendor/draft.md");
  const index = await read(".git/index");
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    files: ["vendor"],
  });
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
  expect(await read("vendor/draft.md")).toEqual([...binary]);
  expect(await read(".git/index")).toEqual(index);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
});

it.each([false, true])(
  "stops the working directory scan at an incoming submodule (previously tracked: %s)",
  async (tracked) => {
    const { app, notebook, args, submodule } = await submoduleRepository();
    if (!tracked) {
      await git.writeRef({
        ...args,
        ref: "refs/heads/master",
        value: submodule.oid,
        force: true,
      });
      await git.remove({ ...args, filepath: "vendor" });
      notebook.localSha = submodule.oid;
    }
    await pfs.writeFile(notebook.dir + "/vendor/subtree/inside.md", binary);
    await pfs.writeFile(notebook.dir + "/ordinary/draft.md", changed);
    const listing = vi.spyOn(fs.promises, "readdir");
    const { cache } = await app["generateChangesCache"](
      notebook,
      false,
      {},
      new Map([["vendor", "2".repeat(40)]]),
    );
    expect(Object.keys(cache)).toEqual(["ordinary/draft.md"]);
    expect([...cache["ordinary/draft.md"]]).toEqual([...changed]);
    const directories = listing.mock.calls.map(([dir]) => dir);
    expect(directories).toContain(notebook.dir + "/ordinary");
    expect(directories).not.toContain(notebook.dir + "/vendor");
    expect(directories).not.toContain(notebook.dir + "/vendor/subtree");
  },
);

it.each([false, true])(
  "restores committed children beneath a staged pointer (matching child: %s)",
  async (matching) => {
    const file = "vendor/note.md";
    const { app, notebook, base, read } = await repository(
      {},
      { [file]: bytes("committed note") },
    );
    const args = { fs, dir: notebook.dir };
    const staged = matching
      ? (await git.readBlob({ ...args, oid: base, filepath: file })).oid
      : await git.writeBlob({ ...args, blob: bytes("staged version") });
    for (const child of [file, "vendor/obsolete.md"])
      await git.updateIndex({
        ...args,
        filepath: child,
        mode: 0o100644,
        oid: staged,
        add: true,
      });
    await git.updateIndex({
      ...args,
      filepath: "vendor",
      mode: 0o160000,
      oid: base,
      add: true,
    });
    await pfs.unlink(notebook.dir + "/" + file);
    expect(await git.listFiles(args)).toEqual(
      expect.arrayContaining(["vendor", file, "vendor/obsolete.md"]),
    );
    await app.resetToHead(notebook, await app.previewReset(notebook));
    expect(await git.listFiles(args)).toEqual(
      await git.listFiles({ ...args, ref: base }),
    );
    expect(await read(file)).toEqual([...bytes("committed note")]);
    const [entry] = await git.walk({
      ...args,
      trees: [git.STAGE()],
      map: async (path, [staged]) =>
        path === file ? [await staged.mode(), await staged.oid()] : undefined,
    });
    expect(entry).toEqual([
      0o100644,
      (await git.readBlob({ ...args, oid: base, filepath: file })).oid,
    ]);
  },
);

it("requires a single-note restore to leave staged pointer children intact", async () => {
  const file = "Note.md";
  const other = "Note.md-archive";
  const child = file + "/draft.md";
  const sibling = other + "/draft.md";
  const { notebook, base, read } = await repository(
    {},
    { [file]: bytes("committed note"), [sibling]: bytes("other note") },
  );
  const args = { fs, dir: notebook.dir };
  const note = await notebook.getNote(file);
  const oid = await git.writeBlob({ ...args, blob: bytes("staged draft") });
  for (const pointer of [file, other]) {
    await git.updateIndex({
      ...args,
      filepath: pointer,
      mode: 0o160000,
      oid: base,
      add: true,
    });
    await git.updateIndex({
      ...args,
      filepath: pointer + "/draft.md",
      mode: 0o100644,
      oid,
      add: true,
    });
  }
  const index = await read(".git/index");
  await expect(
    notebook.checkoutNote(await notebook.getNote(sibling)),
  ).rejects.toMatchObject({ files: [other] });
  expect(await read(".git/index")).toEqual(index);
  await expect
    .soft(notebook.checkoutNote(note))
    .rejects.toMatchObject({ files: [child] });
  expect.soft(await read(".git/index")).toEqual(index);
  expect(await read(file)).toEqual([...bytes("committed note")]);

  await pfs.unlink(notebook.dir + "/" + file);
  await expect(notebook.checkoutNote(note)).rejects.toMatchObject({
    files: [child],
  });
  expect(await pfs.exists(notebook.dir + "/" + file)).toBe(false);
  expect(await read(".git/index")).toEqual(index);
  await git.updateIndex({
    ...args,
    filepath: child,
    force: true,
    remove: true,
  });
  await notebook.checkoutNote(note);
  expect(await read(file)).toEqual([...bytes("committed note")]);
  expect(await git.status({ ...args, filepath: file })).toBe("unmodified");
  expect(await git.listFiles(args)).toEqual(
    [...(await git.listFiles({ ...args, ref: base })), other].sort(),
  );
  expect(await read(sibling)).toEqual([...bytes("other note")]);
});

it("resets an old staged submodule child without changing its local file", async () => {
  const { app, notebook, args, tip, submodule } = await submoduleRepository();
  const filepath = "vendor/Draft.md";
  const file = notebook.dir + "/" + filepath;
  await pfs.writeFile(file, "# Local draft\r\n");
  await git.add({ ...args, filepath });
  const expected = ["README.md", "vendor"];
  const mixed = [...expected, filepath];
  expect(await git.listFiles(args)).toEqual(mixed);
  const draft = await notebook.getNote(filepath);
  await expect
    .soft(notebook.checkoutNote(draft))
    .rejects.toThrow("error/no-committed-note");
  await notebook.checkoutNote(await notebook.getNote("README.md"));
  expect(await git.listFiles(args)).toEqual(mixed);

  const target = await app.previewReset(notebook);
  expect.soft(target.files).toEqual([filepath]);
  expect(await git.listFiles(args)).toEqual(mixed);
  await app.resetToHead(notebook, target);
  expect.soft(await git.listFiles(args)).toEqual(expected);
  expect(await pfs.readFile(file, { encoding: "utf8" })).toBe(
    "# Local draft\r\n",
  );
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
  const index = await git.walk({
    ...args,
    trees: [git.STAGE()],
    map: async (file, [entry]) =>
      file === "vendor" ? [await entry.mode(), await entry.oid()] : undefined,
  });
  expect(index).toEqual([[0o160000, submodule.oid]]);
  expect((await app.previewReset(notebook)).files).toEqual([]);
});

it("keeps submodule directories outside both upload scans and missing-index recovery", async () => {
  const { app, notebook, args } = await submoduleRepository();
  const vendor = notebook.dir + "/vendor";
  await pfs.writeFile(vendor + "/subtree/inside.md", binary);
  await pfs.writeFile(notebook.dir + "/ordinary/draft.md", changed);
  const readings: string[][] = [];
  let current: string[] | undefined;
  const readdir = fs.promises.readdir.bind(fs.promises);
  vi.spyOn(fs.promises, "readdir").mockImplementation((name, ...rest) => {
    current?.push(name);
    return readdir(name, ...rest);
  });
  const matrix = git.statusMatrix;
  vi.spyOn(git, "statusMatrix").mockImplementation(async (options) => {
    current = [];
    readings.push(current);
    try {
      return await matrix(options);
    } finally {
      current = undefined;
    }
  });
  vi.spyOn(git, "push").mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  await pfs.unlink(notebook.dir + "/.git/index");
  await pfs.storeTree(notebook.dir);
  await app.listNotebooks();
  expect(await git.listFiles(args)).toEqual([
    "README.md",
    "ordinary/draft.md",
    "vendor",
  ]);
  expect(readings).toHaveLength(3);
  expect(
    readings.map((dirs) =>
      dirs.filter((dir) => dir === vendor || dir.startsWith(vendor + "/")),
    ),
  ).toEqual([[], [], []]);
  expect(
    readings.every((dirs) => dirs.includes(notebook.dir + "/ordinary")),
  ).toBe(true);
});

it("pauses an upload whose old index contains a submodule child", async () => {
  const { app, notebook, args, tip } = await submoduleRepository();
  await pfs.writeFile(notebook.dir + "/vendor/old.bin", binary);
  await git.add({ ...args, filepath: "vendor/old.bin" });
  const send = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    files: ["vendor/old.bin"],
  });
  expect(send).not.toHaveBeenCalled();
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
});

it.each([
  ["pull", "deletion"],
  ["upload", "deletion"],
  ["pull", "hidden child"],
  ["upload", "hidden child"],
])(
  "stops a %s fast-forward before it overwrites a staged submodule %s",
  async (operation, change) => {
    const { app, notebook, args, tree, submodule, tip } =
      await submoduleRepository();
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Add ordinary note",
      tree: await git.writeTree({
        ...args,
        tree: [...tree, submodule, { ...tree[0], path: "new.md" }],
      }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    const child = "vendor/old.bin";
    if (change === "deletion") {
      await git.remove({ ...args, filepath: "vendor" });
    } else {
      await pfs.writeFile(notebook.dir + "/" + child, binary);
      await git.add({ ...args, filepath: child });
      await pfs.writeFile(notebook.dir + "/" + child, changed);
    }
    const index = await pfs.readFile(notebook.dir + "/.git/index");
    const send = vi.spyOn(git, "push");
    const run =
      operation === "pull"
        ? app.pullNotebook({ notebook })
        : app.pushNotebook({ notebook });
    await expect(run).rejects.toMatchObject({
      files: [change === "deletion" ? "vendor" : child],
    });
    expect(send).not.toHaveBeenCalled();
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
    expect(await pfs.exists(notebook.dir + "/new.md")).toBe(false);
    expect([
      ...((await pfs.readFile(notebook.dir + "/.git/index")) as Uint8Array),
    ]).toEqual([...index]);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    if (change === "hidden child") {
      expect(await git.listFiles(args)).toEqual(["README.md", "vendor", child]);
      expect([
        ...((await pfs.readFile(notebook.dir + "/" + child)) as Uint8Array),
      ]).toEqual([...changed]);
    }
  },
);

it.each(["deleted pointer", "missing index", "matching pointer"])(
  "accepts a fast-forward with a %s when it can install the target safely",
  async (state) => {
    const { app, notebook, args, tree, submodule } =
      await submoduleRepository();
    const expected = {
      ...submodule,
      oid: state === "matching pointer" ? "2".repeat(40) : submodule.oid,
    };
    if (state === "missing index")
      await pfs.unlink(notebook.dir + "/.git/index");
    else if (state === "matching pointer")
      await git.updateIndex({
        ...args,
        filepath: "vendor",
        mode: 0o160000,
        oid: expected.oid,
      });
    else await git.remove({ ...args, filepath: "vendor" });
    const entries = [...tree, { ...tree[0], path: "new.md" }];
    if (state !== "deleted pointer") entries.push(expected);
    const incoming = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Change parent tree",
      tree: await git.writeTree({ ...args, tree: entries }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: incoming,
    });
    await app.pullNotebook({ notebook });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
    expect(await git.listFiles(args)).toEqual(
      entries.map((entry) => entry.path).sort(),
    );
    expect((await parentGitTree(notebook.dir)).links.get("vendor")).toBe(
      state === "deleted pointer" ? undefined : expected.oid,
    );
    expect(
      await pfs.readFile(notebook.dir + "/new.md", { encoding: "utf8" }),
    ).toBe("original note");
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  },
);

it("keeps a staged submodule update when an incoming commit needs checkout", async () => {
  const { app, notebook, args, tip, tree, submodule } =
    await submoduleRepository();
  const oid = "3".repeat(40);
  await git.updateIndex({ ...args, filepath: "vendor", oid, mode: 0o160000 });
  const incoming = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Add ordinary note",
    tree: await git.writeTree({
      ...args,
      tree: [...tree, submodule, { ...tree[0], path: "new.md" }],
    }),
  });
  vi.mocked(git.fetch).mockResolvedValue({
    ...emptyRemote,
    fetchHead: incoming,
  });
  await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
    files: ["vendor"],
  });
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(tip);
  expect(await pfs.exists(notebook.dir + "/new.md")).toBe(false);
  vi.mocked(git.fetch).mockResolvedValue({ ...emptyRemote, fetchHead: tip });
  vi.spyOn(git, "push").mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(
    (await git.readTree({ ...args, oid: notebook.remoteSha })).tree,
  ).toContainEqual({ ...submodule, oid });
});

it.each(["working", "staged", "committed"])(
  "preserves a named submodule recovery copy and pauses upload (%s)",
  async (state) => {
    const { app, notebook, args, tip } = await submoduleRepository();
    const original = "vendor/local.bin";
    const copy = "local.local-12345678.bin";
    await pfs.writeFile(notebook.dir + "/" + original, binary);
    await pfs.writeFile(notebook.dir + "/" + copy, binary);
    let head = tip;
    if (state !== "working") {
      await git.add({ ...args, filepath: copy });
      if (state === "committed") {
        head = await git.commit({
          ...args,
          author,
          message: "Earlier pending upload",
        });
        await git.remove({ ...args, filepath: copy });
      }
      await pfs.unlink(notebook.dir + "/" + copy);
    }
    const plan: recovery.PullRecovery = {
      version: 1,
      localSha: tip,
      remoteSha: tip,
      files: { [copy]: binary },
      conflicts: [],
      relocated: { [original]: copy },
    };
    await recovery.savePullRecovery(notebook._id, plan);
    expect(
      (await app.listNotebooks()).some((n) => n._id === notebook._id),
    ).toBe(true);
    const send = vi.spyOn(git, "push");
    notebook.initSearch();
    await expect(
      writeNoteOperation(
        { notebookPath: notebook.dir, filePath: "README.md" },
        () =>
          notebook.writeNote("README.md", "must not be accepted", {
            createdAt: new Date(),
            modifiedAt: new Date(),
          }),
      ),
    ).rejects.toThrow("recovery");
    expect(
      await pfs.readFile(notebook.dir + "/README.md", { encoding: "utf8" }),
    ).toBe("original note");
    await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
      files: [copy],
    });
    expect(send).not.toHaveBeenCalled();
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(head);
    expect(await recovery.readPullRecovery(notebook._id)).toBeDefined();
    if (state === "committed") {
      expect([
        ...(await git.readBlob({ ...args, oid: head, filepath: copy })).blob,
      ]).toEqual([...binary]);
      return;
    }
    if (state === "working") {
      expect([
        ...((await pfs.readFile(notebook.dir + "/" + copy)) as Uint8Array),
      ]).toEqual([...binary]);
      await pfs.unlink(notebook.dir + "/" + copy);
      await pfs.unlink(notebook.dir + "/" + original);
      await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
        files: [original, copy],
      });
      expect(await pfs.exists(notebook.dir + "/" + original)).toBe(false);
      expect(await recovery.readPullRecovery(notebook._id)).toBeDefined();
      await pfs.writeFile(notebook.dir + "/" + original, binary);
    } else {
      expect(await git.listFiles(args)).toContain(copy);
      await git.remove({ ...args, filepath: copy });
    }
    await app.pullNotebook({ notebook });
    expect(await pfs.exists(notebook.dir + "/" + copy)).toBe(false);
    expect([
      ...((await pfs.readFile(notebook.dir + "/" + original)) as Uint8Array),
    ]).toEqual([...binary]);
    expect(await git.listFiles(args)).toEqual(["README.md", "vendor"]);
    expect(
      await pfs.readFile(notebook.dir + "/README.md", { encoding: "utf8" }),
    ).toBe("original note");
    expect(() => assertNotebookWritable(notebook.dir)).not.toThrow();
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  },
);

it("uploads the replacement file when a tracked directory becomes a working file", async () => {
  const { app, notebook, base, read } = await repository();
  await pfs.rmdir(`${notebook.dir}/assets`);
  await pfs.writeFile(`${notebook.dir}/assets`, "replacement");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  const args = { fs, dir: notebook.dir, oid: notebook.remoteSha };
  expect((await git.readCommit(args)).commit.parent).toEqual([base]);
  const files = await git.listFiles({ ...args, ref: notebook.remoteSha });
  expect(files).toContain("assets");
  expect(files).not.toContain("assets/a.bin");
  expect([
    ...(await git.readBlob({ ...args, filepath: "assets" })).blob,
  ]).toEqual([...bytes("replacement")]);
  expect(await read("assets")).toEqual([...bytes("replacement")]);
});

it("uploads a working file that replaces a directory with only staged notes", async () => {
  const { app, notebook, base } = await repository();
  const args = { fs, dir: notebook.dir };
  const folder = "topic.md";
  const children = [folder + "/first.md", folder + "/second.md"];
  for (const file of children) {
    await pfs.writeFile(`${notebook.dir}/${file}`, "staged note");
    await notebook.storeNote(file);
  }
  expect(await git.listFiles(args)).toEqual(expect.arrayContaining(children));
  expect(await git.listFiles({ ...args, ref: base })).not.toContain(
    children[0],
  );
  await pfs.rmdir(`${notebook.dir}/${folder}`);
  await pfs.writeFile(`${notebook.dir}/${folder}`, "replacement note");
  await pfs.writeFile(notebook.dir + "/README.md", "another edit");
  let sent: string | undefined;
  const push = vi.spyOn(git, "push").mockImplementation(async ({ ref }) => {
    const target = await git.expandRef({ ...args, ref: ref! });
    sent = await git.resolveRef({ ...args, ref: target });
    return { ok: true, error: null, refs: {} };
  });
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  expect(sent).toBe(notebook.remoteSha);
  const files = await git.listFiles({ ...args, ref: sent! });
  expect(files.filter((file) => file.startsWith(folder))).toEqual([folder]);
  const replacement = await git.readBlob({
    ...args,
    oid: sent!,
    filepath: folder,
  });
  expect([...replacement.blob]).toEqual([...bytes("replacement note")]);
});

it("preserves both replacement files when each side replaces the same directory", async () => {
  const { app, notebook, theirs, read } = await repository({
    "assets/a.bin": null,
    "assets": remoteBytes,
  });
  await pfs.rmdir(`${notebook.dir}/assets`);
  await pfs.writeFile(`${notebook.dir}/assets`, changed);
  const push = vi.spyOn(git, "push");
  const copy = `assets.remote-${theirs.slice(0, 8)}`;
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    files: ["assets", copy],
  });
  expect(push).not.toHaveBeenCalled();
  expect(notebook.localSha).toBe(theirs);
  expect(await read("assets")).toEqual([...changed]);
  expect(await read(copy)).toEqual([...remoteBytes]);
});

it.each([false, true])(
  "keeps an ignored directory replacement local while uploading other edits (previously staged: %s)",
  async (staged) => {
    const { app, notebook, read } = await repository({
      ".gitignore": bytes(staged ? "" : "assets\n"),
    });
    await app.pullNotebook({ notebook });
    const args = { fs, dir: notebook.dir };
    await pfs.rmdir(`${notebook.dir}/assets`);
    await pfs.writeFile(`${notebook.dir}/assets`, "local file");
    if (staged) {
      await git.remove({ ...args, filepath: "assets/a.bin" });
      await git.add({ ...args, filepath: "assets" });
      expect(await git.listFiles(args)).toContain("assets");
      await pfs.writeFile(`${notebook.dir}/.gitignore`, "assets\n");
    }
    await pfs.writeFile(`${notebook.dir}/README.md`, "upload this edit");
    const push = vi
      .spyOn(git, "push")
      .mockResolvedValue({ ok: true, error: null, refs: {} });
    await app.pushNotebook({ notebook });
    expect(push).toHaveBeenCalledOnce();
    const files = await git.listFiles({ ...args, ref: notebook.remoteSha });
    expect(files).not.toContain("assets");
    expect(files).not.toContain("assets/a.bin");
    expect(await git.listFiles(args)).not.toContain("assets");
    expect(await read("assets")).toEqual([...bytes("local file")]);
    expect([
      ...(
        await git.readBlob({
          ...args,
          oid: notebook.remoteSha,
          filepath: "README.md",
        })
      ).blob,
    ]).toEqual([...bytes("upload this edit")]);
  },
);

it.each([false, true])(
  "preserves an ignored replacement before a fast-forward removes its rule (remote adds an empty file: %s)",
  async (remoteFile) => {
    const { app, notebook, base, read } = await repository(
      {
        "records.md/old.md": null,
        ".gitignore": bytes("local-only.md\n"),
        ...(remoteFile ? { "records.md": bytes("") } : {}),
      },
      {
        "records.md/old.md": bytes("tracked child"),
        ".gitignore": bytes("records.md\nlocal-only.md\n"),
      },
    );
    const args = { fs, dir: notebook.dir };
    const target = `${notebook.dir}/records.md`;
    await pfs.rmdir(target);
    await pfs.writeFile(target, "local draft");
    await pfs.writeFile(`${notebook.dir}/README.md`, "other edit");
    expect(await read(".gitignore")).toEqual([
      ...bytes("records.md\nlocal-only.md\n"),
    ]);
    const push = vi
      .spyOn(git, "push")
      .mockResolvedValue({ ok: true, error: null, refs: {} });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
        files: ["records.md"],
      });
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
      expect(await read("records.md")).toEqual([...bytes("local draft")]);
      expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    }
    expect(push).not.toHaveBeenCalled();
    // Move the draft to a path excluded by both revisions, then retry the ordinary edit.
    await pfs.rename(target, `${notebook.dir}/local-only.md`);
    await app.pushNotebook({ notebook });
    expect(push).toHaveBeenCalledOnce();
    expect(await read("local-only.md")).toEqual([...bytes("local draft")]);
    const sent = { ...args, oid: notebook.remoteSha };
    expect(
      await git.listFiles({ ...args, ref: notebook.remoteSha }),
    ).not.toContain("local-only.md");
    expect([
      ...(await git.readBlob({ ...sent, filepath: "README.md" })).blob,
    ]).toEqual([...bytes("other edit")]);
    if (remoteFile)
      expect([
        ...(await git.readBlob({ ...sent, filepath: "records.md" })).blob,
      ]).toEqual([]);
    else
      expect(
        await git.listFiles({ ...args, ref: notebook.remoteSha }),
      ).not.toContain("records.md");
  },
);

it("uploads the child of a directory replacing a committed file", async () => {
  const { app, notebook } = await repository();
  const args = { fs, dir: notebook.dir };
  await pfs.unlink(`${notebook.dir}/README.md`);
  await pfs.writeFile(`${notebook.dir}/README.md/child.md`, "child");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  const ref = push.mock.calls[0][0].ref!;
  const oid = await git.resolveRef({ ...args, ref });
  expect(oid).toBe(notebook.remoteSha);
  const files = await git.listFiles({ ...args, ref: oid });
  expect(files).not.toContain("README.md");
  const child = await git.readBlob({
    ...args,
    oid,
    filepath: "README.md/child.md",
  });
  expect([...child.blob]).toEqual([...bytes("child")]);
});

it.each([true, false])(
  "checks an unstaged local file before installing changed nested rules (remains ignored: %s)",
  async (remainsIgnored) => {
    const rule = "assets/.gitignore";
    const file = "assets/nested/sample.txt";
    const { app, notebook, base, theirs, read } = await repository(
      { [rule]: remainsIgnored ? bytes("nested/*.txt\n") : null },
      { [rule]: bytes("*.txt\n") },
    );
    await pfs.writeFile(`${notebook.dir}/${file}`, "fixture");
    if (!remainsIgnored) {
      for (let i = 0; i < 2; i++) {
        await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
          files: [file],
        });
        expect(
          await git.resolveRef({ fs, dir: notebook.dir, ref: "HEAD" }),
        ).toBe(base);
        expect(await read(rule)).toEqual([...bytes("*.txt\n")]);
        expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
      }
      await pfs.unlink(`${notebook.dir}/${file}`);
    }
    await app.pullNotebook({ notebook });
    expect(notebook.localSha).toBe(theirs);
    if (remainsIgnored) {
      expect(await read(file)).toEqual([...bytes("fixture")]);
      expect(await git.status({ fs, dir: notebook.dir, filepath: file })).toBe(
        "ignored",
      );
    }
  },
);

it("protects a draft when only the ignore file mode changes in either direction", async () => {
  const { app, notebook, base, read } = await repository(
    {},
    {
      "rules.txt": bytes("draft.md\n"),
      ".gitignore": bytes("rules.txt"),
    },
  );
  const args = { fs, dir: notebook.dir };
  const { tree } = await git.readTree({ ...args, oid: base });
  const remote = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Use shared rules",
    tree: await git.writeTree({
      ...args,
      tree: tree.map((entry) =>
        entry.path === ".gitignore" ? { ...entry, mode: "120000" } : entry,
      ),
    }),
  });
  vi.mocked(git.fetch).mockResolvedValue({ ...emptyRemote, fetchHead: remote });
  await pfs.writeFile(`${notebook.dir}/draft.md`, "meeting notes");
  const result = await app.pullNotebook({ notebook });
  expect(result.ignoredUploadFile).toBe("draft.md");
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(remote);
  expect(await git.listFiles(args)).not.toContain("draft.md");
  expect(await app.getStatus(notebook.dir, "draft.md")).toBe("ignored");
  expect(await read("draft.md")).toEqual([...bytes("meeting notes")]);

  const restored = await git.commit({
    ...args,
    author,
    noUpdateBranch: true,
    message: "Restore ordinary rules",
    tree: (await git.readCommit({ ...args, oid: base })).commit.tree,
  });
  vi.mocked(git.fetch).mockResolvedValue({
    ...emptyRemote,
    fetchHead: restored,
  });
  await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
    files: ["draft.md"],
  });
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(remote);
  expect(await read("draft.md")).toEqual([...bytes("meeting notes")]);
});

it.each([false, true])(
  "downloads an unrelated edit with a linked untracked rules file (self-ignored: %s)",
  async (selfIgnored) => {
    const { app, notebook, read } = await repository();
    const args = { fs, dir: notebook.dir };
    await fs.promises.symlink("rules.txt", notebook.dir + "/.gitignore");
    await git.add({ ...args, filepath: ".gitignore" });
    const linked = await git.commit({
      ...args,
      author,
      message: "Link notebook rules",
    });
    const { tree } = await git.readTree({ ...args, oid: linked });
    const edit = await git.writeBlob({ ...args, blob: bytes("Shared update") });
    const remote = await git.commit({
      ...args,
      author,
      message: "Update README",
      noUpdateBranch: true,
      tree: await git.writeTree({
        ...args,
        tree: tree.map((entry) =>
          entry.path === "README.md" ? { ...entry, oid: edit } : entry,
        ),
      }),
    });
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: remote,
    });
    const rules = selfIgnored ? "rules.txt\ndraft.md\n" : "draft.md\n";
    await pfs.writeFile(notebook.dir + "/rules.txt", rules);
    await pfs.writeFile(notebook.dir + "/draft.md", "meeting notes");
    expect(await git.listFiles(args)).not.toContain("rules.txt");
    await app.pullNotebook({ notebook });
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(remote);
    expect(await read("README.md")).toEqual([...bytes("Shared update")]);
    expect(await git.listFiles(args)).not.toContain("draft.md");
    expect(await read("draft.md")).toEqual([...bytes("meeting notes")]);
    expect(await read("rules.txt")).toEqual([...bytes(rules)]);
  },
);

it.each([
  ["missing", true],
  ["file ancestor", true],
  ["deleted", true],
  ["deleted", false],
  ["chain", true],
  ["chain", false],
  ["directory link", true],
  ["directory link", false],
] as const)(
  "checks a %s nested rule target before download (draft stays ignored: %s)",
  async (kind, staysIgnored) => {
    const file = "assets/meeting.draft.md";
    const directoryLink = kind === "directory link";
    const chained = kind === "chain" || directoryLink;
    const target = directoryLink
      ? "assets/team/team.rules"
      : "assets/team.rules";
    const { app, notebook, read } = await repository(
      {},
      {
        ".gitignore": bytes(staysIgnored && !chained ? "*.draft.md\n" : ""),
        ...(kind === "deleted" || chained
          ? { [target]: bytes("*.draft.md\n") }
          : {}),
      },
    );
    const { dir } = notebook;
    const args = { fs, dir };
    let link = kind === "file ancestor" ? "a.bin/optional.rules" : "team.rules";
    if (chained) {
      await fs.promises.symlink(
        directoryLink ? "team" : "team.rules",
        dir + "/assets/selected.rules",
      );
      await git.add({ ...args, filepath: "assets/selected.rules" });
      link = directoryLink ? "selected.rules/team.rules" : "selected.rules";
    }
    await fs.promises.symlink(link, dir + "/assets/.gitignore");
    await git.add({ ...args, filepath: "assets/.gitignore" });
    const base = await git.commit({
      ...args,
      author,
      message: "Use notebook rules",
    });
    await pfs.writeFile(dir + "/README.md", "Shared update");
    await git.add({ ...args, filepath: "README.md" });
    if (kind === "deleted") {
      await pfs.unlink(dir + "/" + target);
      await git.remove({ ...args, filepath: target });
    } else if (chained && !staysIgnored) {
      await pfs.writeFile(dir + "/" + target, "# Publish notes\n");
      await git.add({ ...args, filepath: target });
    }
    const remote = await git.commit({
      ...args,
      author,
      noUpdateBranch: true,
      message: "Update shared notes",
    });
    await app.hardResetNotebook(
      notebook,
      base,
      await parentGitTree(dir, base),
      true,
    );
    vi.mocked(git.fetch).mockResolvedValue({
      ...emptyRemote,
      fetchHead: remote,
    });
    await pfs.writeFile(dir + "/" + file, "Meeting draft");
    expect(await app.getStatus(dir, file)).toBe("ignored");
    if (staysIgnored) {
      await app.pullNotebook({ notebook });
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(remote);
      expect(await read("README.md")).toEqual([...bytes("Shared update")]);
    } else {
      const index = await read(".git/index");
      await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
        files: [file],
      });
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
      expect(await read(".git/index")).toEqual(index);
      expect(await read(target)).toEqual([...bytes("*.draft.md\n")]);
    }
    expect(await app.getStatus(dir, file)).toBe("ignored");
    expect(await git.listFiles(args)).not.toContain(file);
    expect(await read(file)).toEqual([...bytes("Meeting draft")]);
  },
);

it("checks merged ignore rules together with local nested exceptions before checkout", async () => {
  const baseRules = "# local rules\n# spacer\n# remote rules\n*.txt\n";
  const localRules = baseRules.replace("# local rules", "assets/*");
  const { app, notebook, theirs, read } = await repository(
    { ".gitignore": bytes(baseRules.replace("*.txt\n", "")) },
    { ".gitignore": bytes(baseRules) },
  );
  await pfs.writeFile(`${notebook.dir}/.gitignore`, localRules);
  await pfs.writeFile(
    `${notebook.dir}/assets/nested/.gitignore`,
    "!sample.txt\n",
  );
  await pfs.writeFile(`${notebook.dir}/assets/nested/sample.txt`, "fixture");
  // The local rule excludes the parent itself, so the nested exception cannot apply.
  await app.pullNotebook({ notebook });
  expect(notebook.localSha).toBe(theirs);
  expect(await read(".gitignore")).toEqual([
    ...bytes(localRules.replace("*.txt\n", "")),
  ]);
  expect(
    await git.status({
      fs,
      dir: notebook.dir,
      filepath: "assets/nested/sample.txt",
    }),
  ).toBe("ignored");
});

it.each([false, true])(
  "checks drafts before moving a working-tree ignore file (another rule still applies: %s)",
  async (remainsIgnored) => {
    const rule = "assets/.gitignore";
    const file = "assets/draft.md";
    const incoming = rule + "/README.md";
    const { app, notebook, base, theirs, read } = await repository(
      { [incoming]: bytes("remote note") },
      { ".gitignore": bytes(remainsIgnored ? file + "\n" : "") },
    );
    const args = { fs, dir: notebook.dir };
    await pfs.writeFile(`${notebook.dir}/${rule}`, "draft.md\n");
    await pfs.writeFile(`${notebook.dir}/${file}`, "local draft");
    expect(await git.status({ ...args, filepath: file })).toBe("ignored");
    if (remainsIgnored) {
      const result = await app.pullNotebook({ notebook });
      expect(result.conflicts).toContain(rule);
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(theirs);
      expect(await read(incoming)).toEqual([...bytes("remote note")]);
      expect(await git.status({ ...args, filepath: file })).toBe("ignored");
    } else {
      await expect(app.pullNotebook({ notebook })).rejects.toMatchObject({
        files: [file],
      });
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
      expect(await read(rule)).toEqual([...bytes("draft.md\n")]);
    }
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
    expect(await read(file)).toEqual([...bytes("local draft")]);
  },
);

it("keeps a staged draft private when a fast-forward removes its ignore rule", async () => {
  const { app, notebook, base, read } = await repository(
    { ".gitignore": bytes("local-only.md\n") },
    { ".gitignore": bytes("draft.md\nlocal-only.md\n") },
  );
  const args = { fs, dir: notebook.dir };
  const rules = `${notebook.dir}/.gitignore`;
  await pfs.writeFile(rules, "local-only.md\n");
  await pfs.writeFile(`${notebook.dir}/draft.md`, "local draft");
  await git.add({ ...args, filepath: "draft.md" });
  await pfs.writeFile(rules, "draft.md\nlocal-only.md\n");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    files: ["draft.md"],
  });
  expect(push).not.toHaveBeenCalled();
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
  expect(await read("draft.md")).toEqual([...bytes("local draft")]);
});

it("uploads other edits on the first fast-forward when the remote keeps a staged draft ignored", async () => {
  const { app, notebook, theirs, read } = await repository(
    { "remote.md": bytes("remote edit") },
    { ".gitignore": bytes("draft.md\n") },
  );
  const args = { fs, dir: notebook.dir };
  const rule = `${notebook.dir}/.gitignore`;
  await pfs.writeFile(rule, "");
  await pfs.writeFile(`${notebook.dir}/draft.md`, "local draft");
  await git.add({ ...args, filepath: "draft.md" });
  await pfs.writeFile(rule, "draft.md\n");
  await pfs.writeFile(`${notebook.dir}/README.md`, "other edit");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  const sent = { ...args, oid: notebook.remoteSha };
  expect((await git.readCommit(sent)).commit.parent).toEqual([theirs]);
  expect(
    await git.listFiles({ ...args, ref: notebook.remoteSha }),
  ).not.toContain("draft.md");
  expect(await read("draft.md")).toEqual([...bytes("local draft")]);
  expect([
    ...(await git.readBlob({ ...sent, filepath: "README.md" })).blob,
  ]).toEqual([...bytes("other edit")]);
});

it("uploads other edits when a fast-forward already staged the same ignored note as the worktree", async () => {
  const note = bytes("matching edit");
  const { app, notebook, theirs } = await repository({
    "README.md": note,
    ".gitignore": bytes("README.md\n"),
  });
  await pfs.writeFile(`${notebook.dir}/README.md`, note);
  await pfs.writeFile(`${notebook.dir}/removed.txt`, "another edit");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  const args = { fs, dir: notebook.dir, oid: notebook.remoteSha };
  expect((await git.readCommit(args)).commit.parent).toEqual([theirs]);
  expect([
    ...(await git.readBlob({ ...args, filepath: "README.md" })).blob,
  ]).toEqual([...note]);
  expect([
    ...(await git.readBlob({ ...args, filepath: "removed.txt" })).blob,
  ]).toEqual([...bytes("another edit")]);
});

it("detects unstaged bytes in an ignored tracked file even when Git reports matching stats", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1700000000100);
  const { app, notebook } = await repository({
    ".gitignore": bytes("README.md\n"),
  });
  await app.pullNotebook({ notebook });
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(`${notebook.dir}/README.md`, "# Left\n");
  await notebook.storeNote("README.md");
  expect(await app.getStatus(notebook.dir, "README.md")).toBe("ignored");
  expect(await git.statusMatrix({ ...args, filepaths: ["README.md"] })).toEqual(
    [["README.md", 1, 1, 1]],
  );
  const push = vi.spyOn(git, "push");
  await expect(app.pushNotebook({ notebook })).rejects.toThrow(
    "error/notebook-file-ignored",
  );
  expect(push).not.toHaveBeenCalled();
});

it("stops an upload with unresolved text while keeping the pending branch and later edits", async () => {
  const { app, notebook, read } = await repository();
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(`${notebook.dir}/README.md`, "first edit");
  const push = vi
    .spyOn(git, "push")
    .mockRejectedValueOnce(new Error("Offline"));
  await expect(app.pushNotebook({ notebook })).rejects.toThrow("Offline");
  const pending = await git.resolveRef({ ...args, ref: "HEAD" });
  const conflict =
    "\\<<<<<<< ours\nfirst\n\\=======\nsecond\n\\>>>>>>> theirs\n";
  await pfs.writeFile(`${notebook.dir}/README.md`, conflict);
  const index = await read(".git/index");
  const result = await app.pullNotebook({ notebook });
  expect(result).toMatchObject({
    status: "pending-upload",
    conflicts: ["README.md"],
  });
  await expect(app.pushNotebook({ notebook })).rejects.toBeInstanceOf(
    NotebookConflictError,
  );
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(pending);
  expect(await read(".git/index")).toEqual(index);
  expect(await read("README.md")).toEqual([...bytes(conflict)]);
  expect(push).toHaveBeenCalledTimes(1);
  await pfs.writeFile(`${notebook.dir}/README.md`, "resolved");
  push.mockResolvedValueOnce({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(
    (await git.readCommit({ ...args, oid: notebook.remoteSha })).commit.parent,
  ).toEqual([pending]);
  expect([
    ...(
      await git.readBlob({
        ...args,
        oid: notebook.remoteSha,
        filepath: "README.md",
      })
    ).blob,
  ]).toEqual([...bytes("resolved")]);
});

it.each([false, true])(
  "uploads to the configured branch when another branch is checked out (different tip: %s)",
  async (differentTip) => {
    const { app, notebook, base, read } = await repository();
    const args = { fs, dir: notebook.dir };
    await git.branch({ ...args, ref: "side", checkout: true });
    const tag = await git.commit({
      ...args,
      author,
      message: "Tagged revision",
      noUpdateBranch: true,
    });
    await git.writeRef({ ...args, ref: "refs/tags/master", value: tag });
    const side = differentTip
      ? await git.commit({
          ...args,
          author,
          message: "Independent side commit",
        })
      : base;
    await pfs.writeFile(notebook.dir + "/README.md", "edited note");
    let sent: string | undefined;
    const push = vi.spyOn(git, "push").mockImplementation(async ({ ref }) => {
      const actualRef = await git.expandRef({ ...args, ref: ref! });
      expect(actualRef).toBe("refs/heads/master");
      sent = await git.resolveRef({ ...args, ref: actualRef });
      return { ok: true, error: null, refs: {} };
    });
    if (differentTip) {
      await expect(app.pushNotebook({ notebook })).rejects.toThrow(
        "error/notebook-branch-mismatch",
      );
      expect(push).not.toHaveBeenCalled();
      expect(await git.currentBranch(args)).toBe("side");
      expect(await git.resolveRef({ ...args, ref: "refs/heads/master" })).toBe(
        base,
      );
      expect(notebook.remoteSha).toBe(base);
    } else {
      await app.pushNotebook({ notebook });
      expect(push).toHaveBeenCalledOnce();
      expect(sent).toBe(notebook.remoteSha);
      expect(sent).not.toBe(base);
      expect(await git.currentBranch(args)).toBe(notebook.gitBranch);
      expect([
        ...(await git.readBlob({ ...args, oid: sent!, filepath: "README.md" }))
          .blob,
      ]).toEqual([...bytes("edited note")]);
    }
    expect(await git.resolveRef({ ...args, ref: "refs/heads/side" })).toBe(
      side,
    );
    expect(vi.mocked(git.fetch).mock.lastCall?.[0].ref).toBe(
      "refs/heads/master",
    );
    expect(await git.resolveRef({ ...args, ref: "refs/tags/master" })).toBe(
      tag,
    );
    expect(await read("README.md")).toEqual([...bytes("edited note")]);
  },
);

it("fast-forwards the notebook branch when a tag has the same name", async () => {
  const { app, notebook, base, theirs, read } = await repository({
    "README.md": bytes("Incoming edit"),
  });
  const args = { fs, dir: notebook.dir };
  await git.writeRef({ ...args, ref: "refs/tags/master", value: base });
  await git.branch({ ...args, ref: "side", checkout: true });
  const checkout = vi.spyOn(git, "checkout");
  await app.pullNotebook({ notebook });
  expect(checkout).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ ref: "refs/heads/master", force: true }),
  );
  expect(await git.currentBranch({ ...args, fullname: true })).toBe(
    "refs/heads/master",
  );
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(theirs);
  expect(await read("README.md")).toEqual([...bytes("Incoming edit")]);
  expect(await git.resolveRef({ ...args, ref: "refs/tags/master" })).toBe(base);
  expect(await git.resolveRef({ ...args, ref: "refs/heads/side" })).toBe(base);
});

it("keeps recovery on the original branch when notebook settings are saved", async () => {
  const { app, notebook, base, theirs, read } = await repository({
    "README.md": bytes("Incoming edit"),
  });
  const args = { fs, dir: notebook.dir };
  await git.branch({ ...args, ref: "release" });
  vi.spyOn(app, "hardResetNotebook").mockRejectedValueOnce(
    new Error("Interrupted checkout"),
  );
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "Interrupted checkout",
  );
  const originalURL = notebook.gitURL;
  const settings = {
    name: "Renamed",
    gitURL: "https://example.test/other.git",
    gitBranch: "release",
    gitUsername: notebook.gitUsername,
    gitPassword: notebook.gitPassword,
    gitCorsProxy: notebook.gitCorsProxy,
    autoFetchPeriod: notebook.autoFetchPeriod,
  };
  await app.saveNotebookSettings(notebook, settings);
  await app.resumeNotebook(notebook);
  expect(await git.resolveRef({ ...args, ref: "refs/heads/master" })).toBe(
    theirs,
  );
  expect(await git.resolveRef({ ...args, ref: "refs/heads/release" })).toBe(
    base,
  );
  expect(await read("README.md")).toEqual([...bytes("Incoming edit")]);
  expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  const records = app["notebookDB"];
  expect(await records.get(notebook._id)).toMatchObject({
    name: "Renamed",
    gitURL: originalURL,
    gitBranch: "master",
  });
});

it.each([false, true])(
  "leaves the worktree alone when only another branch has a local tip (reopened: %s)",
  async (reopen) => {
    const { app, notebook, base, read } = await repository({
      "README.md": bytes("Incoming edit"),
    });
    const args = { fs, dir: notebook.dir };
    await git.branch({ ...args, ref: "side", checkout: true });
    await git.deleteBranch({ ...args, ref: "master" });
    await pfs.writeFile(`${notebook.dir}/README.md`, "Working edit");
    await pfs.storeTree(notebook.dir);
    const active = reopen
      ? (await app.listNotebooks()).find((entry) => entry._id === notebook._id)!
      : notebook;
    expect(await pfs.exists(`${notebook.dir}/.git/refs/heads/master`)).toBe(
      false,
    );
    await expect(app.pullNotebook({ notebook: active })).rejects.toThrow(
      "error/notebook-branch-mismatch",
    );
    expect(await git.currentBranch(args)).toBe("side");
    expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(base);
    expect(await pfs.exists(`${notebook.dir}/.git/refs/heads/master`)).toBe(
      false,
    );
    expect(await read("README.md")).toEqual([...bytes("Working edit")]);
    expect(await recovery.readPullRecovery(notebook._id)).toBeUndefined();
  },
);

it("keeps both branches and working files when a retry cannot fast-forward", async () => {
  const { app, notebook, theirs, read } = await repository({
    "remote.md": bytes("remote only"),
  });
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(`${notebook.dir}/README.md`, "local only");
  await git.add({ ...args, filepath: "README.md" });
  const local = await git.commit({ ...args, author, message: "Pending" });
  await pfs.writeFile(`${notebook.dir}/README.md`, "later edit");
  const reset = vi.spyOn(app, "hardResetNotebook");
  const push = vi.spyOn(git, "push");
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "error/notebook-history-diverged",
  );
  await expect(app.pushNotebook({ notebook })).rejects.toThrow(
    "error/notebook-history-diverged",
  );
  expect(reset).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(local);
  expect(await read("README.md")).toEqual([...bytes("later edit")]);
  expect([
    ...(await git.readBlob({ ...args, oid: theirs, filepath: "remote.md" }))
      .blob,
  ]).toEqual([...bytes("remote only")]);
});

it("keeps later edits with shallow history and uploads them once the remote advance can be verified", async () => {
  const { app, notebook, read } = await repository();
  const args = { fs, dir: notebook.dir };
  const push = vi
    .spyOn(git, "push")
    .mockRejectedValueOnce(new Error("Lost reply"))
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await pfs.writeFile(`${notebook.dir}/README.md`, "first upload");
  await expect(app.pushNotebook({ notebook })).rejects.toThrow("Lost reply");
  const pending = await git.resolveRef({ ...args, ref: "HEAD" });

  // The server received the upload and advanced twice, independently of
  // this notebook's branch and index. Only its newest commit is advertised.
  const remoteArgs = { ...args, author, noUpdateBranch: true };
  const intermediate = await git.commit({
    ...remoteArgs,
    message: "Remote checkpoint",
    parent: [pending],
  });
  const parentTree = (await git.readCommit({ ...args, oid: pending })).commit
    .tree;
  const { tree } = await git.readTree({ ...args, oid: parentTree });
  const oid = await git.writeBlob({ ...args, blob: bytes("from remote") });
  tree.push({ mode: "100644", path: "remote.md", type: "blob", oid });
  const remote = await git.commit({
    ...remoteArgs,
    message: "Remote addition",
    parent: [intermediate],
    tree: await git.writeTree({ ...args, tree }),
  });
  vi.mocked(git.fetch).mockResolvedValue({ ...emptyRemote, fetchHead: remote });
  await pfs.writeFile(`${notebook.dir}/README.md`, "typed after upload");
  await pfs.writeFile(`${notebook.dir}/.git/shallow`, remote + "\n");
  await expect(app.pushNotebook({ notebook })).rejects.toThrow(
    "error/notebook-history-diverged",
  );
  expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(pending);
  expect(await read("README.md")).toEqual([...bytes("typed after upload")]);
  expect(push).toHaveBeenCalledTimes(1);

  await pfs.unlink(`${notebook.dir}/.git/shallow`);
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledTimes(2);
  expect(await read("remote.md")).toEqual([...bytes("from remote")]);
  const sent = { ...args, oid: notebook.remoteSha };
  expect((await git.readCommit(sent)).commit.parent).toEqual([remote]);
  expect([
    ...(await git.readBlob({ ...sent, filepath: "README.md" })).blob,
  ]).toEqual([...bytes("typed after upload")]);
  expect([
    ...(await git.readBlob({ ...sent, filepath: "remote.md" })).blob,
  ]).toEqual([...bytes("from remote")]);
});

it("persists fetched objects before reporting the new remote revision", async () => {
  const { app, notebook, theirs } = await repository();
  vi.mocked(git.fetch).mockImplementationOnce(async () => {
    await pfs.writeFile(`${notebook.dir}/.git/objects/fetched`, "object");
    return {
      fetchHead: theirs,
      fetchHeadDescription: "master",
      defaultBranch: "master",
      headers: {},
    };
  });
  await app.fetchNotebook({ notebook });
  expect(await isStored(`${notebook.dir}/.git/objects/fetched`)).toBe(true);
  expect(
    Array.from((await readStored(`${notebook.dir}/.git/objects/fetched`))!),
  ).toEqual([...bytes("object")]);
});

it("only reports a download when the background check saw an incoming commit", async () => {
  const { app, notebook, base, theirs } = await repository({
    "incoming.md": bytes("new remote note"),
  });
  expect(await app.fetchNotebook({ notebook })).toBe(true);
  expect(notebook).toMatchObject({ localSha: base, remoteSha: theirs });
  const push = vi.spyOn(git, "push");
  await expect(app.pushNotebook({ notebook })).resolves.toBe("downloaded");
  expect(push).not.toHaveBeenCalled();
  expect(notebook.localSha).toBe(theirs);
  expect(await readStored(`${notebook.dir}/incoming.md`)).toEqual(
    bytes("new remote note"),
  );
});

it("persists cloned content before recording the notebook", async () => {
  const app = new Crossnote();
  vi.spyOn(git, "clone").mockImplementationOnce(async ({ dir, ref }) => {
    expect(ref).toBe("refs/heads/master");
    await pfs.mkdirp(dir!);
    await git.init({ fs, dir });
    await pfs.writeFile(`${dir}/nested/README.md`, "Cloned");
    await git.add({ fs, dir, filepath: "nested/README.md" });
    const sha = await git.commit({ fs, dir, message: "Clone", author });
    await pfs.writeFile(`${dir}/.git/refs/remotes/origin/master`, sha);
  });
  const notebook = await app.cloneNotebook({
    gitURL: "http://fixture.test/clone.git",
    corsProxy: "",
    branch: "refs/heads/master",
  });
  const tip = await git.resolveRef({
    fs,
    dir: notebook.dir,
    ref: "refs/heads/master",
  });
  expect(notebook.localSha).toBe(tip);
  expect(notebook.remoteSha).toBe(tip);
  expect(await isStored(`${notebook.dir}/nested/README.md`)).toBe(true);
  expect(
    Array.from((await readStored(`${notebook.dir}/nested/README.md`))!),
  ).toEqual([...bytes("Cloned")]);
});

it("opens an existing notebook and its note without rewriting note files", async () => {
  const { app, notebook } = await repository();
  const writing = vi.spyOn(pfs, "writeFile");
  const reopened = (await app.listNotebooks()).find(
    (item) => item._id === notebook._id,
  )!;
  reopened.initSearch();
  await reopened.getNote("README.md", true);
  expect(
    writing.mock.calls.filter(
      ([file]) =>
        file.startsWith(`${notebook.dir}/`) &&
        !file.startsWith(`${notebook.dir}/.git/`),
    ),
  ).toEqual([]);
});
