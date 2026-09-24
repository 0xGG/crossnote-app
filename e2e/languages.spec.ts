import { expect, test } from "./fixtures";
import { layoutOf, noteTab, row, tabset } from "./layouts";

// Two panes side by side, so there is a splitter to name.
const layout = layoutOf(row(tabset(noteTab("a")), tabset(noteTab("b"))));

test.describe(() => {
  // Seeds no English, so Chinese is the only language the page starts with.
  test.use({ firstRun: true });

  test("names the layout's own controls in the chosen language", async ({
    app,
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("settings/language", "zh-CN");
    });
    await app.seedLayout(layout);
    await app.open();

    await expect(
      page.getByRole("separator", { name: "调整大小" }),
    ).toBeVisible();
    // A selected tab shows its close button, whose title is all it says.
    await expect(page.getByTitle("关闭").first()).toBeVisible();
  });
});

test("renames them when the language changes", async ({ app, page }) => {
  await app.seedLayout(layout);
  await app.open();
  await expect(page.getByRole("separator", { name: "Resize" })).toBeVisible();

  await app.openSettings();
  await page.getByRole("combobox").filter({ hasText: "English" }).click();
  await page.getByRole("option", { name: "简体中文" }).click();

  // No reload: the labels follow the language the app now shows.
  await expect(page.getByRole("separator", { name: "调整大小" })).toBeVisible();
  await expect(page.getByTitle("关闭").first()).toBeVisible();
});
