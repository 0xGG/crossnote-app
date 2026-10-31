// R3-0 risk check of the CodeMirror 6 prototype (archive/r3-0-cm6), not for
// main. Five of the six checks in .pr-docs/pr-r3-0-editor-prototypes.md 4.5:
// typing through an input method next to hidden markup and widgets (the
// composition driven over the DevTools protocol), selecting and deleting a
// widget, mounting and unmounting the kanban widget's React root, undo and
// redo across mode switches, and opening a note without writing it. The
// sixth, typing latency, is r3-0-latency.spec.ts.
import type { CDPSession, Page } from "@playwright/test";
import type { CrossnoteApp, EditorHost, TextPosition } from "./crossnote";
import { expect, test } from "./fixtures";

const board =
  '<!-- @crossnote.kanban "board":{"columns":[{"id":1,"title":"Todo","cards":[{"id":2,"title":"Card","description":"desc"}]}]} -->';
const timer = '<!-- @timer "date":"2026-11-01T00:00:00.000Z","duration":60 -->';

// Where the index-th code unit of text is, as the handle counts.
function at(text: string, index: number): TextPosition {
  const before = text.slice(0, index).split("\n");
  return { line: before.length - 1, ch: before[before.length - 1].length };
}

async function openNote(
  app: CrossnoteApp,
  text: string,
  beforeOpening?: () => Promise<unknown>,
): Promise<string> {
  await app.open();
  await app.openNotes();
  const readme = `${await app.notebookFolder()}/README.md`;
  await app.storedText(readme, text);
  await app.page.reload();
  await app.waitUntilReady();
  await beforeOpening?.();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  await app.modeButton("Edit").click();
  await expect(app.editor).toBeVisible();
  return readme;
}

async function placeCaret(
  app: CrossnoteApp,
  anchor: TextPosition,
  head?: TextPosition,
) {
  await app.editor.evaluate(
    (element, [anchor, head]) => {
      const editor = (element as EditorHost).editorHandle;
      editor.focus();
      editor.select(anchor, head ?? undefined);
    },
    [anchor, head ?? null] as const,
  );
}

// What is stored, less the front matter the app puts before the text of a
// note that has none when it saves it.
async function storedBody(app: CrossnoteApp, file: string) {
  const text = await app.storedText(file);
  return text?.replace(/^---\n(?:.*\n)*?---\n/, "");
}

type Roots = { live: number; mounted: number; unmounted: number };
function roots(page: Page): Promise<Roots> {
  return page.evaluate(() => {
    const roots = (
      window as unknown as {
        widgetRoots: {
          liveInEditor: number;
          mounted: number;
          unmounted: number;
        };
      }
    ).widgetRoots;
    return {
      live: roots.liveInEditor,
      mounted: roots.mounted,
      unmounted: roots.unmounted,
    };
  });
}

// Messages React or the editor put in the console.
function consoleProblems(page: Page): string[] {
  const kept: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      kept.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => kept.push(`pageerror: ${error.message}`));
  return kept;
}

// 1. Input method. Each case is a fresh page, so each composition is the
// first one the page sees (Chromium 149 on Windows lost that one in some
// CodeMirror 6 versions).
const imeText = `# 标题\n\n前面 **粗体** 后面\n\n${board}\n\n行内 ${timer} 之后\n\n末行`;
const imeCases: { name: string; index: number }[] = [
  { name: "at the end of a heading, its marks shown", index: "# 标题".length },
  {
    name: "at the end of a line whose bold marks are hidden",
    index: imeText.indexOf(" 后面") + " 后面".length,
  },
  {
    name: "one space after hidden bold marks",
    index: imeText.indexOf(" 后面") + 1,
  },
  {
    name: "right after the closing bold marks",
    index: imeText.indexOf(" 后面"),
  },
  { name: "inside bold text", index: imeText.indexOf("粗体") + 1 },
  {
    name: "on the empty line under a block widget",
    index: imeText.indexOf(board) + board.length + 1,
  },
  {
    name: "on the empty line over a block widget",
    index: imeText.indexOf(board) - 1,
  },
  { name: "right before an inline widget", index: imeText.indexOf(timer) },
  {
    name: "right after an inline widget",
    index: imeText.indexOf(timer) + timer.length,
  },
];

async function compose(cdp: CDPSession, steps: string[], commit: string) {
  for (const text of steps) {
    await cdp.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  }
  await cdp.send("Input.insertText", { text: commit });
}

for (const { name, index } of imeCases) {
  test(`IME: composes ${name}`, async ({ app, page }) => {
    const problems = consoleProblems(page);
    const readme = await openNote(app, imeText);
    await placeCaret(app, at(imeText, index));
    await app.editor.evaluate((element) => {
      const events: string[] = [];
      (window as unknown as { compositions: string[] }).compositions = events;
      for (const type of ["compositionstart", "compositionend"]) {
        element.addEventListener(type, () => events.push(type), true);
      }
    });
    const cdp = await page.context().newCDPSession(page);
    await compose(cdp, ["z", "zh", "zhong", "zhong'w", "中文"], "中文");
    const expected = imeText.slice(0, index) + "中文" + imeText.slice(index);
    await expect.poll(() => app.editorText()).toBe(expected);
    expect(await app.caret()).toEqual(at(expected, index + 2));
    // A second word at the same place.
    await compose(cdp, ["c", "ce", "ceshi", "测试"], "测试");
    const twice = imeText.slice(0, index) + "中文测试" + imeText.slice(index);
    await expect.poll(() => app.editorText()).toBe(twice);
    // A composition given up leaves nothing behind.
    await cdp.send("Input.imeSetComposition", {
      text: "abc",
      selectionStart: 3,
      selectionEnd: 3,
    });
    await cdp.send("Input.imeSetComposition", {
      text: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    await expect.poll(() => app.editorText()).toBe(twice);
    // What is drawn holds the words once, and the widgets are still drawn.
    const drawn = await app.editor.evaluate(
      (element) => element.querySelector(".cm-content")!.textContent ?? "",
    );
    expect(drawn.split("中文测试").length - 1).toBe(1);
    await expect(app.editor.locator(".cm6-widget")).toHaveCount(2);
    test.info().annotations.push({
      type: "composition events",
      description: (
        await page.evaluate(
          () => (window as unknown as { compositions: string[] }).compositions,
        )
      ).join(","),
    });
    await expect.poll(() => storedBody(app, readme)).toBe(twice);
    expect(problems).toEqual([]);
  });
}

// 2. Selecting and deleting a widget.
const widgetText = `上一行\n\n${board}\n\n下一行\n\n行内 ${timer} 之后`;
const boardFrom = widgetText.indexOf(board);
const boardTo = boardFrom + board.length;
const timerFrom = widgetText.indexOf(timer);
const timerTo = timerFrom + timer.length;

test("widget: the caret steps over a block widget", async ({ app, page }) => {
  await openNote(app, widgetText);
  await placeCaret(app, at(widgetText, "上一行".length));
  const offsets: number[] = [];
  const offsetOf = async () => {
    const { line, ch } = await app.caret();
    const lines = widgetText.split("\n");
    return (
      lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0) + ch
    );
  };
  for (const key of [
    "ArrowDown",
    "ArrowDown",
    "ArrowDown",
    "ArrowUp",
    "ArrowUp",
    "ArrowUp",
  ]) {
    await page.keyboard.press(key);
    offsets.push(await offsetOf());
  }
  for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft"]) {
    await page.keyboard.press(key);
    offsets.push(await offsetOf());
  }
  test.info().annotations.push({
    type: "caret offsets",
    description: offsets.join(","),
  });
  for (const offset of offsets) {
    expect(offset <= boardFrom || offset >= boardTo, `caret at ${offset}`).toBe(
      true,
    );
  }
  expect(await app.editorText()).toBe(widgetText);
});

test("widget: Backspace after a block widget takes all of it", async ({
  app,
  page,
}) => {
  await openNote(app, widgetText);
  await expect.poll(async () => (await roots(page)).live).toBe(2);
  await placeCaret(app, at(widgetText, boardTo + 1));
  await page.keyboard.press("Backspace");
  expect(await app.editorText()).toBe(
    widgetText.slice(0, boardTo) + widgetText.slice(boardTo + 1),
  );
  await page.keyboard.press("Backspace");
  expect(await app.editorText()).toBe(
    widgetText.slice(0, boardFrom) + widgetText.slice(boardTo + 1),
  );
  await expect.poll(async () => (await roots(page)).live).toBe(1);
});

test("widget: Delete before a block widget takes all of it", async ({
  app,
  page,
}) => {
  await openNote(app, widgetText);
  await placeCaret(app, at(widgetText, boardFrom - 1));
  await page.keyboard.press("Delete");
  await page.keyboard.press("Delete");
  expect(await app.editorText()).toBe(
    widgetText.slice(0, boardFrom - 1) + widgetText.slice(boardTo),
  );
  await expect.poll(async () => (await roots(page)).live).toBe(1);
});

test("widget: a selection across a widget holds all of its comment", async ({
  app,
  page,
}) => {
  await openNote(app, widgetText);
  await placeCaret(app, at(widgetText, boardFrom - 1));
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const selected = await app.editorSelection();
  expect(selected).toContain(board);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+x");
  expect(await app.editorText()).not.toContain("<!-- @crossnote.kanban");
  expect(await app.editorText()).not.toContain('"Todo"');
});

test("widget: select all and delete unmounts every widget", async ({
  app,
  page,
}) => {
  const readme = await openNote(app, widgetText);
  await expect.poll(async () => (await roots(page)).live).toBe(2);
  await placeCaret(app, at(widgetText, 0));
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  expect(await app.editorText()).toBe("");
  await expect.poll(async () => (await roots(page)).live).toBe(0);
  await expect.poll(() => storedBody(app, readme)).toBe("");
});

test("widget: Backspace after an inline widget takes all of it", async ({
  app,
  page,
}) => {
  await openNote(app, widgetText);
  await placeCaret(app, at(widgetText, timerTo));
  await page.keyboard.press("Backspace");
  expect(await app.editorText()).toBe(
    widgetText.slice(0, timerFrom) + widgetText.slice(timerTo),
  );
  await expect.poll(async () => (await roots(page)).live).toBe(1);
});

test("widget: the kanban board's own delete button takes its comment out", async ({
  app,
  page,
}) => {
  const readme = await openNote(app, widgetText);
  await app.editor.getByRole("button", { name: "Delete", exact: true }).click();
  const expected = widgetText.slice(0, boardFrom) + widgetText.slice(boardTo);
  await expect.poll(() => app.editorText()).toBe(expected);
  await expect.poll(async () => (await roots(page)).live).toBe(1);
  await expect.poll(() => storedBody(app, readme)).toBe(expected);
});

test("widget: a click in a widget leaves the caret outside it", async ({
  app,
}) => {
  await openNote(app, widgetText);
  await placeCaret(app, at(widgetText, 0));
  await app.editor.getByText("Todo", { exact: true }).click();
  const caret = await app.caret();
  const offset = widgetText
    .split("\n")
    .slice(0, caret.line)
    .reduce((sum, text) => sum + text.length + 1, caret.ch);
  expect(offset <= boardFrom || offset >= boardTo, `caret at ${offset}`).toBe(
    true,
  );
  expect(await app.editorText()).toBe(widgetText);
});

// 3. The kanban widget's React root.
test("kanban: mounts one root, keeps it over other edits, swaps it on its own change and unmounts it", async ({
  app,
  page,
}) => {
  const problems = consoleProblems(page);
  const text = `上一行\n\n${board}\n\n下一行`;
  const readme = await openNote(app, text);
  await expect.poll(() => roots(page)).toMatchObject({ live: 1 });
  const start = await roots(page);
  const steps: Record<string, Roots> = { opened: start };

  await placeCaret(app, at(text, "上一行".length));
  await page.keyboard.type("abc");
  await expect
    .poll(() => app.editorText())
    .toBe(`上一行abc\n\n${board}\n\n下一行`);
  steps.typedElsewhere = await roots(page);
  expect(steps.typedElsewhere).toEqual(start);

  await app.editor.getByRole("button", { name: "Add new column" }).click();
  await expect.poll(() => app.editorText()).toContain('"title":"untitled"');
  await expect
    .poll(() => roots(page))
    .toEqual({
      live: 1,
      mounted: start.mounted + 1,
      unmounted: start.unmounted + 1,
    });
  steps.ownChange = await roots(page);

  await app.editor.evaluate((element) =>
    (element as EditorHost).editorHandle.focus(),
  );
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => app.editorText())
    .toBe(`上一行abc\n\n${board}\n\n下一行`);
  await expect.poll(() => roots(page)).toMatchObject({ live: 1 });
  steps.undone = await roots(page);

  await app.modeButton("Source code").click();
  await expect.poll(() => roots(page)).toMatchObject({ live: 0 });
  steps.source = await roots(page);
  await app.modeButton("Edit").click();
  await expect.poll(() => roots(page)).toMatchObject({ live: 1 });
  steps.edit = await roots(page);
  await app.modeButton("Preview").click();
  await expect(app.preview).toBeVisible();
  // The preview draws the board as well, with a root the editor does not
  // own; the hidden editor takes its widgets away as source code mode does.
  await expect.poll(() => roots(page)).toMatchObject({ live: 0 });
  steps.preview = await roots(page);
  // Closed from edit mode, with the widget mounted.
  await app.modeButton("Edit").click();
  await expect.poll(() => roots(page)).toMatchObject({ live: 1 });
  steps.editAgain = await roots(page);

  await app.tab("README").hover();
  await page
    .locator(".flexlayout__tab_button", { hasText: "README" })
    .locator(".flexlayout__tab_button_trailing")
    .click();
  await expect(app.tab("README")).toHaveCount(0);
  await expect.poll(() => roots(page)).toMatchObject({ live: 0 });
  steps.closed = await roots(page);
  test
    .info()
    .annotations.push({ type: "roots", description: JSON.stringify(steps) });
  await expect
    .poll(() => storedBody(app, readme))
    .toBe(`上一行abc\n\n${board}\n\n下一行`);
  expect(problems).toEqual([]);
});

// 4. Undo and redo across mode switches.
test("undo: the history outlasts switching between edit, source code and preview", async ({
  app,
  page,
}) => {
  const text = `第一行\n\n${board}\n`;
  const readme = await openNote(app, text);
  const typeAtEnd = async (typed: string) => {
    await placeCaret(app, at(text, "第一行".length));
    await page.keyboard.type(typed);
  };
  const focus = () =>
    app.editor.evaluate((element) =>
      (element as EditorHost).editorHandle.focus(),
    );
  const history: string[] = [];

  await typeAtEnd("abc");
  await expect.poll(() => app.editorText()).toBe(`第一行abc\n\n${board}\n`);
  await app.modeButton("Source code").click();
  await focus();
  await page.keyboard.press("Control+z");
  history.push(await app.editorText());
  expect(history.at(-1)).toBe(text);

  await app.modeButton("Preview").click();
  await app.modeButton("Edit").click();
  await focus();
  await page.keyboard.press("Control+y");
  history.push(await app.editorText());
  expect(history.at(-1)).toBe(`第一行abc\n\n${board}\n`);

  await app.modeButton("Source code").click();
  await focus();
  await page.keyboard.press("End");
  await page.keyboard.type("def");
  await app.modeButton("Edit").click();
  await focus();
  await page.keyboard.press("Control+z");
  history.push(await app.editorText());
  expect(history.at(-1)).toBe(`第一行abc\n\n${board}\n`);

  // A change the widget makes, undone in source code mode.
  await page.keyboard.press("Control+y");
  await app.editor.getByRole("button", { name: "Add new column" }).click();
  await expect.poll(() => app.editorText()).toContain('"title":"untitled"');
  await app.modeButton("Source code").click();
  await focus();
  await page.keyboard.press("Control+z");
  history.push(await app.editorText());
  expect(history.at(-1)).toBe(`第一行abcdef\n\n${board}\n`);
  // A keyboard gives the key as "Z" while Shift is held; Playwright gives
  // what it is told.
  await page.evaluate(() => {
    const keys: string[] = [];
    (window as unknown as { keys: string[] }).keys = keys;
    document.addEventListener(
      "keydown",
      (event) =>
        keys.push(`${event.key} shift=${event.shiftKey} ctrl=${event.ctrlKey}`),
      true,
    );
  });
  await page.keyboard.press("Control+Shift+Z");
  test.info().annotations.push({
    type: "keys",
    description: (
      await page.evaluate(() => (window as unknown as { keys: string[] }).keys)
    ).join("; "),
  });
  history.push(await app.editorText());
  expect(history.at(-1)).toContain('"title":"untitled"');
  test.info().annotations.push({
    type: "history",
    description: JSON.stringify(history),
  });
  await expect.poll(() => storedBody(app, readme)).toBe(history.at(-1));
});

// 5. Opening a note, moving around in it and switching modes writes nothing.
test("open: a note opened, looked through and switched between modes is not written", async ({
  app,
  page,
}) => {
  const text =
    "---\r\ntitle: 不写盘\r\ntags: [a, b]\r\n---\r\n# 标题  \r\n\r\n前面 **粗体** 后面\t\r\n\r\n" +
    board +
    "\r\n\r\n行内 " +
    timer +
    " 之后\r\n末行";
  const readme = await openNote(app, text, () => app.refuseWrites());
  await expect(app.editor.getByText("Todo", { exact: true })).toBeVisible();
  await app.editor.getByText("末行").click();
  for (const key of [
    "ArrowUp",
    "ArrowUp",
    "ArrowUp",
    "ArrowUp",
    "Home",
    "End",
    "ArrowDown",
  ]) {
    await page.keyboard.press(key);
  }
  await app.editor.getByText("Todo", { exact: true }).click();
  await placeCaret(app, { line: 0, ch: 0 }, { line: 6, ch: 2 });
  await page.keyboard.press("Control+c");
  for (const mode of [
    "Source code",
    "Preview",
    "Edit",
    "Source code",
    "Edit",
  ] as const) {
    await app.modeButton(mode).click();
  }
  await page.waitForTimeout(1500);
  // The directory tree ("!root") is written as the app starts and as a note
  // opens, the CodeMirror 5 build of main included (.cache/r3-0/tmp/); what
  // the editor must not cause is a write of a file.
  const refused = await app.refusedWrites();
  test.info().annotations.push({
    type: "refused writes",
    description: refused.join(","),
  });
  expect(refused.filter((write) => write !== "!root")).toEqual([]);
  expect(await app.storedText(readme)).toBe(text);
});
