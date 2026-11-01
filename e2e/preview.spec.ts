import { expect, test } from "./fixtures";

// Requests that would leave the machine are refused: reveal.js, which the
// slides load from a CDN, does not arrive, and the deck is drawn without it.
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.abort(),
  );
});

test("draws a deck of slides with a diagram in it", async ({ app }) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.typeInEditor(
    "<!-- slide -->\n\n[[Other]]\n\n```mermaid\ngraph TD; A-->B\n```\n",
  );
  await app.modeButton("Preview").click();

  // The deck's frame stays, and the slides' own mermaid draws the diagram in
  // it. The preview used to read the frame's body before the scripts in its
  // head had loaded, fail, and show the error in place of the deck.
  const deck = app.preview.frameLocator("iframe");
  await expect(deck.locator(".mermaid svg")).toBeVisible();
  await expect(app.preview).not.toContainText("TypeError");
  // Links in the deck open notes, as the preview's do.
  await expect
    .poll(() =>
      deck
        .getByRole("link", { name: "Other" })
        .evaluate((link: HTMLAnchorElement) => link.onclick !== null),
    )
    .toBe(true);
});

test("draws a vega-lite chart without a way to open it on another site", async ({
  app,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // The chart names an editor of its own; neither it nor vega's is offered.
  await app.setEditorText(
    [
      "```vega-lite",
      "usermeta:",
      "  embedOptions:",
      "    editorUrl: https://example.org/",
      "data:",
      "  values:",
      "    - a: 1",
      "mark: point",
      "encoding:",
      "  x:",
      "    field: a",
      "    type: quantitative",
      "```",
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();

  const actions = app.preview.locator(".vega-embed .vega-actions a");
  await expect(actions.filter({ hasText: "Save as SVG" })).toHaveCount(1);
  await expect(app.preview.locator(".vega-embed canvas")).toBeVisible();
  await expect(actions.filter({ hasText: "Vega Editor" })).toHaveCount(0);
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
