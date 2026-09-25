import { expect, test } from "./fixtures";

// The table of contents is the one panel in the app a user can resize. Its
// width is a pixel value kept in localStorage, so the divider has to answer a
// drag, stay inside its bounds, and bring the width back after a reload.

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // A tab this wide opens with the table of contents showing.
  await expect(app.tocDivider).toBeVisible();
});

test("resizes the table of contents and remembers the width", async ({
  app,
  page,
}) => {
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "300");
  await expect(app.tocPane).toHaveCSS("width", "300px");
  const noteName = await app.noteTitle.inputValue();

  // Dragging the divider left widens the panel it sits against.
  await app.dragTocDivider(-40);
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "340");
  await expect(app.tocPane).toHaveCSS("width", "340px");
  expect(
    await page.evaluate(() => localStorage.getItem("toc-panel-width")),
  ).toBe("340");

  // A note created moments ago may not have reached the disk yet, and a
  // reload before it does comes back without it.
  await app.waitUntilStored(`${await app.notebookFolder()}/${noteName}.md`);
  await page.reload();
  await app.waitUntilReady();
  await app.selectTab(noteName);
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "340");
  await expect(app.tocPane).toHaveCSS("width", "340px");
});

test("keeps the table of contents between its bounds", async ({ app }) => {
  // Far enough left to overshoot the widest the panel may be.
  await app.dragTocDivider(-500);
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "350");
  await expect(app.tocPane).toHaveCSS("width", "350px");

  await app.dragTocDivider(340);
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "150");
  await expect(app.tocPane).toHaveCSS("width", "150px");
});

test("moves the divider from the keyboard", async ({ app, page }) => {
  await app.tocDivider.focus();
  await expect(app.tocDivider).toBeFocused();

  // Left widens the panel on the right, one step at a time.
  await page.keyboard.press("ArrowLeft");
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "308");
  await page.keyboard.press("ArrowRight");
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "300");

  // Home and End are about the panel rather than the direction: they give it
  // the smallest and largest size the separator reports.
  await page.keyboard.press("Home");
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "150");
  await expect(app.tocPane).toHaveCSS("width", "150px");
  await page.keyboard.press("End");
  await expect(app.tocDivider).toHaveAttribute("aria-valuenow", "350");
  await expect(app.tocPane).toHaveCSS("width", "350px");
  expect(
    await page.evaluate(() => localStorage.getItem("toc-panel-width")),
  ).toBe("350");
});

test("hides the divider with the table of contents", async ({ app, page }) => {
  const toggle = page.getByRole("button", { name: "Table of contents" });
  await toggle.click();
  await expect(app.tocDivider).toBeHidden();
  await expect(app.tocPane).toBeHidden();

  await toggle.click();
  await expect(app.tocDivider).toBeVisible();
  await expect(app.tocPane).toBeVisible();
  await expect(app.tocPane).toHaveCSS("width", "300px");
});
