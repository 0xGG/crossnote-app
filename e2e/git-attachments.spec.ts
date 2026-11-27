import { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import { fileEvent, insertedPath, png } from "./attachment-helpers";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  download,
  fixtureURL,
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
  await changeRemote(request, remote, { "incoming.md": bytes("Remote note") });
  const localSha = (
    await app.storedText(`${dir}/.git/refs/heads/master`)
  )?.trim();
  const remoteSha = (
    await (await request.get(`${fixtureURL}/repos/${remote.id}`)).json()
  ).sha;
  const key = dir.slice("/notebooks/".length);
  async function savedPlan() {
    return page.evaluate(
      async ({ key, file }) => {
        if (
          !(await indexedDB.databases()).some(
            (db) => db.name === "crossnote-downloads",
          )
        )
          return null;
        function result<T>(request: IDBRequest<T>) {
          return new Promise<T>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        }
        const db = await result(indexedDB.open("crossnote-downloads"));
        try {
          const plan = await result(
            db.transaction("pulls").objectStore("pulls").get(key),
          );
          if (plan === undefined) return null;
          const attachment = plan?.files?.[file];
          if (!(attachment instanceof Uint8Array)) {
            throw new Error(
              `Saved download plan has no attachment bytes for ${file}`,
            );
          }
          return {
            version: plan.version,
            localSha: plan.localSha,
            remoteSha: plan.remoteSha,
            attachment: Array.from(attachment),
          };
        } finally {
          db.close();
        }
      },
      { key, file },
    );
  }
  const messages = await app.recordMessages();
  // Interrupt persistence only after checkout has installed the incoming note.
  const interrupted = await page.evaluateHandle((dir) => {
    const { pfs } = window as unknown as FileHost;
    const storeTree = pfs.storeTree.bind(pfs);
    let failed = false;
    pfs.storeTree = async (path) => {
      if (path === dir && (await pfs.readdir(dir)).includes("incoming.md")) {
        pfs.storeTree = storeTree;
        failed = true;
        throw new Error("Could not persist the downloaded notebook");
      }
      return storeTree(path);
    };
    return () => failed;
  }, dir);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  await expect.poll(messages).toContain("Failed to download notebook");
  expect(await interrupted.evaluate((didFail) => didFail())).toBe(true);
  expect(await localBytes(page, `${dir}/incoming.md`)).toEqual(
    bytes("Remote note"),
  );
  expect(await savedPlan()).toEqual({
    version: 2,
    localSha,
    remoteSha,
    attachment: png,
  });
  // Only the committed plan can restore deliberately removed working bytes on reload.
  await page.evaluate(async (path) => {
    const fs = (window as unknown as FileHost).pfs;
    await fs.unlink(path);
    await fs.storeTree(path);
  }, `${dir}/${file}`);
  await page.reload();
  await app.waitUntilReady();
  await expect.poll(savedPlan).toBeNull();
  expect(await localBytes(page, `${dir}/${file}`)).toEqual(png);
  expect(await localBytes(page, `${dir}/incoming.md`)).toEqual(
    bytes("Remote note"),
  );
  expect((await app.storedText(`${dir}/.git/refs/heads/master`))?.trim()).toBe(
    remoteSha,
  );
  await app.openNotes(remote.id);
  await upload(app, remote);
  expect(await remoteBytes(request, remote, file)).toEqual(png);
});
