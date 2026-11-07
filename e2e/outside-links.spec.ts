import { expect, test } from "./fixtures";

// A page opened from a note is someone else's: it must not get a handle on
// the app's window (window.opener), through which it could send the app's
// tab elsewhere. The outside pages are answered locally.
const outside = "<!doctype html><title>Outside</title>";

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.fulfill({ contentType: "text/html", body: outside }),
  );
});

test("opens a link in the preview without a way back to the app", async ({
  app,
  context,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor("[outside](https://example.org/)");
  await app.modeButton("Preview").click();

  const opened = context.waitForEvent("page");
  await app.preview.getByRole("link", { name: "outside" }).click();
  const popup = await opened;
  await expect(popup).toHaveURL("https://example.org/");
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
});
