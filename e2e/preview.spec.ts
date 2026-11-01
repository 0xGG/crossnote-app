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
