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

test("sorts the list from the sort menu", async ({ app, page }) => {
  const sort = app.notesPanel.getByRole("button", { name: "Sort notes" });
  const byTitle = page.getByRole("button", { name: "Title", exact: true });
  // With nothing else changing in the list, the click alone has to open the
  // menu.
  await expect(app.noteCards).toHaveCount(1);
  await sort.click();
  await expect(byTitle).toBeVisible();
  // An open menu hides the rest of the page from assistive technology, and
  // with it the list this suite finds by its heading.
  await page.keyboard.press("Escape");
  await expect(byTitle).toBeHidden();

  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const name = await app.noteTitle.inputValue();
  await app.selectTab("Drafts");
  // Newest first by default: the note just made, then README.
  await expect(app.noteCards).toHaveCount(2);
  await expect(app.noteCards.first()).toContainText(name);

  // Titles in the default descending order put README first...
  await sort.click();
  await byTitle.click();
  await page.keyboard.press("Escape");
  await expect(app.noteCards.first()).toContainText("README");
  // ...and ascending order puts the date-named note back on top.
  await sort.click();
  await page.getByRole("button", { name: "Asc", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(app.noteCards.first()).toContainText(name);
});

test("keeps the search box in view while the list scrolls", async ({
  app,
  page,
}) => {
  // Short enough for three cards to overflow the pane.
  await page.setViewportSize({ width: 1280, height: 400 });
  for (const count of [2, 3]) {
    await app.notesPanel.getByRole("button", { name: "New note" }).click();
    // The new note opens in a tab of its own; the list is behind it.
    await expect(app.noteTitle).toBeVisible();
    await app.selectTab("Drafts");
    await expect(app.noteCards).toHaveCount(count);
  }

  const scrolled = await app.notesPanel.evaluate((panel) => {
    const pane = panel.parentElement!;
    pane.scrollTop = 150;
    return pane.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(100);
  await expect(app.searchBox).toBeInViewport();

  // The first card's menu button has scrolled under the pinned bar. Moving
  // the focus to it, as Shift+Tab back up the list does, brings it out.
  const menu = app.noteCards.first().getByRole("button", { name: "Note menu" });
  await menu.focus();
  const bar = await app.notesPanel
    .locator(":scope > div")
    .first()
    .boundingBox();
  const button = await menu.boundingBox();
  expect(button!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
});

test("saves an edit that takes a note back to how it was", async ({
  app,
  page,
}) => {
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
  const name = await app.noteTitle.inputValue();
  // A note's card follows each save of the note.
  const card = app.noteCards.filter({ hasText: `${name}.md` });
  await app.typeInEditor("Typed and then taken back");
  await app.selectTab("Drafts");
  await expect(card).toContainText("Typed and then taken back");

  // Emptied again, the note is as it was when its tab opened.
  await app.selectTab(name);
  await app.editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await app.selectTab("Drafts");
  await expect(card).toContainText("This note is empty");
});

test("names a new note in the language the app is in now", async ({
  app,
  page,
}) => {
  // With today's note made, the next one is named Untitled, in words.
  await app.createNote();
  await app.openSettings();
  await page.getByRole("combobox").filter({ hasText: "English" }).click();
  await page.getByRole("option", { name: "简体中文" }).click();

  // The same list as before, now headed in Chinese.
  await app.selectTab("Drafts");
  await page
    .locator(".notes-panel")
    .filter({ visible: true })
    .getByRole("button", { name: "新的笔记" })
    .click();
  await expect(app.tab("无标题")).toBeVisible();
});

test("never gives a new note the name of one that exists", async ({
  app,
  page,
}) => {
  const newNote = async () => {
    await app.notesPanel.getByRole("button", { name: "New note" }).click();
    // The title box is the new note's once its tab is up.
    await expect(app.noteTitle).not.toHaveValue("");
    return app.noteTitle.inputValue();
  };
  // Today's note, then Untitled, Untitled 1 and Untitled 2.
  for (let i = 0; i < 3; i++) {
    await newNote();
    await app.selectTab("Drafts");
  }
  expect(await newNote()).toBe("Untitled 2");
  await page.locator(".CodeMirror").filter({ visible: true }).click();
  await page.keyboard.type("Worth keeping");
  await app.selectTab("Drafts");
  const kept = app.noteCards.filter({ hasText: "Untitled 2.md" });
  await expect(kept).toContainText("Worth keeping");

  // With Untitled 1 renamed, two notes are called Untitled-something, and
  // the next new note must not be named Untitled 2 over the one above.
  await app.selectTab("Untitled 1");
  await app.noteTitle.fill("Renamed");
  await app.noteTitle.press("Enter");
  await expect(app.tab("Renamed")).toBeVisible();
  await app.selectTab("Drafts");
  const next = await newNote();
  expect(next).not.toBe("Untitled 2");
  await app.selectTab("Drafts");
  // Once the list shows the new note, it has been written.
  await expect(app.noteCards.filter({ hasText: `${next}.md` })).toBeVisible();
  await expect(kept).toContainText("Worth keeping");
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
