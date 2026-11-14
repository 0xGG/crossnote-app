import type { Page } from "@playwright/test";
import type { CrossnoteApp, EditorHost } from "./crossnote";
import { expect, test } from "./fixtures";

type RenameWindow = Window & {
  pfs: { storeTree(dir: string): Promise<void> };
  renameHeld: boolean;
  releaseRename(error?: string): void;
};

async function renameWhileTyping(app: CrossnoteApp, page: Page) {
  await app.open();
  await app.openNotes();
  const title = await app.createNote();
  const folder = await app.notebookFolder();
  await app.typeInEditor("Before");
  await expect
    .poll(() => app.storedText(`${folder}/${title}.md`))
    .toContain("Before");
  // The content write can finish before its tree update. Wait for the saver
  // to settle so the gate below holds the rename, not this preceding save.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const leaving = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(leaving);
        return leaving.defaultPrevented;
      }),
    )
    .toBe(false);
  // Hold a real rename after the file has moved and its old cache is gone.
  await page.evaluate(() => {
    const win = window as unknown as RenameWindow;
    const storeTree = win.pfs.storeTree;
    let release: () => void;
    let fail: (error: Error) => void;
    const gate = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    win.renameHeld = false;
    win.releaseRename = (error) => {
      if (error) fail(new Error(error));
      else release();
    };
    win.pfs.storeTree = async (dir) => {
      win.pfs.storeTree = storeTree;
      win.renameHeld = true;
      await gate;
      await storeTree(dir);
    };
  });
  await app.noteTitle.fill("After");
  await app.noteTitle.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as RenameWindow).renameHeld),
    )
    .toBe(true);
  const close = await app
    .tab(title)
    .locator(".flexlayout__tab_button_trailing")
    .elementHandle();
  await app.editor.evaluate((element, close) => {
    (element as EditorHost).editorHandle.insert(" during rename");
    (close as HTMLElement).click();
  }, close);
  return { title, folder };
}

test("closing during rename saves the latest text at the new path before releasing the last tab", async ({
  app,
  page,
}) => {
  const { title, folder } = await renameWhileTyping(app, page);
  await page.evaluate(() =>
    (window as unknown as RenameWindow).releaseRename(),
  );
  await expect(app.tab(title)).toBeHidden();
  await expect(app.tab("After")).toBeHidden();
  await expect
    .poll(() => app.storedText(`${folder}/After.md`))
    .toContain("Before during rename");
  expect(await app.storedText(`${folder}/${title}.md`)).toBeUndefined();
  await app.openNotes();
  await app.noteCards.getByText("After", { exact: true }).click();
  await expect.poll(() => app.editorText()).toBe("Before during rename");
});

test("a rename failure after moving keeps the last tab and text through repeated close attempts", async ({
  app,
  page,
}) => {
  const { title, folder } = await renameWhileTyping(app, page);
  await page.evaluate(() =>
    (window as unknown as RenameWindow).releaseRename("tree write refused"),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Close this note without saving?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(app.tab(title)).toBeVisible();
  expect(await app.editorText()).toBe("Before during rename");
  await app.tab(title).locator(".flexlayout__tab_button_trailing").click();
  await expect(dialog).toContainText("Close this note without saving?");
  await dialog.getByRole("button", { name: "Close anyway" }).click();
  await expect(app.tab(title)).toBeHidden();
  expect(await app.storedText(`${folder}/${title}.md`)).toBeUndefined();
  expect(await app.storedText(`${folder}/After.md`)).not.toContain(
    "during rename",
  );
});
