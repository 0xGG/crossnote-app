import type { Page } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";

// Presses the editing keys the app rebinds and checks what a user sees: the
// text they produce, the caret staying in the editor and no uncaught error.
// Types at the end of the note.
async function probeEditingKeys(
  page: Page,
  app: CrossnoteApp,
  pageErrors: string[],
) {
  // Read from the text the editor holds, indentation and all.
  const lastLine = async () => (await app.editorText()).split("\n").pop();
  await app.editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("one");
  await expect.poll(lastLine).toBe("one");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("two");
  await expect.poll(lastLine).toBe("two");
  await page.keyboard.press("Tab");
  await page.keyboard.type("three");
  await expect.poll(lastLine).toMatch(/^two\s+three$/);
  expect(await app.editorHasFocus()).toBe(true);
  // Shift+Tab takes one indent unit off the line each time; the probe leaves
  // the line unindented so that Enter copies no indentation later on.
  await page.keyboard.press("Enter");
  await page.keyboard.type("    four");
  await expect.poll(lastLine).toBe("    four");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(lastLine).toBe("  four");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(lastLine).toBe("four");
  await page.keyboard.type("!");
  await expect.poll(lastLine).toBe("four!");
  expect(await app.editorHasFocus()).toBe(true);
  expect(pageErrors).toEqual([]);
}

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
  await expect.poll(() => app.editorText()).toContain("Written **by** a robot");

  // Edit is the default: the editor folds markup as you type, so the
  // emphasis markers around "by" are not shown.
  await expect(app.modeOn).toHaveAccessibleName("Edit");
  await expect.poll(() => app.markupShown("**")).toBe(0);

  // Preview renders the markdown and puts the editor away.
  await app.modeButton("Preview").click();
  await expect(app.modeOn).toHaveAccessibleName("Preview");
  await expect(app.editor).toBeHidden();
  await expect(app.preview.getByRole("heading", { level: 1 })).toHaveText(
    "Hello from Playwright",
  );
  await expect(app.preview.locator("strong")).toHaveText("by");

  // Source code shows the markdown as written: no preview, nothing folded.
  await app.modeButton("Source code").click();
  await expect(app.modeOn).toHaveAccessibleName("Source code");
  await expect(app.editor).toBeVisible();
  await expect(app.preview).toHaveCount(0);
  await expect.poll(() => app.markupShown("**")).toBe(2);

  // And back to the folding editor.
  await app.modeButton("Edit").click();
  await expect(app.modeOn).toHaveAccessibleName("Edit");
  await expect.poll(() => app.markupShown("**")).toBe(0);
});

test("shows source code as plain text once the setting is on", async ({
  app,
  page,
}) => {
  // Walks through three editor states with a key probe in each and a reload
  // in between; a slower browser needs more than the default timeout.
  test.slow();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor("# Hello from Playwright");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Written **by** a robot");
  // The tab strip names the note after its file, so remember which tab it is
  // before leaving for the settings tab.
  const noteTab = app.tab(await app.noteTitle.inputValue());
  await expect(noteTab).toBeVisible();
  const heading = () => app.lineScale("Hello from Playwright");

  // Styled source is the default: the heading line keeps its typography.
  await app.modeButton("Source code").click();
  await expect.poll(heading).toBeGreaterThan(1);

  // Switching the setting on reaches the note that is already open.
  await app.openSettings();
  await app.plainTextSourceCodeSwitch.check();
  await noteTab.click();
  await expect.poll(heading).toBe(1);
  // Syntax colors stay and the markers are part of the text.
  await expect
    .poll(() => app.tokenTypes("Hello from Playwright"))
    .toContain("header");
  await expect.poll(() => app.tokenTypes("**by**")).toContain("strong");
  // The editing keys keep working without the HyperMD parser behind them.
  await probeEditingKeys(page, app, pageErrors);
  // Ctrl+B still toggles emphasis around the selection.
  const lastLine = async () => (await app.editorText()).split("\n").pop();
  await page.keyboard.press("Enter");
  await page.keyboard.type("bold");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Control+b");
  await expect.poll(lastLine).toBe("**bold**");
  await page.keyboard.press("Control+b");
  await expect.poll(lastLine).toBe("bold");
  expect(pageErrors).toEqual([]);

  // The folding editor is not affected.
  await app.modeButton("Edit").click();
  await expect.poll(() => app.markupShown("**")).toBe(0);
  await probeEditingKeys(page, app, pageErrors);
  await app.modeButton("Source code").click();
  await expect.poll(heading).toBe(1);

  // The setting is remembered across a reload.
  await page.reload();
  await app.waitUntilReady();
  await app.openSettings();
  await expect(app.plainTextSourceCodeSwitch).toBeChecked();
  await noteTab.click();
  await app.modeButton("Source code").click();
  await expect.poll(heading).toBe(1);
  // The table of contents is rebuilt from the plain text parser state, so a
  // heading typed now has to show up in it.
  await app.editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\n## Second heading");
  await expect(app.tocItem("Second heading")).toBeVisible();

  // Switching it off brings the styled source back, keys included.
  await app.openSettings();
  await app.plainTextSourceCodeSwitch.uncheck();
  await noteTab.click();
  await expect.poll(heading).toBeGreaterThan(1);
  await probeEditingKeys(page, app, pageErrors);
});

test("keeps headings inside fenced code out of the table of contents", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();

  await app.typeInEditor("# Real heading");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```markdown");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Example inside fenced code");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## After the fence");
  // Once the table of contents has caught up with the last heading, the one
  // inside the fence must not be there.
  await expect(app.tocItem("After the fence")).toBeVisible();
  await expect(app.tocItem("Real heading")).toBeVisible();
  await expect(app.tocItem("Example inside fenced code")).toHaveCount(0);

  // Plain text source code parses the fence with its own mode as well.
  const noteTab = app.tab(await app.noteTitle.inputValue());
  await app.openSettings();
  await app.plainTextSourceCodeSwitch.check();
  await noteTab.click();
  await app.modeButton("Source code").click();
  await expect.poll(() => app.lineScale("Real heading")).toBe(1);
  await app.editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Plain text heading");
  await expect(app.tocItem("Plain text heading")).toBeVisible();
  await expect(app.tocItem("Real heading")).toBeVisible();
  await expect(app.tocItem("Example inside fenced code")).toHaveCount(0);
});
