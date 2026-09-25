import { expect, test } from "./fixtures";

// The editor widgets render into DOM the editor owns, through their own React
// roots, so nothing else in this suite reaches them.
test("turns an audio widget into a player once it has a source", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.modeButton("Edit").click();

  // This comment is exactly what the slash menu inserts for /audio. Leaving
  // the line is what folds it into the widget.
  await app.typeInEditor("<!-- @crossnote.audio -->\n");

  await expect(page.getByRole("heading", { name: "Audio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);

  const source = page.getByPlaceholder(
    "Enter audio source URL here, then press 'Enter' to insert.",
  );
  await source.fill("https://example.com/sound.mp3");
  await source.press("Enter");

  // With a source the widget stops being a form and becomes the player.
  await expect(page.getByRole("heading", { name: "Audio" })).toHaveCount(0);
  await expect(page.locator("audio > source")).toHaveAttribute(
    "src",
    "https://example.com/sound.mp3",
  );

  // Preview mode takes a separate branch inside the widget; the player has to
  // survive it.
  await app.modeButton("Preview").click();
  await expect(app.preview.locator("audio > source")).toHaveAttribute(
    "src",
    "https://example.com/sound.mp3",
  );
});

// A one-pixel PNG, for the widgets that take an image file.
const picture = {
  name: "picture.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};

test("lets the image widget take the same file again after a failed upload", async ({
  app,
  page,
}) => {
  // The upload service is out of reach, so the upload fails.
  await page.route("https://sm.ms/**", (route) => route.abort());
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.modeButton("Edit").click();
  await app.typeInEditor("<!-- @crossnote.image -->\n");
  const dropArea = page.getByText("Click here to browse image file");

  const first = page.waitForEvent("filechooser");
  await dropArea.click();
  await (await first).setFiles(picture);
  await expect(
    page.getByRole("alert").filter({ hasText: "Failed to upload image" }),
  ).toBeVisible({ timeout: 10000 });

  // A browser may not report choosing the file already in the input, so the
  // input has to be empty again by the time the picker opens.
  const again = page.waitForEvent("filechooser");
  await dropArea.click();
  const input = (await again).element();
  expect(
    await input.evaluate((element) => (element as HTMLInputElement).value),
  ).toBe("");
});
