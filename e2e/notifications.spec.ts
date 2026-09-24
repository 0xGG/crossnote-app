import { expect, test } from "./fixtures";

// The one outcome a user can provoke without a git remote: renaming a note
// onto a file that already exists fails, and the failure is reported through
// the same channel as every other outcome in the app.
test("reports a failed rename in a message the user can close", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const ownTitle = await app.noteTitle.inputValue();

  // The Drafts notebook a fresh origin gets is seeded with README.md, so this
  // name is already taken.
  await app.noteTitle.fill("README");
  await app.noteTitle.press("Enter");

  const message = page.getByRole("alert");
  await expect(message).toHaveText("Failed to change file path");
  // The rename did not go through, so the title box falls back to the file.
  // Waiting for that before closing matters: closing moves focus out of the
  // title box, and a blur that still saw "README" would try the rename again.
  await expect(app.noteTitle).toHaveValue(ownTitle);

  await message.getByRole("button", { name: "Close" }).click();
  await expect(message).toBeHidden();
});
