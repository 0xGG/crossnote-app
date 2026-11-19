import type { Emitter, EventType } from "../src/lib/event";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";

interface FixtureWindow {
  globalEmitter: Emitter;
  pfs: {
    readFile(path: string, options?: object): Promise<Uint8Array>;
    writeFile(path: string, bytes: Uint8Array): Promise<void>;
    storeTree(path: string): Promise<void>;
  };
  restoreDestination(text?: string): Promise<void>;
  noteWrites: string[];
}

async function openSource(
  app: CrossnoteApp,
  failure: "unreadable" | "missing",
) {
  const { page } = app;
  await app.open();
  await app.openNotes();
  const dir = await app.notebookFolder();
  const original = await app.storedText(`${dir}/README.md`);
  const destination = `${dir}/Recovered.md`;
  await page.evaluate(
    async ({ dir, destination, failure }) => {
      const host = window as unknown as FixtureWindow;
      const fs = host.pfs;
      const source = `${dir}/README.md`;
      const bytes = await fs.readFile(source);
      const write = fs.writeFile.bind(fs);
      const read = fs.readFile.bind(fs);
      if (failure === "unreadable") await write(destination, bytes);
      fs.readFile = async (path, options) => {
        if (path === destination)
          throw new Error("Destination read unavailable");
        return read(path, options);
      };
      host.restoreDestination = async (text) => {
        if (text !== undefined || failure === "missing") {
          await write(
            destination,
            text === undefined ? bytes : new TextEncoder().encode(text),
          );
          await fs.storeTree(destination);
        }
        fs.readFile = read;
      };
      host.noteWrites = [];
      fs.writeFile = async (path, bytes) => {
        if (path === source || path === destination) host.noteWrites.push(path);
        return write(path, bytes);
      };
    },
    { dir, destination, failure },
  );

  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  return { dir, original, destination };
}

async function moveInNotebook(app: CrossnoteApp, dir: string) {
  await app.page.evaluate((notebookPath) => {
    const { globalEmitter } = window as unknown as FixtureWindow;
    globalEmitter.emit("ChangedNoteFilePath" as EventType, {
      notebookPath,
      oldNoteFilePath: "README.md",
      newNoteFilePath: "Recovered.md",
    });
    globalEmitter.emit("PerformedGitOperation" as EventType, {
      notebookPath,
    });
  }, dir);
}

async function moveAndRetry(
  app: CrossnoteApp,
  dir: string,
  text: string,
  restored?: string,
) {
  const { page } = app;
  const editor = await app.visibleEditor.elementHandle();
  const menu = page
    .getByRole("group", { name: "actions", exact: true })
    .getByRole("button", { name: "Note menu", exact: true });
  await menu.click();
  await page.getByRole("button", { name: "Change file path" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await moveInNotebook(app, dir);

  const retry = page.getByRole("button", { name: "Retry" });
  await expect(menu).toBeDisabled();
  await expect(retry).toBeVisible();
  await expect(app.noteTitle).toBeDisabled();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await app.editorText()).toBe(text);
  expect(
    await app.editor.evaluate((node, original) => node === original, editor),
  ).toBe(true);
  await page.evaluate(
    (text) => (window as unknown as FixtureWindow).restoreDestination(text),
    restored,
  );
  await retry.click();
  await expect(app.noteTitle).toHaveValue("Recovered");
  await expect(app.noteTitle).toBeEnabled();
  await expect(menu).toBeEnabled();
  expect(
    await app.editor.evaluate((node, original) => node === original, editor),
  ).toBe(true);
}

test("retains an unsaved draft when a moved note is temporarily unreadable", async ({
  app,
  page,
}) => {
  const { dir, original, destination } = await openSource(app, "unreadable");
  const draft = `${await app.editorText()}\nUnsaved addition`;
  await app.refuseWrites();
  await app.setEditorText(draft);
  await expect(page.getByRole("alert")).toContainText(
    "Failed to save the note",
  );
  await moveAndRetry(app, dir, draft);
  expect(await app.editorText()).toBe(draft);
  await app.refuseWrites(false);
  await app.visibleEditor.click();
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => app.storedText(destination))
    .toContain("Unsaved addition");
  expect(await app.storedText(`${dir}/README.md`)).toBe(original);
});

test("retries a missing moved note without writing either path", async ({
  app,
  page,
}) => {
  const { dir, original, destination } = await openSource(app, "missing");
  const changed = "Recovered first line\r\nChanged while unavailable\r\n";
  await moveAndRetry(app, dir, await app.editorText(), changed);
  expect(await app.editorText()).toBe(changed);
  expect(await app.storedText(destination)).toBe(changed);
  expect(
    await page.evaluate(() => (window as unknown as FixtureWindow).noteWrites),
  ).toEqual([]);
  expect(await app.storedText(`${dir}/README.md`)).toBe(original);
});

test("continues editing a moved note after switching back to its tab", async ({
  app,
  page,
}) => {
  const { dir, destination, original } = await openSource(app, "unreadable");
  const editor = await app.visibleEditor.elementHandle();
  const text = await app.editorText();
  await app.openSettings();
  await expect(app.editor).toHaveCSS("display", "none");
  await moveInNotebook(app, dir);
  await app.selectTab("README");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(app.editor).toBeVisible();
  await app.visibleEditor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" continued");
  expect(await app.editorText()).toBe(text + " continued");
  await page.evaluate(() =>
    (window as unknown as FixtureWindow).restoreDestination(),
  );
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(app.noteTitle).toHaveValue("Recovered");
  expect(
    await app.editor.evaluate((node, original) => node === original, editor),
  ).toBe(true);
  await app.visibleEditor.click();
  await page.keyboard.press("Control+s");
  await expect.poll(() => app.storedText(destination)).toContain(" continued");
  expect(await app.storedText(`${dir}/README.md`)).toBe(original);
});
