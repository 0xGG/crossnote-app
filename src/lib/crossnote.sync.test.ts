import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { afterEach, expect, it, vi } from "vitest";
import { isStored, readStored } from "../test/storedTree";
import Crossnote, { convertNotebookToNotebookDBEntry } from "./crossnote";
import { EventType, globalEmitter } from "./event";
import { RecoveryDirectoryCollisionError } from "./recoveryDirectory";
import { fs, pfs } from "./fs";
import { NotebookConflictError } from "./mergeFiles";
import type { Notebook } from "./notebook";
import { assertNotebookWritable } from "./notebookOperation";
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
    await app.hardResetNotebook(notebook, base, true);
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
    body: [bytes("001e# service=git-upload-pack\n00000000")],
  }));
  const app = new Crossnote();
  const notebook = await app.cloneNotebook({
    gitURL: "http://fixture.test/empty.git",
    corsProxy: "",
  });
  expect(notebook.localSha).toBe("");
  const args = { fs, dir: notebook.dir };
  await pfs.writeFile(`${notebook.dir}/local.md`, "staged locally");
  await git.add({ ...args, filepath: "local.md" });
  expect(await git.listFiles(args)).toEqual(["local.md"]);

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
      if (file === `${notebook.dir}/local.md`)
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
    await pfs.readFile(`${notebook.dir}/local.md`, { encoding: "utf8" }),
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
    "local.md",
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
    const { app, notebook, read, theirs } = await repository({
      [remotePath]: bytes("remote content"),
    });
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

it("retains recovery when checkout swallows a remote file write failure", async () => {
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
  await expect(app.pullNotebook({ notebook })).rejects.toThrow(
    "Git checkout did not restore README.md",
  );
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

it.each(["Network lost", "Remote rejected"])(
  "keeps and retries the original commit after %s, a reopen and a download",
  async (failure) => {
    const { app, notebook, base, read } = await repository();
    const args = { fs, dir: notebook.dir };
    const head = () => git.resolveRef({ ...args, ref: "refs/heads/master" });
    const note = "saved before upload\r\n";
    await pfs.writeFile(`${notebook.dir}/README.md`, note);
    await git.add({ ...args, filepath: "README.md" });
    const attempts: string[] = [];
    const push = vi.spyOn(git, "push").mockImplementation(async () => {
      attempts.push(await head());
      if (attempts.length === 1) {
        if (failure === "Network lost") throw new Error(failure);
        return { ok: false, error: failure, refs: {} };
      }
      return { ok: true, error: null, refs: {} };
    });
    await expect(app.pushNotebook({ notebook })).rejects.toThrow(failure);
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
  },
);

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
  await app.pushNotebook({ notebook });
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
  await pfs.writeFile(`${notebook.dir}/private.md`, "private draft");
  await pfs.writeFile(`${notebook.dir}/removed.txt`, "another edit");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await expect(app.pushNotebook({ notebook })).rejects.toMatchObject({
    filepath: "new.md",
  });
  expect(push).not.toHaveBeenCalled();
  expect(notebook.localSha).toBe(theirs);
  expect(await read("new.md")).toEqual([...bytes("new note")]);
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
  const args = { fs, dir: notebook.dir, oid: reopened.remoteSha };
  expect(await git.listFiles({ ...args, ref: args.oid })).not.toContain(
    "private.md",
  );
  expect(await read("private.md")).toEqual([...bytes("private draft")]);
  expect([
    ...(await git.readBlob({ ...args, filepath: "new.md" })).blob,
  ]).toEqual([...bytes("new note")]);
});

it("recovers upload eligibility from the old checkout when resuming an older pull plan", async () => {
  const { app, notebook, base, theirs, read } = await repository(
    { "notes/.gitignore": bytes("new.md\n") },
    { ".gitignore": bytes("private.md\n") },
  );
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
});

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

it.each([false, true])(
  "checks an unstaged ignored draft at the exact incoming path (matching bytes: %s)",
  async (match) => {
    const { app, notebook, base, theirs, read } = await repository(
      { ".gitignore": null, "draft.md": bytes("remote note") },
      { ".gitignore": bytes("draft.md\n") },
    );
    const args = { fs, dir: notebook.dir };
    expect([
      ...(await git.readBlob({ ...args, oid: theirs, filepath: "draft.md" }))
        .blob,
    ]).toEqual([...bytes("remote note")]);
    const content = bytes(match ? "remote note" : "local note");
    await pfs.writeFile(`${notebook.dir}/draft.md`, content);
    expect(await git.status({ ...args, filepath: "draft.md" })).toBe("ignored");
    expect(await git.listFiles(args)).not.toContain("draft.md");
    if (match) {
      await app.pullNotebook({ notebook });
      expect(notebook.localSha).toBe(theirs);
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

it("preserves a submodule in the uploaded tree when only a note changes", async () => {
  const { app, notebook, base } = await repository();
  const args = { fs, dir: notebook.dir };
  const { tree } = await git.readTree({ ...args, oid: base });
  const submodule = {
    path: "vendor",
    type: "commit" as const,
    mode: "160000",
    oid: base,
  };
  const tip = await git.commit({
    ...args,
    author,
    message: "Add submodule",
    tree: await git.writeTree({ ...args, tree: [...tree, submodule] }),
  });
  await app.hardResetNotebook(notebook, tip, true);
  vi.mocked(git.fetch).mockResolvedValue({ ...emptyRemote, fetchHead: tip });
  expect((await pfs.stats(notebook.dir + "/vendor")).isDirectory()).toBe(true);
  expect(await git.listFiles(args)).toContain("vendor");
  await pfs.writeFile(notebook.dir + "/README.md", "ordinary edit");
  const push = vi
    .spyOn(git, "push")
    .mockResolvedValue({ ok: true, error: null, refs: {} });
  await app.pushNotebook({ notebook });
  expect(push).toHaveBeenCalledOnce();
  const sent = await git.readTree({ ...args, oid: notebook.remoteSha });
  expect(sent.tree).toContainEqual(submodule);
});

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
    expect(await git.status({ ...args, filepath: "records.md" })).toBe(
      "ignored",
    );
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
