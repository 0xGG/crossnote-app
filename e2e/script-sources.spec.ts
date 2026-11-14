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

// A language is a chunk of the site's own build, asked for the first time a
// note names it. Held back here until the block has been drawn without it,
// so that what is checked is the block being drawn again.
test("loads the language of a code block from the site, and draws the block again with it", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const asked: string[] = [];
  await page.route(/\/assets\/shell-[^/]+\.js$/, async (route) => {
    asked.push(route.request().url());
    await held;
    await route.continue();
  });
  await app.typeInEditor("```bash\necho $HOME\n```\n");
  await expect.poll(() => asked).toHaveLength(1);
  expect(new URL(asked[0]).origin).toBe(new URL(page.url()).origin);
  // Drawn, without the language's colours, while the language is on its way.
  await expect(app.editor).toContainText("echo $HOME");
  expect(await app.tokenTypes("echo")).not.toContain("variableName");
  release();
  // The language arrived and took effect.
  await expect.poll(() => app.tokenTypes("echo")).toContain("variableName");
  expect(await app.editorText()).toBe("```bash\necho $HOME\n```\n");
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
  await expect.poll(() => app.tokenTypes("echo")).toContain("variableName");
  // The app saves a change 300 ms after it. A change the language set off
  // would come no later than the highlighting just seen, so one typed into
  // another note now is saved after it, and its write to the same storage
  // lands after that one: once it is stored, the README has been saved, if it
  // was going to be. The README stays open behind the new note, so only what
  // is on screen is the new note's.
  await app.selectTab("Drafts");
  await app.notesPanel.getByRole("button", { name: "New note" }).click();
  const title = app.noteTitle.filter({ visible: true });
  await expect(title).not.toHaveValue("");
  const other = `${await app.notebookFolder()}/${await title.inputValue()}.md`;
  await app.visibleEditor.click();
  await page.keyboard.type("x");
  await expect.poll(() => app.storedText(other)).toContain("x");
  expect(await app.storedText(readme)).toBe(text);
});
