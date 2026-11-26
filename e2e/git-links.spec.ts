import { expect, test } from "./fixtures";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  download,
  fixtureURL,
  type FileHost,
  indexEntries,
  localBytes,
  remoteBytes,
  upload,
} from "./git";

test.describe.configure({ timeout: 90000 });

test("removes a gitlink from the fixture remote", async ({ request }) => {
  const remote = await createRemote(request, {
    "vendor": { gitlink: "1".repeat(40) },
    "remove.md": bytes("remove"),
    "keep.md": bytes("keep"),
  });
  await changeRemote(request, remote, {
    "vendor": null,
    "remove.md": null,
    "missing.md": null,
  });
  const state = await request.get(`${fixtureURL}/repos/${remote.id}`);
  expect((await state.json()).files).toEqual(["keep.md"]);
});

for (const oldPath of ["vendor", "vendor/old.md"]) {
  test(`replaces ${oldPath} with a gitlink and updates the pointer`, async ({
    request,
  }) => {
    const remote = await createRemote(request, {
      [oldPath]: bytes("old file"),
    });
    for (const oid of ["1".repeat(40), "2".repeat(40)]) {
      await changeRemote(request, remote, { vendor: { gitlink: oid } });
      const tree = await request.get(`${fixtureURL}/repos/${remote.id}?tree`);
      expect(await tree.json()).toEqual([`160000 commit ${oid}\tvendor`]);
    }
  });
}

test("replaces a fixture symlink with ordinary file bytes", async ({
  request,
}) => {
  const remote = await createRemote(request, {
    shortcut: { symlink: "target" },
    other: { symlink: "target" },
  });
  const content = bytes("ordinary content");
  await changeRemote(request, remote, { shortcut: content });
  const tree = await request.get(`${fixtureURL}/repos/${remote.id}?tree`);
  expect(await tree.json()).toEqual([
    expect.stringMatching(/^120000 blob [0-9a-f]{40}\tother$/),
    expect.stringMatching(/^100644 blob [0-9a-f]{40}\tshortcut$/),
  ]);
  expect(await remoteBytes(request, remote, "shortcut")).toEqual(content);
});

test("keeps a populated submodule in place across download, reset, index recovery and upload", async ({
  app,
  page,
  request,
}) => {
  const first = "1".repeat(40);
  const second = "2".repeat(40);
  const raw = [0, 255, 128, 9, 12];
  const draftBytes = bytes("# Local draft\r\n");
  const remote = await createRemote(request, {
    "README.md": bytes("# Original"),
    "vendor": { gitlink: first },
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const indexPath = dir + "/.git/index";
  const local = dir + "/vendor/local.bin";
  const draft = dir + "/vendor/Draft.md";
  await localBytes(page, local, raw);
  await localBytes(page, draft, draftBytes);
  // Read the Git v2 index in the browser's filesystem, including the mode
  // and object ID. The target commit is deliberately absent from the parent.
  const checkIndex = async (oid: string) => {
    const entries = await indexEntries(page, indexPath);
    expect(entries.map((entry) => entry.name)).toEqual(["README.md", "vendor"]);
    expect(
      await page.evaluate(
        async (name) =>
          (await (window as unknown as FileHost).pfs.readdir(name)).sort(),
        dir,
      ),
    ).toEqual([".git", "README.md", "vendor"]);
    expect(entries[1]).toEqual({ name: "vendor", mode: "160000", oid });
    expect(await localBytes(page, local)).toEqual(raw);
    expect(await localBytes(page, draft)).toEqual(draftBytes);
  };
  await checkIndex(first);
  await changeRemote(request, remote, {
    "vendor": { gitlink: second },
    "README.md": bytes("# Remote"),
  });
  await download(app, remote);
  await checkIndex(second);
  await app.noteCards.getByText("Draft", { exact: true }).click();
  await page.getByRole("button", { name: "Note menu" }).click();
  await page
    .getByRole("button", { name: "Restore (git checkout)", exact: true })
    .click();
  const notice = page
    .getByRole("alert")
    .filter({ hasText: "This note has no committed version yet." });
  await expect(notice).toBeVisible({ timeout: 20000 });
  await notice.getByRole("button", { name: "Close" }).click();
  await checkIndex(second);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Hard reset", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Confirm reset", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await checkIndex(second);
  await page.evaluate(async (name) => {
    const fs = (window as unknown as FileHost).pfs;
    await fs.unlink(name);
    await fs.storeTree(name);
  }, indexPath);
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  await checkIndex(second);
  const edit = bytes("# Ordinary edit");
  await localBytes(page, dir + "/README.md", edit);
  await upload(app, remote);
  const url = `${fixtureURL}/repos/${remote.id}`;
  const state = await (await request.get(url)).json();
  expect(state.sha).toBe(
    (await app.storedText(dir + "/.git/refs/heads/master"))?.trim(),
  );
  expect(state.files).toEqual(["README.md", "vendor"]);
  expect(await (await request.get(url + "?tree")).json()).toContain(
    "160000 commit " + second + "\tvendor",
  );
  expect(await remoteBytes(request, remote, "README.md")).toEqual(edit);
  await checkIndex(second);
});
