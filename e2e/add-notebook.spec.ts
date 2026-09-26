import { expect, test } from "./fixtures";

// Adding a notebook by cloning checks the URL before going to the network,
// so a bad one can be tried without a git remote.
test("reports a git URL it cannot clone in words, not as a key", async ({
  app,
  page,
}) => {
  await app.open();
  await app.sidebar.getByRole("button", { name: "Add a notebook" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Url" })
    .fill("github.com/0xGG/crossnote-app.git");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();

  // The download message comes first; the failure follows it.
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid git URL prefix" }),
  ).toBeVisible({ timeout: 10000 });
});
