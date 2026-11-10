import type { Page } from "@playwright/test";
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

// A message stays at the top right, under the note's header rather than
// over the buttons in it, at any width.
for (const { width, height, openSidebar } of [
  { width: 1280, height: 720, openSidebar: async () => {} },
  {
    width: 375,
    height: 700,
    // A narrow screen has the sidebar over the page, opened from a button.
    openSidebar: (page: Page) =>
      page.getByRole("button", { name: "Open menu" }).click(),
  },
]) {
  test(`leaves the note's buttons free while it shows, ${width} wide`, async ({
    app,
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await openSidebar(page);
    const drafts = page.getByRole("treeitem", { name: /Drafts/ });
    await drafts.getByRole("button").first().click();
    await drafts.getByRole("treeitem", { name: /Notes/ }).click();
    await app.createNote();
    await expect(app.noteTitle).not.toHaveValue("");
    // Taken: the rename fails and says so.
    await app.noteTitle.fill("README");
    await app.noteTitle.press("Enter");
    const message = page.getByRole("alert");
    await expect(message).toHaveText("Failed to change file path");

    // The rename fell through: the note keeps its own name.
    await expect(app.noteTitle).not.toHaveValue("README");
    const first = await app.noteTitle.inputValue();

    // Clicked straight through, as the message stays five seconds.
    await app.modeButton("Preview").click({ timeout: 2000 });
    await expect(app.modeOn).toHaveAccessibleName("Preview");
    await page
      .getByRole("button", { name: "Note menu" })
      .click({ timeout: 2000 });
    await expect(
      page.getByRole("button", { name: "Change file path" }),
    ).toBeVisible();
    // The open menu hides the rest of the page from assistive technology.
    await page.keyboard.press("Escape");
    await expect(message).toBeVisible();
    // At the right, below the header.
    const box = (await message.boundingBox())!;
    const header = (await page
      .getByRole("group", { name: "editor mode" })
      .boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(width - 40);
    expect(box.y).toBeGreaterThan(header.y + header.height);

    // The notes list's buttons at the top right are free too.
    await app.selectTab("Drafts");
    await expect(message).toBeVisible();
    await app.notesPanel
      .getByRole("button", { name: "New note" })
      .click({ timeout: 2000 });
    // Still up: the click went through while it showed, not after it left.
    await expect(message).toBeVisible();
    // A note of its own opens, not the one the message came from.
    await expect(app.noteTitle).not.toHaveValue("");
    await expect(app.noteTitle).not.toHaveValue(first);
  });
}
