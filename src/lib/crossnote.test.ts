import * as git from "isomorphic-git";
import webHttp from "isomorphic-git/http/web";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isStored, readStored } from "../test/storedTree";
import Crossnote from "./crossnote";
import { fs, pfs } from "./fs";
import { parentGitTree } from "./gitLinks";
import { effectiveGitProxy, gitConnection } from "./gitConnection";

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

  it("changes the shared settings only after their record has been saved", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Original",
      gitURL: "",
    });
    const changes = {
      name: "Edited",
      gitUsername: "",
      gitPassword: "",
      gitCorsProxy: "",
      autoFetchPeriod: 0,
    };
    const records = crossnote["notebookDB"];
    const put = records.put.bind(records);
    const failingWrite = vi
      .spyOn(records, "put")
      .mockImplementation((...args) => {
        // The search index can still be writing its own document.
        if (args[0]._id === notebook._id) {
          return Promise.reject(new Error("disk full"));
        }
        return put(...args);
      });
    try {
      await expect(
        crossnote.saveNotebookSettings(notebook, changes),
      ).rejects.toThrow("disk full");
      expect(notebook.name).toBe("Original");
      expect((await records.get(notebook._id)).name).toBe("Original");
    } finally {
      failingWrite.mockRestore();
    }
    await crossnote.saveNotebookSettings(notebook, changes);
    expect(notebook.name).toBe("Edited");
    expect((await records.get(notebook._id)).name).toBe("Edited");
  });

  it("reports a cleanup failure after removing the notebook record", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Cleanup fails",
      gitURL: "",
    });
    const failure = new Error("storage unavailable");
    const remove = vi.spyOn(pfs, "rmdir").mockRejectedValueOnce(failure);
    try {
      expect(await crossnote.deleteNotebook(notebook._id)).toEqual({
        cleanupError: failure,
      });
      await expect(
        crossnote["notebookDB"].get(notebook._id),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      remove.mockRestore();
    }
  });

  it("stores clone credentials only in a successfully registered notebook", async () => {
    const url = "https://example.test/notes.git";
    const clone = vi.spyOn(git, "clone").mockImplementation(async (args) => {
      const location = { fs, dir: args.dir };
      await git.init({ ...location, defaultBranch: "master" });
      await git.setConfig({
        ...location,
        path: "remote.origin.url",
        value: args.url,
      });
    });
    const records = crossnote["notebookDB"];
    const put = records.put.bind(records);
    const failed = vi
      .spyOn(records, "put")
      .mockImplementation((...args) =>
        args[0].gitURL === url
          ? Promise.reject(new Error("registration failed"))
          : put(...args),
      );
    const args = {
      gitURL: "https://old:embedded@example.test/notes.git",
      username: "reader",
      password: "saved-secret",
    };
    try {
      try {
        await expect(crossnote.cloneNotebook(args)).rejects.toThrow(
          "registration failed",
        );
      } finally {
        failed.mockRestore();
      }
      const notebook = await crossnote.cloneNotebook(args);
      expect(await records.get(notebook._id)).toMatchObject({
        gitURL: url,
        gitUsername: args.username,
        gitPassword: args.password,
      });
      expect(
        await git.getConfig({
          fs,
          dir: notebook.dir,
          path: "remote.origin.url",
        }),
      ).toBe(url);
      const connection = clone.mock.calls.at(-1)[0];
      expect(await connection.onAuth(url, {})).toEqual({
        username: args.username,
        password: args.password,
      });
    } finally {
      clone.mockRestore();
    }
  });

  it("clears login information from the registry and Git config only when settings are saved", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Legacy",
      gitURL: "",
    });
    const records = crossnote["notebookDB"];
    const url = "https://example.test/legacy.git";
    const legacy = "https://legacy:embedded@example.test/legacy.git";
    const origin = { fs, dir: notebook.dir, path: "remote.origin.url" };
    await git.setConfig({ ...origin, value: legacy });
    await records.put({
      ...(await records.get(notebook._id)),
      gitURL: legacy,
      gitUsername: "legacy",
      gitPassword: "old-stored-secret",
    });

    const reopened = (await crossnote.listNotebooks()).find(
      (item) => item._id === notebook._id,
    );
    expect(reopened.gitURL).toBe(url);
    expect((await records.get(notebook._id)).gitURL).toBe(legacy);
    expect(await git.getConfig(origin)).toBe(legacy);
    expect(
      await crossnote.saveNotebookSettings(reopened, {
        name: reopened.name,
        gitUsername: "",
        gitPassword: "",
        gitCorsProxy: "",
        autoFetchPeriod: 0,
      }),
    ).toBe("cleared");
    expect(await records.get(notebook._id)).toMatchObject({
      gitURL: url,
      gitUsername: "",
      gitPassword: "",
    });
    expect(await git.getConfig(origin)).toBe(url);
  });

  it("waits for the displayed proxy address to be saved before sending existing credentials", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Old proxy",
      gitURL: "",
    });
    const records = crossnote["notebookDB"];
    const url = "https://example.test/old-proxy.git";
    const oldProxy = "https://crossnote.app/cors";
    const credentials = { gitUsername: "reader", gitPassword: "saved-secret" };
    await records.put({
      ...(await records.get(notebook._id)),
      ...credentials,
      gitURL: url,
      gitCorsProxy: oldProxy,
    });
    const reopened = (await crossnote.listNotebooks()).find(
      (item) => item._id === notebook._id,
    );
    const shownProxy = effectiveGitProxy(reopened.gitCorsProxy);
    expect(shownProxy).not.toBe(oldProxy);
    expect((await records.get(notebook._id)).gitCorsProxy).toBe(oldProxy);
    const receiver =
      (shownProxy.endsWith("?")
        ? shownProxy + url
        : shownProxy
          ? shownProxy + "/example.test/old-proxy.git"
          : url) + "/info/refs?service=git-upload-pack";
    const dispatched = vi
      .spyOn(webHttp, "request")
      .mockResolvedValue(undefined);
    let challenged = false;
    const fetch = vi
      .spyOn(git, "fetch")
      .mockImplementation(async ({ http }) => {
        await http.request({ url: receiver });
        if (challenged) {
          await http.request({
            url: receiver,
            headers: { Authorization: "Basic fixture" },
          });
        }
        return {
          fetchHead: null,
          fetchHeadDescription: null,
          defaultBranch: null,
        };
      });
    try {
      await expect(
        crossnote.fetchNotebook({ notebook: reopened }),
      ).resolves.toBe(false);
      expect(dispatched.mock.calls.map(([request]) => request.headers)).toEqual(
        [undefined],
      );
      challenged = true;
      await expect(
        crossnote.fetchNotebook({ notebook: reopened }),
      ).rejects.toThrow("error/git-confirm-proxy");
      expect(dispatched.mock.calls.map(([request]) => request.headers)).toEqual(
        [undefined, undefined],
      );
      expect(reopened.gitNeedsLogin).toBe(true);
      await crossnote.saveNotebookSettings(reopened, {
        ...credentials,
        name: reopened.name,
        gitCorsProxy: shownProxy,
        autoFetchPeriod: 0,
      });
      await crossnote.fetchNotebook({ notebook: reopened });
      expect(dispatched.mock.calls.at(-1)[0].headers).toEqual({
        Authorization: "Basic fixture",
      });
      const connection = fetch.mock.calls.at(-1)[0];
      expect(connection.corsProxy).toBe(shownProxy);
      expect(await connection.onAuth(url, {})).toEqual({
        username: credentials.gitUsername,
        password: credentials.gitPassword,
      });
      expect(reopened.gitNeedsLogin).toBe(false);
    } finally {
      fetch.mockRestore();
      dispatched.mockRestore();
    }
  });

  it.each([
    [
      "http://example.test/notes.git",
      "",
      "http://example.test/notes.git/info/refs?service=git-upload-pack",
    ],
    [
      "https://example.test/notes.git",
      "http://proxy.test",
      "http://proxy.test/example.test/notes.git/info/refs?service=git-upload-pack",
    ],
  ])(
    "allows anonymous HTTP and refuses to send saved authorization (%s via %s)",
    async (url, proxy, receiver) => {
      const dispatched = vi
        .spyOn(webHttp, "request")
        .mockResolvedValue(undefined);
      try {
        const { http } = gitConnection(url, proxy, "reader", "saved-secret");
        await http.request({ url: receiver });
        await expect(
          http.request({
            url: receiver,
            headers: { Authorization: "Basic fixture" },
          }),
        ).rejects.toThrow("error/git-credentials-require-https");
        expect(dispatched.mock.calls).toEqual([[{ url: receiver }]]);
      } finally {
        dispatched.mockRestore();
      }
    },
  );

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

  // A folder removed while the record stays would be a notebook that can
  // take no notes, and the file system stores its tree on its own, half a
  // second after the last change, whether or not the record went.
  it("keeps a notebook whole when its record cannot be removed", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Kept whole",
      corsProxy: "",
      gitURL: "",
    });
    const removing = vi
      .spyOn(crossnote["notebookDB"], "remove")
      .mockRejectedValueOnce(new Error("Document update conflict"));

    await expect(crossnote.deleteNotebook(notebook._id)).rejects.toThrow(
      "Document update conflict",
    );
    removing.mockRestore();
    expect(await pfs.exists(`${notebook.dir}/.git/HEAD`)).toBe(true);
  });

  it("checks the confirmed branch and HEAD before resetting equal-size edits", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Local commits",
      gitURL: "",
    });
    const args = { fs, dir: notebook.dir };
    const file = notebook.dir + "/Note.md";
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-01-01T01:02:03.000Z"));
      await pfs.writeFile(file, "old");
      await git.add({ ...args, filepath: "Note.md" });
      notebook.localSha = await git.commit({
        ...args,
        message: "First note",
        author,
      });
      await pfs.writeFile(file, "new");
      await git.add({ ...args, filepath: "Note.md" });
      const sha = await git.commit({
        ...args,
        message: "Pending local commit",
        author,
      });
      const before = await pfs.stats(file);
      await pfs.writeFile(file, "bad");
      const draft = "temp/deep/draft.md";
      await pfs.writeFile(notebook.dir + "/" + draft, "draft");
      await git.add({ ...args, filepath: draft });
      expect(await pfs.stats(file)).toMatchObject({
        mtimeMs: before.mtimeMs,
        size: before.size,
      });
      const target = await crossnote.previewReset(notebook);
      expect(target).toMatchObject({
        branch: "refs/heads/master",
        sha,
        files: ["Note.md", draft],
      });
      await git.branch({ ...args, ref: "other" });
      await git.checkout({ ...args, ref: "other", noCheckout: true });
      await expect(crossnote.resetToHead(notebook, target)).rejects.toThrow(
        "error/reset-target-changed",
      );
      expect(await pfs.readFile(file, { encoding: "utf8" })).toBe("bad");
      await git.checkout({ ...args, ref: "master", noCheckout: true });
      await expect(
        crossnote.resetToHead(notebook, { ...target, sha: notebook.localSha }),
      ).rejects.toThrow("error/reset-target-changed");
      await crossnote.resetToHead(notebook, target);
      expect(await pfs.readFile(file, { encoding: "utf8" })).toBe("new");
      expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(sha);
      expect(await pfs.exists(notebook.dir + "/temp")).toBe(false);
      expect(await crossnote.previewReset(notebook)).toMatchObject({
        branch: target.branch,
        sha,
        files: [],
      });
      await git.checkout({ ...args, ref: sha, noCheckout: true });
      await pfs.writeFile(file, "bad");
      await expect(crossnote.resetToHead(notebook, target)).rejects.toThrow(
        "error/reset-target-changed",
      );
      const detached = await crossnote.previewReset(notebook);
      expect(detached).toMatchObject({
        branch: "HEAD",
        sha,
        files: ["Note.md"],
      });
      await crossnote.resetToHead(notebook, detached);
      expect(await pfs.readFile(file, { encoding: "utf8" })).toBe("new");
      expect(await git.currentBranch(args)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a checked-out relative symlink alone and restores a different target", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Link restore",
      gitURL: "",
    });
    const args = { fs, dir: notebook.dir };
    const filepath = "Shortcut.md";
    const file = notebook.dir + "/" + filepath;
    await pfs.writeFile(notebook.dir + "/README.md", "note");
    await git.add({ ...args, filepath: "README.md" });
    const oid = await git.writeBlob({
      ...args,
      blob: new TextEncoder().encode("README.md"),
    });
    await git.updateIndex({
      ...args,
      filepath,
      oid,
      mode: 0o120000,
      add: true,
    });
    const base = await git.commit({
      ...args,
      author,
      message: "Relative link",
    });
    await git.checkout({ ...args, ref: "master", force: true });
    expect(await fs.promises.readlink(file)).toBe("./README.md");
    const unlink = vi.spyOn(pfs, "unlink");
    const symlink = vi.spyOn(fs.promises, "symlink");
    try {
      const clean = await crossnote.previewReset(notebook);
      await crossnote.resetToHead(notebook, clean);
      expect.soft(clean.files).toEqual([]);
      expect.soft(unlink).not.toHaveBeenCalledWith(file);
      expect.soft(symlink).not.toHaveBeenCalled();
      await pfs.unlink(file);
      await fs.promises.symlink("missing.md", file);
      const changed = await crossnote.previewReset(notebook);
      expect(changed.files).toEqual([filepath]);
      await crossnote.resetToHead(notebook, changed);
      expect(await fs.promises.readlink(file)).toBe("./README.md");
      expect(await crossnote.getStatus(notebook.dir, filepath)).toBe(
        "unmodified",
      );
      expect((await crossnote.previewReset(notebook)).files).toEqual([]);
      const { tree } = await git.readTree({ ...args, oid: base });
      const updated = await git.writeBlob({
        ...args,
        blob: new TextEncoder().encode("updated target"),
      });
      const incoming = await git.commit({
        ...args,
        author,
        message: "Update linked note",
        noUpdateBranch: true,
        tree: await git.writeTree({
          ...args,
          tree: tree.map((entry) =>
            entry.path === "README.md" ? { ...entry, oid: updated } : entry,
          ),
        }),
      });
      notebook.gitURL = "https://fixture.test/link.git";
      notebook.localSha = notebook.remoteSha = base;
      const fetch = vi
        .spyOn(git, "fetch")
        .mockResolvedValue({
          fetchHead: incoming,
          fetchHeadDescription: "master",
          defaultBranch: "master",
          headers: {},
        });
      try {
        await pfs.unlink(file);
        await fs.promises.symlink("Other.md", file);
        await expect(
          crossnote.pullNotebook({ notebook }),
        ).rejects.toMatchObject({ files: [filepath] });
        expect(await fs.promises.readlink(file)).toBe("./Other.md");
        await crossnote.resetToHead(
          notebook,
          await crossnote.previewReset(notebook),
        );
        await crossnote.pullNotebook({ notebook });
        expect(await fs.promises.readlink(file)).toBe("./README.md");
        expect(await pfs.readFile(file, { encoding: "utf8" })).toBe(
          "updated target",
        );
        const push = vi.spyOn(git, "push");
        try {
          await crossnote.pushNotebook({ notebook });
          expect(push).not.toHaveBeenCalled();
          expect(await git.resolveRef({ ...args, ref: "HEAD" })).toBe(incoming);
        } finally {
          push.mockRestore();
        }
      } finally {
        fetch.mockRestore();
      }
    } finally {
      unlink.mockRestore();
      symlink.mockRestore();
    }
  });

  it("only removes the previewed entries of a directory that blocks a committed file", async () => {
    const notebook = await crossnote.addNotebook({
      name: "Blocked restore",
      gitURL: "",
    });
    const args = { fs, dir: notebook.dir };
    const file = "README.md";
    const root = notebook.dir + "/" + file;
    await pfs.writeFile(root, "committed");
    await git.add({ ...args, filepath: file });
    await git.commit({ ...args, author, message: "Record note" });
    const note = await notebook.getNote(file);
    await pfs.unlink(root);
    await pfs.mkdir(root);
    await notebook.checkoutNote(note);
    expect(await pfs.readFile(root, { encoding: "utf8" })).toBe("committed");
    await pfs.unlink(root);
    await pfs.mkdir(root);
    await pfs.writeFile(notebook.dir + "/outside/keep.md", "keep");
    await fs.promises.symlink("../outside", root + "/shortcut");
    const preview = await crossnote.previewReset(notebook);
    expect.soft(preview.files).toEqual([file, file + "/shortcut"]);
    const readBlob = git.readBlob;
    // The file appears after confirmation has validated the plan.
    const insert = vi
      .spyOn(git, "readBlob")
      .mockImplementationOnce(async (input) => {
        await pfs.writeFile(root + "/late.md", "new draft");
        return readBlob(input);
      });
    try {
      await expect
        .soft(crossnote.resetToHead(notebook, preview))
        .rejects.toThrow();
    } finally {
      insert.mockRestore();
    }
    expect(await pfs.readFile(root + "/late.md", { encoding: "utf8" })).toBe(
      "new draft",
    );
    expect(
      await pfs.readFile(notebook.dir + "/outside/keep.md", {
        encoding: "utf8",
      }),
    ).toBe("keep");
    await crossnote.resetToHead(
      notebook,
      await crossnote.previewReset(notebook),
    );
    expect(await pfs.readFile(root, { encoding: "utf8" })).toBe("committed");
  });

  it.each([true, false])(
    "restores both working and index paths when a staged directory replaces a file or vice versa (%s)",
    async (headHasDirectory) => {
      const notebook = await crossnote.addNotebook({
        name: "Path replacement",
        gitURL: "",
      });
      const args = { fs, dir: notebook.dir };
      const root = notebook.dir + "/thing";
      const tracked = headHasDirectory ? "thing/inside" : "thing";
      const replacement = headHasDirectory ? "thing" : "thing/inside";
      await pfs.writeFile(notebook.dir + "/" + tracked, "committed");
      await git.add({ ...args, filepath: tracked });
      await git.commit({ ...args, author, message: "Record original path" });
      await git.remove({ ...args, filepath: tracked });
      if (headHasDirectory) await pfs.rmdir(root);
      else await pfs.unlink(root);
      await pfs.writeFile(notebook.dir + "/" + replacement, "staged");
      await git.add({ ...args, filepath: replacement });
      const target = await crossnote.previewReset(notebook);
      await crossnote.resetToHead(notebook, target);
      expect(await git.listFiles(args)).toEqual([tracked]);
      expect(
        await pfs.readFile(notebook.dir + "/" + tracked, { encoding: "utf8" }),
      ).toBe("committed");
    },
  );

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
    await crossnote.hardResetNotebook(
      notebook,
      sha,
      await parentGitTree(notebook.dir, sha),
    );
    const index = `${notebook.dir}/.git/index`;
    const there = await pfs.exists(index);
    expect({
      stored: await isStored(index),
      readable: (await readStored(index)) !== undefined,
    }).toEqual({ stored: there, readable: there });
  });
});
