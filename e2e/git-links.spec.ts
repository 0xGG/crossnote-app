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

test("keeps a populated submodule in place across download, reset and upload", async ({
  app,
  page,
  request,
}) => {
  const first = "1".repeat(40);
  const second = "2".repeat(40);
  const raw = [0, 255, 128, 9, 12];
  const remote = await createRemote(request, {
    "README.md": bytes("# Original"),
    "vendor": { gitlink: first },
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const indexPath = dir + "/.git/index";
  const local = dir + "/vendor/local.bin";
  await localBytes(page, local, raw);
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
  };
  await checkIndex(first);
  await changeRemote(request, remote, {
    "vendor": { gitlink: second },
    "README.md": bytes("# Remote"),
  });
  await download(app, remote);
  await checkIndex(second);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Hard reset", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Hard reset 2", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Hard reset 1", exact: true })
    .click();
  await expect(dialog).toBeHidden();
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
