import type { Page } from "@playwright/test";
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

test("draws the sidebar once, beside the page or over it on a narrow screen", async ({
  app,
  page,
}) => {
  await app.open();
  // One tree for the one notebook, counting what is out of sight too.
  const trees = page.locator('[role="tree"]');
  await expect(trees).toHaveCount(1);

  // A narrow screen opens it over the page from a button, and a row's
  // action closes it again.
  await page.setViewportSize({ width: 375, height: 700 });
  const drafts = page.getByRole("treeitem", { name: /Drafts/ });
  await expect(drafts).toBeHidden();
  await expect(trees).toHaveCount(1);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(drafts).toBeVisible();
  await drafts.getByRole("button").first().click();
  await drafts.getByRole("treeitem", { name: /Graph view/ }).click();
  await expect(app.tab("Graph view")).toHaveAttribute("aria-selected", "true");
  await expect(drafts).toBeHidden();
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

// The button that opens the drawer over the page, there on a narrow screen
// only; counted out of sight too, as a dialog open hides it from assistive
// technology.
const menuButton = (page: Page) =>
  page.getByRole("button", { name: "Open menu", includeHidden: true });

// The sidebar is drawn anew in the other drawer when the screen gets narrow
// or wide, as a phone turned does; what was open in it stays open.
test("keeps a notebook's dialog and tree as they were when the screen changes width", async ({
  app,
  page,
}) => {
  await app.open();
  const drafts = app.notebook("Drafts");
  await drafts.getByRole("button").first().click();
  // Once the notes are read, the rows are where they stay.
  await expect(
    drafts.getByRole("treeitem", { name: /quick-access README/ }),
  ).toBeVisible();
  await drafts
    .getByRole("group")
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  const name = page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Notebook name" });
  await name.fill("Typed, not saved");

  await page.setViewportSize({ width: 375, height: 700 });
  // The drawer has changed once the button that opens it is there.
  await expect(menuButton(page)).toHaveCount(1);
  await expect(name).toHaveValue("Typed, not saved");
  await page.keyboard.press("Escape");
  await expect(name).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("treeitem", { name: /Drafts/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

// Back on a narrow screen, the drawer over the page stays closed: opened, it
// would come in over the dialog and take its keys.
test("leaves a dialog opened from the drawer to be typed into after the screen goes wide and back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const drafts = page.getByRole("treeitem", { name: /Drafts/ });
  await drafts.getByRole("button").first().click();
  // Once the notes are read, the rows are where they stay.
  await expect(
    drafts.getByRole("treeitem", { name: /quick-access README/ }),
  ).toBeVisible();
  await drafts
    .getByRole("group")
    .getByRole("treeitem", { name: /Settings/ })
    .click();
  const name = page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Notebook name" });
  await name.fill("Typed");

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(menuButton(page)).toHaveCount(0);
  await expect(name).toHaveValue("Typed");
  await page.setViewportSize({ width: 375, height: 700 });
  await expect(menuButton(page)).toHaveCount(1);
  await name.click();
  await page.keyboard.type(" and more");
  await expect(name).toHaveValue("Typed and more");
});
