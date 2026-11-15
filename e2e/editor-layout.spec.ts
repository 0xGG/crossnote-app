import type { Locator, Route } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";

const sample = [
  "---",
  "title: Layout",
  "tags: [layout]",
  "---",
  "",
  "普通正文 English text **Bold** *Italic* ~~Deleted~~ `inline code`",
  "",
  "> Quote 引用",
  "> second line",
  "",
  "- first item",
  "  - nested item",
  "",
  "4. ordered first",
  "9. ordered second",
  "",
  "- [ ] task pending",
  "- [x] task done",
  "",
  "---",
  "",
  "Setext title",
  "=====",
  "",
  "```javascript",
  "const value = 123;",
  "```",
  "",
  "```python",
  "def example():",
  "    return 1",
  "```",
  "",
  "```",
  "plain code",
  "```",
  "",
  "    indented code",
  "",
  "END",
].join("\n");

async function openStored(app: CrossnoteApp, text: string) {
  await app.open();
  await app.openNotes();
  const file = `${await app.notebookFolder()}/README.md`;
  await app.storedText(file, text);
  await app.page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards
    .filter({ hasText: "README" })
    .getByText("README", { exact: true })
    .click();
  await app.modeButton("Edit").click();
  await expect(app.editor).toBeVisible();
  await app.selectInEditor({
    line: text.split(/\r\n|\r|\n/).length - 1,
    ch: 0,
  });
  return file;
}

async function style(element: Locator) {
  return element.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      font: s.fontFamily,
      size: s.fontSize,
      weight: s.fontWeight,
      lineHeight: s.lineHeight,
      color: s.color,
      background: s.backgroundColor,
      padding: s.padding,
      radius: s.borderRadius,
    };
  });
}

for (const [theme, expectedBackground] of Object.entries({
  "light": "rgb(255, 255, 255)",
  "dark": "rgb(30, 30, 30)",
  "one-dark": "rgb(40, 44, 52)",
  "solarized-light": "rgb(253, 246, 228)",
})) {
  test(`shares inline typography and task styling in ${theme}`, async ({
    app,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.addInitScript(
      (theme) => localStorage.setItem("settings/theme", theme),
      theme,
    );
    await openStored(app, sample);
    const code = app.editor.locator(".cn-code");
    await expect(code).toHaveCSS("font-size", "13.6px");
    await expect(code).toHaveCSS("padding-left", "6px");
    const inline = await style(code);
    const renderedCode = app.editor.locator(".cn-code-preview pre").first();
    await expect(renderedCode).toHaveClass(/language-javascript/);
    const codeStyle = await style(renderedCode);
    await expect(app.editor.locator(".cn-strong")).toHaveCSS(
      "font-weight",
      "700",
    );
    const task = await style(app.editor.locator(".cn-task").first());
    const background = await app.editor.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(background).toBe(expectedBackground);
    await page.screenshot({ path: testInfo.outputPath("edit.png") });
    await app.modeButton("Preview").click();
    await expect(app.preview.locator("pre").first()).toHaveClass(
      /language-javascript/,
    );
    expect(await style(app.preview.locator("pre").first())).toEqual(codeStyle);
    expect(await style(app.preview.locator("p code").first())).toEqual(inline);
    expect(
      await style(app.preview.locator(".task-list-item-checkbox").first()),
    ).toEqual(task);
    await expect(app.preview).toHaveCSS("background-color", background);
    await page.screenshot({ path: testInfo.outputPath("preview.png") });
  });
}

test("aligns wrapped list text and restores markers for an item selection", async ({
  app,
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  const text = `- ${"wrapped 中文 text ".repeat(18)}\n  - nested\n\nEND`;
  await openStored(app, text);
  const item = app.editor.locator(".cm-line").filter({ hasText: /wrapped/ });
  const rects = await item.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent?.includes("wrapped")) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).map((rect) => ({
          x: rect.x,
          y: rect.y,
        }));
      }
    }
    return [];
  });
  expect(rects.length).toBeGreaterThan(1);
  for (const rect of rects) expect(rect.x).toBeCloseTo(rects[0].x, 0);
  await app.selectInEditor({ line: 0, ch: 3 }, { line: 0, ch: 25 });
  await expect(item).toContainText("- wrapped");
  expect(await app.editorText()).toBe(text);
  await app.selectInEditor({ line: 3, ch: 0 });
  await expect(app.editor.locator(".cn-list-marker")).toHaveCount(2);
  const parent = await item.boundingBox();
  await app.selectInEditor({ line: 1, ch: 6 });
  await expect(item.locator(".cn-list-marker")).toHaveText("•");
  expect(await item.boundingBox()).toEqual(parent);
});

test("keeps nested quote indentation and borders when markers are hidden", async ({
  app,
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const text = "> outer\n> > inner\n> > > deep\ncontinued\n\nEND";
  await openStored(app, text);
  const positions = async (root: Locator) =>
    root.evaluate((el) => {
      return ["outer", "inner", "deep", "continued"].map((word) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const index = node.textContent?.indexOf(word) ?? -1;
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + word.length);
          return range.getBoundingClientRect().x;
        }
        throw new Error(`Missing quote text: ${word}`);
      });
    });
  const edit = await positions(app.editor);
  expect(edit[1] - edit[0]).toBe(19);
  expect(edit[2] - edit[1]).toBe(19);
  expect(edit[3]).toBe(edit[2]);
  const nested = app.editor.locator(".cm-line").filter({ hasText: "deep" });
  await expect(nested).toHaveCSS("background-image", /linear-gradient/);
  await page.screenshot({
    path: testInfo.outputPath("nested-quotes-edit.png"),
  });
  await app.modeButton("Preview").click();
  expect(await positions(app.preview)).toEqual(edit);
  await page.screenshot({
    path: testInfo.outputPath("nested-quotes-preview.png"),
  });
  await app.modeButton("Edit").click();
  await app.selectInEditor({ line: 2, ch: 8 });
  await expect(nested).toContainText("> > > deep");
  expect(await app.editorText()).toBe(text);
});

for (const width of [1440, 640]) {
  test(`aligns all three modes without line numbers at width ${width}`, async ({
    app,
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() =>
      localStorage.setItem("settings/sourceCodeLineNumbers", "false"),
    );
    await openStored(
      app,
      "First plain paragraph\n\nSecond plain paragraph\n\nEND",
    );
    const positions: { x: number; width: number; y: number }[] = [];
    for (const mode of ["Edit", "Source code", "Preview"] as const) {
      await app.modeButton(mode).click();
      const line = {
        "Preview": app.preview.locator("p").first(),
        "Edit": app.editor.locator(".cm-line").first(),
        "Source code": app.editor.locator(".cm-line").first(),
      }[mode];
      await expect(line).toHaveCSS("line-height", "24px");
      await line.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      positions.push(
        await line.evaluate((el) => {
          const box = el.getBoundingClientRect(),
            s = getComputedStyle(el);
          return {
            x: box.x + parseFloat(s.paddingLeft),
            y: box.y,
            width:
              box.width -
              parseFloat(s.paddingLeft) -
              parseFloat(s.paddingRight),
          };
        }),
      );
    }
    for (const position of positions.slice(1)) {
      expect(position.x).toBeCloseTo(positions[0].x, 0);
      expect(position.y).toBeCloseTo(positions[0].y, 0);
      expect(position.width).toBeCloseTo(positions[0].width, 0);
    }
  });
}

test("renders block markers without changing stored text, then edits and undoes a task", async ({
  app,
  page,
}) => {
  const original = sample.replace(/\n/g, "\r\n");
  const file = await openStored(app, original);
  await app.refuseWrites();
  await expect(app.editor.locator(".cn-rule")).toHaveCount(1);
  await expect(app.editor.locator(".cn-list-marker")).toHaveText([
    "•",
    "◦",
    "4.",
    "5.",
    "",
    "",
  ]);
  await expect(app.editor.locator(".cn-quote").first()).toHaveCSS(
    "background-color",
    "rgb(240, 240, 240)",
  );
  await expect(app.editor.locator(".cn-setext-mark")).toHaveText("");
  await app.selectInEditor({ line: 7, ch: 3 });
  await expect(app.editor.locator(".cn-quote").first()).toContainText(
    "> Quote",
  );
  await app.selectInEditor({ line: sample.split("\n").length - 1, ch: 0 });
  for (const mode of ["Source code", "Preview", "Edit"] as const)
    await app.modeButton(mode).click();
  await page.clock.install();
  await page.clock.runFor(1000);
  // lightning-fs may finish a pending directory-cache flush after the note
  // opens. A file-content write would change the note and must never occur.
  expect(
    (await app.refusedWrites()).filter((write) => write === "file"),
  ).toEqual([]);
  expect(await app.storedText(file)).toBe(original);
  expect(await app.editorText()).toBe(original);
  await app.refuseWrites(false);
  await app.editor.locator(".cn-task").first().click();
  await expect.poll(() => app.editorText()).toContain("- [x] task pending");
  await app.focusEditor();
  await page.keyboard.press("Control+z");
  await expect.poll(() => app.editorText()).toBe(original);
});

test("uses a code font in source after embedded languages load", async ({
  app,
  page,
}) => {
  await openStored(app, sample);
  await app.modeButton("Source code").click();
  await expect.poll(() => app.tokenTypes("const")).toContain("keyword");
  for (const text of [
    "const value",
    "def example",
    "plain code",
    "indented code",
  ]) {
    await app.selectInEditor({
      line: sample.split("\n").findIndex((line) => line.includes(text)),
      ch: 0,
    });
    await app.focusEditor();
    await page.keyboard.press("ArrowRight");
    const line = app.editor.locator(".cm-line").filter({ hasText: text });
    await expect(line).toHaveCSS("font-family", /Consolas/);
    await expect(line).toHaveCSS("font-size", "16px");
  }
  await expect(
    app.editor.locator(".cm-line").filter({ hasText: "普通正文" }),
  ).toHaveCSS("font-family", /Noto Sans SC/);
});

test("keeps the reading block through mode changes in a long note", async ({
  app,
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("settings/sourceCodeLineNumbers", "false"),
  );
  const text =
    "See footnote[^a].\n\n[^a]: early definition\n\n" +
    Array.from(
      { length: 70 },
      (_, i) => `Paragraph ${i} 中文 English ${"words ".repeat(12)}`,
    ).join("\n\n");
  await openStored(app, text);
  await app.modeButton("Preview").click();
  const paragraph = app.preview
    .locator("p")
    .filter({ hasText: /^Paragraph 35 / });
  await paragraph.evaluate((el) => {
    const root = el.closest("[data-testid=note-preview]")!;
    root.scrollTop +=
      el.getBoundingClientRect().top - root.getBoundingClientRect().top - 48;
  });
  const offset = await paragraph.evaluate(
    (el) =>
      el.getBoundingClientRect().top -
      el.closest("[data-testid=note-preview]")!.getBoundingClientRect().top,
  );
  for (const mode of ["Edit", "Source code", "Preview"] as const) {
    await app.modeButton(mode).click();
    const line = {
      "Preview": paragraph,
      "Edit": app.editor
        .locator(".cm-line")
        .filter({ hasText: /^Paragraph 35 / }),
      "Source code": app.editor
        .locator(".cm-line")
        .filter({ hasText: /^Paragraph 35 / }),
    }[mode];
    await expect(line).toBeVisible();
    await expect
      .poll(() =>
        line.evaluate(
          (el) =>
            el.getBoundingClientRect().top -
            (el.closest(".cm-scroller") ??
              el.closest("[data-testid=note-preview]"))!.getBoundingClientRect()
              .top,
        ),
      )
      .toBeCloseTo(offset, 0);
  }
});

test("opens only the clicked code block as source without writing the note", async ({
  app,
  page,
}, testInfo) => {
  const text = [
    "Before",
    "",
    "```javascript",
    "const value = 1;",
    "```",
    "",
    "```unknown",
    "literal <b> & text",
    "```",
    "",
    "    indented",
    "",
    "```mermaid",
    "graph TD; A-->B",
    "```",
    "",
    "END",
  ].join("\r\n");
  const file = await openStored(app, text);
  await app.refuseWrites();
  const widgets = app.editor.locator(".cn-code-preview");
  await expect(widgets).toHaveCount(3);
  const copied = await widgets
    .first()
    .locator("pre")
    .evaluate((pre) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(pre);
      selection.removeAllRanges();
      selection.addRange(range);
      const clipboardData = new DataTransfer();
      pre.closest(".cm-content")!.dispatchEvent(
        new ClipboardEvent("copy", {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      );
      const text = clipboardData.getData("text/plain");
      selection.removeAllRanges();
      return text;
    });
  expect(copied).toBe("const value = 1;");
  await expect(widgets.nth(1)).toHaveText("literal <b> & text\n");
  await expect(widgets.nth(2).locator("pre > code")).toHaveText("indented\n");
  await expect(app.editor.locator(".cn-diagram-source").first()).toContainText(
    "```mermaid",
  );
  const before = await app.editor
    .locator(".cm-line")
    .filter({ hasText: /^Before$/ })
    .boundingBox();
  await page.screenshot({ path: testInfo.outputPath("code-inactive.png") });
  await widgets
    .first()
    .locator("pre")
    .click({ position: { x: 35, y: 20 } });
  await expect(widgets).toHaveCount(2);
  const active = app.editor
    .locator(".cm-line")
    .filter({ hasText: /^const value/ });
  await expect(active).toHaveCSS("font-size", "16px");
  await expect(active).toHaveCSS("line-height", "24px");
  await expect(
    app.editor.locator(".cm-line").filter({ hasText: "```javascript" }),
  ).toBeVisible();
  expect(
    await app.editor
      .locator(".cm-line")
      .filter({ hasText: /^Before$/ })
      .boundingBox(),
  ).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath("code-active.png") });
  await app.selectInEditor({ line: 16, ch: 0 });
  await expect(widgets).toHaveCount(3);
  await app.selectInEditor({ line: 5, ch: 0 });
  await app.focusEditor();
  await page.keyboard.press("ArrowUp");
  await expect(widgets).toHaveCount(2);
  await app.selectInEditor({ line: 16, ch: 0 });
  await app.modeButton("Source code").click();
  await expect(active).toHaveCSS("font-size", "16px");
  await app.modeButton("Edit").click();
  await expect(widgets).toHaveCount(3);
  await page.clock.install();
  await page.clock.runFor(1000);
  expect((await app.refusedWrites()).filter((w) => w === "file")).toEqual([]);
  expect(await app.storedText(file)).toBe(text);
  expect(await app.editorText()).toBe(text);
  await app.refuseWrites(false);
  await app.selectInEditor({ line: 3, ch: 0 });
  await app.focusEditor();
  await page.keyboard.type("// ");
  await page.keyboard.press("Control+z");
  expect(await app.editorText()).toBe(text);
});

test("opens code in early footnotes without writing or reordering the source", async ({
  app,
  page,
}) => {
  const text =
    "See[^a].\n\n[^a]: footnote\n\n    ```js\n    const early = 1;\n    ```\n\nLater\n\n```js\nconst late = 2;\n```\n\nEND";
  const file = await openStored(app, text);
  await app.refuseWrites();
  const widgets = app.editor.locator(".cn-code-preview");
  await expect(widgets).toHaveCount(2);
  await expect(widgets.first()).toContainText("const early = 1;");
  await expect(widgets.last()).toContainText("const late = 2;");
  await widgets.first().locator("pre").click();
  await expect(widgets).toHaveCount(1);
  await expect(widgets.first()).toContainText("const late = 2;");
  expect(await app.editorText()).toBe(text);
  await page.clock.install();
  await page.clock.runFor(1000);
  expect((await app.refusedWrites()).filter((w) => w === "file")).toEqual([]);
  expect(await app.storedText(file)).toBe(text);
});

test("moves through wrapped prose before entering adjacent code", async ({
  app,
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  const paragraph = "Long adjacent paragraph ".repeat(22);
  const text = `${paragraph}\n\`\`\`js\nconst code = 1;\n\`\`\`\n${paragraph}\n\nEND`;
  await openStored(app, text);
  const widgets = app.editor.locator(".cn-code-preview");
  await app.selectInEditor({ line: 0, ch: 0 });
  await app.focusEditor();
  await page.keyboard.press("ArrowDown");
  expect((await app.caret()).line).toBe(0);
  expect((await app.caret()).ch).toBeGreaterThan(0);
  await expect(widgets).toHaveCount(1);
  await app.selectInEditor({ line: 0, ch: paragraph.length });
  await page.keyboard.press("ArrowDown");
  expect((await app.caret()).line).toBe(1);
  await expect(widgets).toHaveCount(0);
  await app.selectInEditor({ line: 4, ch: paragraph.length });
  await page.keyboard.press("ArrowUp");
  expect((await app.caret()).line).toBe(4);
  expect((await app.caret()).ch).toBeLessThan(paragraph.length);
  await expect(widgets).toHaveCount(1);
  await app.selectInEditor({ line: 4, ch: 0 });
  await page.keyboard.press("ArrowUp");
  expect((await app.caret()).line).toBe(3);
  await expect(widgets).toHaveCount(0);
  expect(await app.editorText()).toBe(text);
});

test("keeps parent list markers when activating a child inside a quote", async ({
  app,
}) => {
  await openStored(app, "- parent\n  > - child\n  > - sibling\n\nEND");
  const parent = app.editor.locator(".cm-line").filter({ hasText: "parent" });
  const sibling = app.editor.locator(".cm-line").filter({ hasText: "sibling" });
  const before = await parent.boundingBox();
  await app.selectInEditor({ line: 1, ch: 8 });
  await expect(parent.locator(".cn-list-marker")).toHaveText("•");
  await expect(sibling.locator(".cn-list-marker")).toBeVisible();
  expect(await parent.boundingBox()).toEqual(before);
});

test("preserves quote depth inside a list and nested code content", async ({
  app,
}) => {
  const text =
    "- item\n  > outer\n  > > inner\n  > > > deep\n\n  > ```js\n  > const nested = 2;\n  > ```\n\nEND";
  await openStored(app, text);
  const positions = async (root: Locator) =>
    root.evaluate((el) =>
      ["outer", "inner", "deep"].map((word) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const at = node.textContent?.indexOf(word) ?? -1;
          if (at < 0) continue;
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + word.length);
          return r.getBoundingClientRect().x;
        }
        throw Error(word);
      }),
    );
  const edit = await positions(app.editor);
  expect(edit[1] - edit[0]).toBe(19);
  expect(edit[2] - edit[1]).toBe(19);
  await expect(app.editor.locator(".cn-code-preview pre")).toHaveText(
    "const nested = 2;\n",
  );
  await app.modeButton("Preview").click();
  expect(await positions(app.preview)).toEqual(edit);
  await app.modeButton("Edit").click();
  await app.editor.locator(".cn-code-preview pre").click();
  await expect(
    app.editor.locator(".cm-line").filter({ hasText: "const nested" }),
  ).toContainText("> const nested");
  expect(await app.editorText()).toBe(text);
});

test("gives consecutive headings and quotes space without changing active heading typography", async ({
  app,
}) => {
  await openStored(app, "# First\n\n## Second\n\n> Quote\n\nAfter\n\nEND");
  const heading = app.editor.locator(".tok-heading1").last();
  const inactive = await style(heading);
  await app.selectInEditor({ line: 0, ch: 3 });
  expect(await style(app.editor.locator(".tok-heading1").last())).toEqual(
    inactive,
  );
  await app.modeButton("Preview").click();
  const gaps = await app.preview.evaluate((root) => {
    const nodes = [...root.children];
    return nodes
      .slice(1, 4)
      .map(
        (n, i) =>
          n.getBoundingClientRect().top -
          nodes[i].getBoundingClientRect().bottom,
      );
  });
  expect(gaps).toEqual([24, 24, 24]);
});

test("keeps a preview anchor when an image above it finishes loading", async ({
  app,
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("settings/defaultEditorMode", "EchoMD"),
  );
  const pending: Route[] = [];
  let released = false;
  const fulfill = (route: Route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="900"><rect width="500" height="900" fill="gray"/></svg>',
    });
  await page.route("https://example.test/late.svg", async (route) => {
    if (released) await fulfill(route);
    else pending.push(route);
  });
  const text = `![late](https://example.test/late.svg)\n\n${Array.from({ length: 50 }, (_, i) => `Reading block ${i}`).join("\n\n")}`;
  await openStored(app, text);
  await app.modeButton("Source code").click();
  await app.editor.locator(".cm-scroller").evaluate((el) => {
    el.scrollTop = 1100;
  });
  await app.modeButton("Preview").click();
  const target = app.preview
    .locator("p")
    .filter({ hasText: /^Reading block 23$/ });
  const offset = () =>
    target.evaluate(
      (el) =>
        el.getBoundingClientRect().top -
        el.closest("[data-testid=note-preview]")!.getBoundingClientRect().top,
    );
  await expect(app.preview.locator("img")).toHaveCount(1);
  const before = await offset();
  await expect.poll(() => pending.length).toBeGreaterThan(0);
  released = true;
  for (const route of pending) await fulfill(route);
  await expect
    .poll(() =>
      app.preview
        .locator("img")
        .evaluate((el) => (el as HTMLImageElement).naturalHeight),
    )
    .toBe(900);
  await expect.poll(offset).toBeCloseTo(before, 0);
});
