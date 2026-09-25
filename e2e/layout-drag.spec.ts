import type { Locator, Page } from "@playwright/test";
import type CodeMirror from "codemirror";
import { expect, test } from "./fixtures";
import { layoutOf, noteTab, row, settingsTab, tabset } from "./layouts";

// Tabs are dragged with the HTML drag and drop API, the one the panes use for
// their own drag and drop too. These drag the way a hand does, in a stream of
// moves, unless a spec says otherwise.

async function centre(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Moves the selected text of one field into another.
async function dragText(page: Page, from: Locator, to: Locator) {
  await from.selectText();
  const start = (await from.boundingBox())!;
  const end = (await to.boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + 30, end.y + end.height / 2, { steps: 10 });
  await page.mouse.up();
}

const editorState = (editor: Locator) =>
  editor.evaluate((element) => {
    const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor })
      .CodeMirror;
    return { text: cm.getValue(), selection: cm.getSelection() };
  });

test("keeps a tab dropped on a note out of the note", async ({ app }) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor("Written before the drop");
  await app.editor.evaluate((element) =>
    (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      // "before"
      .setSelection({ line: 0, ch: 8 }, { line: 0, ch: 14 }),
  );

  // One step from the tab strip onto the editor, so the drop lands before
  // the layout has covered the panes with its overlay.
  await app.tab("Drafts").dragTo(app.editor);
  expect(await editorState(app.editor)).toEqual({
    text: "Written before the drop",
    selection: "before",
  });
});

test("docks a tab brought back over a note's text in one sweep", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor("One\nTwo\nThree\nFour\nFive");
  const tab = await centre(app.tab("Drafts"));
  const text = (await app.editor.locator(".CodeMirror-scroll").boundingBox())!;
  const lineY = text.y + 30;

  await page.mouse.move(tab.x, tab.y);
  await page.mouse.down();
  await page.mouse.move(tab.x, tab.y + 40, { steps: 5 });
  // Out of the layout, over the sidebar...
  await page.mouse.move((await centre(app.sidebar)).x, lineY, { steps: 10 });
  // ...and back straight onto the text, across the lines, to the right edge
  // of the pane.
  await page.mouse.move(text.x + 40, lineY);
  await page.mouse.move(text.x + 200, lineY + 60, { steps: 10 });
  const pane = (await page.locator(".flexlayout__tabset").boundingBox())!;
  await page.mouse.move(pane.x + pane.width - 20, pane.y + pane.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.locator(".flexlayout__tabset")).toHaveCount(2);
});

test("shows where a tab will land after text was dropped in a pane", async ({
  app,
  page,
}) => {
  await app.seedLayout(
    layoutOf(row(tabset(settingsTab), tabset(noteTab("elsewhere")))),
  );
  await app.open();
  const name = page.getByRole("textbox", { name: "Author name" });
  const email = page.getByRole("textbox", { name: "Author email" });
  await name.fill("");
  await email.fill("someone@example.com");
  await dragText(page, email, name);
  await expect(name).toHaveValue("someone@example.com");

  const tab = await centre(app.tab("elsewhere"));
  const settings = await centre(page.locator(".flexlayout__tabset").first());
  await page.mouse.move(tab.x, tab.y);
  await page.mouse.down();
  await page.mouse.move(settings.x, settings.y, { steps: 12 });
  await page.mouse.move(settings.x + 5, settings.y + 5, { steps: 3 });
  await expect(
    page.locator(".flexlayout__outline_rect, .flexlayout__outline_rect_edge"),
  ).toBeVisible();
  await page.mouse.up();
});

test("keeps the tabs in the hidden tabs menu where they are", async ({
  app,
  page,
}) => {
  const many = Array.from({ length: 15 }, (_, i) => noteTab(`tab ${i}`));
  await app.seedLayout(
    layoutOf(
      row(
        { ...tabset(settingsTab), weight: 80 },
        { ...tabset(...many), weight: 20 },
      ),
    ),
  );
  await app.open();
  const tabsets = page.locator(".flexlayout__tabset");
  await expect(tabsets).toHaveCount(2);

  // A tab pulled out of the menu and let go over the sidebar...
  await page.getByRole("button", { name: "Hidden tabs" }).click();
  const item = await centre(page.getByRole("menuitem").first());
  await page.mouse.move(item.x, item.y);
  await page.mouse.down();
  await page.mouse.move(item.x - 30, item.y + 10, { steps: 5 });
  await page.mouse.move((await centre(app.sidebar)).x, 400, { steps: 15 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  // ...leaves the next drag, of text in the settings, to go where it goes.
  const name = page.getByRole("textbox", { name: "Author name" });
  const email = page.getByRole("textbox", { name: "Author email" });
  await name.fill("");
  await email.fill("someone@example.com");
  await dragText(page, email, name);
  await expect(name).toHaveValue("someone@example.com");
  await expect(tabsets).toHaveCount(2);
});
