import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { CrossnoteApp } from "./crossnote";

export const fixtureURL = "http://127.0.0.1:4174";
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
export const bytes = (text: string) => [...new TextEncoder().encode(text)];

export async function createRemote(
  request: APIRequestContext,
  files: Record<string, number[]>,
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
  files: Record<string, number[] | null>,
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
