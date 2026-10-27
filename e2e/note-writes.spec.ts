import { expect, test } from "./fixtures";

// Creating, deleting or pinning a note writes to the browser's storage too;
// when that is refused, as by a full disk, the app has to say so.

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openNotes();
});

test("says when a note cannot be created", async ({ app, page }) => {
  await app.refuseWrites();
  await app.notesPanel.getByRole("button", { name: "New note" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Failed to create the note",
  );
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
