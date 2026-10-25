import { expect, test } from "./fixtures";

// Scripts that the editor and the preview add to the page while it runs come
// from the site itself, not from a CDN address that serves whatever version
// is newest there. Requests that would leave the machine are refused, so the
// checks need no network and nothing fetched from elsewhere runs.
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.abort(),
  );
});

test("loads the language of a code block from the site", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  const shellMode = page.waitForRequest(/\/mode\/shell\/shell\.js$/);
  await app.typeInEditor("```bash\necho $HOME\n```\n");
  const request = await shellMode;
  expect(new URL(request.url()).origin).toBe(new URL(page.url()).origin);
  // The language arrived and took effect.
  await expect(
    app.editor.locator(".cm-builtin", { hasText: "echo" }),
  ).toBeVisible();
});
