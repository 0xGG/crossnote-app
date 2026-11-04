import type { Locator } from "@playwright/test";
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

// Puts the pointer over a chart until its tooltip shows: echarts draws it on
// the canvas, as text, or writes it into the page as HTML.
async function showTooltip(chart: Locator) {
  const canvas = chart.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const drawn = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  // Once the bars have grown into place, the canvas holds still.
  let still = "";
  await expect
    .poll(async () => still === (still = await drawn()), { intervals: [300] })
    .toBe(true);
  await chart.hover({ position: { x: 200, y: 200 } });
  await expect
    .poll(
      async () =>
        (await chart.locator("img").count()) > 0 || (await drawn()) !== still,
    )
    .toBe(true);
}

test("draws echarts charts without letting their tooltips or titles reach the page", async ({
  app,
  page,
}) => {
  const violations = await app.recordPolicyViolations();
  const vendored = app.recordVendoredRequests("echarts");
  await app.open();
  await app.openNotes();
  await app.createNote();
  const bars = {
    xAxis: { data: ["a", "b"] },
    yAxis: {},
    series: [{ type: "bar", data: [1, 2] }],
  };
  await app.setEditorText(
    [
      "```echarts",
      JSON.stringify({
        title: {
          text: "Sales",
          link: "javascript:window.fromTitle=1",
          target: "self",
        },
        tooltip: {
          trigger: "axis",
          formatter: "<img src=x onerror=window.fromTooltip=1>{b}",
        },
        ...bars,
      }),
      "```",
      "",
      // echarts reads a base option in place of the option's own keys.
      "```echarts",
      JSON.stringify({
        baseOption: {
          tooltip: {
            trigger: "axis",
            formatter: "<img src=x onerror=window.fromBase=1>{b}",
          },
          ...bars,
        },
      }),
      "```",
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();

  const charts = app.preview.locator("[_echarts_instance_]");
  await expect(charts).toHaveCount(2);
  for (const chart of [charts.nth(0), charts.nth(1)]) {
    await showTooltip(chart);
    await expect(chart.locator("img")).toHaveCount(0);
  }
  // The title's link, which is not a web address, is not opened.
  await charts.nth(0).click({ position: { x: 15, y: 15 } });
  await charts.nth(0).hover({ position: { x: 300, y: 300 } });
  expect(
    await page.evaluate(() => [
      (window as any).fromTooltip,
      (window as any).fromBase,
      (window as any).fromTitle,
    ]),
  ).toEqual([undefined, undefined, undefined]);
  expect(vendored()).toEqual([]);
  expect(await violations()).toEqual([]);
});

test("draws a 3D echarts chart with echarts-gl", async ({ app }) => {
  const violations = await app.recordPolicyViolations();
  const vendored = app.recordVendoredRequests("echarts-gl");
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    [
      "```echarts",
      JSON.stringify({
        grid3D: {},
        xAxis3D: {},
        yAxis3D: {},
        zAxis3D: {},
        series: [{ type: "scatter3D", data: [[1, 2, 3]] }],
      }),
      "```",
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();

  const chart = app.preview.locator("[_echarts_instance_]");
  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(app.preview.locator(".language-error")).toHaveCount(0);
  // echarts leaves out a series it does not know, without an error: the
  // chart is echarts-gl's only if it draws with WebGL. A canvas that already
  // draws in 2D gives no WebGL context.
  await expect
    .poll(() =>
      chart
        .locator("canvas")
        .evaluateAll((canvases: HTMLCanvasElement[]) =>
          canvases.some(
            (canvas) =>
              !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl")),
          ),
        ),
    )
    .toBe(true);
  expect(vendored()).toEqual([]);
  expect(await violations()).toEqual([]);
});

test("draws vega and vega-lite charts, sized by an expression", async ({
  app,
}) => {
  const violations = await app.recordPolicyViolations();
  const vendored = ["vega", "vega-lite", "vega-embed"].map((name) =>
    app.recordVendoredRequests(name),
  );
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    [
      "```vega",
      JSON.stringify({
        signals: [{ name: "side", value: 60 }],
        width: { signal: "side * 2" },
        height: { signal: "side" },
        marks: [
          {
            type: "rect",
            encode: {
              enter: {
                width: { signal: "side" },
                height: { signal: "side / 2" },
                fill: { value: "steelblue" },
              },
            },
          },
        ],
      }),
      "```",
      "",
      "```vega-lite",
      "data:",
      "  values:",
      "    - a: 1",
      "mark: point",
      "```",
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();

  const canvases = app.preview.locator("canvas");
  await expect(canvases).toHaveCount(2);
  // The width the expression gives, with vega's padding around it.
  await expect
    .poll(() =>
      canvases
        .first()
        .evaluate((canvas) => Math.round(canvas.getBoundingClientRect().width)),
    )
    .toBe(120);
  await expect(app.preview.locator(".language-error")).toHaveCount(0);
  expect(vendored.flatMap((requested) => requested())).toEqual([]);
  expect(await violations()).toEqual([]);
});
