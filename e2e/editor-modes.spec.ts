import { expect, test } from "./fixtures";

test("switches between edit, preview and source code", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor("# Hello from Playwright");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Written **by** a robot");

  // Edit is the default: the editor folds markup as you type, so the
  // emphasis markers around "by" are hidden tokens.
  const markers = app.editor.locator(".cm-formatting-strong");
  await expect(markers).toHaveCount(2);
  await expect(markers.first()).toHaveClass(/hmd-hidden-token/);

  // Preview renders the markdown and puts the editor away.
  await app.modeButton("Preview").click();
  await expect(app.editor).toBeHidden();
  await expect(app.preview.getByRole("heading", { level: 1 })).toHaveText(
    "Hello from Playwright",
  );
  await expect(app.preview.locator("strong")).toHaveText("by");

  // Source code shows the markdown as written: no preview, nothing folded.
  await app.modeButton("Source code").click();
  await expect(app.editor).toBeVisible();
  await expect(app.preview).toHaveCount(0);
  await expect(markers.first()).not.toHaveClass(/hmd-hidden-token/);

  // And back to the folding editor.
  await app.modeButton("Edit").click();
  await expect(markers.first()).toHaveClass(/hmd-hidden-token/);
});
