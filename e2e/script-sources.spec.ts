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

test("loads mermaid for a slide from the site", async ({ app, page }) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor(
    "<!-- slide -->\n\n```mermaid\ngraph TD; A-->B\n```\n",
  );
  // The page itself loads the same file at start; the one asked for here is
  // the slide's own, from the frame the slides are drawn in. Only the address
  // is checked: a deck with a diagram in it is not drawn at all yet, as the
  // preview reads the frame before the scripts in its head have loaded.
  const slideMermaid = page.waitForRequest(
    (request) =>
      /mermaid(\.min)?\.js$/.test(request.url()) &&
      request.frame() !== page.mainFrame(),
  );
  await app.modeButton("Preview").click();
  const request = await slideMermaid;
  expect(request.url()).toBe(
    new URL("/deps/mermaid/mermaid.min.js", page.url()).href,
  );
});
