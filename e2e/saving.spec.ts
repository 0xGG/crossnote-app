import { type Page } from "@playwright/test";
import type { EditorHost } from "./crossnote";
import { expect, test } from "./fixtures";

// Writes the browser's storage refuses, as a full disk does, have to show,
// and leave what was typed where it is.

// Whether leaving the page now would be asked about: the app asks while a
// save has failed and none has gone through since, which it settles only
// once the whole save is done, after the note's text is stored.
function asksBeforeLeaving(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    return leaving.defaultPrevented;
  });
}

test("says when a note cannot be saved, keeps what was typed and saves it once it can", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const file = `${await app.notebookFolder()}/${await app.noteTitle.inputValue()}.md`;
  await app.typeInEditor("First");
  await expect.poll(() => app.storedText(file)).toContain("First");

  const messages = await app.recordMessages();
  await app.refuseWrites();
  await page.keyboard.type(" second");
  const message = page.getByRole("alert");
  await expect(message).toContainText("Failed to save the note");
  // Closed, so that another message would show at once rather than wait in
  // line behind it.
  await message.getByRole("button", { name: "Close" }).click();
  await expect(message).toHaveCount(0);
  // Typing on fails again, without saying so again: the save it sets off
  // writes the note's content, and that is refused once more.
  const refused = (await app.refusedWrites()).length;
  await app.editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" third");
  await expect
    .poll(async () => (await app.refusedWrites()).slice(refused))
    .toContain("file");
  expect(await app.editorText()).toBe("First second third");

  await app.refuseWrites(false);
  await page.keyboard.type(" fourth");
  await expect
    .poll(() => app.storedText(file))
    .toContain("First second third fourth");
  await expect.poll(() => asksBeforeLeaving(page)).toBe(false);
  expect(await messages()).toEqual([
    expect.stringContaining("Failed to save the note"),
  ]);

  // Once a save has gone through, the next one to fail is said again.
  await app.refuseWrites();
  await page.keyboard.type(" fifth");
  await expect
    .poll(messages)
    .toEqual([
      expect.stringContaining("Failed to save the note"),
      expect.stringContaining("Failed to save the note"),
    ]);
});

test("asks before the page is left with a note it could not save", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor("First");
  await app.refuseWrites();
  await page.keyboard.type(" second");
  await expect(page.getByRole("alert")).toContainText(
    "Failed to save the note",
  );

  const asked = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
});

test("leaves the page without asking once the note is saved", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const file = `${await app.notebookFolder()}/${await app.noteTitle.inputValue()}.md`;
  await app.typeInEditor("First");
  await app.refuseWrites();
  await page.keyboard.type(" second");
  await expect(page.getByRole("alert")).toContainText(
    "Failed to save the note",
  );
  await app.refuseWrites(false);
  await page.keyboard.type(" third");
  await expect.poll(() => app.storedText(file)).toContain("First second third");
  await expect.poll(() => asksBeforeLeaving(page)).toBe(false);

  let asked = false;
  page.on("dialog", (dialog) => {
    asked = true;
    void dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(asked).toBe(false);
});

test("asks before the page is left while what was just typed is still to be saved", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // Nothing waits to be written before the typing.
  await expect.poll(() => asksBeforeLeaving(page)).toBe(false);
  // Typed and asked in the same task: the save is still a moment away.
  const asked = await app.editor.evaluate((element) => {
    (element as EditorHost).editorHandle.insert("Just typed");
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    return leaving.defaultPrevented;
  });
  expect(asked).toBe(true);
  await expect.poll(() => asksBeforeLeaving(page)).toBe(false);
});

test("asks before a note it could not save is closed, and keeps it open unless told otherwise", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const title = await app.noteTitle.inputValue();
  const file = `${await app.notebookFolder()}/${title}.md`;
  const tab = app.tab(title);
  await app.typeInEditor("First");
  await expect.poll(() => app.storedText(file)).toContain("First");
  await app.refuseWrites();
  await page.keyboard.type(" second");
  await expect(page.getByRole("alert")).toContainText(
    "Failed to save the note",
  );

  const close = tab.locator(".flexlayout__tab_button_trailing");
  const dialog = page.getByRole("dialog");
  await close.click();
  await expect(dialog).toContainText("Close this note without saving?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(tab).toBeVisible();
  expect(await app.editorText()).toBe("First second");

  // Closing anyway lets go of what was not saved: with the storage taking
  // writes again, nothing writes it as the tab goes.
  await close.click();
  await expect(dialog).toBeVisible();
  await app.refuseWrites(false);
  await dialog.getByRole("button", { name: "Close anyway" }).click();
  await expect(tab).toBeHidden();
  await expect(dialog).toBeHidden();
  // A later note written and stored: anything the closed one wrote as it
  // went would be in by then.
  await app.selectTab("Drafts");
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const later = `${await app.notebookFolder()}/${await app.noteTitle.inputValue()}.md`;
  await app.typeInEditor("Later");
  await expect.poll(() => app.storedText(later)).toContain("Later");
  const stored = await app.storedText(file);
  expect(stored).toContain("First");
  expect(stored).not.toContain("second");
});

test("saves what was just typed into a note as its tab is closed", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const title = await app.noteTitle.inputValue();
  const file = `${await app.notebookFolder()}/${title}.md`;
  const close = await app
    .tab(title)
    .locator(".flexlayout__tab_button_trailing")
    .elementHandle();
  // Typed and closed in the same task: the save is still a moment away.
  await app.editor.evaluate((element, close) => {
    (element as EditorHost).editorHandle.insert("Typed");
    (close as HTMLElement).click();
  }, close);
  await expect(app.tab(title)).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(() => app.storedText(file)).toContain("Typed");
});

test("prints what was typed into the note a moment before", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText("Saved before.\n");
  await page.evaluate(() => {
    window.print = () => {
      const printed = Array.from(document.body.children)
        .filter((element) => element.classList.contains("preview"))
        .pop()!;
      (window as any).printed = printed.textContent;
    };
  });
  await page.getByRole("button", { name: "Note menu" }).click();
  const print = await page
    .getByRole("button", { name: "Print / Export PDF" })
    .elementHandle();
  // Typed and printed in the same task: the save is still a moment away.
  await app.editor.evaluate((element, print) => {
    (element as EditorHost).editorHandle.insert("Typed last. ");
    (print as HTMLElement).click();
  }, print);
  await expect
    .poll(() => page.evaluate(() => (window as any).printed), {
      timeout: 15000,
    })
    .toContain("Typed last.");
});

test("shows the note's git status as it is once what was typed is saved", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  // The first-run README was written without being staged; a save stages
  // what it writes.
  const status = page.locator(".editor-bottom-panel");
  await expect(status).toContainText("README.md - *added");
  // README opens in the preview, its editor out of sight.
  await app.editor.evaluate((element) =>
    (element as EditorHost).editorHandle.insert("Changed. "),
  );
  await expect(status).toContainText("README.md - added");
});
