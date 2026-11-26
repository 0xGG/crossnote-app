import { createHash } from "node:crypto";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  download,
  expectReadOnlyNoteOpen,
  fixtureURL,
  indexEntries,
  type FileHost,
  localBytes,
  remoteBytes,
} from "./git";

test("keeps a checked-out relative symlink clean across notebook resets", async ({
  app,
  page,
  request,
}) => {
  test.slow();
  const name = "Shortcut.md";
  const remote = await createRemote(request, {
    "README.md": bytes("# Linked note\n"),
    "Other.md": bytes("# Linked note\n"),
    [name]: { symlink: "README.md" },
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const link = await page.evaluateHandle(
    (file) => {
      const { pfs } = window as unknown as FileHost & {
        pfs: {
          fs: {
            promises: {
              symlink(target: string, file: string): Promise<void>;
              readlink(file: string): Promise<string>;
            };
          };
        };
      };
      const fs = pfs.fs.promises;
      const unlink = pfs.unlink.bind(pfs);
      const symlink = fs.symlink.bind(fs);
      const writes: string[] = [];
      pfs.unlink = (path) => {
        if (path === file) writes.push("unlink");
        return unlink(path);
      };
      fs.symlink = (target, path) => {
        if (path === file) writes.push("symlink");
        return symlink(target, path);
      };
      return {
        writes,
        target: () => fs.readlink(file),
        change: async () => {
          await unlink(file);
          await symlink("Other.md", file);
          await pfs.storeTree(file);
        },
      };
    },
    dir + "/" + name,
  );
  const dialog = page.getByRole("dialog");
  const preview = async () => {
    await app
      .notebook(remote.id)
      .getByRole("treeitem", { name: /Settings/ })
      .click();
    await dialog
      .getByRole("button", { name: "Hard reset", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toBeVisible();
    return dialog.getByRole("listitem");
  };
  const confirm = async () => {
    await dialog.getByRole("button", { name: "Confirm reset" }).click();
    await expect(dialog).toBeHidden();
  };
  expect(await link.evaluate((state) => state.target())).toBe("./README.md");
  await expect.soft(await preview()).toHaveCount(0);
  await confirm();
  expect.soft(await link.evaluate((state) => state.writes)).toEqual([]);
  await link.evaluate((state) => state.change());
  await expect(await preview()).toHaveText([name]);
  await confirm();
  expect(await link.evaluate((state) => state.target())).toBe("./README.md");
  const card = app.noteCards.filter({ hasText: name });
  await expect
    .soft(card)
    .toContainText(name + " - unmodified", { ignoreCase: true });
  await expect(await preview()).toHaveCount(0);
  await confirm();
  expect(await link.evaluate((state) => state.writes)).toEqual([
    "unlink",
    "symlink",
  ]);
  const updated = bytes("# Updated linked note\n");
  await changeRemote(request, remote, { "README.md": updated });
  await download(app, remote);
  expect(await link.evaluate((state) => state.target())).toBe("./README.md");
  expect(await localBytes(page, dir + "/" + name)).toEqual(updated);
  await link.evaluate((state) => state.change());
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);
  await expect(card).toContainText(name + " - *modified", { ignoreCase: true });
});

test("requires a new reset preview for new files inside a blocking directory", async ({
  app,
  page,
  request,
}) => {
  const original = "# Committed note\n";
  const remote = await createRemote(request, { "README.md": bytes(original) });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const root = dir + "/README.md";
  const index = dir + "/.git/index";
  const before = await localBytes(page, index);
  await page.evaluate(
    (file) => (window as unknown as FileHost).pfs.unlink(file),
    root,
  );
  const draft = "README.md/private/draft.md";
  const late = "README.md/late.bin";
  await localBytes(page, dir + "/" + draft, bytes("local draft"));
  await localBytes(page, dir + "/sibling.bin", [9, 8]);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  const dialog = page.getByRole("dialog");
  const preview = dialog.getByRole("status");
  const reset = dialog.getByRole("button", { name: "Hard reset", exact: true });
  const confirm = dialog.getByRole("button", { name: "Confirm reset" });
  await reset.click();
  await expect(preview).toContainText("README.md");
  await expect.soft(preview).toContainText(draft);
  await localBytes(page, dir + "/" + late, [0, 255]);
  await confirm.click();
  await expect(dialog).toBeVisible();
  await expect(reset).toBeVisible();
  expect(await localBytes(page, dir + "/" + draft)).toEqual(
    bytes("local draft"),
  );
  expect(await localBytes(page, dir + "/" + late)).toEqual([0, 255]);
  expect(await localBytes(page, index)).toEqual(before);
  await reset.click();
  await expect(preview).toContainText(draft);
  await expect(preview).toContainText(late);
  await expect(preview).not.toContainText("sibling.bin");
  await confirm.click();
  await expect(dialog).toBeHidden();
  expect(await localBytes(page, root)).toEqual(bytes(original));
  expect(await localBytes(page, dir + "/sibling.bin")).toEqual([9, 8]);
});

test("keeps local drafts when a directory blocks a single-note checkout", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "README.md": bytes("# Committed\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await app.noteCards.getByText("README", { exact: true }).click();
  const root = dir + "/README.md";
  const index = dir + "/.git/index";
  const before = await localBytes(page, index);
  await page.evaluate(
    (file) => (window as unknown as FileHost).pfs.unlink(file),
    root,
  );
  await localBytes(page, root + "/draft.md", bytes("local draft"));
  await page.getByRole("button", { name: "Note menu" }).click();
  await page
    .getByRole("button", { name: "Restore (git checkout)", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Please resolve conflicts first" }),
  ).toBeVisible({ timeout: 10000 });
  expect(await localBytes(page, root + "/draft.md")).toEqual(
    bytes("local draft"),
  );
  expect(await localBytes(page, index)).toEqual(before);
});

test("restores a note from HEAD and retries a refused notebook reset", async ({
  app,
  page,
  request,
}) => {
  test.slow();
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

  await expectReadOnlyNoteOpen(page, async () => {
    await app.noteCards.getByText("README", { exact: true }).click();
    await expect(app.noteTitle).toHaveValue("README");
  });
  expect(await app.storedText(notePath)).toBe(original);
  expect(await localBytes(page, indexPath)).toEqual(originalIndex);

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
    .filter({ hasText: "Note restored to its committed version" });
  await expect(checkout).toBeVisible();
  expect(await app.storedText(notePath)).toBe(original);
  expect(await containsStaged()).toBe(false);
  expect(await readHead()).toBe(originalHead);
  await expect.poll(() => app.editorText(app.visibleEditor)).toBe(original);
  await checkout.getByRole("button", { name: "Close" }).click();

  await page.evaluate(async (filename) => {
    const host = window as unknown as FileHost & {
      resetWriteAttempts: string[];
      allowResetWrite(): void;
      releaseReset?(): void;
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
    // Refuse the actual content write, after confirmation and preflight.
    const backend = host.pfs.fs.promises._backend;
    const write = backend.writeFile.bind(backend);
    host.resetWriteAttempts = [];
    host.allowResetWrite = () => {
      backend.writeFile = async (path, data, options) => {
        if (path === filename) {
          backend.writeFile = write;
          await new Promise<void>((resolve) => {
            host.releaseReset = resolve;
          });
        }
        return write(path, data, options);
      };
    };
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
  await dialog.getByRole("button", { name: "Hard reset", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(originalHead!);
  await expect(dialog.getByRole("status")).toContainText("README.md");
  await dialog.getByRole("button", { name: "Confirm reset" }).click();
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
  await page.evaluate(() =>
    (window as unknown as { allowResetWrite(): void }).allowResetWrite(),
  );
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  await dialog.getByRole("button", { name: "Hard reset", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm reset" }).click();
  await expect
    .poll(() => page.evaluate(() => "releaseReset" in window))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.keyboard.type("Late typing");
  await page.evaluate(() =>
    (window as unknown as { releaseReset(): void }).releaseReset(),
  );
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Notebook restored to the local commit" }),
  ).toBeVisible();
  expect(await app.storedText(notePath)).toBe(original);
  expect(await readHead()).toBe(originalHead);
});

test("resets tracked notes and staged additions to the pending local commit", async ({
  app,
  page,
  request,
}) => {
  test.slow();
  const base = "# Original\n";
  const pending = "# Pending local commit\n";
  const deleted = "# Deleted note\n";
  const remote = await createRemote(request, {
    "README.md": bytes(base),
    "Deleted.md": bytes(deleted),
    ".gitignore": bytes("private.bin\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  const head = async () =>
    (await app.storedText(dir + "/.git/refs/heads/master"))?.trim();
  const baseSha = await head();
  await localBytes(page, dir + "/README.md", bytes(pending));
  await page.route("**/git-receive-pack", (route) => route.abort("failed"), {
    times: 1,
  });
  const messages = await app.recordMessages();
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect
    .poll(messages, { timeout: 20000 })
    .toContain("Failed to upload notebook");
  const pendingSha = await head();
  const committedIndex = await indexEntries(page, dir + "/.git/index");
  expect(pendingSha).toMatch(/^[0-9a-f]{40}$/);
  expect(pendingSha).not.toBe(baseSha);
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes(remote.id);

  const restoreMessages = await app.recordMessages();
  const indexPath = dir + "/.git/index";
  const beforeDraft = await localBytes(page, indexPath);
  const draft = await app.createNote();
  await app.modeButton("Source code").click();
  await app.setEditorText("A staged draft\n", app.visibleEditor);
  const draftPath = dir + "/" + draft + ".md";
  await expect
    .poll(() => app.storedText(draftPath))
    .toContain("A staged draft");
  await page.getByRole("button", { name: "Note menu" }).click();
  await page
    .getByRole("button", { name: "Restore (git checkout)", exact: true })
    .click();
  await expect
    .poll(restoreMessages)
    .toContain("This note has no committed version yet.");
  const savedDraft = (await app.storedText(draftPath))!;
  const draftOid = createHash("sha1")
    .update("blob " + Buffer.byteLength(savedDraft) + "\0" + savedDraft)
    .digest();
  const index = async () =>
    Buffer.from(await localBytes(page, dir + "/.git/index"));
  expect((await index()).includes(draftOid)).toBe(true);
  await app.openNotes(remote.id);
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Source code").click();
  await app.setEditorText("Staged edit\n", app.visibleEditor);
  await expect
    .poll(() => app.storedText(dir + "/README.md"))
    .toContain("Staged edit");
  await localBytes(page, dir + "/README.md", bytes("Unstaged edit\n"));
  await page.getByRole("button", { name: "Note menu" }).click();
  await page
    .getByRole("button", { name: "Restore (git checkout)", exact: true })
    .click();
  await expect.poll(() => app.editorText(app.visibleEditor)).toBe(pending);
  await page
    .getByRole("alert")
    .filter({ hasText: "Note restored to its committed version" })
    .getByRole("button", { name: "Close" })
    .click();
  expect((await index()).includes(draftOid)).toBe(true);
  expect(await app.storedText(draftPath)).toBe(savedDraft);
  await app.setEditorText("Discard this change\n", app.visibleEditor);
  await expect
    .poll(() => app.storedText(dir + "/README.md"))
    .toContain("Discard this change");
  await page.evaluate(async (file) => {
    const fs = (window as unknown as FileHost).pfs;
    await fs.unlink(file);
    await fs.storeTree(file);
  }, dir + "/Deleted.md");
  await localBytes(page, dir + "/untracked.bin", [11, 12]);
  await localBytes(page, dir + "/private.bin", [24, 25]);
  const afterDraft = await localBytes(page, indexPath);
  await localBytes(page, indexPath, beforeDraft);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  await dialog.getByRole("button", { name: "Hard reset", exact: true }).click();
  const preview = dialog.getByRole("status");
  await expect(preview).toContainText("README.md");
  await expect(preview).not.toContainText(draft + ".md");
  await localBytes(page, indexPath, afterDraft);
  await dialog.getByRole("button", { name: "Confirm reset" }).click();
  await expect
    .poll(restoreMessages)
    .toContain(
      "The notebook changed after the preview. Review the reset again.",
    );
  expect(await app.storedText(draftPath)).toBe(savedDraft);
  expect(await localBytes(page, indexPath)).toEqual(afterDraft);
  await dialog.getByRole("button", { name: "Hard reset", exact: true }).click();
  for (const name of [
    pendingSha!,
    "README.md",
    "Deleted.md",
    draft + ".md",
    "staged additions",
  ])
    await expect(preview).toContainText(name);
  await expect(preview).not.toContainText("private.bin");
  await expect(preview).not.toContainText("untracked.bin");
  await dialog.getByRole("button", { name: "Confirm reset" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => app.editorText(app.visibleEditor)).toBe(pending);
  expect(await head()).toBe(pendingSha);
  expect(await app.storedText(dir + "/README.md")).toBe(pending);
  expect(await app.storedText(dir + "/Deleted.md")).toBe(deleted);
  expect(await app.storedText(draftPath)).toBeUndefined();
  expect((await index()).includes(draftOid)).toBe(false);
  expect(await indexEntries(page, dir + "/.git/index")).toEqual(committedIndex);
  expect(await localBytes(page, dir + "/untracked.bin")).toEqual([11, 12]);
  expect(await localBytes(page, dir + "/private.bin")).toEqual([24, 25]);
  await app.openNotes(remote.id);
  await expect(app.noteCards.filter({ hasText: "README.md" })).toContainText(
    "unmodified",
    { ignoreCase: true },
  );
  await expect(app.noteCards.filter({ hasText: "Deleted.md" })).toContainText(
    "unmodified",
    { ignoreCase: true },
  );
  await expect(app.noteCards.getByText(draft, { exact: true })).toHaveCount(0);
  // A later upload also includes ordinary untracked files. Remove this fixture
  // after proving its preservation to verify the original commit itself is sent.
  await page.evaluate(
    (file) => (window as unknown as FileHost).pfs.unlink(file),
    dir + "/untracked.bin",
  );
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Upload/ })
    .click();
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${fixtureURL}/repos/${remote.id}`)).json())
          .sha,
      { timeout: 20000 },
    )
    .toBe(pendingSha);
});

async function restoreFromMenu(
  app: CrossnoteApp,
  id: string,
  restore: "note" | "notebook",
) {
  const page = app.page;
  if (restore === "note") {
    await page.getByRole("button", { name: "Note menu" }).click();
    await page
      .getByRole("button", { name: "Restore (git checkout)", exact: true })
      .click();
    return;
  }
  const dialog = page.getByRole("dialog");
  await app
    .notebook(id)
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  await dialog.getByRole("button", { name: "Hard reset", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm reset" }).click();
  // A persistence failure leaves settings open so the user can retry.
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
}

for (const restore of ["note", "notebook"] as const) {
  test(`refreshes the ${restore} view when persisting a restore fails`, async ({
    app,
    page,
    request,
  }) => {
    const committed = "# Committed note\n";
    const remote = await createRemote(request, {
      "README.md": bytes(committed),
    });
    await app.open();
    const dir = await cloneRemote(app, remote);
    const file = dir + "/README.md";
    const index = dir + "/.git/index";
    const committedIndex = await indexEntries(page, index);
    await app.noteCards.getByText("README", { exact: true }).click();
    await app.modeButton("Source code").click();
    await app.setEditorText("# Draft to discard\n", app.visibleEditor);
    await expect.poll(() => app.storedText(file)).toContain("Draft to discard");
    await expect
      .poll(() => indexEntries(page, index))
      .not.toEqual(committedIndex);

    await page.evaluate(
      ({ dir, file, committed }) => {
        const fs = (window as unknown as FileHost).pfs;
        const store = fs.storeTree;
        fs.storeTree = async (path) => {
          if (
            path === dir &&
            new TextDecoder().decode(await fs.readFile(file)) === committed
          ) {
            fs.storeTree = store;
            throw new Error("Could not persist the restored notebook");
          }
          await store(path);
        };
      },
      { dir, file, committed },
    );
    await restoreFromMenu(app, remote.id, restore);
    const failed = page.getByRole("alert").filter({
      hasText:
        "Working files were restored, but the notebook could not be saved.",
    });
    await expect(failed).toBeVisible();
    await failed.getByRole("button", { name: "Details" }).click();
    await expect(failed.locator("pre")).toContainText(
      "Could not persist the restored notebook",
    );
    expect(await app.storedText(file)).toBe(committed);
    expect(await indexEntries(page, index)).toEqual(committedIndex);
    await expect.poll(() => app.editorText(app.visibleEditor)).toBe(committed);
    await app.openNotes(remote.id);
    await expect(app.noteCards.filter({ hasText: "README.md" })).toContainText(
      "unmodified",
      { ignoreCase: true },
    );
  });
}

test("keeps the upload result when the next local edit cannot be saved", async ({
  app,
  page,
  request,
}) => {
  const original = "# Starting point\n\nShared text\n\nOriginal ending\n";
  const remote = await createRemote(request, {
    "README.md": bytes(original),
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
  const before = original.replace("Starting point", "A saved edit to upload");
  await app.setEditorText(before, app.visibleEditor);
  await expect.poll(() => app.storedText(file)).toContain(before);
  const ending = "Ending downloaded from the remote";
  const sent = (await app.storedText(file))!.replace("Original ending", ending);
  await changeRemote(request, remote, {
    "README.md": bytes(original.replace("Original ending", ending)),
    "Incoming.md": bytes(
      "---\nfavorited: true\n---\n# Downloaded before upload\n",
    ),
  });
  const favorite = app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Incoming/ });
  await expect(favorite).toBeHidden();

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
    await page.evaluate(
      ({ file, dir }) => {
        const fs = (window as unknown as FileHost).pfs;
        const { readFile, readdir } = fs;
        // Stop the save before reconciliation. The refresh can read normally.
        fs.readFile = async (...args) => {
          if (args[0] === file)
            throw new Error("Fixture could not read the note for saving");
          return readFile(...args);
        };
        fs.readdir = (path) => {
          if (path === dir) {
            fs.readFile = readFile;
            fs.readdir = readdir;
          }
          return readdir(path);
        };
      },
      { file, dir },
    );
    const after = before.replace(
      "A saved edit to upload",
      "A newer edit to keep in the editor",
    );
    await app.setEditorText(after, app.visibleEditor);
    expect(await app.editorText(app.visibleEditor)).toBe(after);
    release();
    await expect(
      page.getByTestId("notification-summary").filter({
        hasText:
          "Downloaded remote changes. Notebook uploaded. Could not finish updating the local notebook.",
      }),
    ).toBeVisible({ timeout: 10000 });
    await expect(favorite).toBeVisible();
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
