import type { Locator, Route } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import { layoutSample } from "./editor-layout-sample";

const sample = [
  "---",
  "title: Layout",
  "tags: [layout]",
  "---",
  "",
  "普通正文 English text **Bold** *Italic* ~~Deleted~~ `inline code` #topic H~2~O x^2^",
  "",
  "> Quote 引用",
  "> second line `quoted code`",
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

async function revealEditor(app: CrossnoteApp, target: Locator) {
  if ((await target.count()) === 0) {
    const scroller = app.editor.locator(".cm-scroller");
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect
      .poll(
        async () => {
          if (await target.count()) return true;
          await scroller.evaluate((el) => {
            el.scrollTop += el.clientHeight * 0.6;
          });
          return false;
        },
        { timeout: 15000, intervals: [50, 100] },
      )
      .toBe(true);
  }
  await target.scrollIntoViewIfNeeded();
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
    const code = app.editor.locator(".cn-code").first();
    await expect(code).toHaveCSS("font-size", "13.6px");
    await expect(code).toHaveCSS("padding-left", "6px");
    const inline = await style(code);
    const inlinePairs = [
      [".cn-strike .tok-strikethrough", "s"],
      [".cn-hashtag", "a.tag-topic"],
      [".cn-sub", "sub"],
      [".cn-sup", "sup"],
      [".cn-quote .cn-code .tok-monospace", "blockquote code"],
    ];
    const inlineStyles = await Promise.all(
      inlinePairs.map(async ([edit, preview]) => ({
        preview,
        style: await style(app.editor.locator(edit)),
      })),
    );
    const tagStyle = await style(app.editor.locator(".cn-hashtag"));
    await expect(app.editor.locator(".cn-strike")).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
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
    for (const pair of inlineStyles) {
      const rendered = await style(app.preview.locator(pair.preview));
      expect(pair.style.color).toBe(rendered.color);
      expect(pair.style.size).toBe(rendered.size);
      expect(pair.style.lineHeight).toBe(rendered.lineHeight);
    }
    expect(await style(app.preview.locator("a.tag-topic"))).toEqual(tagStyle);
    await expect(app.preview.locator("pre").first()).toHaveCSS(
      "line-height",
      "24px",
    );
    expect(
      await style(app.preview.locator(".task-list-item-checkbox").first()),
    ).toEqual(task);
    await expect(app.preview).toHaveCSS("background-color", background);
    await page.screenshot({ path: testInfo.outputPath("preview.png") });
  });
}

test("matches inactive rule and display formula geometry with preview", async ({
  app,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const text =
    "Before\n\n---\n\nAfterRule\n\n$$\n\\sum_{i=1}^{n} i = 1\n$$\n\nAfterMath\n\n$$x^2$$\n\nEND";
  const file = await openStored(app, text);
  await app.refuseWrites();
  const measure = (root: Locator, rule: string) =>
    root.evaluate((el, rule) => {
      const origin = el.querySelector(rule)!.getBoundingClientRect();
      const words = ["Before", "AfterRule", "AfterMath", "END"].map((word) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const at = node.textContent?.indexOf(word) ?? -1;
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + word.length);
          return range.getBoundingClientRect().y - origin.y;
        }
        throw Error(word);
      });
      return {
        ruleHeight: origin.height,
        words,
        math: [...el.querySelectorAll(".katex-display")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { y: rect.y - origin.y, height: rect.height };
        }),
      };
    }, rule);
  await expect(app.editor.locator(".katex-display")).toHaveCount(2);
  const edit = await measure(app.editor, ".cn-rule");
  await app.modeButton("Preview").click();
  const preview = await measure(app.preview, "hr");
  expect(edit.ruleHeight).toBe(4);
  expect(edit.ruleHeight).toBe(preview.ruleHeight);
  edit.words.forEach((y, i) => expect(y).toBeCloseTo(preview.words[i], 0));
  edit.math.forEach((math, i) => {
    expect(math.y).toBeCloseTo(preview.math[i].y, 0);
    expect(math.height).toBeCloseTo(preview.math[i].height, 0);
  });
  await app.modeButton("Edit").click();
  await app.selectInEditor({ line: 2, ch: 1 });
  await expect(app.editor.locator(".cn-rule")).toHaveCount(0);
  await expect(app.editor.locator(".cm-line").nth(2)).toContainText("---");
  expect(await app.editorText()).toBe(text);
  expect(await app.storedText(file)).toBe(text);
  expect(
    (await app.refusedWrites()).filter((write) => write === "file"),
  ).toEqual([]);
});

test("keeps nested item active throughout its leading indentation", async ({
  app,
  page,
}) => {
  const text = "- Parent\n  - Child\n  - Sibling\n\nEND";
  await openStored(app, text);
  const parent = app.editor.locator(".cm-line").filter({ hasText: "Parent" });
  const child = app.editor.locator(".cm-line").filter({ hasText: "Child" });
  const sibling = app.editor.locator(".cm-line").filter({ hasText: "Sibling" });
  const before = await parent.boundingBox();
  await app.selectInEditor({ line: 1, ch: 4 });
  await app.focusEditor();
  for (let ch = 3; ch >= 0; ch--) {
    await page.keyboard.press("ArrowLeft");
    expect(await app.caret()).toEqual({ line: 1, ch });
    await expect(child).toContainText("  - Child");
    await expect(parent.locator(".cn-list-marker")).toBeVisible();
    await expect(sibling.locator(".cn-list-marker")).toBeVisible();
    expect(await parent.boundingBox()).toEqual(before);
  }
  expect(await app.editorText()).toBe(text);
});

for (const width of [1440, 640]) {
  for (const long of [false, true]) {
    const text = long
      ? "Long paragraph\n\n".repeat(80) + "END"
      : "Short note\n\nEND";

    test(`fits the outer note frame without empty overflow at width ${width}, long=${long}`, async ({
      app,
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openStored(app, text);
      for (const mode of ["Edit", "Source code", "Preview"] as const) {
        await app.modeButton(mode).click();
        await expect
          .poll(() =>
            page
              .locator(".flexlayout__tab_moveable:visible")
              .evaluateAll((elements) =>
                elements.map((el) => el.scrollHeight - el.clientHeight),
              ),
          )
          .toEqual([0]);
        const root = {
          "Preview": app.preview,
          "Edit": app.editor,
          "Source code": app.editor,
        }[mode];
        const outerOverflow = await root.evaluate((el) => {
          const result: number[] = [];
          for (
            let parent = el.parentElement;
            parent;
            parent = parent.parentElement
          ) {
            if (/auto|scroll/.test(getComputedStyle(parent).overflowY))
              result.push(parent.scrollHeight - parent.clientHeight);
          }
          return result;
        });
        expect(outerOverflow.every((value) => value <= 1)).toBe(true);
        const scroller = {
          "Preview": app.preview,
          "Edit": app.editor.locator(".cm-scroller"),
          "Source code": app.editor.locator(".cm-scroller"),
        }[mode];
        expect(
          await scroller.evaluate((el) => el.scrollHeight > el.clientHeight),
        ).toBe(long);
      }
    });
  }
}

test("retains compact footnote labels while their code and diagrams are rendered", async ({
  app,
  page,
}) => {
  const text =
    "See[^a] and[^b].\n\n[^a]: ```js\n    const a = 1;\n    ```\n\n[^b]: ~~~mermaid\n    graph TD\n      A --> B\n    ~~~\n\nEND";
  const file = await openStored(app, text);
  await app.refuseWrites();
  await expect(app.editor.locator(".cn-code-preview")).toHaveCount(2);
  await expect(app.editor.locator(".cn-code-preview svg")).toBeVisible();
  const labels = app.editor
    .locator(".cm-line")
    .filter({ hasText: /^\[\^[ab]\]:\s*$/ });
  await expect(labels).toHaveCount(2);
  await app.selectInEditor({ line: 2, ch: 1 });
  await expect(app.editor.locator(".cn-code-preview")).toHaveCount(2);
  await app.focusEditor();
  await page.keyboard.press("ArrowDown");
  await expect(app.editor.locator(".cn-code-preview")).toHaveCount(1);
  await app.selectInEditor({ line: 11, ch: 0 });
  await expect(app.editor.locator(".cn-code-preview")).toHaveCount(2);
  await app.selectInEditor({ line: 2, ch: 5 });
  await app.focusEditor();
  await page.keyboard.press("ArrowRight");
  await expect(app.editor.locator(".cn-code-preview")).toHaveCount(1);
  await expect(
    app.editor.locator(".cm-line").filter({ hasText: "[^a]:" }),
  ).toContainText("```js");
  await app.selectInEditor({ line: 11, ch: 0 });
  await app.editor
    .locator(".cn-code-preview pre")
    .click({ position: { x: 50, y: 20 } });
  expect((await app.caret()).line).toBe(3);
  await app.selectInEditor({ line: 11, ch: 0 });
  await app.editor.locator(".cn-code-preview svg").click();
  expect((await app.caret()).line).toBe(7);
  expect(await app.editorText()).toBe(text);
  expect(await app.storedText(file)).toBe(text);
  expect(
    (await app.refusedWrites()).filter((write) => write === "file"),
  ).toEqual([]);
});

for (const [language, body, selector] of [
  ["js", "const a = 1;", "pre"],
  ["mermaid", "graph TD; A-->B", "svg"],
]) {
  test(`keeps compact ${language} footnotes still after repeated activation`, async ({
    app,
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const text = `${"Before paragraph\n\n".repeat(35)}See[^a].\n\n[^a]: \`\`\`${language}\n    ${body}\n    \`\`\`\n\nAfterFootnote\n\n${"Later paragraph\n\n".repeat(35)}END`;
    const file = await openStored(app, text);
    await app.refuseWrites();
    await app.selectInEditor({ line: 70, ch: 0 });
    const scroller = app.editor.locator(".cm-scroller");
    await scroller.evaluate((el) => {
      el.scrollTop = 1480;
    });
    const code = app.editor.locator(`.cn-code-preview ${selector}`);
    await code.scrollIntoViewIfNeeded();
    const after = app.editor
      .locator(".cm-line")
      .filter({ hasText: /^AfterFootnote$/ });
    const position = () =>
      after.evaluate((el) => el.getBoundingClientRect().top);
    const scroll = () => scroller.evaluate((el) => el.scrollTop);
    const beforeScroll = await scroll();
    const beforePosition = await position();
    for (let i = 0; i < 10; i++) {
      await code.click({ position: { x: 50, y: 20 } });
      await expect(code).toHaveCount(0);
      await after.click();
      await expect(code).toBeVisible();
      await expect.poll(scroll).toBeCloseTo(beforeScroll, 0);
      await expect.poll(position).toBeCloseTo(beforePosition, 0);
    }
    expect(await app.editorText()).toBe(text);
    expect(await app.storedText(file)).toBe(text);
    expect(
      (await app.refusedWrites()).filter((write) => write === "file"),
    ).toEqual([]);
  });
}

for (const [name, text] of Object.entries({
  atx: "- # Heading\n\nParagraph\n\nEND",
  setext: "1. Heading\n   =======\n\nParagraph\n\nEND",
  nested: "- Parent\n  - ## Heading\n\nParagraph\n\nEND",
  rule: "- Item\n\n  ***\n\n  Paragraph\n\nEND",
})) {
  test(`matches preview container geometry for list ${name}`, async ({
    app,
  }) => {
    await openStored(app, text);
    const markerStyle = await style(
      app.editor.locator(".cn-list-marker").first(),
    );
    const measure = (root: Locator) =>
      root.evaluate((el) => {
        const result: Record<string, { x: number; y: number; width: number }> =
          {};
        for (const word of ["Heading", "Paragraph", "END"]) {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const at = node.textContent?.indexOf(word) ?? -1;
            if (at < 0) continue;
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + word.length);
            const rect = range.getBoundingClientRect();
            result[word] = { x: rect.x, y: rect.y, width: rect.width };
            break;
          }
        }
        const rule = el.querySelector(".cn-rule, hr");
        if (rule) {
          const rect = rule.getBoundingClientRect();
          result.rule = { x: rect.x, y: rect.y, width: rect.width };
        }
        return result;
      });
    const edit = await measure(app.editor);
    await app.modeButton("Preview").click();
    const preview = await measure(app.preview);
    const listStyle = await style(app.preview.locator("li").first());
    expect(markerStyle.size).toBe(listStyle.size);
    expect(markerStyle.weight).toBe(listStyle.weight);
    expect(markerStyle.lineHeight).toBe(listStyle.lineHeight);
    expect(Object.keys(edit)).toEqual(Object.keys(preview));
    for (const key of Object.keys(preview)) {
      expect(edit[key].x, key).toBeCloseTo(preview[key].x, 0);
      expect(edit[key].y, key).toBeCloseTo(preview[key].y, 0);
      expect(edit[key].width, key).toBeCloseTo(preview[key].width, 0);
    }
    expect(await app.editorText()).toBe(text);
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
  await expect(item.locator(".cn-list-marker")).toHaveAttribute(
    "data-marker",
    "•",
  );
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
  expect(
    await nested.evaluate(
      (el) => getComputedStyle(el, "::before").backgroundImage,
    ),
  ).toMatch(/linear-gradient/);
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
  expect(
    await app.editor
      .locator(".cn-list-marker")
      .evaluateAll((elements) =>
        elements.map((el) => el.getAttribute("data-marker")),
      ),
  ).toEqual(["•", "◦", "4.", "5.", "", ""]);
  expect(
    await app.editor
      .locator(".cn-quote")
      .first()
      .evaluate((el) => getComputedStyle(el, "::before").backgroundColor),
  ).toBe("rgb(240, 240, 240)");
  await expect(app.editor.locator(".cn-setext-mark")).toHaveCount(0);
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
  const widgets = app.editor.locator(".cn-code-preview:has(pre)");
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
  await expect(
    app.editor.locator(".cn-code-preview .mermaid svg"),
  ).toBeVisible();
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
  await expect.poll(() => app.tokenTypes("const")).toContain("keyword");
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
  await expect(parent.locator(".cn-list-marker")).toHaveAttribute(
    "data-marker",
    "•",
  );
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

for (const separator of ["\n", "\n\n"]) {
  test(`matches preview heading positions with ${separator.length} source newlines`, async ({
    app,
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await openStored(
      app,
      [
        "# HeadingOne",
        "## HeadingTwo",
        "### HeadingThree",
        "TextAfter",
        "",
        "END",
      ].join(separator),
    );
    const positions = (root: Locator) =>
      root.evaluate((el) =>
        ["HeadingOne", "HeadingTwo", "HeadingThree", "TextAfter"].map(
          (word) => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              const at = node.textContent?.indexOf(word) ?? -1;
              if (at < 0) continue;
              const range = document.createRange();
              range.setStart(node, at);
              range.setEnd(node, at + word.length);
              return range.getBoundingClientRect().top;
            }
            throw new Error(word);
          },
        ),
      );
    const edit = await positions(app.editor);
    await app.modeButton("Preview").click();
    const preview = await positions(app.preview);
    for (let i = 1; i < edit.length; i++)
      expect(edit[i] - edit[0]).toBeCloseTo(preview[i] - preview[0], 0);
  });
}

test("matches preview code boundaries and stays still after repeated activation", async ({
  app,
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  const text = `${Array.from({ length: 15 }, (_, i) => `Earlier ${i}`).join("\n\n")}\n\nBeforeCode\n\`\`\`python\ndef total():\n    return 1\n\`\`\`\nAfterCode\n\n${"Later\n\n".repeat(15)}END`;
  await openStored(app, text);
  const code = app.editor.locator(".cn-code-preview");
  await code.scrollIntoViewIfNeeded();
  const gaps = async (root: Locator, selector: string) => {
    return root.evaluate((el, selector) => {
      const before = [...el.querySelectorAll(selector)].find(
        (n) => n.textContent === "BeforeCode",
      )!;
      const after = [...el.querySelectorAll(selector)].find(
        (n) => n.textContent === "AfterCode",
      )!;
      const pre = el.querySelector("pre")!.getBoundingClientRect();
      const afterStyle = getComputedStyle(after);
      return [
        pre.top - before.getBoundingClientRect().bottom,
        after.getBoundingClientRect().top +
          parseFloat(afterStyle.paddingTop) -
          pre.bottom,
      ];
    }, selector);
  };
  const editGaps = await gaps(app.editor, ".cm-line");
  const scroll = () =>
    app.editor.locator(".cm-scroller").evaluate((el) => el.scrollTop);
  const before = await scroll();
  for (let i = 0; i < 10; i++) {
    await code.locator("pre").click({ position: { x: 60, y: 20 } });
    await expect(
      app.editor.locator(".cm-line").filter({ hasText: "```python" }),
    ).toBeVisible();
    await app.editor
      .locator(".cm-line")
      .filter({ hasText: /^BeforeCode$/ })
      .click();
    await expect(code).toBeVisible();
    await expect.poll(scroll).toBeCloseTo(before, 0);
  }
  await app.modeButton("Preview").click();
  await app.preview.locator("pre").scrollIntoViewIfNeeded();
  expect(editGaps).toEqual(await gaps(app.preview, "p"));
  expect(editGaps).toEqual([24, 16]);
});

test("uses native list markers and preview spacing for tight and loose items", async ({
  app,
}) => {
  await openStored(
    app,
    "- UnorderedOne\n- UnorderedTwo\n\n4. OrderedOne\n5. OrderedTwo\n\n- [ ] TaskOne\n- [x] TaskTwo\n\n- LooseOne\n\n- LooseTwo\n\nAfterLists\n\nEND",
  );
  const positions = (root: Locator) =>
    root.evaluate((el) => {
      return [
        "UnorderedOne",
        "UnorderedTwo",
        "OrderedOne",
        "OrderedTwo",
        "TaskOne",
        "TaskTwo",
        "LooseOne",
        "LooseTwo",
        "AfterLists",
      ].map((word) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const at = node.textContent?.indexOf(word) ?? -1;
          if (at < 0) continue;
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + word.length);
          const rect = r.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        }
        throw new Error(word);
      });
    });
  await expect(app.editor.locator(".cn-list-marker-native").first()).toHaveCSS(
    "display",
    "list-item",
  );
  await expect(app.editor.locator(".cn-list-marker-native").first()).toHaveCSS(
    "list-style-type",
    "disc",
  );
  await expect(app.editor.locator('[data-marker="4."] > span')).toHaveCSS(
    "list-style-type",
    "decimal",
  );
  const edit = await positions(app.editor);
  await app.modeButton("Preview").click();
  const preview = await positions(app.preview);
  for (let i = 0; i < edit.length; i++) {
    expect(edit[i].x).toBeCloseTo(preview[i].x, 0);
    expect(
      edit[i].y - edit[0].y,
      JSON.stringify({ i, edit, preview }),
    ).toBeCloseTo(preview[i].y - preview[0].y, 0);
  }
});

for (const theme of ["light", "dark", "one-dark", "solarized-light"]) {
  test(`shows quote selection above the quote background in ${theme}`, async ({
    app,
    page,
  }, testInfo) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("settings/theme", theme),
      theme,
    );
    await openStored(app, "> Selected quote text\n> second line\n\nEND");
    await app.selectInEditor({ line: 0, ch: 2 }, { line: 1, ch: 8 });
    await app.focusEditor();
    const selected = app.editor.locator(".cn-selected-text").first();
    await expect(selected).toContainText("Selected quote text");
    const colors = await selected.evaluate((el) => ({
      selection: getComputedStyle(el).backgroundColor,
      quote: getComputedStyle(el.closest(".cn-quote")!, "::before")
        .backgroundColor,
    }));
    expect(colors.selection).not.toBe(colors.quote);
    expect(colors.selection).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({
      path: testInfo.outputPath("quote-selected-visible.png"),
    });
  });
}

test("keeps setext activation inside its own heading and separator", async ({
  app,
}) => {
  await openStored(
    app,
    "TitleOne\n========\n\nAfterOne\n\nTitleTwo\n--------\n\nAfterTwo\n\nEND",
  );
  const rect = (word: string) =>
    app.editor
      .locator(".cm-line")
      .filter({ hasText: new RegExp(`^${word}$`) })
      .boundingBox();
  const after = await rect("AfterOne");
  const next = await rect("TitleTwo");
  await app.editor
    .locator(".cm-line")
    .filter({ hasText: /^TitleOne$/ })
    .click();
  await expect(app.editor.locator(".cn-setext-mark")).toContainText("========");
  expect(await rect("AfterOne")).toEqual(after);
  expect(await rect("TitleTwo")).toEqual(next);
  await app.selectInEditor({ line: 10, ch: 0 });
  const editGap = after!.y - (await rect("TitleOne"))!.y;
  await app.modeButton("Preview").click();
  const h1 = await app.preview.locator("h1").boundingBox();
  const p = await app.preview
    .locator("p")
    .filter({ hasText: /^AfterOne$/ })
    .boundingBox();
  expect(editGap).toBeCloseTo(p!.y - h1!.y, 0);
});

for (const width of [1920, 640]) {
  test(`keeps real clicks and visible carets aligned throughout the mixed note at ${width}`, async ({
    app,
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1080 });
    await openStored(app, layoutSample);
    await page.getByRole("button", { name: "Table of contents" }).click();
    const lines = layoutSample.split("\n");
    async function clickLine(label: string) {
      const line = app.editor.locator(".cm-line").filter({ hasText: label });
      await revealEditor(app, line);
      await line.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      // Read actual glyphs before the click, without asking CodeMirror to
      // measure its coordinates (which could hide a stale height map).
      const point = await line.evaluate((el, label) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const at = node.textContent?.indexOf(label) ?? -1;
          if (at < 0) continue;
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + label.length);
          const box = r.getClientRects()[0];
          return { x: box.x + 5, y: box.y + box.height / 2 };
        }
        throw new Error(label);
      }, label);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.up();
      const hit = await page.evaluate(
        ({ x, y }) => ({
          x,
          y,
          target: document.elementFromPoint(x, y)?.outerHTML.slice(0, 200),
          scroll: document.querySelector(".cm-scroller")?.scrollTop,
        }),
        point,
      );
      expect((await app.caret()).line, JSON.stringify({ label, hit })).toBe(
        lines.findIndex((l) => l.includes(label)),
      );
      await expect
        .poll(
          async () => {
            const box = await app.editor
              .locator(".cm-cursor")
              .first()
              .boundingBox();
            return Math.abs(box!.y + box!.height / 2 - point.y);
          },
          { message: label },
        )
        .toBeLessThan(3);
    }
    for (const label of ["A03", "B03", "B04", "C03", "E14", "E15"])
      await clickLine(label);
    for (let i = 0; i < 10; i++) {
      const code = app.editor
        .locator(".cn-code-preview")
        .filter({ hasText: "def total" });
      await revealEditor(app, code);
      await code.locator("pre").click({ position: { x: 70, y: 20 } });
      await clickLine("C03");
    }
    await clickLine("B04");
    const b3 = app.editor.locator(".cm-line").filter({ hasText: "B03" });
    await revealEditor(app, b3);
    const box = await b3.boundingBox();
    await page.mouse.click(box!.x + 35, box!.y + box!.height + 8);
    await clickLine("B03");
    const diagram = app.editor.locator(".cn-code-preview .mermaid svg");
    await revealEditor(app, diagram);
    await diagram.click();
    for (const label of ["mermaid", "graph TD", "A[开始]", "B --> C[预览]"])
      await clickLine(label);
    expect(await app.editorText()).toBe(layoutSample);
  });
}

test("renders Mermaid until clicked and restores the diagram after editing", async ({
  app,
  page,
}, testInfo) => {
  const text = "Before\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter\n\nEND";
  const file = await openStored(app, text);
  await app.refuseWrites();
  const diagram = app.editor.locator(".cn-code-preview .mermaid svg");
  await expect(diagram).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mermaid-inactive.png") });
  await diagram.click();
  const source = app.editor
    .locator(".cm-line")
    .filter({ hasText: "```mermaid" });
  await expect(source).toBeVisible();
  await expect(source).toHaveCSS("font-size", "16px");
  await expect(source).toHaveCSS("line-height", "24px");
  expect((await app.caret()).line).toBe(3);
  await source.click({ position: { x: 60, y: 12 } });
  expect((await app.caret()).line).toBe(2);
  await app.editor
    .locator(".cm-line")
    .filter({ hasText: /^After$/ })
    .click();
  await expect(diagram).toBeVisible();
  expect(await app.editorText()).toBe(text);
  expect(await app.storedText(file)).toBe(text);
  expect((await app.refusedWrites()).filter((w) => w === "file")).toEqual([]);
});

test("redraws multiple live diagrams in a changed theme and lets invalid diagrams be corrected", async ({
  app,
  page,
}) => {
  await openStored(
    app,
    "```mermaid\ngraph TD; A-->B\n```\n\n```mermaid\ngraph LR; C-->D\n```\n\n```mermaid\nnot a diagram\n```\n\nEND",
  );
  const diagrams = app.editor.locator(".cn-code-preview .mermaid svg");
  await expect(diagrams).toHaveCount(2);
  const lightFill = await diagrams
    .first()
    .locator(".node rect")
    .first()
    .evaluate((el) => getComputedStyle(el).fill);
  await app.openSettings();
  await page
    .getByRole("combobox")
    .filter({ hasText: /^light$/ })
    .click();
  await page.getByRole("option", { name: "dark", exact: true }).click();
  await app.selectTab("README");
  await expect(diagrams).toHaveCount(2);
  await expect
    .poll(() =>
      diagrams
        .first()
        .locator(".node rect")
        .first()
        .evaluate((el) => getComputedStyle(el).fill),
    )
    .not.toBe(lightFill);
  const error = app.editor.locator(".cn-code-preview .language-error");
  await expect(error).toBeVisible();
  await error.click();
  await expect(
    app.editor.locator(".cm-line").filter({ hasText: "not a diagram" }),
  ).toBeVisible();
  await expect(diagrams).toHaveCount(2);
  await app.selectInEditor({ line: 9, ch: 0 }, { line: 9, ch: 13 });
  await app.focusEditor();
  await page.keyboard.insertText("graph TD; E-->F");
  await app.editor.locator(".cm-line").filter({ hasText: /^END$/ }).click();
  await expect(diagrams).toHaveCount(3);
  await app.focusEditor();
  await page.keyboard.press("Control+z");
  await app.selectInEditor({ line: 12, ch: 0 });
  await expect(error).toBeVisible();
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
