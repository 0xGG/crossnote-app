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

test("draws a mermaid diagram with a formula in it, drawn by KaTeX", async ({
  app,
  page,
}) => {
  const violations = await app.recordPolicyViolations();
  const vendored = app.recordVendoredRequests("mermaid");
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    [
      "```mermaid",
      "graph TD",
      '  A["Start"] --> B["$$x^2$$"]',
      '  B --> C["<img src=x onerror=window.fromMermaid=1>"]',
      "```",
      "",
      "```mermaid",
      "not a diagram",
      "```",
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();

  const diagram = app.preview.locator("svg", { hasText: "Start" });
  await expect(diagram).toBeVisible();
  // The formula is KaTeX's, the same the notes' math is drawn with.
  await expect(diagram.locator(".katex")).toHaveCount(1);
  // What mermaid cannot read says so in its place.
  await expect(app.preview.locator(".language-error")).toBeVisible();
  // HTML in a label brings no handler into the page.
  expect(
    await diagram.evaluate((svg) =>
      [svg, ...svg.querySelectorAll("*")].flatMap((element) =>
        element.getAttributeNames().filter((name) => /^on/i.test(name)),
      ),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).fromMermaid),
  ).toBeUndefined();
  expect(vendored()).toEqual([]);
  expect(await violations()).toEqual([]);
});

test("loads no library from the site's /deps folder but CodeMirror's languages", async ({
  app,
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (
      pathname.startsWith("/deps/") &&
      !pathname.startsWith("/deps/codemirror@")
    ) {
      requested.push(pathname);
    }
  });
  await app.open();
  await app.openNotes();
  expect(requested).toEqual([]);
});
