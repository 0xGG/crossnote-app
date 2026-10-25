import { expect, test } from "./fixtures";

// The theme stylesheets and the emoji sheet are fetched by URL at run time.
// Both the preview server and the static host answer a path that does not
// exist with the app's own page and a 200, so a wrong path only shows as
// missing styles or blank emoji. Hence the checks look at what comes back
// and where it is asked for, not at the status alone.

test("loads each theme stylesheet from the root as CSS", async ({
  app,
  page,
}) => {
  await app.open();
  // The editor, preview and code block themes.
  const themes = page.locator('link[rel="stylesheet"][id^="echomd-"]');
  await expect(themes).toHaveCount(3);
  const hrefs = await themes.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );
  for (const href of hrefs) {
    expect(href).toMatch(/^\/styles\//);
    const response = await page.request.get(href);
    expect(response.ok(), href).toBe(true);
    expect(response.headers()["content-type"], href).toContain("text/css");
  }
});

// Only the address is checked here: the CI builds these tests run on skip
// downloading the sheet itself, and the job that builds the site for
// publishing checks that the sheet in its build is a PNG.
test("draws emoji from the sheet at the root", async ({ app, page }) => {
  await app.open();
  const emoji = page.locator(".emoji-mart-emoji > span").first();
  await expect(emoji).toHaveCSS(
    "background-image",
    `url("${new URL("/assets/emoji/twitter/64.png", page.url()).href}")`,
  );
});
