import { expect, test } from "./fixtures";

// The emoji sheet is fetched by URL at run time. Both the preview server and
// the static host answer a path that does not exist with the app's own page
// and a 200, so a wrong path only shows as blank emoji. Hence the check
// looks at where it is asked for, not at the status alone.

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
