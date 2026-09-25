import { expect, test } from "./fixtures";
import { layoutOf, noteTab, row, settingsTab, tabset } from "./layouts";

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

test("names the settings and graph tabs in the language of the moment", async ({
  app,
  page,
}) => {
  await app.open();
  const drafts = app.notebook("Drafts");
  await drafts.getByRole("button").first().click();
  await drafts
    .getByRole("group")
    .getByRole("treeitem", { name: /Graph view/ })
    .click();
  await expect(app.tab("Graph view")).toBeVisible();
  await app.openSettings();
  await expect(app.tab("Settings")).toBeVisible();

  await page.getByRole("combobox").filter({ hasText: "English" }).click();
  await page.getByRole("option", { name: "简体中文" }).click();

  // The name the tab goes by and the text it shows are set apart.
  await expect(app.tab("设置")).toContainText("设置");
  await expect(app.tab("关联图")).toContainText("关联图");
});

test("names a settings tab saved under another language in this one", async ({
  app,
}) => {
  // The name a tab is saved with is the one it was opened under.
  await app.seedLayout(layoutOf(row(tabset({ ...settingsTab, name: "设置" }))));
  await app.open();
  await expect(app.tab("Settings")).toContainText("Settings");
});

test("names a hidden settings tab in the overflow menu in this language too", async ({
  app,
  page,
}) => {
  // Too many tabs for a narrow pane: the settings, last, only shows in the
  // menu of hidden tabs.
  const many = Array.from({ length: 15 }, (_, i) => noteTab(`tab ${i}`));
  await app.seedLayout(
    layoutOf(
      row(
        { ...tabset(noteTab("wide")), weight: 80 },
        { ...tabset(...many, { ...settingsTab, name: "设置" }), weight: 20 },
      ),
    ),
  );
  await app.open();
  await page.getByRole("button", { name: "Hidden tabs" }).click();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
});
