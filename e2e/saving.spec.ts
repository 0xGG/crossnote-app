import { expect, test } from "./fixtures";

// Writes the browser's storage refuses, as a full disk does, have to show,
// and leave what was typed where it is.

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
  await expect(app.editor).toContainText("First second third");

  await app.refuseWrites(false);
  await page.keyboard.type(" fourth");
  await expect
    .poll(() => app.storedText(file))
    .toContain("First second third fourth");
  expect(await messages()).toEqual([
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

  let asked = false;
  page.on("dialog", (dialog) => {
    asked = true;
    void dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(asked).toBe(false);
});
