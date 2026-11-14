import { expect, test } from "./fixtures";
import type { CrossnoteApp } from "./crossnote";

type RefreshWindow = Window & {
  pfs: {
    readdir(path: string): Promise<string[]>;
    writeFile(path: string, text: string): Promise<void>;
  };
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  meritFile: FileSystemFileHandle;
  meritReleaseRead(): void;
  meritReadHeld: boolean;
  meritReleaseWrite(): void;
  meritWriteHeld: boolean;
  meritWriteDone: boolean;
};

// Real File System Access handles in the isolated test origin. Only the OS
// directory picker is replaced; notebook reads and writes use the app's
// LocalFileSystem and the browser's OPFS implementation.
async function localNote(app: CrossnoteApp, text: string) {
  await app.open();
  await app.page.evaluate(async (text) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("ReviewFolder", {
      create: true,
    });
    const file = await directory.getFileHandle("README.md", { create: true });
    const writer = await file.createWritable();
    await writer.write(text);
    await writer.close();
    (window as unknown as RefreshWindow).showDirectoryPicker = async () =>
      directory;
    (window as unknown as RefreshWindow).meritFile = file;
  }, text);
  await app.sidebar.getByRole("button", { name: "Add a notebook" }).click();
  await app.page.getByRole("button", { name: "Open a Local Folder" }).click();
  await expect(app.notebook("ReviewFolder")).toBeVisible();
  await app.openNotes("ReviewFolder");
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  await expect.poll(() => app.editorText()).toBe(text);
}

async function holdRefresh(app: CrossnoteApp) {
  await app.page.evaluate(() => {
    const win = window as unknown as RefreshWindow;
    const original = win.pfs.readdir;
    let release: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    win.meritReleaseRead = release!;
    win.meritReadHeld = false;
    win.pfs.readdir = async (path: string) => {
      if (path.startsWith("/lfs/")) {
        win.pfs.readdir = original;
        win.meritReadHeld = true;
        await gate;
      }
      return original(path);
    };
  });
  await app
    .notebook("ReviewFolder")
    .getByText("Refresh", { exact: true })
    .click();
  await expect
    .poll(() =>
      app.page.evaluate(
        () => (window as unknown as RefreshWindow).meritReadHeld,
      ),
    )
    .toBe(true);
}

async function externalText(app: CrossnoteApp, text: string) {
  await app.page.evaluate(async (text) => {
    const writer = await (
      window as unknown as RefreshWindow
    ).meritFile.createWritable();
    await writer.write(text);
    await writer.close();
  }, text);
}

test("actual local refresh cannot settle with different disk and editor text", async ({
  app,
  page,
}) => {
  await localNote(app, "O");
  await holdRefresh(app);
  await page.evaluate(() => {
    const win = window as unknown as RefreshWindow;
    const original = win.pfs.writeFile;
    let release: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    win.meritReleaseWrite = release!;
    win.meritWriteHeld = false;
    win.meritWriteDone = false;
    win.pfs.writeFile = async (path: string, text: string) => {
      if (path.endsWith("/README.md")) {
        win.pfs.writeFile = original;
        win.meritWriteHeld = true;
        await gate;
      }
      await original(path, text);
      win.meritWriteDone = true;
    };
  });
  await app.focusEditor();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("A");
  await page.keyboard.press("Control+s");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as RefreshWindow).meritWriteHeld),
    )
    .toBe(true);
  await externalText(app, "B");
  await page.evaluate(() =>
    (window as unknown as RefreshWindow).meritReleaseRead(),
  );
  await expect.poll(() => app.editorText()).toBe("B");
  await page.evaluate(() =>
    (window as unknown as RefreshWindow).meritReleaseWrite(),
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as RefreshWindow).meritWriteDone),
    )
    .toBe(true);
  // The real self-write event proves Notebook.writeNote and its getNote(true)
  // finished, rather than merely the lower-level file write.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(false);
  const disk = await page.evaluate(async () =>
    (await (window as unknown as RefreshWindow).meritFile.getFile()).text(),
  );
  const ui = await app.editorText();
  expect(ui).toBe("B");
  expect(disk).toMatch(/(?:^|\n)B$/);
});

for (const action of ["Update", "Delete"]) {
  test(`invalidates ${action} in an image dialog opened during local refresh`, async ({
    app,
    page,
  }) => {
    const before = "Before\n\n![old](https://example.com/a.png)\n\nEnd";
    const after = "Before\n\n![new](https://example.com/b.png)\n\nEnd";
    await localNote(app, before);
    await holdRefresh(app);
    const picture = app.editor.locator("img.cn-image");
    await expect(picture).toHaveCount(1);
    await picture.dispatchEvent("mousedown", { button: 0 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await externalText(app, after);
    await page.evaluate(() =>
      (window as unknown as RefreshWindow).meritReleaseRead(),
    );
    await expect.poll(() => app.editorText()).toBe(after);
    await expect(
      dialog.getByRole("button", { name: action, exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByRole("alert")).toContainText("The note changed");
    expect(
      await page.evaluate(async () =>
        (await (window as unknown as RefreshWindow).meritFile.getFile()).text(),
      ),
    ).toBe(after);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await picture.dispatchEvent("mousedown", { button: 0 });
    await expect(dialog.getByRole("textbox").first()).toHaveValue(
      "https://example.com/b.png",
    );
    await dialog.getByRole("textbox").nth(2).fill("latest");
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    const edited = after.replace("![new]", "![latest]");
    await expect.poll(() => app.editorText()).toBe(edited);
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (
            await (window as unknown as RefreshWindow).meritFile.getFile()
          ).text(),
        ),
      )
      .toContain(edited);
  });
}
