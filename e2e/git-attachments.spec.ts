import { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import { fileEvent, insertedPath, png } from "./attachment-helpers";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  download,
  localBytes,
  remoteBytes,
  upload,
  type FileHost,
} from "./git";

test.describe.configure({ timeout: 60000 });

test("rejects a UI attachment ignored by Git without creating a link or file", async ({
  app,
  page,
  request,
}) => {
  const ignore = bytes("assets/\n");
  const remote = await createRemote(request, {
    "README.md": bytes("# Ignore\n"),
    ".gitignore": ignore,
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  const before = await app.editorText(app.visibleEditor);
  const messages = await app.recordMessages();
  await fileEvent(app, "paste", "ignored.png", "image/png", png);
  await expect
    .poll(messages)
    .toContainEqual(expect.stringContaining("ignored by Git"));
  expect(await app.editorText(app.visibleEditor)).toBe(before);
  expect(await localBytes(page, `${dir}/.gitignore`)).toEqual(ignore);
  const assets = await page.evaluate(async (dir) => {
    const fs = (
      window as unknown as FileHost & {
        pfs: { exists(path: string): Promise<boolean> };
      }
    ).pfs;
    return (await fs.exists(`${dir}/assets`))
      ? fs.readdir(`${dir}/assets`)
      : [];
  }, dir);
  expect(assets).toEqual([]);
  expect(await app.storedText(`${dir}/README.md`)).not.toContain("/assets/");
});

test("uploads an attachment created in the editor and clones its bytes", async ({
  app,
  page,
  request,
  browser,
}) => {
  const remote = await createRemote(request, {
    "README.md": bytes("# Attachments\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  await fileEvent(app, "paste", "git.png", "image/png", png);
  const file = await insertedPath(app, ".png");
  expect(await localBytes(page, `${dir}/${file}`)).toEqual(png);
  await upload(app, remote);
  expect(await remoteBytes(request, remote, file)).toEqual(png);
  await changeRemote(request, remote, {
    "remote.md": bytes("Remote change\n"),
  });
  await download(app, remote);
  expect(await localBytes(page, `${dir}/${file}`)).toEqual(png);
  const fresh = await browser.newContext();
  try {
    await fresh.addInitScript(() =>
      localStorage.setItem("settings/language", "en-US"),
    );
    const nextPage = await fresh.newPage();
    const next = new CrossnoteApp(nextPage);
    await nextPage.goto(new URL("/", page.url()).href);
    await next.waitUntilReady();
    const nextDir = await cloneRemote(next, remote);
    expect(await localBytes(nextPage, `${nextDir}/${file}`)).toEqual(png);
  } finally {
    await fresh.close();
  }
});

test("recovers an editor-created attachment after an interrupted pull", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "README.md": bytes("# Recovery\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  await fileEvent(app, "paste", "recovery.png", "image/png", png);
  const file = await insertedPath(app, ".png");
  const theirs = [0, 253, 130];
  await changeRemote(request, remote, { [file]: theirs });
  const messages = await app.recordMessages();
  await page.evaluate(() => {
    const fs = (window as unknown as FileHost).pfs;
    const write = fs.writeFile.bind(fs);
    fs.writeFile = async (path, data) => {
      if (path.includes(".remote-")) throw new Error("Simulated disk failure");
      return write(path, data);
    };
  });
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  await expect.poll(messages).toContain("Failed to download notebook");
  await page.evaluate(async (path) => {
    const fs = (window as unknown as FileHost).pfs;
    await fs.unlink(path);
    await fs.storeTree(path);
  }, `${dir}/${file}`);
  await page.reload();
  await app.waitUntilReady();
  await expect(app.notebook(remote.id)).toBeVisible();
  expect(await localBytes(page, `${dir}/${file}`)).toEqual(png);
  const copies = await page.evaluate(
    async (dir) =>
      (
        await (window as unknown as FileHost).pfs.readdir(`${dir}/assets`)
      ).filter((name) => name.includes(".remote-")),
    dir,
  );
  expect(copies).toHaveLength(1);
  expect(await localBytes(page, `${dir}/assets/${copies[0]}`)).toEqual(theirs);
});
