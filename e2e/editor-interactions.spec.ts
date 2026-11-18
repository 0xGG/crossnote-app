import { expect, test } from "./fixtures";
import type { CrossnoteApp } from "./crossnote";

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

async function openStored(app: CrossnoteApp, text: string) {
  await app.open();
  await app.openNotes();
  const file = `${await app.notebookFolder()}/README.md`;
  await app.storedText(file, text);
  await app.page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  return file;
}

for (const { label, prefix } of [
  { label: "ordinary", prefix: "" },
  { label: "nested", prefix: "> " },
]) {
  test(`preserves the anchor and glyph position on Shift clicking ${label} code`, async ({
    app,
    page,
  }) => {
    const text = `Before\n\n${prefix}\`\`\`text\n${prefix}abcdefghijk\n${prefix}\`\`\`\n\nAfter`;
    const file = await openStored(app, text);
    for (const { position, anchor } of [
      { position: { line: 0, ch: 2 }, anchor: 2 },
      { position: { line: 6, ch: 3 }, anchor: text.lastIndexOf("After") + 3 },
    ]) {
      await app.selectInEditor(position);
      await app.focusEditor();
      const code = app.editor.locator(".cn-code-preview pre");
      await expect(code).toContainText("abcdefghijk");
      const point = await code.evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const index = node.textContent?.indexOf("abcdefghijk") ?? -1;
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index + 5);
          range.setEnd(node, index + 6);
          const rect = range.getBoundingClientRect();
          return { x: rect.left + 0.2, y: (rect.top + rect.bottom) / 2 };
        }
        throw new Error("code glyph missing");
      });
      await page.keyboard.down("Shift");
      await page.mouse.click(point.x, point.y);
      await page.keyboard.up("Shift");
      await expect
        .poll(() => app.caret())
        .toEqual({ line: 3, ch: prefix.length + 5 });
      const head = text.indexOf("abcdefghijk") + 5;
      await expect
        .poll(() => app.editorSelection())
        .toBe(text.slice(Math.min(head, anchor), Math.max(head, anchor)));
      expect(await app.editorText()).toBe(text);
    }
    // A plain click still activates just this block at the same glyph.
    await app.selectInEditor({ line: 6, ch: 0 });
    await app.editor
      .locator(".cn-code-preview pre")
      .click({ position: { x: 20, y: 14 } });
    await expect(app.editor.locator(".cn-code-preview")).toHaveCount(0);
    expect(await app.editorSelection()).toBe("");
    expect(await app.storedText(file)).toBe(text);
  });
}

const brightness = (color: string) => {
  const c = color
    .match(/\d+/g)!
    .slice(0, 3)
    .map((v) => Number(v) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const checkOneDark = (colors: { selected: string; quote: string }) => {
  expect(colors.selected).toBe("rgb(82, 109, 150)");
  // A regression threshold for this palette, not a WCAG text claim.
  expect(
    (brightness(colors.selected) + 0.05) / (brightness(colors.quote) + 0.05),
  ).toBeGreaterThan(1.5);
};
const checkTheme = (colors: { selected: string; quote: string }) =>
  expect(colors.selected).not.toBe(colors.quote);
for (const { theme, check } of [
  { theme: "light", check: checkTheme },
  { theme: "dark", check: checkTheme },
  { theme: "one-dark", check: checkOneDark },
  { theme: "solarized-light", check: checkTheme },
]) {
  test(`keeps quote selection distinguishable in ${theme}`, async ({
    app,
    page,
  }, info) => {
    await page.addInitScript(
      (value) => localStorage.setItem("settings/theme", value),
      theme,
    );
    const text =
      "> Quote selected text\n> second line\n>\n> > Nested selected text\n> > nested second line\n\nEND";
    const file = await openStored(app, text);
    await app.selectInEditor({ line: 6, ch: 0 });
    await page.screenshot({ path: info.outputPath("quotes-unselected.png") });
    await app.selectInEditor({ line: 0, ch: 8 }, { line: 4, ch: 12 });
    await app.focusEditor();
    const selected = app.editor.locator(".cn-quote .cn-selected-text").first();
    await expect(selected).toBeVisible();
    const colors = await selected.evaluate((el) => ({
      selected: getComputedStyle(el).backgroundColor,
      quote: getComputedStyle(el.closest(".cn-quote")!, "::before")
        .backgroundColor,
    }));
    check(colors);
    expect(colors.selected).not.toBe(colors.quote);
    await page.screenshot({ path: info.outputPath("quotes-selected.png") });
    for (const mode of ["Source code", "Preview", "Edit"] as const)
      await app.modeButton(mode).click();
    expect(await app.editorText()).toBe(text);
    expect(await app.storedText(file)).toBe(text);
  });
}
