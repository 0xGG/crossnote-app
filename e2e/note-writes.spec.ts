import { expect, test } from "./fixtures";

// Creating, deleting or pinning a note writes to the browser's storage too;
// when that is refused, as by a full disk, the app has to say so.

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openNotes();
});

test("says when a note cannot be created, and leaves no trace of it", async ({
  app,
  page,
}) => {
  await app.refuseWrites();
  await app.notesPanel.getByRole("button", { name: "New note" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Failed to create the note",
  );

  // Once the storage takes writes, a new note writes the directory tree,
  // which must not hold the note that was refused.
  await app.refuseWrites(false);
  await app.notesPanel.getByRole("button", { name: "New note" }).click();
  await expect(app.noteTitle).not.toHaveValue("");
  const file = `${await app.notebookFolder()}/${await app.noteTitle.inputValue()}.md`;
  await app.typeInEditor("Created");
  await expect.poll(() => app.storedText(file)).toContain("Created");
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await expect(app.noteCards).toHaveCount(2);
  await expect(app.noteCards.filter({ hasText: "README" })).toHaveCount(1);
  await expect(app.noteCards.filter({ hasText: "Created" })).toHaveCount(1);
});

test("keeps the dialog open when a note cannot be deleted", async ({
  app,
  page,
}) => {
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await app.refuseWrites();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Failed to delete the note",
  );
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete" })).toBeEnabled();

  // Tried again, it fails again rather than take the note for gone.
  const message = page.getByRole("alert");
  await message.getByRole("button", { name: "Close" }).click();
  await expect(message).toHaveCount(0);
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(message).toContainText("Failed to delete the note");
  await expect(dialog).toBeVisible();

  // Once the storage takes writes, it goes, for good.
  await app.refuseWrites(false);
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await expect(app.noteCards).toHaveCount(1);
  await expect(app.noteCards.filter({ hasText: "README" })).toHaveCount(1);
});

test("says when a note's settings cannot be saved", async ({ app, page }) => {
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  await app.refuseWrites();
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Pin the note" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Failed to save the note's settings",
  );
});

test("leaves an alias out when it cannot be saved", async ({ app, page }) => {
  const aliasPopover = page
    .getByRole("presentation")
    .filter({ has: page.getByPlaceholder("Add an alias") });
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Edit note alias" }).click();
  await app.refuseWrites();
  await aliasPopover.getByPlaceholder("Add an alias").fill("Kept out");
  await aliasPopover.getByPlaceholder("Add an alias").press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "Failed to save the note's settings",
  );
  await expect(aliasPopover.getByText("Kept out", { exact: true })).toHaveCount(
    0,
  );
});

test("keeps an alias in when taking it out cannot be saved", async ({
  app,
  page,
}) => {
  const aliasPopover = page
    .getByRole("presentation")
    .filter({ has: page.getByPlaceholder("Add an alias") });
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Edit note alias" }).click();
  await aliasPopover.getByPlaceholder("Add an alias").fill("Kept in");
  await aliasPopover.getByPlaceholder("Add an alias").press("Enter");
  // The list shows an alias once it is saved.
  const alias = aliasPopover.getByText("Kept in", { exact: true });
  await expect(alias).toBeVisible();
  await app.refuseWrites();
  await aliasPopover.getByRole("button", { name: "Delete" }).click();
  // The list takes the deletion's answer right after the message goes up,
  // before the check after it reaches the page.
  await expect(page.getByRole("alert")).toContainText(
    "Failed to save the note's settings",
  );
  await expect(alias).toBeVisible();
});
