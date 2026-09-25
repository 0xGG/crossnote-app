import { expect, test } from "./fixtures";
import { layoutOf, noteTab, row, tabset } from "./layouts";

// Access to a local folder has to be granted again after a reload, and the
// browser only asks in answer to a click, so the app opens with a dialog to
// click whenever the saved layout shows a notebook kept in a local folder.
// Local folders live under /lfs in the app's file system; the notebook does
// not have to exist for the check, only the tab that names it.
const inLocalFolder = (id: string) => {
  const tab = noteTab(id);
  return { ...tab, config: { ...tab.config, notebookPath: "/lfs/Notes" } };
};

test("asks for a click when a local folder's note sits in the lower half of a split", async ({
  app,
  page,
}) => {
  // Splitting the only pane top and bottom saves a row inside the root row,
  // with the tabs a level further down.
  await app.seedLayout(
    layoutOf(
      row(row(tabset(noteTab("upper")), tabset(inLocalFolder("lower")))),
    ),
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Welcome back to Crossnote");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toBeHidden();
  await app.waitUntilReady();
});
