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

test("opens a YouTube video without a way back to the app", async ({
  app,
  context,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // Leaving the line is what folds the comment into the widget, which shows
  // the video's thumbnail and opens the video when it is clicked.
  await app.typeInEditor('<!-- @crossnote.youtube "videoID":"abc" -->\n');

  const opened = context.waitForEvent("page");
  await app.editor.getByRole("img", { name: "Youtube: abc" }).click();
  const popup = await opened;
  await expect(popup).toHaveURL("https://www.youtube.com/watch?v=abc");
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
});

test("opens a link in a kanban card without a way back to the app", async ({
  app,
  page,
  context,
}) => {
  // The board is typed into the editor a key at a time, which takes most of
  // the default timeout on a busy machine.
  test.slow();
  await app.open();
  await app.openNotes();
  await app.createNote();
  // A kanban widget with one card whose description is a link.
  const card = { id: 2, title: "C", description: "[outside](https://a.b/)" };
  const board = { columns: [{ id: 1, title: "A", cards: [card] }] };
  await app.typeInEditor(
    `<!-- @crossnote.kanban "board":${JSON.stringify(board)} -->\n`,
  );

  // The card's own editor has no click handler of the app's, so a link in
  // it is opened by echomd's.
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  const opened = context.waitForEvent("page");
  await app.cardEditor
    .getByText("outside", { exact: true })
    .click({ modifiers: ["Control"] });
  const popup = await opened;
  await expect(popup).toHaveURL("https://a.b/");
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
});
