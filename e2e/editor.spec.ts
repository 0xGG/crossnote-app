import type { CDPSession, Page } from "@playwright/test";
import type { CrossnoteApp, EditorHost, TextPosition } from "./crossnote";
import { expect, test } from "./fixtures";
import { layoutOf, row, tabset } from "./layouts";

// The note editor: typing through an input method beside what the live
// preview hides and draws, the keys, completion, the table of contents, a
// note open in two tabs, and line endings.

// Where the index-th code unit of a text is, as the editor's handle counts.
function at(text: string, index: number): TextPosition {
  const before = text.slice(0, index).split("\n");
  return { line: before.length - 1, ch: before[before.length - 1].length };
}

// Opens the README holding a text, in the editor.
async function openNote(
  app: CrossnoteApp,
  text: string,
  mode: "Edit" | "Source code" = "Edit",
  shownText = text,
): Promise<string> {
  await app.open();
  // Only the notebook's notes are open, so the note opens on the click
  // below, not as the page loads the layout.
  await app.openNotes();
  const readme = `${await app.notebookFolder()}/README.md`;
  await app.storedText(readme, text);
  await app.page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  await app.modeButton(mode).click();
  await expect(app.editor).toBeVisible();
  await expect.poll(() => app.editorText()).toBe(shownText);
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
  return text?.replace(
    /^---(?:\r\n|\r|\n)(?:[^\r\n]*(?:\r\n|\r|\n))*?---(?:\r\n|\r|\n)/,
    "",
  );
}

// Errors and warnings React or the editor put in the console.
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

// What the editor draws, as text.
const drawnText = (app: CrossnoteApp) =>
  app.editor.evaluate(
    (element) => element.querySelector(".cm-content")!.textContent ?? "",
  );

// The list of completions that is open.
const completions = (page: Page) => page.locator(".cm-tooltip-autocomplete li");

test("renders multiline link suffixes without a view-plugin exception", async ({
  app,
  page,
}) => {
  const errors = consoleProblems(page);
  const text = '[text](\nhttps://example.org\n"Title")\n\nLast';
  await openNote(app, text);
  await placeCaret(app, { line: 4, ch: 4 });
  await expect(app.editor.locator(".cm-line").last()).toHaveText("Last");
  await expect.poll(() => drawnText(app)).toContain("https://example.org");
  expect(await app.editorText()).toBe(text);
  expect(errors).toEqual([]);
});

test("renders quoted TeX consistently in the editor and formula tooltip", async ({
  app,
  page,
}) => {
  const text = "> $$\n> a > b\n> $$\n\nLast";
  await openNote(app, text);
  await placeCaret(app, { line: 4, ch: 4 });
  await expect(app.editor.locator(".cn-math annotation")).toHaveText("a > b");
  await placeCaret(app, { line: 1, ch: 3 });
  await expect(
    page.locator(".cm-tooltip.cn-math-preview annotation"),
  ).toHaveText("a > b");
  expect(await app.editorText()).toBe(text);
});

test("opens decoded Markdown note destinations from the editor", async ({
  app,
}) => {
  await openNote(
    app,
    "[parentheses](a\\(b\\).md)\n\n[colon](Re:Zero.md)\n\n[angle](a\\>)\n\nLast",
  );
  await placeCaret(app, { line: 6, ch: 4 });
  await app.editor
    .locator(".cn-link")
    .filter({ hasText: "parentheses" })
    .click({ modifiers: ["Control"] });
  await expect(app.tab("a(b)")).toBeVisible();
  await app.selectTab("README");
  await app.editor
    .filter({ visible: true })
    .locator(".cn-link")
    .filter({ hasText: "colon" })
    .click({ modifiers: ["Control"] });
  await expect(app.tab("Re:Zero")).toBeVisible();
  await app.selectTab("README");
  await app.editor
    .filter({ visible: true })
    .locator(".cn-link")
    .filter({ hasText: "angle" })
    .click({ modifiers: ["Control"] });
  await expect(app.tab("a>")).toBeVisible();
});

// Enter on the list. The list takes no key for a moment after it opens, so
// that one meant for the text is not taken for a choice.
async function pick(page: Page) {
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
}

test.describe("an input method", () => {
  // A composition is driven over the DevTools protocol, as an input method
  // drives one: it goes through the browser's composition events, not
  // through the input method's own program. Each case is a fresh page, so
  // each composition is the first one the page sees.
  const text =
    "# 标题\n\n前面 **粗体** 后面\n\n$$\nE = mc^2\n$$\n\n行内 $x^2$ 之后 :smile: 尾\n\n- [ ] 待办\n\n| 甲 | 乙 |\n| --- | --- |\n\n末行";
  const cases: { name: string; index: number }[] = [
    {
      name: "at the end of a heading, its signs shown",
      index: "# 标题".length,
    },
    {
      name: "at the end of a line whose bold marks are hidden",
      index: text.indexOf(" 后面") + " 后面".length,
    },
    {
      name: "one space after hidden bold marks",
      index: text.indexOf(" 后面") + 1,
    },
    {
      name: "right after the closing bold marks",
      index: text.indexOf(" 后面"),
    },
    { name: "inside bold text", index: text.indexOf("粗体") + 1 },
    {
      name: "on the empty line under a formula drawn over three lines",
      index: text.indexOf("$$\n\n") + 3,
    },
    {
      name: "on the empty line over a formula drawn over three lines",
      index: text.indexOf("\n$$\nE"),
    },
    { name: "right before a formula in a line", index: text.indexOf("$x^2$") },
    {
      name: "right after a formula in a line",
      index: text.indexOf("$x^2$") + "$x^2$".length,
    },
    {
      name: "right after an emoji drawn in place of its short name",
      index: text.indexOf(":smile:") + ":smile:".length,
    },
    {
      name: "at the start of a task, after its box",
      index: text.indexOf("待办"),
    },
    { name: "in a table's cell", index: text.indexOf("甲") + 1 },
  ];

  async function compose(cdp: CDPSession, steps: string[], commit: string) {
    for (const step of steps) {
      await cdp.send("Input.imeSetComposition", {
        text: step,
        selectionStart: step.length,
        selectionEnd: step.length,
      });
    }
    await cdp.send("Input.insertText", { text: commit });
  }

  for (const { name, index } of cases) {
    test(`composes ${name}`, async ({ app, page }) => {
      const problems = consoleProblems(page);
      const readme = await openNote(app, text);
      await placeCaret(app, at(text, index));
      const cdp = await page.context().newCDPSession(page);
      await compose(cdp, ["z", "zh", "zhong", "zhong'w", "中文"], "中文");
      const expected = text.slice(0, index) + "中文" + text.slice(index);
      await expect.poll(() => app.editorText()).toBe(expected);
      expect(await app.caret()).toEqual(at(expected, index + 2));
      // A second word at the same place.
      await compose(cdp, ["c", "ce", "ceshi", "测试"], "测试");
      const twice = text.slice(0, index) + "中文测试" + text.slice(index);
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
      // What is drawn holds the words once.
      expect((await drawnText(app)).split("中文测试").length - 1).toBe(1);
      await expect.poll(() => storedBody(app, readme)).toBe(twice);
      expect(problems).toEqual([]);
    });
  }

  test("composes after a colon without the list of emoji taking the word", async ({
    app,
    page,
  }) => {
    await openNote(app, "Text\n");
    await placeCaret(app, { line: 0, ch: 4 });
    await page.keyboard.type(" :");
    const cdp = await page.context().newCDPSession(page);
    await compose(cdp, ["x", "xiao", "笑"], "笑");
    await expect.poll(() => app.editorText()).toBe("Text :笑\n");
  });
});

test.describe("the live preview", () => {
  test("hides markup away from the caret and shows it at the caret, the text staying the note's", async ({
    app,
  }) => {
    const text =
      "# Title\n\nSome **bold** and [a link](https://example.org) here.\n\nLast line\n";
    await openNote(app, text);
    await placeCaret(app, at(text, text.indexOf("Last") + 4));
    await expect
      .poll(() => drawnText(app))
      .toBe("TitleSome bold and a link here.Last line");
    await placeCaret(app, at(text, text.indexOf("bold") + 2));
    await expect.poll(() => drawnText(app)).toContain("**bold**");
    await placeCaret(app, { line: 0, ch: 3 });
    await expect.poll(() => drawnText(app)).toContain("# Title");
    expect(await app.editorText()).toBe(text);
  });

  test("draws formulas, an emoji and a task's box, and ticks the task on a click", async ({
    app,
    page,
  }) => {
    const text =
      "Inline $x^2$ and :smile:\n\n$$\nE = mc^2\n$$\n\n- [ ] to do\n\nLast\n";
    const readme = await openNote(app, text);
    await placeCaret(app, at(text, text.indexOf("Last")));
    await expect(app.editor.locator(".cn-math .katex")).toHaveCount(2);
    await expect(app.editor.locator(".cn-math-display")).toHaveCount(1);
    await expect(app.editor.locator(".cn-emoji img.emoji")).toHaveCount(1);
    const box = app.editor.locator("input.cn-task");
    await expect(box).not.toBeChecked();
    await box.click();
    await expect.poll(() => app.editorText()).toContain("- [x] to do");
    await expect(app.editor.locator("input.cn-task")).toBeChecked();
    await expect
      .poll(() => storedBody(app, readme))
      .toBe(text.replace("[ ]", "[x]"));
    // Nothing the page's policy refuses was needed to draw these.
    await expect(page.locator(".cn-math-error")).toHaveCount(0);
  });

  test("shows a formula as it will read above the one being typed", async ({
    app,
    page,
  }) => {
    const text = "A formula $x^2$ here\n";
    await openNote(app, text);
    await placeCaret(app, at(text, text.indexOf("x^2") + 1));
    const shown = page.locator(".cm-tooltip.cn-math-preview .katex");
    await expect(shown).toHaveCount(1);
    await page.keyboard.type("y");
    await expect.poll(() => app.editorText()).toBe("A formula $xy^2$ here\n");
    await expect(shown).toHaveCount(1);
    await placeCaret(app, { line: 0, ch: 0 });
    await expect(shown).toHaveCount(0);
  });

  test("keeps an image's element while text is typed elsewhere, and edits the image from a click on it", async ({
    app,
    page,
  }) => {
    const text = '![a picture](https://example.org/a.png "Pic")\n\nText\n';
    await openNote(app, text);
    await placeCaret(app, at(text, text.indexOf("Text") + 4));
    const image = app.editor.locator("img.cn-image");
    await expect(image).toHaveAttribute("alt", "a picture");
    await image.evaluate((element) => {
      (element as HTMLElement & { kept?: boolean }).kept = true;
    });
    await page.keyboard.type(" typed");
    await expect.poll(() => app.editorText()).toContain("Text typed");
    expect(
      await image.evaluate(
        (element) => (element as HTMLElement & { kept?: boolean }).kept,
      ),
    ).toBe(true);

    await image.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox").first()).toHaveValue(
      "https://example.org/a.png",
    );
    await dialog.getByRole("textbox").nth(2).fill("renamed");
    await dialog.getByRole("button", { name: "Update" }).click();
    await expect
      .poll(() => app.editorText())
      .toBe('![renamed](https://example.org/a.png "Pic")\n\nText typed\n');
  });

  test("renders and edits reference images without changing their shared definition", async ({
    app,
    page,
  }) => {
    const definition = '\n\n[pic]: https://example.org/a.png "Pic"\n\nText\n';
    const text = "![first][pic]\n\n![second][pic]" + definition;
    const readme = await openNote(app, text);
    await placeCaret(app, at(text, text.indexOf("Text")));
    const images = app.editor.locator("img.cn-image");
    await expect(images).toHaveCount(2);
    await expect(images.first()).toHaveAttribute("title", "Pic");
    await images.first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox").first()).toHaveValue(
      "https://example.org/a.png",
    );
    await dialog.getByRole("textbox").nth(2).fill("edited");
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    const edited =
      '![edited](https://example.org/a.png "Pic")\n\n![second][pic]' +
      definition;
    await expect.poll(() => storedBody(app, readme)).toBe(edited);
    await placeCaret(app, at(edited, edited.indexOf("Text")));
    await images.nth(1).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect
      .poll(() => storedBody(app, readme))
      .toBe('![edited](https://example.org/a.png "Pic")\n\n' + definition);
  });

  test("shows the words for an empty note until something is typed", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    await app.createNote();
    const placeholder = app.editor.locator(".cm-placeholder");
    await expect(placeholder).toBeVisible();
    await app.typeInEditor("x");
    await expect(placeholder).toHaveCount(0);
    await page.keyboard.press("Backspace");
    await expect(placeholder).toBeVisible();
  });
});

test.describe("the editor's keys", () => {
  // Whether the page kept a key from the browser, read where the browser
  // would act on it.
  async function recordPrevented(page: Page) {
    await page.evaluate(() => {
      const kept: Record<string, boolean> = {};
      (window as unknown as { prevented: typeof kept }).prevented = kept;
      window.addEventListener("keydown", (event) => {
        kept[event.key.toLowerCase()] = event.defaultPrevented;
      });
    });
    return (key: string) =>
      page.evaluate(
        (key) =>
          (window as unknown as { prevented: Record<string, boolean> })
            .prevented[key],
        key,
      );
  }

  test("mark the selection, and take the mark away again", async ({
    app,
    page,
  }) => {
    await openNote(app, "word\n");
    for (const [key, marked] of [
      ["b", "**word**\n"],
      ["i", "*word*\n"],
      ["d", "~~word~~\n"],
    ]) {
      await placeCaret(app, { line: 0, ch: 0 }, { line: 0, ch: 4 });
      const prevented = await recordPrevented(page);
      await page.keyboard.press(`Control+${key}`);
      await expect.poll(() => app.editorText()).toBe(marked);
      expect(await prevented(key)).toBe(true);
      await page.keyboard.press(`Control+${key}`);
      await expect.poll(() => app.editorText()).toBe("word\n");
    }
  });

  test("undo and redo across the editor's modes, with Ctrl+Y and with Ctrl+Shift+Z", async ({
    app,
    page,
  }) => {
    await openNote(app, "Start\n");
    await placeCaret(app, { line: 0, ch: 5 });
    await page.keyboard.type(" one");
    // Apart in time, so that the two are two steps to undo.
    await page.waitForTimeout(700);
    await page.keyboard.type(" two");
    await expect.poll(() => app.editorText()).toBe("Start one two\n");

    await app.modeButton("Source code").click();
    await app.focusEditor();
    await page.keyboard.press("Control+z");
    await expect.poll(() => app.editorText()).toBe("Start one\n");

    // Through the preview and back: the history is still there.
    await app.modeButton("Preview").click();
    await expect(app.preview).toContainText("Start one");
    await app.modeButton("Edit").click();
    await app.focusEditor();
    await page.keyboard.press("Control+z");
    await expect.poll(() => app.editorText()).toBe("Start\n");
    await page.keyboard.press("Control+y");
    await expect.poll(() => app.editorText()).toBe("Start one\n");
    // Shift makes the key a capital letter.
    await page.keyboard.press("Control+Shift+Z");
    await expect.poll(() => app.editorText()).toBe("Start one two\n");
  });

  test("write the note at once on Ctrl+S, and keep the browser's dialog away", async ({
    app,
    page,
  }) => {
    const readme = await openNote(app, "Start\n");
    await placeCaret(app, { line: 0, ch: 5 });
    const prevented = await recordPrevented(page);
    // The page's timers stand still from here on, so the write the editor
    // makes a moment after the last change never comes: twice that moment
    // on, the note is as it was.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    try {
      await page.keyboard.type(" typed");
      await expect.poll(() => app.editorText()).toBe("Start typed\n");
      await page.waitForTimeout(600);
      expect(await storedBody(app, readme)).toBe("Start\n");
      await page.keyboard.press("Control+s");
      expect(await prevented("s")).toBe(true);
      await expect.poll(() => storedBody(app, readme)).toBe("Start typed\n");
    } finally {
      // What ends the test waits on the page's timers.
      await page.clock.resume();
    }
  });

  test("indent a list item with Tab, and leave the editor with Tab after Escape", async ({
    app,
    page,
  }) => {
    await openNote(app, "- one\n- two\n");
    await placeCaret(app, { line: 1, ch: 5 });
    await page.keyboard.press("Tab");
    await expect.poll(() => app.editorText()).toBe("- one\n    - two\n");
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => app.editorText()).toBe("- one\n- two\n");
    expect(await app.editorHasFocus()).toBe(true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect.poll(() => app.editorHasFocus()).toBe(false);
    expect(await app.editorText()).toBe("- one\n- two\n");
  });

  test("go from cell to cell in a table, and start a row after the last", async ({
    app,
    page,
  }) => {
    const text = "| a | b |\n| --- | --- |\n| c | d |\n";
    await openNote(app, text);
    await placeCaret(app, { line: 0, ch: 3 });
    await page.keyboard.press("Tab");
    expect(await app.editorSelection()).toBe("b");
    await page.keyboard.press("Tab");
    expect(await app.editorSelection()).toBe("c");
    await page.keyboard.press("Shift+Tab");
    expect(await app.editorSelection()).toBe("b");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect
      .poll(() => app.editorText())
      .toBe("| a | b |\n| --- | --- |\n| c | d |\n|   |   |\n");
    await page.keyboard.type("e");
    // Enter in a row starts the next; in an empty row it ends the table.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => app.editorText())
      .toBe("| a | b |\n| --- | --- |\n| c | d |\n| e  |   |\n\n");
  });

  test("open a link on a click with Ctrl held, and put the caret there on a plain one", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    const name = await app.createNote();
    await app.setEditorText("See [[README]] for more.\n\nLast\n");
    await placeCaret(app, { line: 2, ch: 4 });
    const link = app.editor.locator(".cn-wikilink");
    await link.click();
    // A plain click is the editor's: the link shows as typed.
    await expect.poll(() => drawnText(app)).toContain("[[README]]");
    await expect(app.tab("README")).toHaveCount(0);
    await placeCaret(app, { line: 2, ch: 4 });
    await link.click({ modifiers: ["Control"] });
    await expect(app.tab("README")).toBeVisible();
    await expect(app.tab(name)).toBeVisible();
  });
});

test.describe("completion", () => {
  test("lists the commands after a slash, each with its picture and what it is called", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    await app.createNote();
    await app.typeInEditor("/");
    await expect(completions(page)).toHaveCount(12);
    await expect(completions(page).first()).toContainText("/h1");
    await expect(completions(page).first()).toContainText("Insert header 1");
    await expect(
      completions(page).locator(".cn-completion-icon svg"),
    ).toHaveCount(12);
    await expect(completions(page).last()).toContainText(
      "Insert a Mermaid diagram",
    );
    await page.keyboard.type("h2");
    await expect(completions(page)).toHaveCount(1);
    await pick(page);
    await expect.poll(() => app.editorText()).toBe("## ");
    await page.keyboard.type("Title");
    await expect.poll(() => app.editorText()).toBe("## Title");
  });

  test("writes the date and time for /now, and a diagram block for /mermaid", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    await app.createNote();
    await app.typeInEditor("/now");
    await expect(completions(page)).toHaveCount(1);
    await pick(page);
    await expect
      .poll(() => app.editorText())
      .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await page.keyboard.press("Enter");
    await page.keyboard.type("/mermaid");
    await expect(completions(page)).toHaveCount(1);
    await pick(page);
    await expect
      .poll(() => app.editorText())
      .toMatch(/\n```mermaid\ngraph TD\n {4}A --> B\n```\n$/);
  });

  test("leaves a slash in a path or an address alone", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    await app.createNote();
    await app.typeInEditor("folder/");
    await page.keyboard.type("x https:/");
    // Time for a list to open, were one going to.
    await page.waitForTimeout(500);
    await expect(completions(page)).toHaveCount(0);
    expect(await app.editorText()).toBe("folder/x https:/");
  });

  test("puts an emoji in the text for a short name after a colon", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    await app.createNote();
    await app.typeInEditor("Happy :smile");
    await expect(completions(page).first()).toContainText(":smile:");
    await expect(
      completions(page).first().locator(".cn-emoji img.emoji"),
    ).toHaveCount(1);
    await pick(page);
    await expect.poll(() => app.editorText()).toBe("Happy 😄 ");
  });

  test("lists the notebook's notes inside double brackets, and writes the link whole", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    await app.createNote();
    // The brackets are closed as they are typed, and the start of the
    // note's name is enough to find it.
    await app.typeInEditor("See [[READ");
    await expect.poll(() => app.editorText()).toBe("See [[READ]]");
    await expect(completions(page).first()).toHaveText("[[README]]");
    await pick(page);
    await expect.poll(() => app.editorText()).toBe("See [[README]]");
  });

  test("lists the notes beside a note as tags after a number sign", async ({
    app,
    page,
  }) => {
    await app.open();
    await app.openNotes();
    await app.createNote();
    await app.typeInEditor("About #READ");
    await expect(completions(page).first()).toHaveText("#README");
    await pick(page);
    await expect.poll(() => app.editorText()).toBe("About #README");
  });
});

test.describe("the table of contents", () => {
  test("lists the note's headings and puts the caret on the one clicked", async ({
    app,
    page,
  }) => {
    const text =
      "# One\n\ntext\n\n## Two :smile:\n\n```md\n# Not a heading\n```\n\n### Three\n";
    await openNote(app, text);
    await page.setViewportSize({ width: 1400, height: 800 });
    if (!(await app.tocItem("One").isVisible())) {
      await page.getByRole("button", { name: "Table of contents" }).click();
    }
    await expect(app.tocItem("One")).toBeVisible();
    await expect(app.tocItem("Two")).toBeVisible();
    await expect(app.tocItem("Two").locator("img.emoji")).toHaveCount(1);
    await expect(app.tocItem("Three")).toBeVisible();
    await expect(app.tocItem("Not a heading")).toHaveCount(0);
    await app.tocItem("Three").click();
    await expect.poll(() => app.caret()).toEqual({ line: 10, ch: 0 });
    expect(await app.editorHasFocus()).toBe(true);
    // A heading typed joins the list a moment later.
    await placeCaret(app, at(text, text.length));
    await page.keyboard.type("\n#### Four");
    await expect(app.tocItem("Four")).toBeVisible();
  });
});

test.describe("a note open in two tabs", () => {
  // The README holding a text, open in two tabs side by side, as a saved
  // layout brings them back; and the editors of the two.
  async function openTwice(app: CrossnoteApp, text: string) {
    await app.open();
    await app.openNotes();
    const folder = await app.notebookFolder();
    const readme = `${folder}/README.md`;
    await app.storedText(readme, text);
    const note = (id: string) => ({
      type: "tab",
      id,
      name: "README",
      component: "Note",
      config: {
        component: "Note",
        singleton: false,
        notebookPath: folder,
        noteFilePath: "README.md",
      },
    });
    await app.seedLayout(
      layoutOf(row(tabset(note("left")), tabset(note("right")))),
    );
    await app.page.reload();
    await app.waitUntilReady();
    const left = app.editor.nth(0);
    const right = app.editor.nth(1);
    await app.page.getByRole("button", { name: "Edit" }).nth(0).click();
    await app.page.getByRole("button", { name: "Edit" }).nth(1).click();
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    await expect.poll(() => app.editorText(left)).toBe(text);
    await expect.poll(() => app.editorText(right)).toBe(text);
    return { readme, left, right };
  }

  // A note with Windows line endings, or the old Mac OS's: one tab saves the
  // note's settings, and the other, which used to take the text that came
  // back as a new one and save it with \n throughout, leaves the file as the
  // settings' save left it.
  for (const [name, text] of [
    ["Windows line endings", "One\r\nTwo\r\n"],
    ["the line endings of the old Mac OS", "One\rTwo\r"],
  ]) {
    test(`keeps ${name} when the note's settings are saved from one of the tabs`, async ({
      app,
      page,
    }) => {
      const { readme } = await openTwice(app, text);
      await page.getByRole("button", { name: "Note menu" }).first().click();
      await page.getByRole("button", { name: "Pin the note" }).click();
      await expect.poll(() => app.storedText(readme)).toMatch(/pinned: true/);
      // Time for a save set off by the settings' to come, were one going to.
      await page.waitForTimeout(1000);
      expect(await storedBody(app, readme)).toBe(text);
    });
  }

  test("has one text: what is typed in one tab is in the other, and undone from either", async ({
    app,
    page,
  }) => {
    const { readme, left, right } = await openTwice(app, "Start\n");

    await left.evaluate((element) => {
      const editor = (element as EditorHost).editorHandle;
      editor.focus();
      editor.select(editor.end());
    });
    await page.keyboard.type("typed on the left");
    await expect
      .poll(async () =>
        (await right.locator(".cm-line").allTextContents()).join("\n"),
      )
      .toBe("Start\ntyped on the left");
    await expect
      .poll(() => storedBody(app, readme))
      .toBe("Start\ntyped on the left");

    // Undone from the other tab.
    await right.evaluate((element) =>
      (element as EditorHost).editorHandle.focus(),
    );
    await page.keyboard.press("Control+z");
    await expect
      .poll(async () =>
        (await left.locator(".cm-line").allTextContents()).join("\n"),
      )
      .toBe("Start\n");
    await expect.poll(() => storedBody(app, readme)).toBe("Start\n");

    // Typed on the right while the left has its caret before it: the left
    // keeps what it has and gains the rest.
    await page.keyboard.type("right");
    await expect
      .poll(async () =>
        (await left.locator(".cm-line").allTextContents()).join("\n"),
      )
      .toBe("Start\nright");
    await expect.poll(() => storedBody(app, readme)).toBe("Start\nright");
  });
});

test.describe("line endings", () => {
  for (const [name, ending] of [
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ]) {
    for (const body of ["Body", ""]) {
      test(`keeps ${name} after editing a settings-only front matter file with ${body ? "one body line" : "an empty body"}`, async ({
        app,
        page,
      }) => {
        const original = ["---", "created: 2026-01-01", "---", body].join(
          ending,
        );
        const file = await openNote(app, original, "Source code", body);
        expect(await app.storedText(file)).toBe(original);
        await app.focusEditor();
        await page.keyboard.press("Control+End");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Next");
        await expect
          .poll(() => storedBody(app, file))
          .toBe(`${body}${ending}Next`);
        const written = await app.storedText(file);
        expect(
          written!
            .match(/\r\n?|\n/g)
            ?.every((lineBreak) => lineBreak === ending),
        ).toBe(true);
      });
    }
  }

  test("keeps Windows line endings in a note that is edited, the typed lines included", async ({
    app,
    page,
  }) => {
    const text = "One\r\nTwo\r\n";
    const readme = await openNote(app, text);
    await placeCaret(app, { line: 1, ch: 3 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Three");
    await expect
      .poll(() => storedBody(app, readme))
      .toBe("One\r\nTwo\r\nThree\r\n");
  });

  test("keeps line endings of \\r alone in a note that is edited, the typed lines included", async ({
    app,
    page,
  }) => {
    const text = "One\rTwo\r";
    const readme = await openNote(app, text);
    await placeCaret(app, { line: 1, ch: 3 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Three");
    await expect.poll(() => storedBody(app, readme)).toBe("One\rTwo\rThree\r");
  });

  test("gives a note of two kinds of line ending its first kind throughout once it is edited", async ({
    app,
    page,
  }) => {
    const text = "One\r\nTwo\nThree\n";
    const readme = await openNote(app, text);
    await placeCaret(app, { line: 2, ch: 5 });
    await page.keyboard.type("!");
    await expect
      .poll(() => storedBody(app, readme))
      .toBe("One\r\nTwo\r\nThree!\r\n");
  });
});
