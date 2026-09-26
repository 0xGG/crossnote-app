import type { Page } from "@playwright/test";
import path from "node:path";
import type { CrossnoteApp } from "./crossnote";
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

test("remembers turning the OCR widget's grayscale off", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.modeButton("Edit").click();
  await app.typeInEditor("<!-- @crossnote.ocr -->\n");
  // The switch shows once there is an image to work on.
  const grayscale = page.getByRole("switch", { name: "Grayscale" });
  const chooseImage = async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Click here to browse image file").click();
    await (await chooser).setFiles(picture);
  };
  await chooseImage();
  await expect(grayscale).toBeChecked();
  await grayscale.click();
  await expect(grayscale).not.toBeChecked();

  // Setting the text again builds the widget anew, as opening the note
  // another time would; the new one starts from the choice.
  await app.editor.evaluate(
    (element, text) =>
      (
        element as HTMLElement & { CodeMirror: CodeMirror.Editor }
      ).CodeMirror.setValue(text),
    "\n<!-- @crossnote.ocr -->\n",
  );
  await chooseImage();
  await expect(grayscale).not.toBeChecked();
});

// Runs recognition on the one-pixel picture and expects the widget back with
// its message, and no error left uncaught on the way.
async function expectRecognitionToFail(app: CrossnoteApp, page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.modeButton("Edit").click();
  await app.typeInEditor("<!-- @crossnote.ocr -->\n");
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Click here to browse image file").click();
  await (await chooser).setFiles(picture);
  const start = page.getByRole("button", { name: "Start OCR" });
  await start.click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Failed to recognize the text" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(start).toBeVisible();
  expect(errors).toEqual([]);
}

test("brings the OCR widget back with a message when recognition fails", async ({
  app,
  page,
  context,
}) => {
  // The recognition engine comes from a CDN: its worker is served here from
  // the installed package, and the engine's core cannot be fetched.
  await context.route("https://unpkg.com/**", (route) =>
    route.request().url().endsWith("/dist/worker.min.js")
      ? route.fulfill({
          path: path.resolve("node_modules/tesseract.js/dist/worker.min.js"),
          contentType: "application/javascript",
        })
      : route.abort(),
  );
  await expectRecognitionToFail(app, page);
});

test("brings the OCR widget back when the recognition worker cannot be loaded", async ({
  app,
  page,
  context,
}) => {
  // Offline, say: not even the worker's own script comes.
  await context.route("https://unpkg.com/**", (route) => route.abort());
  await expectRecognitionToFail(app, page);
});

test("brings the OCR widget back when the chosen file is no image", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.modeButton("Edit").click();
  await app.typeInEditor("<!-- @crossnote.ocr -->\n");
  // The file input takes any file.
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Click here to browse image file").click();
  await (
    await chooser
  ).setFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Not an image"),
  });

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The image could not be loaded" }),
  ).toBeVisible();
  await expect(page.getByText("Click here to browse image file")).toBeVisible();
});

test("keeps the OCR widget's image when one chosen before it fails to load", async ({
  app,
  page,
}) => {
  // A linked image whose server keeps the widget waiting, and answers only
  // once another image has been chosen.
  let hold!: (fail: () => Promise<void>) => void;
  const requested = new Promise<() => Promise<void>>(
    (resolve) => (hold = resolve),
  );
  await page.route("https://example.com/slow.png", (route) =>
    hold(() => route.abort()),
  );
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.modeButton("Edit").click();
  await app.typeInEditor("<!-- @crossnote.ocr -->\n");
  const messages = await app.recordMessages();
  const link = page.getByPlaceholder(
    "Enter image URL here, then press 'Enter' to insert.",
  );
  await link.fill("https://example.com/slow.png");
  await link.press("Enter");
  const fail = await requested;
  await page.getByRole("button", { name: "Go back" }).click();

  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Click here to browse image file").click();
  await (await chooser).setFiles(picture);
  const start = page.getByRole("button", { name: "Start OCR" });
  await expect(start).toBeEnabled();

  const failed = page.waitForEvent("requestfailed");
  await fail();
  await failed;
  // Two frames on, the image's error has been handled and drawn, if at all.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(start).toBeEnabled();
  expect(await messages()).toEqual([]);
});
