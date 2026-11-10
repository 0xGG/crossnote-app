import { expect, test } from "./fixtures";

// The notebook tree in the sidebar lists a notebook's favourite notes, each
// with the number of notes that refer to it.
test("shows a favourite's whole title and its reference count however long the title", async ({
  app,
}) => {
  await app.open();
  await app.openNotes();
  // README is the favourite a fresh notebook starts with.
  await app.noteCards
    .filter({ hasText: "README.md" })
    .getByText("README", { exact: true })
    .click();
  // No spaces or hyphens, so nothing to break the line at.
  await app.noteTitle.fill("quarterly_review_meeting_notes_2026");
  await app.noteTitle.press("Enter");

  const favourite = app
    .notebook("Drafts")
    .getByRole("treeitem", { name: /quick-access quarterly_review/ });
  await expect(favourite).toBeVisible();
  await expect(favourite.getByText("0", { exact: true })).toBeInViewport({
    ratio: 1,
  });
  // The title breaks where it has to rather than being cut short.
  const title = favourite.getByText("quarterly_review_meeting_notes_2026", {
    exact: true,
  });
  await expect
    .poll(() =>
      title.evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);
});

test("works the notebook tree from the keyboard", async ({ app, page }) => {
  await app.open();
  const drafts = app.notebook("Drafts");

  // A click on a notebook's name refreshes it rather than expanding it; a
  // click is a discrete event, so React has drawn its outcome by now.
  await drafts.getByText("Drafts", { exact: true }).click();
  await expect(drafts).toHaveAttribute("aria-expanded", "false");

  // The arrow keys expand and collapse a notebook...
  await drafts.focus();
  await page.keyboard.press("ArrowRight");
  await expect(drafts).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(drafts).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");

  // ...and Enter on a row does what a click on its label does.
  const favourite = drafts.getByRole("treeitem", {
    name: /quick-access README/,
  });
  await favourite.focus();
  await page.keyboard.press("Enter");
  await expect(app.tab("README")).toHaveAttribute("aria-selected", "true");
  const graph = drafts.getByRole("treeitem", { name: /Graph view/ });
  await graph.focus();
  await page.keyboard.press("Enter");
  await expect(app.tab("Graph view")).toHaveAttribute("aria-selected", "true");
});

test("forgets edits to a notebook's settings that were cancelled", async ({
  app,
  page,
}) => {
  await app.open();
  const drafts = app.notebook("Drafts");
  await drafts.getByRole("button").first().click();
  // The favourites come in once the notes are read, above Settings, and push
  // it down a row: a click aimed at Settings before then can land on the
  // favourite that moves into its place.
  await expect(
    drafts.getByRole("treeitem", { name: /quick-access README/ }),
  ).toBeVisible();
  const openSettings = () =>
    drafts
      .getByRole("group")
      .getByRole("treeitem", { name: /Settings/ })
      .click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByRole("textbox", { name: "Notebook name" });

  await openSettings();
  await expect(name).toHaveValue("Drafts");
  await name.fill("Not saved");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // The dialog stays mounted between openings; what it shows next time is
  // the notebook, not the cancelled edit.
  await openSettings();
  await expect(name).toHaveValue("Drafts");
});
