import { expect, test } from "./fixtures";
import type { CrossnoteApp } from "./crossnote";

// Front matter is the user's: the notebook only adds the settings it keeps
// after it. Each test puts a note's text in storage as another program would
// have written it, opens the note, and looks at what is stored afterwards.

// The README the first run writes, holding the given text, opened. Whatever
// is to be done on the page before the note opens is done once the page has
// loaded the text.
async function openReadme(
  app: CrossnoteApp,
  text: string,
  beforeOpening?: () => Promise<unknown>,
): Promise<string> {
  await app.open();
  // Only the notebook's notes are open, so the note opens on the click
  // below, not as the page loads the layout.
  await app.openNotes();
  const readme = `${await app.notebookFolder()}/README.md`;
  await app.storedText(readme, text);
  await app.page.reload();
  await app.waitUntilReady();
  await beforeOpening?.();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  return readme;
}

// The message a note whose front matter YAML cannot read opens with. It
// covers the buttons that switch the editor's mode, so it is closed first.
async function closeFrontMatterMessage(app: CrossnoteApp) {
  const message = app.page
    .getByRole("alert")
    .filter({ hasText: "The front matter of this note cannot be read" });
  await message.getByRole("button", { name: "Close" }).click();
  await expect(message).toHaveCount(0);
}

async function typeAtEnd(app: CrossnoteApp, text: string) {
  await app.editor.click();
  await app.page.keyboard.press("Control+End");
  await app.page.keyboard.type(text);
}

// The settings the notebook writes before front matter it cannot add them to.
const settingsBefore = /^---\ncreated: \S+\nmodified: \S+\n---\n/;

test("keeps front matter YAML cannot read when the note is edited", async ({
  app,
}) => {
  const text = "---\ntitle: Notes\ntags: [work, r3\n---\n# Kept\n";
  const readme = await openReadme(app, text);
  await closeFrontMatterMessage(app);
  await app.modeButton("Edit").click();
  await expect(app.editor).toContainText("tags: [work, r3");

  await typeAtEnd(app, "More");
  await expect.poll(() => app.storedText(readme)).toContain("More");
  const stored = (await app.storedText(readme)) ?? "";
  expect(stored).toMatch(settingsBefore);
  expect(stored.replace(settingsBefore, "")).toBe(`${text}More`);

  // Read again, the note is all there.
  await app.page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  await closeFrontMatterMessage(app);
  await app.modeButton("Edit").click();
  await expect(app.editor).toContainText("tags: [work, r3");
  await expect(app.editor).toContainText("More");
});

test("keeps values in front matter as they were written when the note is edited", async ({
  app,
}) => {
  const frontMatter = "phone: 0123456789\nversion: 1.10\ndate: 2026-10-26\n";
  const readme = await openReadme(app, `---\n${frontMatter}---\n# Kept\n`);
  await app.modeButton("Edit").click();
  await expect(app.editor).toContainText("phone: 0123456789");

  await typeAtEnd(app, "More");
  await expect.poll(() => app.storedText(readme)).toContain("More");
  expect(await app.storedText(readme)).toMatch(
    new RegExp(
      `^---\\n${frontMatter}created: \\S+\\nmodified: \\S+\\n---\\n# Kept\\nMore$`,
    ),
  );
});

// A note that opens without a message leaves nothing to close before its
// mode is switched.
const nothingToClose = async () => {};

for (const { layout, text, opened } of [
  {
    layout: "values YAML reads as other types",
    text: "---\nphone: 0123456789\nversion: 1.10\n---\n# Kept\n",
    opened: nothingToClose,
  },
  {
    layout: "front matter YAML cannot read",
    text: "---\ntags: [work, r3\n---\n# Kept\n",
    opened: closeFrontMatterMessage,
  },
  {
    layout: "Windows line endings",
    text: "---\r\ntags: [a, b]\r\n---\r\n# Kept\r\n",
    opened: nothingToClose,
  },
  {
    layout: "a byte order mark",
    text: "\uFEFF---\ntitle: T\n---\n# Kept\n",
    opened: nothingToClose,
  },
]) {
  test(`opens a note with ${layout} without writing it`, async ({ app }) => {
    const readme = await openReadme(app, text);
    await opened(app);
    await app.modeButton("Edit").click();
    await app.modeButton("Source code").click();
    await app.modeButton("Preview").click();
    await expect(app.preview).toContainText("Kept");
    // A change the note's opening set off would be saved no later than one
    // typed into another note now, whose write to the same storage lands
    // after it.
    await app.selectTab("Drafts");
    await app.notesPanel.getByRole("button", { name: "New note" }).click();
    const title = app.noteTitle.filter({ visible: true });
    await expect(title).not.toHaveValue("");
    const other = `${await app.notebookFolder()}/${await title.inputValue()}.md`;
    await app.editor.filter({ visible: true }).click();
    await app.page.keyboard.type("x");
    await expect.poll(() => app.storedText(other)).toContain("x");
    expect(await app.storedText(readme)).toBe(text);
  });
}

test("says that front matter YAML cannot read is kept as it is", async ({
  app,
}) => {
  await openReadme(app, "---\ntags: [work, r3\n---\n# Kept\n");
  await expect(app.page.getByRole("alert")).toContainText(
    "The front matter of this note cannot be read. It is kept as it is.",
  );
});

test("says nothing of front matter YAML reads", async ({ app }) => {
  let messages: () => Promise<string[]>;
  await openReadme(app, "---\ntags: [work, r3]\n---\n# Kept\n", async () => {
    messages = await app.recordMessages();
  });
  // A message the note's opening put up would be on screen by the time the
  // editor it switches to is.
  await app.modeButton("Edit").click();
  await expect(app.editor).toContainText("tags: [work, r3]");
  expect(await messages!()).toEqual([]);
});
