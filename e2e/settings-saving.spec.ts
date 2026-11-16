import { expect, test } from "./fixtures";

type HeldWindow = Window & {
  pfs: { writeFile(name: string, data: string | Uint8Array): Promise<void> };
  heldSetting?: { reached: boolean; release: () => void };
};

test("keeps typing saved after a delayed pin write and reopening the note", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  const file = `${await app.notebookFolder()}/README.md`;
  await app.storedText(file, "A");
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  await app.modeButton("Edit").click();
  await page.evaluate((file) => {
    const host = window as unknown as HeldWindow;
    const write = host.pfs.writeFile.bind(host.pfs);
    host.pfs.writeFile = async (name, text) => {
      if (
        name === file &&
        String(text).includes("pinned: true") &&
        !host.heldSetting
      ) {
        await new Promise<void>((resolve) => {
          host.heldSetting = { reached: true, release: resolve };
        });
      }
      return write(name, text);
    };
  }, file);
  await page.getByRole("button", { name: "Note menu" }).first().click();
  await page.getByRole("button", { name: "Pin the note", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as HeldWindow).heldSetting?.reached,
      ),
    )
    .toBe(true);
  await app.selectInEditor({ line: 0, ch: 1 });
  await app.focusEditor();
  await page.keyboard.insertText("B");
  expect(await app.editorText()).toBe("AB");
  await page.evaluate(() =>
    (window as unknown as HeldWindow).heldSetting!.release(),
  );
  await expect.poll(() => app.storedText(file)).toContain("AB");
  await expect.poll(() => app.storedText(file)).toContain("pinned: true");
  await page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.filter({ hasText: "README" }).click();
  await app.modeButton("Edit").click();
  expect(await app.editorText()).toBe("AB");
  await page.getByRole("button", { name: "Note menu" }).first().click();
  await expect(
    page.getByRole("button", { name: "Unpin the note", exact: true }),
  ).toBeVisible();
});
