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
});

test.describe("hostile markup in a diagram", () => {
  // The browser reports the handler in the label as refused while the
  // sanitizer parses it, inert.
  test.use({ expectPolicyViolations: ["script-src-attr"] });

  test("draws a mermaid diagram with a formula in it, drawn by KaTeX", async ({
    app,
    page,
  }) => {
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
  });
});

// The libraries behind these diagrams (cytoscape among them) were built to
// find the global object with Function("return this")(), code made from
// text that the page's policy refuses; they look at self first, so the
// policy has nothing to refuse while they draw.
test("draws an architecture diagram and a mindmap within the page's policy", async ({
  app,
}) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    [
      "```mermaid",
      "architecture-beta",
      "  group api(cloud)[API]",
      "  service db(database)[Database] in api",
      "  service server(server)[Server] in api",
      "  db:L -- R:server",
      "```",
      "",
      "```mermaid",
      "mindmap",
      "  root((Root))",
      "    Branch A",
      "    Branch B",
      "```",
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();
  // The architecture diagram's icons are SVGs of their own, inside its own.
  await expect(app.preview.locator(".mermaid > svg")).toHaveCount(2, {
    timeout: 20000,
  });
  await expect(app.preview.locator(".language-error")).toHaveCount(0);
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
