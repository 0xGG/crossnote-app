import { expect, test } from "./fixtures";
import { layoutOf, noteTab, row, tabset } from "./layouts";

// What closing the last tab of the active tabset leaves behind when that
// tabset shares its column with two others: a root row holding only rows,
// a split inside each half of a split, and no active tabset.
const layout = layoutOf(
  row(
    row(tabset(noteTab("a")), tabset(noteTab("b"))),
    row(tabset(noteTab("c")), tabset(noteTab("d"))),
  ),
);

test("opens a tab in an existing tabset when none is active", async ({
  app,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.seedLayout(layout);
  await app.open();
  const tabsets = page.locator(".flexlayout__tabset");
  await expect(tabsets).toHaveCount(4);

  // The notes list opens in one of the four tabsets rather than failing on
  // the way to a fifth.
  await app.openNotes();
  await expect(tabsets).toHaveCount(4);
  expect(errors).toEqual([]);
});
