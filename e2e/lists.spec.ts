import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

// Every entry of the app's lists and menus sits in a list item, and the
// separators between their groups are hidden from assistive technology: a
// list holding anything else is one it cannot count or step through.
async function expectOnlyListItems(list: Locator) {
  await expect(list.getByRole("listitem").first()).toBeVisible();
  // By role, not by tag: MUI gives a separator rendered as li the separator
  // role, which is not a list item's.
  const others = await list.evaluate(
    (element) =>
      Array.from(element.children).filter(
        (child) =>
          child.getAttribute("aria-hidden") !== "true" &&
          !(
            child.tagName === "LI" &&
            [null, "listitem"].includes(child.getAttribute("role"))
          ),
      ).length,
  );
  expect(others).toBe(0);
  const entries = await list.getByRole("button").count();
  await expect(list.getByRole("listitem").getByRole("button")).toHaveCount(
    entries,
  );
}

test.describe(() => {
  test.use({ firstRun: true });

  test("lists the languages to choose from in list items", async ({ page }) => {
    await page.goto("/");
    await expectOnlyListItems(page.getByRole("dialog").getByRole("list"));
  });
});

test("lists the sidebar's settings entry in a list item", async ({
  app,
  page,
}) => {
  await app.open();
  await expectOnlyListItems(
    app.sidebar
      .getByRole("list")
      .filter({ has: page.getByRole("button", { name: "Settings" }) }),
  );
});

test("lists the sort orders and the note actions in list items", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.notesPanel.getByRole("button", { name: "Sort notes" }).click();
  // An open menu hides the rest of the page, so its list is the one found.
  await expectOnlyListItems(page.getByRole("list"));
  await page.keyboard.press("Escape");

  await app.createNote();
  await page.getByRole("button", { name: "Note menu" }).click();
  await expectOnlyListItems(page.getByRole("list"));
});
