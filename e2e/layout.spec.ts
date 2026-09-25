import { readFileSync } from "node:fs";
import type CodeMirror from "codemirror";
import { expect, test } from "./fixtures";
import { layoutOf, noteTab, row, tabset } from "./layouts";

// A layout the app saved under flexlayout-react 0.5.21 (the unit tests read
// the same file; src/lib/layout.test.ts says how it was made). It names a
// made-up notebook folder, swapped here for the one this run creates.
const savedByOldEngine = readFileSync(
  new URL("../src/lib/layout-0.5.21.json", import.meta.url),
  "utf8",
);

test("restores a layout saved by the previous layout engine", async ({
  app,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.open();
  // Opening the notes list saves a layout that names the notebook's folder.
  await app.openNotes();
  const folder = await app.notebookFolder();
  await app.seedLayout(
    savedByOldEngine.replaceAll("/notebooks/fixture-drafts", folder),
  );
  // The note the layout opens has to have reached the disk.
  await app.waitUntilStored(`${folder}/README.md`);
  await page.reload();
  await app.waitUntilReady();

  // Every tab comes back with its icon...
  await expect(app.tab("README")).toHaveCount(2);
  await expect(app.tab("README").first().getByLabel(/memo/)).toBeVisible();
  await expect(
    app.tab("Drafts").getByLabel(/notebook_with_decorative_cover/),
  ).toBeVisible();
  await expect(app.tab("Settings").getByLabel(/gear/)).toBeVisible();
  await expect(app.tab("Graph view").getByLabel(/spider_web/)).toBeVisible();

  // ...each tabset shows what it showed: the note, the settings, the graph...
  await expect(app.tab("README").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(app.tab("Drafts")).toHaveAttribute("aria-selected", "false");
  await expect(app.tab("Settings")).toHaveAttribute("aria-selected", "true");
  await expect(app.tab("Graph view")).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: /Welcome to Crossnote/ }),
  ).toBeVisible();
  await expect(app.plainTextSourceCodeSwitch).toBeVisible();

  // ...in the same three panes, with the sizes the app had: a 24px tab strip
  // (the library sizes it by content now) and 4px splitters.
  const splitters = page.getByRole("separator", { name: "Resize" });
  await expect(splitters).toHaveCount(2);
  const strip = await page.getByRole("tablist").first().boundingBox();
  expect(strip!.height).toBe(24);
  const splitter = await splitters.first().boundingBox();
  expect(Math.min(splitter!.width, splitter!.height)).toBe(4);
  expect(errors).toEqual([]);

  // A change saves the layout again, without the sizes that moved to CSS.
  await app.selectTab("Drafts");
  const savedLayout = () =>
    page.evaluate(() => localStorage.getItem("layoutModel")!);
  await expect.poll(savedLayout).not.toContain("splitterSize");
  expect(JSON.parse(await savedLayout()).global).toEqual({
    tabEnableRename: false,
    tabSetEnableMaximize: false,
  });
});

test("goes to the reference a note already open is opened at", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  const title = await app.noteTitle.inputValue();
  const line = "See [[README]] here.";
  // Through CodeMirror: typing "[[" would open the wikilink hints.
  await app.editor.evaluate(
    (element, text) =>
      (
        element as HTMLElement & { CodeMirror: CodeMirror.Editor }
      ).CodeMirror.setValue(text),
    `Intro line.\n\n${line}\n`,
  );
  await app.modeButton("Preview").click();

  // The note goes behind the notes list, and README opens in the same pane.
  await app.selectTab("Drafts");
  // The editor writes the note a moment after the change, and README reads
  // its references when it opens; a list opened before the write catches up
  // only on its next refresh, 15 seconds on. The note's card shows the new
  // text once the write is done.
  await expect(app.noteCards.filter({ hasText: `${title}.md` })).toContainText(
    "Intro line.",
  );
  await app.noteCards
    .filter({ hasText: "README.md" })
    .getByText("README", { exact: true })
    .click();
  await expect(app.tab("README")).toHaveAttribute("aria-selected", "true");

  // README's references show the line; clicking it brings the note back
  // with the line marked.
  const reference = page.getByText(line, { exact: true }).filter({
    visible: true,
  });
  await expect(reference).toBeVisible({ timeout: 15000 });
  await reference.click();
  await expect(app.tab(title)).toHaveAttribute("aria-selected", "true");
  await expect(
    app.preview.filter({ visible: true }).locator(".reference-highlight"),
  ).toBeVisible();
});

test("keeps a long tab name from scrolling the layout sideways", async ({
  app,
  page,
}) => {
  // 230 characters, far wider than the panel.
  const name = Array(4)
    .fill("A title that runs on well past the width of the panel")
    .join(", and ");
  await app.seedLayout(layoutOf(row(tabset(noteTab("long", name)))));
  await app.open();
  await expect(app.tab(name)).toBeVisible();
  const overflow = await page
    .locator("#main-panel")
    .evaluate((panel) => panel.scrollWidth - panel.clientWidth);
  expect(overflow).toBe(0);
});

test("opens a note next to a group of tabs", async ({ app, page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.seedLayout(
    layoutOf(row(tabset({ type: "tabgroup", children: [noteTab("grouped")] }))),
  );
  await app.open();
  await app.openNotes();
  await app.noteCards
    .filter({ hasText: "README.md" })
    .getByText("README", { exact: true })
    .click();
  await expect(app.tab("README")).toBeVisible();
  expect(errors).toEqual([]);
});

test("takes key events without a key in its stride", async ({ app, page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.open();
  await app.openSettings();
  // A browser's autofill can send one as it fills in a field.
  await page
    .getByRole("textbox", { name: "Author name" })
    .evaluate((field) =>
      field.dispatchEvent(new Event("keydown", { bubbles: true })),
    );
  await expect(app.plainTextSourceCodeSwitch).toBeVisible();
  expect(errors).toEqual([]);
});
