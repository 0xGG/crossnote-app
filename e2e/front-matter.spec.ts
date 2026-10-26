import { expect, test } from "./fixtures";
import type { CrossnoteApp } from "./crossnote";

// Front matter is the user's: the notebook only adds the settings it keeps
// after it. Each test puts a note's text in storage as another program would
// have written it, opens the note, and looks at what is stored afterwards.

// The README the first run writes, holding the given text; open, in the
// given mode.
async function openReadme(
  app: CrossnoteApp,
  text: string,
  mode: "Edit" | "Source code" | "Preview" = "Edit",
): Promise<string> {
  await app.open();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  const readme = `${await app.notebookFolder()}/README.md`;
  await app.storedText(readme, text);
  await app.page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  await app.modeButton(mode).click();
  return readme;
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
  await app.modeButton("Edit").click();
  await expect(app.editor).toContainText("tags: [work, r3");
  await expect(app.editor).toContainText("More");
});

test("keeps values in front matter as they were written when the note is edited", async ({
  app,
}) => {
  const frontMatter = "phone: 0123456789\nversion: 1.10\ndate: 2026-10-26\n";
  const readme = await openReadme(app, `---\n${frontMatter}---\n# Kept\n`);
  await expect(app.editor).toContainText("phone: 0123456789");

  await typeAtEnd(app, "More");
  await expect.poll(() => app.storedText(readme)).toContain("More");
  expect(await app.storedText(readme)).toMatch(
    new RegExp(
      `^---\\n${frontMatter}created: \\S+\\nmodified: \\S+\\n---\\n# Kept\\nMore$`,
    ),
  );
});

for (const [layout, text] of [
  [
    "values YAML reads as other types",
    "---\nphone: 0123456789\nversion: 1.10\n---\n# Kept\n",
  ],
  ["front matter YAML cannot read", "---\ntags: [work, r3\n---\n# Kept\n"],
  ["Windows line endings", "---\r\ntags: [a, b]\r\n---\r\n# Kept\r\n"],
  ["a byte order mark", "\uFEFF---\ntitle: T\n---\n# Kept\n"],
]) {
  test(`opens a note with ${layout} without writing it`, async ({ app }) => {
    const readme = await openReadme(app, text, "Edit");
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
