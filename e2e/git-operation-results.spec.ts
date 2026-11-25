import { createHash } from "node:crypto";
import { expect, test } from "./fixtures";
import {
  bytes,
  cloneRemote,
  createRemote,
  type FileHost,
  localBytes,
  remoteBytes,
} from "./git";

test("reports the checkout command and a refused reset at their real entry points", async ({
  app,
  page,
  request,
}) => {
  const original = "# Baseline note\n";
  const remote = await createRemote(request, { "README.md": bytes(original) });
  await app.open();
  const dir = await cloneRemote(app, remote);
  // Start with an already registered notebook and no writes from this clone
  // scheduled in the page being checked.
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  const notePath = dir + "/README.md";
  const indexPath = dir + "/.git/index";
  const refPath = dir + "/.git/refs/heads/master";
  const readHead = async () => (await app.storedText(refPath))?.trim();
  const originalHead = await readHead();
  expect(originalHead).toMatch(/^[a-f0-9]{40}$/);
  const originalIndex = await localBytes(page, indexPath);

  await app.refuseWrites();
  await app.noteCards.getByText("README", { exact: true }).click();
  await expect(app.noteTitle).toHaveValue("README");
  expect(await app.refusedWrites()).toEqual([]);
  expect(await app.storedText(notePath)).toBe(original);
  expect(await localBytes(page, indexPath)).toEqual(originalIndex);
  await app.refuseWrites(false);

  await app.modeButton("Source code").click();
  const staged = "# Staged note\n\nKeeps its staged content\n";
  await app.setEditorText(staged, app.visibleEditor);
  await expect.poll(() => app.storedText(notePath)).toContain(staged);
  const saved = (await app.storedText(notePath))!;
  const stagedObject = createHash("sha1")
    .update("blob " + Buffer.byteLength(saved) + "\0")
    .update(saved)
    .digest();
  const containsStaged = async () =>
    Buffer.from(await localBytes(page, indexPath)).includes(stagedObject);
  await expect.poll(containsStaged).toBe(true);
  const unstaged = "# Unstaged changes\n";
  await localBytes(page, notePath, bytes(unstaged));
  expect(await app.storedText(notePath)).toBe(unstaged);
  expect(await containsStaged()).toBe(true);

  await page.getByRole("button", { name: "Note menu" }).click();
  await page
    .getByRole("button", { name: "Restore (git checkout)", exact: true })
    .click();
  const checkout = page
    .getByRole("alert")
    .filter({ hasText: "Checkout command completed" });
  await expect(checkout).toBeVisible();
  expect(await app.storedText(notePath)).toBe(saved);
  expect(await containsStaged()).toBe(true);
  expect(await readHead()).toBe(originalHead);
  await checkout.getByRole("button", { name: "Close" }).click();

  await page.evaluate(async (filename) => {
    const host = window as unknown as FileHost & {
      resetWriteAttempts: string[];
      pfs: {
        fs: {
          promises: {
            _backend: {
              writeFile(
                path: string,
                data: Uint8Array,
                options: unknown,
              ): Promise<void>;
            };
          };
        };
      };
    };
    await host.pfs.unlink(filename);
    await host.pfs.storeTree(filename);
    // Git's cached filesystem adapter still invokes the underlying backend.
    // Refuse the missing note's write so the reset reaches Git checkout first.
    const backend = host.pfs.fs.promises._backend;
    const write = backend.writeFile.bind(backend);
    host.resetWriteAttempts = [];
    backend.writeFile = async (path, data, options) => {
      if (path === filename) {
        host.resetWriteAttempts.push(path);
        throw new Error(
          "Fixture note write refused https://fixture-user:fixture-secret@example.test/repo.git?token=error-query",
        );
      }
      return write(path, data, options);
    };
  }, notePath);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  const dialog = page.getByRole("dialog");
  for (const name of ["Hard reset", "Hard reset 2", "Hard reset 1"]) {
    await dialog.getByRole("button", { name, exact: true }).click();
  }
  const failed = page
    .getByRole("alert")
    .filter({ hasText: "Notebook reset failed" });
  await expect(failed).toBeVisible();
  expect(
    await page.evaluate(() => [
      ...new Set(
        (window as unknown as { resetWriteAttempts: string[] })
          .resetWriteAttempts,
      ),
    ]),
  ).toEqual([notePath]);
  expect(await readHead()).toBe(originalHead);
  expect(await app.storedText(notePath)).toBeUndefined();

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const detailsButton = dialog.getByRole("button", {
    name: "Details",
    exact: true,
  });
  await detailsButton.focus();
  await expect(detailsButton).toBeFocused();
  await page.keyboard.press("Enter");
  const details = failed.locator("pre");
  await expect(details).toContainText("MultipleGitError");
  await expect(details).toContainText(
    "Fixture note write refused https://example.test/repo.git",
  );
  await expect(details).not.toContainText(
    /fixture-user|fixture-secret|error-query/,
  );
  const copy = dialog.getByRole("button", { name: "Copy details" });
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(failed.getByRole("status")).toHaveText("Details copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // The system clipboard may use Windows line endings for plain text.
  expect(copied.replace(/\r\n/g, "\n")).toBe(await details.textContent());
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  const close = failed.getByRole("button", { name: "Close", exact: true });
  await close.focus();
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(failed).toBeHidden();
});

test("keeps the upload result when the next local edit cannot be saved", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "README.md": bytes("# Starting point\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const file = dir + "/README.md";
  await page
    .getByRole("alert")
    .filter({ hasText: "Notebook cloned" })
    .getByRole("button", { name: "Close" })
    .click();
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Source code").click();
  const before = "# A saved edit to upload\n";
  await app.setEditorText(before, app.visibleEditor);
  await expect.poll(() => app.storedText(file)).toContain(before);
  const sent = (await app.storedText(file))!;

  let release!: () => void;
  let accepted!: () => void;
  const holdReply = new Promise<void>((resolve) => {
    release = resolve;
  });
  const serverResponded = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  await page.route(
    "**/git-receive-pack",
    async (route) => {
      const response = await route.fetch();
      accepted();
      await holdReply;
      await route.fulfill({ response });
    },
    { times: 1 },
  );

  try {
    await app
      .notebook(remote.id)
      .getByRole("treeitem", { name: /Upload/ })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    await serverResponded;
    expect(await remoteBytes(request, remote, "README.md")).toEqual(
      bytes(sent),
    );

    // The request has reached the server, but the application is still waiting.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.evaluate((path) => {
      const fs = (window as unknown as FileHost).pfs;
      const write = fs.writeFile.bind(fs);
      fs.writeFile = async (file, data) => {
        if (file === path)
          throw new Error("Fixture rejected the next local save");
        return write(file, data);
      };
    }, file);
    const after = "# A newer edit to keep in the editor\n";
    await app.setEditorText(after, app.visibleEditor);
    expect(await app.editorText(app.visibleEditor)).toBe(after);
    release();
    await expect(
      page.getByTestId("notification-summary").filter({
        hasText:
          "Notebook uploaded. Could not finish updating the local notebook.",
      }),
    ).toBeVisible({ timeout: 10000 });
    expect(await app.editorText(app.visibleEditor)).toBe(after);
    expect(await app.storedText(file)).toBe(sent);
    expect(await remoteBytes(request, remote, "README.md")).toEqual(
      bytes(sent),
    );
  } finally {
    release();
    await page.unroute("**/git-receive-pack");
  }
});
