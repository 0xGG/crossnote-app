import git from "isomorphic-git";
import { afterEach, expect, it, vi } from "vitest";
import { fs, pfs } from "./fs";
import { Notebook } from "./notebook";
import { needsRecovery, notebookOperation } from "./notebookOperation";
import { validateAttachment, writeAttachment } from "./attachments";

function file(bytes: Uint8Array, name = "照片.png", type = "image/png"): File {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const result = new File([copy], name, { type });
  Object.defineProperty(result, "arrayBuffer", {
    configurable: true,
    value: async () => copy.buffer.slice(0),
  });
  return result;
}
async function notebook(local: boolean) {
  const n = new Notebook();
  n.dir = `/notebooks/attachment-${crypto.randomUUID()}`;
  n.isLocal = local;
  await pfs.mkdirp(n.dir);
  if (!local) await git.init({ fs, dir: n.dir });
  return n;
}
afterEach(() => vi.restoreAllMocks());

it("accepts 20 MiB and rejects larger or unsupported files", () => {
  expect(() =>
    validateAttachment(file(new Uint8Array(20 * 1024 * 1024))),
  ).not.toThrow();
  expect(() =>
    validateAttachment(file(new Uint8Array(20 * 1024 * 1024 + 1))),
  ).toThrow("size");
  expect(() =>
    validateAttachment(
      file(new Uint8Array([1]), "document.pdf", "application/pdf"),
    ),
  ).toThrow("type");
  expect(() =>
    validateAttachment(file(new Uint8Array([1]), "image.png", "video/mp4")),
  ).toThrow("type");
});

it("names unnamed clipboard media and keeps long Unicode names portable", async () => {
  const n = await notebook(true);
  const unnamed = await writeAttachment(
    n,
    file(new Uint8Array([42]), "", "image/png"),
  );
  expect(unnamed).toMatch(/^\/assets\/attachment-[\da-f-]+\.png$/);
  const long = await writeAttachment(
    n,
    file(new Uint8Array([43]), "𠮷".repeat(90) + ".png"),
  );
  const basename = decodeURIComponent(long.split("/").pop()!);
  expect(new TextEncoder().encode(basename).length).toBeLessThanOrEqual(255);
  expect(basename).toMatch(/^𠮷+-[\da-f-]+\.png$/u);
});

it.each([true, false])(
  "writes bytes and stores distinct same-name files (isLocal=%s)",
  async (local) => {
    const n = await notebook(local);
    const bytes = new Uint8Array([0, 255, 128, 13, 10]);
    const originalStore = n.storeNote.bind(n);
    const store = vi
      .spyOn(n, "storeNote")
      .mockImplementation(async (relative) => {
        expect(await pfs.exists(`${n.dir}/${relative}`)).toBe(true);
        await originalStore(relative);
      });
    const first = await writeAttachment(n, file(bytes));
    const second = await writeAttachment(n, file(new Uint8Array([2])));
    expect(first).not.toBe(second);
    const relative = decodeURIComponent(first.slice(1));
    expect(relative).toMatch(/^assets\/照片-.*\.png$/);
    expect(
      Array.from((await pfs.readFile(`${n.dir}/${relative}`)) as Uint8Array),
    ).toEqual(Array.from(bytes));
    expect(
      Array.from(
        (await pfs.readFile(
          `${n.dir}/${decodeURIComponent(second.slice(1))}`,
        )) as Uint8Array,
      ),
    ).toEqual([2]);
    expect(store).toHaveBeenCalledTimes(2);
    if (!local)
      expect(await git.status({ fs, dir: n.dir, filepath: relative })).toBe(
        "added",
      );
  },
);

it("rejects write and store failures instead of reporting a link", async () => {
  const n = await notebook(true);
  const write = vi
    .spyOn(pfs, "writeFile")
    .mockRejectedValueOnce(new Error("write failed"));
  await expect(writeAttachment(n, file(new Uint8Array([1])))).rejects.toThrow(
    "write failed",
  );
  write.mockRestore();
  vi.spyOn(n, "storeNote").mockRejectedValueOnce(new Error("store failed"));
  await expect(writeAttachment(n, file(new Uint8Array([1])))).rejects.toThrow(
    "store failed",
  );
});

it.each(["assets/", "*.png"])(
  "rejects an attachment ignored by Git rule %s before writing",
  async (rule) => {
    const n = await notebook(false);
    await pfs.writeFile(`${n.dir}/.gitignore`, `${rule}\n`);
    await expect(
      writeAttachment(n, file(new Uint8Array([1]))),
    ).rejects.toMatchObject({ reason: "ignored" });
    expect(await pfs.exists(`${n.dir}/assets`)).toBe(false);
    const entries = await git.listFiles({ fs, dir: n.dir });
    expect(entries.some((entry) => entry.startsWith("assets/"))).toBe(false);
  },
);

it("does not apply Git ignore rules to a local notebook", async () => {
  const n = await notebook(true);
  await pfs.writeFile(`${n.dir}/.gitignore`, "assets/\n*.png\n");
  const link = await writeAttachment(n, file(new Uint8Array([42])));
  expect(
    Array.from(
      (await pfs.readFile(
        `${n.dir}/${decodeURIComponent(link.slice(1))}`,
      )) as Uint8Array,
    ),
  ).toEqual([42]);
});

it.each(["location", "recovery"] as const)(
  "rechecks %s after waiting for the notebook lock",
  async (changed) => {
    const n = await notebook(true);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = notebookOperation(n.dir, async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await started;
    let read!: () => void;
    const bytesRead = new Promise<void>((resolve) => {
      read = resolve;
    });
    const attachment = file(new Uint8Array([1]));
    Object.defineProperty(attachment, "arrayBuffer", {
      value: async () => {
        read();
        return new Uint8Array([1]).buffer;
      },
    });
    let current = true;
    const isCurrent = vi.fn(() => current);
    const pending = writeAttachment(n, attachment, isCurrent);
    const result = pending.then(
      () => "success",
      (error: Error) => error.message,
    );
    await bytesRead;
    // Let writeAttachment enqueue after its byte read, while the first operation holds the lock.
    await Promise.resolve();
    let checkedBeforeNext = false;
    const next = notebookOperation(n.dir, async () => {
      checkedBeforeNext = isCurrent.mock.calls.length > 0;
    });
    try {
      expect(isCurrent).not.toHaveBeenCalled();
      if (changed === "location") current = false;
      else needsRecovery(n.dir, true);
      release();
      await held;
      expect(await result).toContain(changed);
      await next;
      expect(checkedBeforeNext).toBe(true);
      expect(await pfs.exists(`${n.dir}/assets`)).toBe(false);
    } finally {
      needsRecovery(n.dir, false);
      release();
    }
  },
);
