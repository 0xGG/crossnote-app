import { expect, test } from "./fixtures";

// Requests that would leave the machine are refused.
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.abort(),
  );
});

test("draws a note that was a deck of slides as any other note", async ({
  app,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // Set rather than typed: typing "[[" would open the wikilink hints.
  await app.setEditorText(
    "<!-- slide -->\n\n[[Other]]\n\n<!-- slide -->\n\n```mermaid\ngraph TD; A-->B\n```\n",
  );
  await app.modeButton("Preview").click();

  // No frame: the diagram is drawn in the preview itself, and its links
  // open notes.
  await expect(app.preview.locator(".mermaid svg")).toBeVisible();
  await expect(app.preview.locator("iframe")).toHaveCount(0);
  await expect(app.preview).not.toContainText("slide");
  await expect
    .poll(() =>
      app.preview
        .getByRole("link", { name: "Other" })
        .evaluate((link: HTMLAnchorElement) => link.onclick !== null),
    )
    .toBe(true);
});

test("shows the comments the widgets that are gone left in a note as text in the editor, and not at all in the preview", async ({
  app,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();

  // In the editor a comment typed in is the text it is, not folded into
  // anything: the YouTube widget showed a thumbnail, and echomd folds into
  // widgets of its own a comment whose attributes it cannot read and one
  // named hello.
  await app.typeInEditor(
    '<!-- @crossnote.youtube "videoID":"abc" -->\n\n<!-- @hello -->\n\n<!-- @broken "a":b -->\n\n',
  );
  await expect(app.editor).toContainText("@crossnote.youtube");
  await expect(app.editor).toContainText("@hello");
  await expect(app.editor).toContainText("@broken");
  await expect(app.editor.getByRole("img")).toHaveCount(0);

  const kanban =
    '<!-- @crossnote.kanban "board":{"columns":[{"title":"Column","cards":[{"title":"Card"}]}]} -->';
  const text = [
    "Before.",
    '<!-- @crossnote.youtube "videoID":"abc" -->',
    kanban,
    '<!-- @timer "date":"Sat Nov 07 2026 10:00:00 GMT+0800" -->',
    "After.",
    "",
  ].join("\n\n");
  await app.setEditorText(text);

  await app.modeButton("Preview").click();
  await expect(app.preview).toContainText("After.");
  await expect(app.preview).not.toContainText("Column");
  await expect(app.preview).not.toContainText("2026");
  await expect(app.preview.locator("img, iframe, input")).toHaveCount(0);

  await app.modeButton("Edit").click();
  expect(await app.editorText()).toBe(text);
});

test("draws a note's emoji from the sheet", async ({ app, page }) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText("Hello :smile: there\n");
  await app.modeButton("Preview").click();

  // The short name becomes the emoji, drawn as an image named by the emoji
  // whose background is its place in the sheet.
  const emoji = app.preview.locator(".emoji");
  await expect(emoji).toHaveCount(1);
  await expect(emoji).toHaveJSProperty("tagName", "IMG");
  await expect(emoji).toHaveAttribute("alt", "😄");
  await expect(emoji).toHaveCSS(
    "background-image",
    `url("${new URL("/assets/emoji/twitter/64.png", page.url()).href}")`,
  );
  await expect(emoji).toHaveCSS("background-position", "53.5714% 69.6429%");
});

test("prints a note with its local images and page breaks", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  // Any file of the notebook stands in for a picture, as the preview reads
  // it as one: here the note itself.
  const readme = `${await app.notebookFolder()}/README.md`;
  await app.storedText(
    readme,
    "![picture](README.md)\n\nBefore.\n\n<!-- pagebreak -->\n\nAfter.\n",
  );
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();

  // What the page holds when the print dialog would open.
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => {
    window.print = () => {
      // The note printed covers the page from the end of the body.
      const printed = Array.from(document.body.children)
        .filter((element) => element.classList.contains("preview"))
        .pop()!;
      (window as any).printed = {
        image: printed.querySelector("img")!.getAttribute("src"),
        breakAfter: getComputedStyle(printed.querySelector(".pagebreak")!)
          .breakAfter,
      };
    };
  });
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Print" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).printed), {
      timeout: 15000,
    })
    .toEqual({
      image: expect.stringMatching(/^data:image\/md;base64,/),
      breakAfter: "page",
    });
});

test("colours the preview in the theme chosen in the settings, and the editor's stylesheet with it", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  const title = await app.noteTitle.inputValue();
  await app.setEditorText("Some text.\n\n```js\n// a comment\n```\n");
  await app.modeButton("Preview").click();
  const comment = app.preview.locator("pre .token.comment");
  await expect(app.preview).toHaveCSS("color", "rgb(51, 51, 51)");
  await expect(comment).toHaveCSS("color", "rgb(150, 152, 150)");

  await app.openSettings();
  await page
    .getByRole("combobox")
    .filter({ hasText: /^light$/ })
    .click();
  await page.getByRole("option", { name: "one-dark" }).click();
  await app.selectTab(title);
  // One Dark's text, and a comment in its code blocks.
  await expect(app.preview).toHaveCSS("color", "rgb(171, 178, 191)");
  await expect(comment).toHaveCSS("color", "rgb(92, 99, 112)");
  await expect(page.locator("#echomd-editor-theme")).toHaveAttribute(
    "href",
    /\/editor_themes\/one-dark\.css$/,
  );
});

test("prints a note light in a dark theme, and leaves the preview on the page dark", async ({
  app,
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("settings/theme", "dark");
    // The text's colour and a comment's in code, as a preview shows them.
    (window as any).colours = (preview: Element) => ({
      text: getComputedStyle(preview).color,
      comment: getComputedStyle(preview.querySelector("pre .token.comment")!)
        .color,
    });
  });
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText("Some text.\n\n```js\n// a comment\n```\n");
  await app.modeButton("Preview").click();
  await expect(app.preview.locator("pre .token.comment")).toBeVisible();
  const dark = await app.preview.evaluate((preview) =>
    (window as any).colours(preview),
  );
  expect(dark).toEqual({
    text: "rgb(212, 212, 212)",
    comment: "rgb(117, 113, 94)",
  });
  const light = { text: "rgb(51, 51, 51)", comment: "rgb(150, 152, 150)" };

  await page.evaluate(() => {
    window.print = () => {
      const printed = Array.from(document.body.children)
        .filter((element) => element.classList.contains("preview"))
        .pop()!;
      const shown = document.querySelector('[data-testid="note-preview"]')!;
      (window as any).printed = {
        printed: (window as any).colours(printed),
        shown: (window as any).colours(shown),
      };
    };
  });
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Print" }).click();
  // Printed in the light theme's colours, while the preview on the page
  // keeps the dark's.
  await expect
    .poll(() => page.evaluate(() => (window as any).printed), {
      timeout: 15000,
    })
    .toEqual({ printed: light, shown: dark });
});
