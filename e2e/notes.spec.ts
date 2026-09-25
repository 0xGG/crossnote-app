import { expect, test } from "./fixtures";

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openNotes();
});

test("creates a note that joins the notebook's list", async ({ app }) => {
  await expect(app.noteCards).toHaveCount(1);

  await app.createNote();
  await app.typeInEditor("Written by a robot");

  // The new note opened in its own tab; the list behind it has the entry,
  // with the saved text as its summary.
  await app.selectTab("Drafts");
  await expect(app.noteCards).toHaveCount(2);
  await expect(app.noteCards.first()).toContainText("Written by a robot");
});

test("keeps notes across a reload", async ({ app, page }) => {
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const name = await app.noteTitle.inputValue();
  await app.typeInEditor("Stored in the browser file system");
  await app.selectTab("Drafts");
  const card = app.noteCards.filter({ hasText: "Stored in the browser" });
  await expect(card).toBeVisible();

  // Nothing survives a reload except what reached IndexedDB (notes) and
  // localStorage (the layout). The file system stores its directory tree
  // half a second after the last write, so the note may not be listed yet.
  await app.waitUntilStored(`${await app.notebookFolder()}/${name}.md`);
  await page.reload();
  await app.waitUntilReady();
  await expect(card).toBeVisible();
  // An existing note opens in the default mode, Preview; the editor then
  // shows the same markdown once switched on.
  await card.getByText("Stored in the browser file system").click();
  await expect(app.preview).toContainText("Stored in the browser file system");
  await app.modeButton("Edit").click();
  await expect(app.editor).toContainText("Stored in the browser file system");
});

test("filters the list by content and reports when nothing matches", async ({
  app,
}) => {
  await app.createNote();
  await app.typeInEditor("The quick brown fox");
  await app.selectTab("Drafts");
  await expect(app.noteCards).toHaveCount(2);

  await app.searchBox.fill("brown fox");
  await expect(app.noteCards).toHaveCount(1);
  await expect(app.noteCards).toContainText("The quick brown fox");

  // The welcome note matches on its own content.
  await app.searchBox.fill("Welcome");
  await expect(app.noteCards).toHaveCount(1);
  await expect(app.noteCards).toContainText("README");

  await app.searchBox.fill("xyzzy");
  await expect(app.noteCards).toHaveCount(0);
  await expect(app.notesPanel).toContainText("No more notes found");
});
