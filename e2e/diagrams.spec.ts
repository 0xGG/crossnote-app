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

// Elements of the page, outside the preview, that charts name for their
// inputs: vega would empty them to put the inputs in, or bind a signal to
// the input's value.
test("keeps the inputs of vega and vega-lite charts in the chart", async ({
  app,
  page,
}) => {
  const violations = await app.recordPolicyViolations();
  await app.open();
  await page.evaluate(() => {
    for (const id of ["outside-vega", "outside-vega-lite", "outside-embed"]) {
      const element = document.createElement("div");
      element.id = id;
      element.textContent = "kept";
      document.body.append(element);
    }
    const input = document.createElement("input");
    input.id = "outside-input";
    input.value = "kept";
    document.body.append(input);
  });
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    [
      "```vega",
      JSON.stringify({
        signals: [
          {
            name: "size",
            value: 5,
            bind: { input: "range", min: 1, max: 10, element: "#outside-vega" },
          },
          // Bound to the page's input, and changed by the chart.
          {
            name: "word",
            value: "",
            bind: { element: "#outside-input" },
            on: [{ events: "timer{50}", update: "'changed'" }],
          },
          { name: "echo", update: "word", bind: { input: "text" } },
        ],
      }),
      "```",
      "",
      "```vega-lite",
      JSON.stringify({
        data: { values: [{ a: 1 }] },
        mark: "point",
        params: [
          {
            name: "shown",
            value: 1,
            bind: {
              input: "range",
              min: 0,
              max: 1,
              element: "#outside-vega-lite",
            },
          },
        ],
        usermeta: { embedOptions: { bind: "#outside-embed" } },
      }),
      "```",
      "",
    ].join("\n"),
  );
  await app.modeButton("Preview").click();

  // Once the chart has changed its signal, and both charts have their inputs.
  await expect(app.preview.locator('input[type="text"]')).toHaveValue(
    "changed",
  );
  await expect(app.preview.locator('input[type="range"]')).toHaveCount(2);
  for (const id of ["outside-vega", "outside-vega-lite", "outside-embed"]) {
    await expect(page.locator(`#${id}`)).toHaveText("kept");
  }
  await expect(page.locator("#outside-input")).toHaveValue("kept");
  await expect(app.preview.locator(".language-error")).toHaveCount(0);
  expect(await violations()).toEqual([]);
});

// Sources that have wavedrom write markup of their own into its drawing
// (the same as in src/render/wavedrom.test.ts): JsonML in the head's text
// (an image with onerror, an animation with onbegin), XHTML in a lane's
// name, an attribute value a quote ends early, and an edge's label.
const wavedromPayloads = [
  {
    signal: [{ name: "a", wave: "01" }],
    head: {
      text: ["tspan", ["image", { href: "x.png", onerror: "window.wd1=1" }]],
    },
  },
  {
    signal: [{ name: "a", wave: "01" }],
    head: {
      text: [
        "tspan",
        ["set", { attributeName: "x", to: "1", onbegin: "window.wd2=1" }],
      ],
    },
  },
  {
    signal: [
      {
        name: "<img xmlns='http://www.w3.org/1999/xhtml' src='x.png' onerror='window.wd3=1'/>",
        wave: "01",
      },
    ],
  },
  {
    signal: [{ name: "a", wave: "01" }],
    head: {
      text: [
        "tspan",
        {
          class:
            'x"><image href="x.png" onerror="window.wd4=1"/><tspan class="y',
        },
        "t",
      ],
    },
  },
  {
    signal: [
      { name: "a", wave: "01", node: ".a" },
      { name: "b", wave: "01", node: ".b" },
    ],
    edge: ["a~b <image href='x.png' onerror='window.wd5=1'/>"],
  },
];

test("draws wavedrom as sanitized SVG, running nothing its source writes", async ({
  app,
  page,
}) => {
  const violations = await app.recordPolicyViolations();
  const vendored = app.recordVendoredRequests("wavedrom");
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText(
    [{ signal: [{ name: "clk", wave: "p..." }] }, ...wavedromPayloads]
      .map((source) => "```wavedrom\n" + JSON.stringify(source) + "\n```\n")
      .join("\n"),
  );
  await app.modeButton("Preview").click();

  const drawings = app.preview.locator("svg");
  await expect(drawings).toHaveCount(6);
  await expect(drawings.first()).toContainText("clk");
  // The wave itself, drawn with the skin's shapes.
  await expect(drawings.first().locator("use").first()).toBeAttached();
  // What is in the page has no handlers to run.
  const handlers = await drawings.evaluateAll((svgs) =>
    svgs.flatMap((svg) =>
      [svg, ...svg.querySelectorAll("*")].flatMap((element) =>
        element
          .getAttributeNames()
          .filter((name) => /^on/i.test(name))
          .map((name) => `${element.tagName}@${name}`),
      ),
    ),
  );
  expect(handlers).toEqual([]);
  expect(
    await page.evaluate(() =>
      [1, 2, 3, 4, 5].map((n) => (window as any)[`wd${n}`]),
    ),
  ).toEqual([undefined, undefined, undefined, undefined, undefined]);
  expect(vendored()).toEqual([]);
  expect(await violations()).toEqual([]);
});

test("asks before sending a PlantUML diagram to plantuml.com, unless set to draw without asking", async ({
  app,
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://www.plantuml.com/")) {
      sent.push(request.url());
    }
  });
  // plantuml.com, here, draws every diagram as the same small image, until
  // it cannot be reached.
  let reachable = true;
  await page.route("https://www.plantuml.com/**", (route) =>
    reachable
      ? route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>',
        })
      : route.abort(),
  );
  const loaded = (image: Locator) =>
    image.evaluate((image: HTMLImageElement) => image.naturalWidth);
  const violations = await app.recordPolicyViolations();
  const vendored = app.recordVendoredRequests("plantuml-encoder");
  await app.open();
  await app.openNotes();
  await app.createNote();
  await app.setEditorText("```plantuml\n@startuml\nA -> B\n@enduml\n```\n");
  const noteTab = app.tab(await app.noteTitle.inputValue());
  await app.modeButton("Preview").click();

  const draw = app.preview.getByRole("button", {
    name: "Draw with plantuml.com (sends the diagram's source to it)",
  });
  await expect(draw).toBeVisible();
  await expect(app.preview.locator("pre")).toContainText("A -> B");
  expect(sent).toEqual([]);
  await draw.click();
  const diagram = app.preview.getByRole("img", { name: "PlantUML diagram" });
  await expect(diagram).toHaveAttribute(
    "src",
    /^https:\/\/www\.plantuml\.com\/plantuml\/img\/[0-9A-Za-z_-]+$/,
  );
  await expect.poll(() => sent.length).toBe(1);
  await expect.poll(() => loaded(diagram)).toBe(20);

  // With the setting on, the diagram is drawn as the note is.
  await app.openSettings();
  await page
    .getByRole("switch", {
      name: "Draw PlantUML diagrams with plantuml.com without asking",
    })
    .check();
  await noteTab.click();
  await app.modeButton("Edit").click();
  await app.modeButton("Preview").click();
  await expect.poll(() => loaded(diagram)).toBe(20);
  await expect(draw).toHaveCount(0);

  // An image that cannot be loaded gives way to the source and the button,
  // which tries again when pressed. (Another diagram, as the browser keeps
  // the image it has loaded.)
  reachable = false;
  await app.modeButton("Edit").click();
  await app.setEditorText("```plantuml\n@startuml\nA -> C\n@enduml\n```\n");
  await app.modeButton("Preview").click();
  await expect(draw).toBeEnabled();
  await expect(app.preview.locator("pre")).toContainText("A -> C");
  await expect(diagram).toHaveCount(0);
  const tried = sent.length;
  await draw.click();
  await expect.poll(() => sent.length).toBe(tried + 1);
  await expect(draw).toBeEnabled();
  await expect(diagram).toHaveCount(0);
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
