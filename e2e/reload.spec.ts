import { expect, test } from "./fixtures";

// The browser file system writes a file's content at once, but its directory
// tree only half a second after the last change, and a page loaded in that
// time used to come back without the files just made. What the app shows as
// done has to be there however soon the page is reloaded.

test("keeps the first notebook when the page is reloaded as soon as it is there", async ({
  app,
  page,
}) => {
  await app.open();
  await page.reload();
  await app.waitUntilReady();

  await app.openNotes();
  await expect(app.noteCards.filter({ hasText: "README.md" })).toBeVisible();
  // A notebook without its folder could take no note.
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
});

test("keeps a new note when the page is reloaded as soon as it opens", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const name = await app.noteTitle.inputValue();

  await page.reload();
  await app.waitUntilReady();
  // The note's tab comes back with the note in it rather than waiting for
  // one that is not there...
  await expect(app.noteTitle).toHaveValue(name);
  // ...and the notebook lists it.
  await app.selectTab("Drafts");
  await expect(app.noteCards.filter({ hasText: `${name}.md` })).toBeVisible();
});
