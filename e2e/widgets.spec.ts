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
