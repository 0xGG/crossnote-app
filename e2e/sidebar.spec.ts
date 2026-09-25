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
