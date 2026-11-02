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
  // Set rather than typed: typing "[[" would open the wikilink hints.
  await app.setEditorText(
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

// Stands in for reveal.js in the slides' frame: initialize says the deck is
// ready, as reveal.js does once it has laid the slides out.
const revealStub = `window.Reveal = (function () {
  var ready = [];
  return {
    initialize: function () {
      setTimeout(function () {
        var slide = document.querySelector(".slides section");
        ready.forEach(function (listener) {
          try {
            listener({ currentSlide: slide, indexh: 0, indexv: 0 });
          } catch (error) {}
        });
      });
    },
    addEventListener: function (type, listener) {
      if (type === "ready") ready.push(listener);
    },
    slide: function () {},
  };
})();`;

test("draws wavedrom in slides from JSON, and runs nothing a note makes look like it", async ({
  app,
  context,
}) => {
  // Registered after the refusal above, so these answer first: reveal.js's
  // stand-in, and the wavedrom the slides ask the CDN for, from the site's
  // copy of the same version.
  await context.route(/reveal\.js@3\.9\.2\/js\/reveal\.min\.js$/, (route) =>
    route.fulfill({ contentType: "text/javascript", body: revealStub }),
  );
  await context.route(
    /wavedrom@2\.3\.2\/(wavedrom\.min|skins\/default)\.js$/,
    (route) =>
      route.fulfill({
        path: `public/deps/wavedrom/${route.request().url().split("wavedrom@2.3.2/")[1]}`,
      }),
  );
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    [
      "<!-- slide -->",
      "",
      "[[Other]]",
      "",
      "```wavedrom",
      '{ "signal": [{ "name": "clk", "wave": "p..." }] }',
      "```",
      "",
      '<div class="vickeymd-fence wavedrom">window.fromFence = 1</div>',
      "",
      '<a type="WaveDrom">({ signal: [], x: (window.fromAnchor = 1) })</a>',
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();

  const deck = app.preview.frameLocator("iframe");
  await expect(deck.locator("#WaveDrom_Display_0 svg")).toBeVisible();
  // The deck is finished once reveal.js is ready: its links open notes.
  await expect
    .poll(() =>
      deck
        .getByRole("link", { name: "Other" })
        .evaluate((link: HTMLAnchorElement) => link.onclick !== null),
    )
    .toBe(true);
  expect(
    await deck
      .locator("body")
      .evaluate(() => [(window as any).fromFence, (window as any).fromAnchor]),
  ).toEqual([undefined, undefined]);
});

test("draws a vega-lite chart without the actions that open other windows", async ({
  app,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // The chart names an editor of its own, and HTML to write around its
  // source; neither the editor nor the source is offered.
  await app.setEditorText(
    [
      "```vega-lite",
      "usermeta:",
      "  embedOptions:",
      "    editorUrl: https://example.org/",
      '    sourceHeader: "<script>opener.fromHeader = 1</script>"',
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
  await expect(actions.filter({ hasText: "View Source" })).toHaveCount(0);
  await expect(actions.filter({ hasText: "View Compiled Vega" })).toHaveCount(
    0,
  );
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

test("draws a kanban card's description through the same sanitizing", async ({
  app,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  // echomd's own filter lets a form through; the preview's sanitizing does
  // not, and a card's description is drawn the same way.
  const card = {
    id: 2,
    title: "C",
    description:
      '[[Other]]\n\n<form action="javascript:alert(1)"><input value="kept"></form>\n',
  };
  const board = { columns: [{ id: 1, title: "A", cards: [card] }] };
  await app.setEditorText(
    `<!-- @crossnote.kanban "board":${JSON.stringify(board)} -->\n`,
  );
  await app.modeButton("Preview").click();

  const description = app.preview.locator(".preview").filter({
    has: app.page.locator('input[value="kept"]'),
  });
  await expect(description.getByRole("link", { name: "Other" })).toBeVisible();
  await expect(description.locator("form")).toHaveCount(0);
});
