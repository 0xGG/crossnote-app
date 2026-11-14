import { expect, test } from "./fixtures";
import { layoutOf, row, tabset } from "./layouts";

type ReviewWindow = Window & {
  pfs: {
    mkdir(path: string): Promise<void>;
    writeFile(path: string, text: string): Promise<void>;
    storeTree(path: string): Promise<void>;
  };
  reviewHeld: boolean;
  reviewRelease(): void;
  reviewWrites: string[];
};

test("creating a note waits for its own tab while another pane is editing", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  const folder = await app.notebookFolder();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("layoutModel")!),
  );
  const readme = {
    type: "tab",
    id: "existing-note",
    name: "README",
    component: "Note",
    config: {
      component: "Note",
      singleton: false,
      notebookPath: folder,
      noteFilePath: "README.md",
    },
  };
  await app.seedLayout(layoutOf(row(saved.layout, tabset(readme))));
  await page.reload();
  await app.waitUntilReady();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(app.noteTitle).toHaveValue("README");
  await expect(app.editor).toBeVisible();
  await page.evaluate(() => {
    const win = window as unknown as ReviewWindow;
    const write = win.pfs.writeFile;
    let release: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    win.reviewRelease = release!;
    win.reviewHeld = false;
    win.pfs.writeFile = async (path, text) => {
      if (path.endsWith(".md")) {
        win.pfs.writeFile = write;
        win.reviewHeld = true;
        await gate;
      }
      await write(path, text);
    };
  });
  let earlyTitle: string | undefined;
  const creating = app.createNote().then((title) => {
    earlyTitle = title;
    return title;
  });
  try {
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as ReviewWindow).reviewHeld),
      )
      .toBe(true);
    // The write is held, and the existing title is ready. Let the helper's
    // browser assertions finish before checking that creation is still pending.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(earlyTitle).toBeUndefined();
  } finally {
    await page.evaluate(() =>
      (window as unknown as ReviewWindow).reviewRelease(),
    );
  }
  const title = await creating;
  expect(title).not.toBe("README");
  await expect(app.tab(title)).toHaveAttribute("aria-selected", "true");
});

test("moving a note reloads relative images without replacing its editor or undo history", async ({
  app,
  page,
}) => {
  await app.open();
  await app.openNotes();
  const folder = await app.notebookFolder();
  const original = "Body\n\n![photo](picture.svg)";
  const pictures = await page.evaluate(
    async ({ folder, original }) => {
      const win = window as unknown as ReviewWindow;
      const svg = (color: string) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${color}"/></svg>`;
      await win.pfs.mkdir(`${folder}/moved`);
      await win.pfs.writeFile(`${folder}/picture.svg`, svg("red"));
      await win.pfs.writeFile(`${folder}/moved/picture.svg`, svg("blue"));
      await win.pfs.writeFile(`${folder}/README.md`, original);
      await win.pfs.storeTree(folder);
      return { red: btoa(svg("red")), blue: btoa(svg("blue")) };
    },
    { folder, original },
  );
  await page.reload();
  await app.waitUntilReady();
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
  await app.focusEditor();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("typed ");
  const image = app.editor.locator("img.cn-image");
  await expect(image).toHaveAttribute(
    "src",
    `data:image/svg+xml;base64,${pictures.red}`,
  );
  const editorBefore = await app.editor.elementHandle();
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Change file path" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("moved/README.md");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Drafts: moved/README.md")).toBeVisible();
  await expect(image).toHaveAttribute(
    "src",
    `data:image/svg+xml;base64,${pictures.blue}`,
  );
  expect(
    await app.editor.evaluate(
      (element, before) => element === before,
      editorBefore,
    ),
  ).toBe(true);
  expect(await app.editorText()).toBe(`typed ${original}`);
  await page.evaluate(() => {
    const win = window as unknown as ReviewWindow;
    const write = win.pfs.writeFile;
    win.reviewWrites = [];
    win.pfs.writeFile = async (path, text) => {
      if (path.endsWith(".md")) win.reviewWrites.push(path);
      await write(path, text);
    };
  });
  // Explicit save is a completed synchronization point: changing the image
  // context alone must not have made the document dirty.
  await app.focusEditor();
  await page.keyboard.press("Control+s");
  expect(
    await page.evaluate(() => (window as unknown as ReviewWindow).reviewWrites),
  ).toEqual([]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => app.editorText()).toBe(original);
});
