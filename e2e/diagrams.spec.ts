import { expect, test } from "./fixtures";

// The code blocks the preview draws, each kind with what the app brings for
// it: nothing from the site's /deps folder, and nothing the page's content
// security policy refuses. Requests that would leave the machine are
// refused.
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.abort(),
  );
});

test("highlights a code block in its language", async ({ app }) => {
  const violations = await app.recordPolicyViolations();
  const vendored = app.recordVendoredRequests("prism");
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    "```python\ndef f():\n    pass\n```\n\n```nonesuch\n<b>x</b>\n```\n",
  );
  await app.modeButton("Preview").click();

  await expect(
    app.preview.locator("pre.language-python .token.keyword"),
  ).toHaveText(["def", "pass"]);
  await expect(app.preview.locator("pre.language-text")).toHaveText("<b>x</b>");
  expect(vendored()).toEqual([]);
  expect(await violations()).toEqual([]);
});
