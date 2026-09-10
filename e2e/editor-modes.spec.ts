import type { Page } from "@playwright/test";
import type CodeMirror from "codemirror";
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
  const lastLine = app.editor.locator(".CodeMirror-line").last();
  // Indentation has to be read from the editor itself: toHaveText trims it.
  const lastLineText = () =>
    app.editor.evaluate((editor) => {
      const cm = (editor as HTMLElement & { CodeMirror: CodeMirror.Editor })
        .CodeMirror;
      return cm.getLine(cm.lastLine());
    });
  await app.editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("one");
  await expect(lastLine).toHaveText("one");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("two");
  await expect(lastLine).toHaveText("two");
  await page.keyboard.press("Tab");
  await page.keyboard.type("three");
  await expect(lastLine).toHaveText(/^two\s+three$/);
  await expect(app.editorInput).toBeFocused();
  // Shift+Tab takes one indent unit off the line each time; the probe leaves
  // the line unindented so that Enter copies no indentation later on.
  await page.keyboard.press("Enter");
  await page.keyboard.type("    four");
  await expect.poll(lastLineText).toBe("    four");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(lastLineText).toBe("  four");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(lastLineText).toBe("four");
  await page.keyboard.type("!");
  await expect.poll(lastLineText).toBe("four!");
  await expect(app.editorInput).toBeFocused();
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

  // Edit is the default: the editor folds markup as you type, so the
  // emphasis markers around "by" are hidden tokens.
  const markers = app.editor.locator(".cm-formatting-strong");
  await expect(markers).toHaveCount(2);
  await expect(markers.first()).toHaveClass(/hmd-hidden-token/);

  // Preview renders the markdown and puts the editor away.
  await app.modeButton("Preview").click();
  await expect(app.editor).toBeHidden();
  await expect(app.preview.getByRole("heading", { level: 1 })).toHaveText(
    "Hello from Playwright",
  );
  await expect(app.preview.locator("strong")).toHaveText("by");

  // Source code shows the markdown as written: no preview, nothing folded.
  await app.modeButton("Source code").click();
  await expect(app.editor).toBeVisible();
  await expect(app.preview).toHaveCount(0);
  await expect(markers.first()).not.toHaveClass(/hmd-hidden-token/);

  // And back to the folding editor.
  await app.modeButton("Edit").click();
  await expect(markers.first()).toHaveClass(/hmd-hidden-token/);
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

  const heading = app.editor
    .locator(".CodeMirror-line")
    .filter({ hasText: "Hello from Playwright" });
  // The heading line's font size relative to a paragraph line, read in one
  // go: CodeMirror redraws line nodes freely, so two separate reads could
  // straddle a redraw.
  const headingScale = () =>
    app.editor.evaluate((editor) => {
      const fontSize = (text: string) => {
        const line = Array.from(
          editor.querySelectorAll(".CodeMirror-line"),
        ).find((candidate) => candidate.textContent?.includes(text));
        return line ? parseFloat(getComputedStyle(line).fontSize) : NaN;
      };
      return fontSize("Hello from Playwright") / fontSize("a robot");
    });

  // Styled source is the default: the heading line keeps its typography.
  await app.modeButton("Source code").click();
  await expect(heading).toHaveClass(/HyperMD-header-1/);
  await expect.poll(headingScale).toBeGreaterThan(1);

  // Switching the setting on reaches the note that is already open.
  await app.openSettings();
  await app.plainTextSourceCodeSwitch.check();
  await noteTab.click();
  await expect(heading).not.toHaveClass(/HyperMD-header/);
  await expect.poll(headingScale).toBe(1);
  // Syntax colors stay and the markers are part of the text.
  await expect(app.editor.locator(".cm-header")).not.toHaveCount(0);
  await expect(app.editor.locator(".cm-strong")).toHaveText("**by**");
  // The editing keys keep working without the HyperMD parser behind them.
  await probeEditingKeys(page, app, pageErrors);
  // Ctrl+B still toggles emphasis around the selection.
  const lastLine = app.editor.locator(".CodeMirror-line").last();
  await page.keyboard.press("Enter");
  await page.keyboard.type("bold");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Control+b");
  await expect(lastLine).toHaveText("**bold**");
  await page.keyboard.press("Control+b");
  await expect(lastLine).toHaveText("bold");
  expect(pageErrors).toEqual([]);

  // The folding editor is not affected.
  await app.modeButton("Edit").click();
  await expect(app.editor.locator(".cm-formatting-strong").first()).toHaveClass(
    /hmd-hidden-token/,
  );
  await probeEditingKeys(page, app, pageErrors);
  await app.modeButton("Source code").click();
  await expect(heading).not.toHaveClass(/HyperMD-header/);

  // The setting is remembered across a reload.
  await page.reload();
  await app.waitUntilReady();
  await app.openSettings();
  await expect(app.plainTextSourceCodeSwitch).toBeChecked();
  await noteTab.click();
  await app.modeButton("Source code").click();
  await expect(heading).not.toHaveClass(/HyperMD-header/);
  // The table of contents is rebuilt from the plain text parser state, so a
  // heading typed now has to show up in it.
  await app.editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\n## Second heading");
  await expect(
    page.locator(".toc-item").filter({ hasText: "Second heading" }),
  ).toBeVisible();

  // Switching it off brings the styled source back, keys included.
  await app.openSettings();
  await app.plainTextSourceCodeSwitch.uncheck();
  await noteTab.click();
  await expect(heading).toHaveClass(/HyperMD-header-1/);
  await probeEditingKeys(page, app, pageErrors);
});

test("keeps headings inside fenced code out of the table of contents", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  const tocItem = (text: string) =>
    page.locator(".toc-item").filter({ hasText: text });

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
  await expect(tocItem("After the fence")).toBeVisible();
  await expect(tocItem("Real heading")).toBeVisible();
  await expect(tocItem("Example inside fenced code")).toHaveCount(0);

  // Plain text source code parses the fence with its own mode as well.
  const noteTab = app.tab(await app.noteTitle.inputValue());
  await app.openSettings();
  await app.plainTextSourceCodeSwitch.check();
  await noteTab.click();
  await app.modeButton("Source code").click();
  await expect(
    app.editor.locator(".CodeMirror-line").filter({ hasText: "Real heading" }),
  ).not.toHaveClass(/HyperMD-header/);
  await app.editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Plain text heading");
  await expect(tocItem("Plain text heading")).toBeVisible();
  await expect(tocItem("Real heading")).toBeVisible();
  await expect(tocItem("Example inside fenced code")).toHaveCount(0);
});
