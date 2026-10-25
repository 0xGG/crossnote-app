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
  const page = await opened;
  await page.waitForLoadState();
  expect(page.url()).toBe("https://example.org/");
  expect(await page.evaluate(() => window.opener === null)).toBe(true);
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
  const page = await opened;
  await page.waitForLoadState();
  expect(page.url()).toBe("https://www.youtube.com/watch?v=abc");
  expect(await page.evaluate(() => window.opener === null)).toBe(true);
});

test("opens a link in a kanban card without a way back to the app", async ({
  app,
  page: appPage,
  context,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // A kanban widget with one card whose description is a link. Each slash
  // typed opens the editor's command menu, which the Enter that leaves the
  // line would pick from, so the menu is closed first.
  const card = {
    id: 2,
    title: "Card",
    description: "[outside](https://example.org/)",
  };
  const board = {
    columns: [{ id: 1, title: "To do", wip: false, cards: [card] }],
  };
  await app.typeInEditor(
    `<!-- @crossnote.kanban "board":${JSON.stringify(board)} -->`,
  );
  await appPage.keyboard.press("Escape");
  await appPage.keyboard.press("Enter");

  // The card's own editor has no click handler of the app's, so a link in
  // it is opened by echomd's.
  await appPage.getByRole("button", { name: "Edit card", exact: true }).click();
  const cardEditor = appPage.getByRole("dialog").locator(".CodeMirror");
  const opened = context.waitForEvent("page");
  await cardEditor
    .getByText("outside", { exact: true })
    .click({ modifiers: ["Control"] });
  const page = await opened;
  await page.waitForLoadState();
  expect(page.url()).toBe("https://example.org/");
  expect(await page.evaluate(() => window.opener === null)).toBe(true);
});
