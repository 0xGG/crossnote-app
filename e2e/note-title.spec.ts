import { expect, test } from "./fixtures";

// The title box above a note renames the note's file on Enter and when it is
// left.

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
});

test("renames once when Enter is followed by leaving the box", async ({
  app,
}) => {
  const messages = await app.recordMessages();
  await app.noteTitle.fill("Renamed");
  // Enter, and the box left straight after, as Tab leaves it, in one go: the
  // rename Enter starts is still under way however quickly it goes.
  await app.noteTitle.evaluate((input: HTMLInputElement) => {
    for (const type of ["keydown", "keyup"]) {
      input.dispatchEvent(
        new KeyboardEvent(type, { key: "Enter", keyCode: 13, bubbles: true }),
      );
    }
    input.blur();
  });

  await expect(app.tab("Renamed")).toBeVisible();
  await expect(app.noteTitle).toHaveValue("Renamed");
  // A second rename, started by leaving the box while the first was under
  // way, would fail on the file the first one had just moved and report it,
  // well before the renamed note is stored.
  await app.waitUntilStored(`${await app.notebookFolder()}/Renamed.md`);
  expect(await messages()).toEqual([]);
});

test("keeps the title box focused when Enter renames the note", async ({
  app,
}) => {
  await app.noteTitle.fill("Renamed");
  await app.noteTitle.press("Enter");
  await expect(app.tab("Renamed")).toBeVisible();
  // The caret stays where it was, for the keyboard and for a screen reader.
  await expect(app.noteTitle).toBeFocused();
});

test("puts the note's name back when the title box is left empty", async ({
  app,
}) => {
  const name = await app.noteTitle.inputValue();
  await app.noteTitle.fill("");
  await app.noteTitle.press("Enter");
  // No name to rename to: the box shows the one the note still has.
  await expect(app.noteTitle).toHaveValue(name);
});

test("leaves an Enter that confirms an input method's candidate to the title", async ({
  app,
}) => {
  const messages = await app.recordMessages();
  // A name the notebook has already: renaming to it fails and says so.
  await app.noteTitle.fill("README");
  // What Chromium sends when Enter commits a composition: a keydown flagged
  // as composing, then a plain keyup once the composition has ended.
  await app.noteTitle.evaluate((input) => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }),
    );
  });
  await expect(app.noteTitle).toBeFocused();
  await expect(app.noteTitle).toHaveValue("README");

  // The title is still being typed. A rename started by that Enter would
  // have failed, and said so, long before this one is stored.
  await app.noteTitle.fill("Renamed");
  await app.noteTitle.press("Enter");
  await expect(app.tab("Renamed")).toBeVisible();
  await app.waitUntilStored(`${await app.notebookFolder()}/Renamed.md`);
  expect(await messages()).toEqual([]);
});
