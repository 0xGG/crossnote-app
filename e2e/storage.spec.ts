import { expect, test } from "./fixtures";

// The browser keeps a site's storage through a shortage of space only once
// it has granted the site that; the app asks as it starts.

test.beforeEach(async ({ page }) => {
  // A browser that has not granted it yet, and grants it when asked.
  await page.addInitScript(() => {
    let granted = false;
    const asked = { count: 0 };
    (window as unknown as { persistAsked: typeof asked }).persistAsked = asked;
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persisted: async () => granted,
        persist: async () => {
          asked.count++;
          granted = true;
          return true;
        },
      },
    });
  });
});

test("asks the browser to keep the site's storage as it starts", async ({
  app,
  page,
}) => {
  await app.open();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { persistAsked: { count: number } })
            .persistAsked.count,
      ),
    )
    .toBe(1);

  await app.openSettings();
  await expect(
    page.getByText(
      "On: the browser does not clear the notes this site stores to free up space.",
    ),
  ).toBeVisible();
  // Once granted, Settings only looks, and asks no more.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { persistAsked: { count: number } }).persistAsked
          .count,
    ),
  ).toBe(1);
});
