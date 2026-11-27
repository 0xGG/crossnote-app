import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { CrossnoteApp } from "./crossnote";
import { fixtureURL } from "./git-fixture";

export { fixtureURL };
export type FileHost = {
  pfs: {
    readdir(name: string): Promise<string[]>;
    readFile(name: string): Promise<Uint8Array>;
    writeFile(name: string, bytes: Uint8Array): Promise<void>;
    storeTree(name: string): Promise<void>;
    unlink(name: string): Promise<void>;
  };
};
export type Remote = { id: string; url: string; proxy: string };
type FixtureFile = number[] | { gitlink: string } | { symlink: string };
export const bytes = (text: string) => [...new TextEncoder().encode(text)];

// Both Git and the app use LightningFS's promise API. Its idle shutdown
// checkpoints the directory tree even after reads, independently of either
// caller. Observe their write requests, including explicit tree flushes.
export async function expectReadOnlyNoteOpen(
  page: Page,
  openNote: () => Promise<void>,
) {
  expect(await filesystemWrites(page, openNote)).toEqual([]);
}

export async function expectNoCheckoutWrites(
  page: Page,
  dir: string,
  sync: () => Promise<void>,
) {
  const writes = await filesystemWrites(page, sync);
  // Fetch can update packs and remote refs before it knows about a conflict.
  const checkoutWrites = writes.filter(({ paths }) =>
    paths.some((path) => {
      if (!path.startsWith(dir + "/")) return false;
      const relative = path.slice(dir.length + 1);
      return (
        !relative.startsWith(".git/") ||
        /^\.git\/(?:HEAD(?:\.lock)?|index(?:\.lock|\.crossnote-rebuild)?|refs\/heads\/.*)$/.test(
          relative,
        )
      );
    }),
  );
  expect(checkoutWrites).toEqual([]);
}

async function filesystemWrites(page: Page, action: () => Promise<void>) {
  const stop = await page.evaluateHandle(async () => {
    await navigator.locks.request("fs_lock", () => {});
    const methods = [
      "writeFile",
      "unlink",
      "mkdir",
      "rmdir",
      "rename",
      "symlink",
      "backFile",
      "flush",
    ] as const;
    type Writes = Record<
      (typeof methods)[number],
      (...args: unknown[]) => Promise<unknown>
    >;
    const { promises } = (
      window as unknown as { pfs: { fs: { promises: Writes } } }
    ).pfs.fs;
    const writes: { method: string; paths: string[] }[] = [];
    const restore = methods.map((method) => {
      const original = promises[method];
      promises[method] = (...args) => {
        const count = method === "rename" || method === "symlink" ? 2 : 1;
        writes.push({
          method,
          paths: args
            .slice(0, count)
            .filter((arg): arg is string => typeof arg === "string"),
        });
        return original.apply(promises, args);
      };
      return () => (promises[method] = original);
    });
    return async () => {
      await navigator.locks.request("fs_lock", () => {});
      for (const reset of restore) reset();
      return writes;
    };
  });
  await action();
  return stop.evaluate((finish) => finish());
}

export async function createRemote(
  request: APIRequestContext,
  files: Record<string, FixtureFile>,
) {
  const response = await request.post(`${fixtureURL}/repos`, {
    data: { files },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Remote;
}

export async function changeRemote(
  request: APIRequestContext,
  remote: Remote,
  files: Record<string, FixtureFile | null>,
) {
  const response = await request.post(`${fixtureURL}/repos/${remote.id}`, {
    data: { files },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

export async function remoteBytes(
  request: APIRequestContext,
  remote: Remote,
  file: string,
): Promise<number[]> {
  const response = await request.get(`${fixtureURL}/repos/${remote.id}/file`, {
    params: { path: file },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).bytes;
}

export async function cloneRemote(
  app: CrossnoteApp,
  remote: Remote,
  fill?: (dialog: Locator) => Promise<void>,
): Promise<string> {
  const page = app.page;
  const before = await page.evaluate(() =>
    (window as unknown as FileHost).pfs.readdir("/notebooks"),
  );
  await app.sidebar.getByRole("button", { name: "Add a notebook" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Url", exact: true })
    .fill(remote.url);
  await dialog
    .getByRole("textbox", { name: "CORS proxy", exact: true })
    .fill(remote.proxy);
  await fill?.(dialog);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(app.notebook(remote.id)).toBeVisible({ timeout: 20000 });
  await expect(dialog).toBeHidden({ timeout: 15000 });
  const after = await page.evaluate(() =>
    (window as unknown as FileHost).pfs.readdir("/notebooks"),
  );
  const added = after.filter((dir) => !before.includes(dir));
  expect(added).toHaveLength(1);
  await app.openNotes(remote.id);
  return `/notebooks/${added[0]}`;
}

export async function localBytes(
  page: Page,
  file: string,
  replacement?: number[],
): Promise<number[]> {
  return page.evaluate(
    async ({ file, replacement }) => {
      const fs = (window as unknown as FileHost).pfs;
      if (replacement) {
        // Prepare an attachment without depending on the later attachment UI.
        // Existing tracked files participate even before the next git.add.
        await fs.writeFile(file, new Uint8Array(replacement));
        await fs.storeTree(file);
      }
      return [...((await fs.readFile(file)) as Uint8Array)];
    },
    { file, replacement },
  );
}

// Inspect the browser's Git v2 index independently of the application.
export async function indexEntries(page: Page, indexPath: string) {
  const index = Buffer.from(await localBytes(page, indexPath));
  expect(index.toString("ascii", 0, 4)).toBe("DIRC");
  expect(index.readUInt32BE(4)).toBe(2);
  const entries = [];
  for (let pos = 12, i = 0; i < index.readUInt32BE(8); i++) {
    const end = index.indexOf(0, pos + 62);
    expect(end).toBeGreaterThanOrEqual(pos + 62);
    const name = index.toString("utf8", pos + 62, end);
    entries.push({
      name,
      mode: index.readUInt32BE(pos + 24).toString(8),
      oid: index.toString("hex", pos + 40, pos + 60),
    });
    pos += Math.ceil((end - pos + 1) / 8) * 8;
  }
  return entries;
}

export async function download(
  app: CrossnoteApp,
  remote: Remote,
  expectedMessage = "Notebook downloaded",
) {
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  await expect.poll(messages, { timeout: 20000 }).toContain(expectedMessage);
}

export async function upload(app: CrossnoteApp, remote: Remote) {
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  const dialog = app.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await expect(
    app.page.getByRole("alert").filter({ hasText: "Notebook uploaded" }),
  ).toBeVisible();
}
