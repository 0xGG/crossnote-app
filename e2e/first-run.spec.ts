import { expect, test } from "./fixtures";

// Opt out of the seeded language: this spec is about the very first launch.
test.use({ firstRun: true });

test("asks for a language once and creates the Drafts notebook", async ({
  app,
  page,
}) => {
  await page.goto("/");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button")).toHaveText([
    "English",
    "简体中文",
    "繁体中文",
    "日本語",
  ]);
  await dialog.getByRole("button", { name: "English" }).click();
  await expect(dialog).toBeHidden();

  // A fresh origin gets a Drafts notebook holding the welcome note.
  await app.waitUntilReady();
  await app.openNotes();
  await expect(app.noteCards).toHaveCount(1);
  await expect(app.noteCards).toContainText("README");

  // The choice is remembered: a reload goes straight to the notebook.
  await page.reload();
  await app.waitUntilReady();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
