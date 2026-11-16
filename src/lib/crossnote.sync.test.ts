import * as git from "isomorphic-git";
import { afterEach, expect, it, vi } from "vitest";
import { isStored, readStored } from "../test/storedTree";
import Crossnote from "./crossnote";
import { fs, pfs } from "./fs";
import { NotebookConflictError } from "./mergeFiles";
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

async function repository(remote: Record<string, Uint8Array | null> = {}) {
  const app = new Crossnote();
  const notebook = await app.addNotebook({ name: "Sync", gitURL: "" });
  for (const [file, data] of Object.entries({
    "README.md": bytes("# Kept\n"),
    "assets/a.bin": binary,
    "removed.txt": bytes("delete me\n"),
  })) {
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
        await pfs.unlink(`${notebook.dir}/${file}`);
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
    await app.hardResetNotebook(notebook, base, true);
    await git.add({ fs, dir: notebook.dir, filepath: "." });
  }
  notebook.gitURL = "http://fixture.test/notebook.git";
  notebook.localSha = base;
  notebook.remoteSha = base;
  await app.updateNotebook(notebook);
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

it("restores changed and newly staged bytes, deletions and untouched files on an unchanged remote", async () => {
  const { app, notebook, read } = await repository();
  await pfs.writeFile(`${notebook.dir}/assets/a.bin`, changed);
  await pfs.writeFile(`${notebook.dir}/assets/new.bin`, remoteBytes);
  await git.add({ fs, dir: notebook.dir, filepath: "assets/new.bin" });
  await pfs.unlink(`${notebook.dir}/removed.txt`);
  await git.remove({ fs, dir: notebook.dir, filepath: "removed.txt" });
  const result = await app.pullNotebook({ notebook });
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
  const { app, notebook, base } = await repository();
  const object = `${notebook.dir}/.git/objects/pack/new-fetch.pack`;
  vi.mocked(git.fetch).mockImplementationOnce(async () => {
    await pfs.writeFile(object, binary);
    return {
      fetchHead: base,
      fetchHeadDescription: "master",
      defaultBranch: "master",
      headers: {},
    };
  });
  const save = recovery.savePullRecovery;
  vi.spyOn(recovery, "savePullRecovery").mockImplementationOnce(
    async (id, plan) => {
      expect(Array.from((await readStored(object)) ?? [])).toEqual([...binary]);
      return save(id, plan);
    },
  );
  await app.pullNotebook({ notebook });
});

it("does not reset when durable recovery cannot be written", async () => {
  const { app, notebook, read } = await repository();
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

it("waits for a failed push's soft reset and stores its directory tree before rejecting", async () => {
  const { app, notebook, base } = await repository();
  vi.spyOn(git, "push").mockRejectedValueOnce(new Error("Network lost"));
  await expect(
    app.pushNotebook({
      notebook,
      authorName: author.name,
      authorEmail: author.email,
    }),
  ).rejects.toThrow("Network lost");
  expect(await app.getGitSHA(notebook.dir)).toBe(base);
  expect(
    new TextDecoder().decode(
      await readStored(`${notebook.dir}/.git/refs/heads/master`),
    ),
  ).toBe(base);
  expect(await isStored(`${notebook.dir}/.git/index`)).toBe(true);
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

it("does not report a rejected remote push as success", async () => {
  const { app, notebook, base } = await repository();
  vi.spyOn(git, "push").mockResolvedValueOnce({
    ok: false,
    error: "Remote rejected",
    refs: {},
  });
  await expect(
    app.pushNotebook({
      notebook,
      authorName: author.name,
      authorEmail: author.email,
    }),
  ).rejects.toThrow("Remote rejected");
  expect(await app.getGitSHA(notebook.dir)).toBe(base);
  expect(
    new TextDecoder().decode(
      await readStored(`${notebook.dir}/.git/refs/heads/master`),
    ),
  ).toBe(base);
});

it("persists cloned content before recording the notebook", async () => {
  const app = new Crossnote();
  vi.spyOn(git, "clone").mockImplementationOnce(async ({ dir }) => {
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
  });
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
