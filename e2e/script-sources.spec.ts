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

test("loads a language built on CodeMirror's mode addons", async ({
  app,
  page,
}) => {
  // reStructuredText lays its markup over another mode with the overlay
  // addon, which a mode script loaded from the site finds only if the bundle
  // has it. Without it the mode throws while the editor draws the block, and
  // the editor stops taking what is typed.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.open();
  await app.openNotes();
  await app.createNote();
  const rstMode = page.waitForResponse(/\/mode\/rst\/rst\.js$/);
  await app.typeInEditor("```rst\n**bold**\n```\n\nafter");
  await rstMode;
  await expect(
    app.editor.locator(".cm-strong", { hasText: "bold" }),
  ).toBeVisible();
  await page.keyboard.type(" typed");
  await expect(app.editor).toContainText("after typed");
  expect(errors).toEqual([]);
});

test("loads the language of a code block without rewriting the note", async ({
  app,
  page,
}) => {
  // A note with Windows line endings, as one cloned from a repository written
  // on Windows has. The editor joins lines with \n, so any change it reports
  // makes the app save the note converted; loading a language for one of its
  // code blocks, with nothing typed, must not be such a change.
  const text = "# Windows\r\n\r\n```bash\r\necho $HOME\r\n```\r\n";
  await app.open();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  const readme = `${await app.notebookFolder()}/README.md`;
  await app.storedText(readme, text);
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  await app.modeButton("Edit").click();
  await expect(
    app.editor.locator(".cm-builtin", { hasText: "echo" }),
  ).toBeVisible();
  // The app saves a change 300 ms after it. A change typed into another note
  // now is saved after any the language set off, and its write to the same
  // storage lands after that one, so once it is stored the README has been
  // saved, if it was going to be.
  // The README stays open behind the new note, so only what is on screen is
  // the new note's.
  await app.selectTab("Drafts");
  await app.notesPanel.getByRole("button", { name: "New note" }).click();
  const title = app.noteTitle.filter({ visible: true });
  await expect(title).not.toHaveValue("");
  const other = `${await app.notebookFolder()}/${await title.inputValue()}.md`;
  await app.editor.filter({ visible: true }).click();
  await page.keyboard.type("x");
  await expect.poll(() => app.storedText(other)).toContain("x");
  expect(await app.storedText(readme)).toBe(text);
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
