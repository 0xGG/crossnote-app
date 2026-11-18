import { expect, test } from "./fixtures";
import { localBytes, type FileHost } from "./git";
import type { ElementHandle, Locator } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";
import {
  createDraft,
  fileEvent,
  holdFileRead,
  insertedPath,
  localFileBytes,
  localFolder,
  png,
  recordedWebm,
  wav,
} from "./attachment-helpers";

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

test("pastes text over a selection when the clipboard also contains an image", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  await app.setEditorText("Before SELECT after", app.visibleEditor);
  await app.focusEditor(app.visibleEditor);
  await app.selectInEditor(
    { line: 0, ch: 7 },
    { line: 0, ch: 13 },
    app.visibleEditor,
  );
  await app.visibleEditor.locator(".cm-content").evaluate((target, data) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "pasted text");
    transfer.items.add(
      new File([new Uint8Array(data)], "clipboard.png", { type: "image/png" }),
    );
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, png);
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toBe("Before pasted text after");
  const assets = await page.evaluate(async (dir) => {
    const fs = (
      window as unknown as FileHost & {
        pfs: { exists(path: string): Promise<boolean> };
      }
    ).pfs;
    return (await fs.exists(`${dir}/assets`))
      ? fs.readdir(`${dir}/assets`)
      : [];
  }, dir);
  expect(assets).toEqual([]);
});

test("imports a dropped text file through the editor", async ({ app }) => {
  await createDraft(app);
  await app.setEditorText("Start", app.visibleEditor);
  const messages = await app.recordMessages();
  await app.focusEditor(app.visibleEditor);
  await app.visibleEditor.locator(".cm-content").evaluate((target) => {
    const line = target.querySelector(".cm-line")!;
    const rect = line.getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["Dropped file content"], "notes.txt", { type: "text/plain" }),
    );
    transfer.items.add(
      new File(["enabled: true"], "config.yaml", { type: "application/yaml" }),
    );
    transfer.items.add(
      new File(["port = 8080"], "config.toml", { type: "application/toml" }),
    );
    transfer.items.add(
      new File(['{"mode":"edit"}'], "settings.json", {
        type: "application/json; charset=utf-8",
      }),
    );
    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left + 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toContain(
      'Dropped file content\nenabled: true\nport = 8080\n{"mode":"edit"}',
    );
  const text = await app.editorText(app.visibleEditor);
  expect(text).not.toContain("/assets/");
  expect(await messages()).toEqual([]);
  await fileEvent(
    app,
    "drop",
    "archive.bin",
    "application/octet-stream",
    [0, 255, 1],
  );
  await expect
    .poll(messages)
    .toContainEqual(expect.stringContaining("not supported"));
  expect(await app.editorText(app.visibleEditor)).toBe(text);
});

async function dropAtThirdCharacter(
  app: CrossnoteApp,
  files: { name: string; type: string; bytes: number[] }[],
) {
  await app.focusEditor(app.visibleEditor);
  await app.visibleEditor.locator(".cm-content").evaluate((target, files) => {
    const text = target.querySelector(".cm-line")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const transfer = new DataTransfer();
    for (const file of files)
      transfer.items.add(
        new File([new Uint8Array(file.bytes)], file.name, { type: file.type }),
      );
    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left,
        clientY: rect.top + rect.height / 2,
      }),
    );
  }, files);
}

test("imports unknown UTF-8 text files in order at the drop position", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  await app.setEditorText("Start", app.visibleEditor);
  const messages = await app.recordMessages();
  await dropAtThirdCharacter(app, [
    { name: "notes.rst", type: "", bytes: [...Buffer.from("第一段")] },
    {
      name: "manual.rst",
      type: "application/octet-stream",
      bytes: [...Buffer.from("%PDF-like text")],
    },
    { name: "NOTES", type: "", bytes: [...Buffer.from("第三段")] },
    {
      name: "README",
      type: "application/octet-stream",
      bytes: [...Buffer.from("第四段")],
    },
    { name: "run.sh", type: "application/x-sh", bytes: [...Buffer.from("sh")] },
    {
      name: "page.php",
      type: "application/x-httpd-php",
      bytes: [...Buffer.from("php")],
    },
    {
      name: "table.csv",
      type: "application/vnd.ms-excel",
      bytes: [...Buffer.from("a,b")],
    },
  ]);
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toBe("Sta第一段\n%PDF-like text\n第三段\n第四段\nsh\nphp\na,brt");
  expect(await messages()).toEqual([]);
  const assets = await page.evaluate(async (dir) => {
    const fs = (
      window as unknown as FileHost & {
        pfs: { exists(path: string): Promise<boolean> };
      }
    ).pfs;
    return (await fs.exists(`${dir}/assets`))
      ? fs.readdir(`${dir}/assets`)
      : [];
  }, dir);
  expect(assets).toEqual([]);
});

test("imports BOM and declared encodings in order at the drop position", async ({
  app,
}) => {
  await createDraft(app);
  await app.setEditorText("Start", app.visibleEditor);
  const messages = await app.recordMessages();
  await dropAtThirdCharacter(app, [
    {
      name: "README",
      type: "",
      bytes: [255, 254, ...Buffer.from("First café", "utf16le")],
    },
    {
      name: "notes.txt",
      type: "application/octet-stream",
      bytes: [255, 254, ...Buffer.from("Second", "utf16le")],
    },
    {
      name: "manual.rst",
      type: "",
      bytes: [254, 255, 0, 84, 0, 104, 0, 105, 0, 114, 0, 100],
    },
    {
      name: "legacy.txt",
      type: "text/plain;charset=windows-1252",
      bytes: [99, 97, 102, 233],
    },
    {
      name: "declared.txt",
      type: "text/plain",
      bytes: [255, 254, ...Buffer.from("Last", "utf16le")],
    },
  ]);
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toBe("StaFirst café\nSecond\nThird\ncafé\nLastrt");
  expect(await messages()).toEqual([]);
});

test("drops unknown text onto the final empty line instead of the caret", async ({
  app,
}) => {
  await createDraft(app);
  await app.setEditorText("Start\n", app.visibleEditor);
  await app.focusEditor(app.visibleEditor);
  await app.selectInEditor({ line: 0, ch: 2 }, undefined, app.visibleEditor);
  await expect
    .poll(() => app.caret(app.visibleEditor))
    .toEqual({ line: 0, ch: 2 });
  const messages = await app.recordMessages();
  await app.visibleEditor.locator(".cm-content").evaluate((target) => {
    const line = target.querySelectorAll(".cm-line");
    const rect = line[line.length - 1].getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.items.add(new File(["Last line"], "README", { type: "" }));
    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toBe("Start\nLast line");
  expect(await messages()).toEqual([]);
});

for (const binary of [
  { label: "NUL", type: "", bytes: [65, 0, 66] },
  { label: "odd-length UTF-16LE", type: "", bytes: [255, 254, 65] },
  { label: "invalid UTF-8 without BOM", type: "", bytes: [195, 40] },
  { label: "NUL in declared text", type: "text/plain", bytes: [65, 0, 66] },
  {
    label: "binary spreadsheet",
    type: "application/vnd.ms-excel",
    bytes: [0xd0, 0xcf, 0x11, 0xe0],
  },
  ...["application/pdf", "application/x-pdf", ""].map((type) => ({
    label: `ASCII PDF with ${type || "no MIME type"}`,
    type,
    bytes: [...Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")],
  })),
  { label: "PNG image", type: "image/png", bytes: png },
]) {
  test(`rejects an entire dropped batch containing ${binary.label} bytes`, async ({
    app,
    page,
  }) => {
    const dir = await createDraft(app);
    await app.setEditorText("Start", app.visibleEditor);
    const messages = await app.recordMessages();
    await dropAtThirdCharacter(app, [
      { name: "notes.rst", type: "", bytes: [...Buffer.from("valid text")] },
      { name: "opaque", type: binary.type, bytes: binary.bytes },
    ]);
    await expect
      .poll(messages)
      .toContainEqual(expect.stringContaining("not supported"));
    expect(await app.editorText(app.visibleEditor)).toBe("Start");
    const assets = await page.evaluate(async (dir) => {
      const fs = (
        window as unknown as FileHost & {
          pfs: { exists(path: string): Promise<boolean> };
        }
      ).pfs;
      return (await fs.exists(`${dir}/assets`))
        ? fs.readdir(`${dir}/assets`)
        : [];
    }, dir);
    expect(assets).toEqual([]);
  });
}

test("imports a dropped image named README as an attachment", async ({
  app,
}) => {
  await createDraft(app);
  await fileEvent(app, "drop", "README", "image/png", png);
  expect(await insertedPath(app, ".png")).toMatch(
    /assets\/README-[\da-f-]+\.png$/,
  );
});

test("uses the extension of a literal image filename without a MIME type", async ({
  app,
}) => {
  await createDraft(app);
  await fileEvent(app, "drop", "figure#1.png", "", png);
  expect(await insertedPath(app, ".png")).toMatch(
    /assets\/figure_1-[\da-f-]+\.png$/,
  );
});

async function expectPreviewMedia(app: CrossnoteApp) {
  const preview = app.preview.filter({ visible: true });
  await expect(preview.locator("img").first()).toBeVisible();
  const audio = preview.locator("audio[controls]");
  await expect(audio).toBeVisible();
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(1);
}

async function expectVideoPlayback(video: Locator) {
  await expect(video).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  // MediaRecorder's streaming WebM omits a duration header. Chromium finds
  // its actual end when asked to seek beyond it.
  await video.evaluate(async (element: HTMLVideoElement) => {
    if (!Number.isFinite(element.duration)) {
      const seeked = new Promise<void>((resolve) =>
        element.addEventListener("seeked", () => resolve(), { once: true }),
      );
      element.currentTime = 1e6;
      await seeked;
      element.currentTime = 0;
    }
  });
  const metadata = await video.evaluate((element: HTMLVideoElement) => ({
    width: element.videoWidth,
    height: element.videoHeight,
    duration: element.duration,
  }));
  expect(metadata.width).toBeGreaterThan(0);
  expect(metadata.height).toBeGreaterThan(0);
  expect(metadata.duration).toBeGreaterThan(0);
  expect(Number.isFinite(metadata.duration)).toBe(true);
  await video.evaluate(async (element: HTMLVideoElement) => {
    await element.play();
    element.pause();
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(true);
}

test("pastes, drops and chooses attachments without changing text on mode switches", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  await fileEvent(app, "paste", "paste.png", "image/png", png);
  const image = await insertedPath(app, ".png");
  expect(await localBytes(page, `${dir}/${image}`)).toEqual(png);
  await app.visibleEditor.locator(".cm-content").evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "plain text");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  });
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toContain("plain text");
  await fileEvent(app, "drop", "sound.wav", "audio/wav", wav);
  const audio = await insertedPath(app, ".wav");
  expect(await localBytes(page, `${dir}/${audio}`)).toEqual(wav);
  await app.focusEditor(app.visibleEditor);
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  const choice = page
    .locator(".cm-tooltip-autocomplete li")
    .filter({ hasText: "/image" });
  await expect(choice).toBeVisible();
  const chooserPromise = page.waitForEvent("filechooser");
  await choice.click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "chosen.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect
    .poll(
      async () =>
        (await app.editorText(app.visibleEditor)).match(
          /!\[\]\(\/assets\/[^)]+\.png\)/g,
        )?.length,
    )
    .toBe(2);
  const text = await app.editorText(app.visibleEditor);
  await app.modeButton("Preview").click();
  await expectPreviewMedia(app);
  for (const mode of ["Edit", "Source code", "Preview"] as const)
    await app.modeButton(mode).click();
  await expectPreviewMedia(app);
  await app.modeButton("Edit").click();
  expect(await app.editorText(app.visibleEditor)).toBe(text);
  await page.keyboard.press("Control+s");
  await page.reload();
  await app.waitUntilReady();
  await app.modeButton("Preview").click();
  await expect(
    app.preview.filter({ visible: true }).locator("img").first(),
  ).toBeVisible();
});

test("decodes and plays a locally uploaded video in edit and preview", async ({
  app,
  page,
}) => {
  await createDraft(app);
  const webm = await recordedWebm(page);
  await fileEvent(app, "paste", "recorded.webm", "video/webm", webm);
  await insertedPath(app, ".webm");
  // Leave the markup line so the inactive Edit widget is rendered.
  await app.focusEditor(app.visibleEditor);
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("after video");
  await expectVideoPlayback(app.visibleEditor.locator("video[controls]"));
  await app.modeButton("Preview").click();
  await expectVideoPlayback(
    app.preview.filter({ visible: true }).locator("video[controls]"),
  );
});

async function startMedia(root: Locator) {
  const players = await root
    .locator("audio[controls], video[controls]")
    .elementHandles();
  expect(players).toHaveLength(2);
  for (const player of players) {
    await expect
      .poll(() => player.evaluate((el) => (el as HTMLMediaElement).readyState))
      .toBeGreaterThanOrEqual(1);
    await player.evaluate(async (el) => {
      const media = el as HTMLMediaElement;
      media.loop = true;
      await media.play();
    });
    expect(await player.evaluate((el) => (el as HTMLMediaElement).paused)).toBe(
      false,
    );
  }
  return players;
}

async function expectReleased(players: ElementHandle<Node>[]) {
  for (const player of players) {
    await expect
      .poll(() =>
        player.evaluate((el) => ({
          paused: (el as HTMLMediaElement).paused,
          src: (el as HTMLMediaElement).getAttribute("src"),
        })),
      )
      .toEqual({ paused: true, src: null });
  }
}

async function expectReadyPaused(root: Locator) {
  const players = root.locator("audio[controls], video[controls]");
  await expect(players).toHaveCount(2);
  for (const player of await players.elementHandles()) {
    await expect
      .poll(() =>
        player.evaluate((el) => ({
          ready: (el as HTMLMediaElement).readyState >= 1,
          paused: (el as HTMLMediaElement).paused,
        })),
      )
      .toEqual({ ready: true, paused: true });
  }
}

test("stops playing media on mode and tab changes and does not autoplay on return", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  const first = await app.noteTitle.inputValue();
  await app.openNotes();
  const second = await app.createNote();
  await app.selectTab(first);
  await fileEvent(app, "paste", "sound.wav", "audio/wav", wav);
  await insertedPath(app, ".wav");
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await fileEvent(
    app,
    "paste",
    "clip.webm",
    "video/webm",
    await recordedWebm(page),
  );
  await insertedPath(app, ".webm");
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("after media");
  const text = await app.editorText(app.visibleEditor);
  const path = `${dir}/${first}.md`;
  await page.keyboard.press("Control+s");
  await expect.poll(() => app.storedText(path)).toContain(text);
  const stored = await app.storedText(path);

  const editPlayers = await startMedia(app.visibleEditor);
  await app.modeButton("Preview").click();
  await expectReleased(editPlayers);
  const preview = app.preview.filter({ visible: true });
  await expectReadyPaused(preview);
  const previewPlayers = await startMedia(preview);
  await app.modeButton("Edit").click();
  await expectReleased(previewPlayers);
  await expectReadyPaused(app.visibleEditor);

  const beforeEditTab = await startMedia(app.visibleEditor);
  await app.selectTab(second);
  await expectReleased(beforeEditTab);
  await app.selectTab(first);
  await expectReadyPaused(app.visibleEditor);
  await app.modeButton("Preview").click();
  const beforePreviewTab = await startMedia(
    app.preview.filter({ visible: true }),
  );
  await app.selectTab(second);
  await expectReleased(beforePreviewTab);
  await app.selectTab(first);
  await expectReadyPaused(app.preview.filter({ visible: true }));
  await app.modeButton("Edit").click();
  expect(await app.editorText(app.visibleEditor)).toBe(text);
  expect(await app.storedText(path)).toBe(stored);
});

test("renders a relative image whose literal filename contains percent", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  const title = await app.noteTitle.inputValue();
  await localBytes(page, `${dir}/100%.png`, png);
  const text = "![literal](100%.png)\n\nAfter";
  await app.setEditorText(text, app.visibleEditor);
  await app.selectInEditor({ line: 2, ch: 5 }, undefined, app.visibleEditor);
  const editImage = app.visibleEditor.locator("img.cn-image");
  await expect
    .poll(() =>
      editImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("Control+s");
  const path = `${dir}/${title}.md`;
  await expect.poll(() => app.storedText(path)).toContain(text);
  const stored = await app.storedText(path);
  await app.modeButton("Preview").click();
  const image = app.preview.filter({ visible: true }).locator("img");
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await app.modeButton("Edit").click();
  expect(await app.editorText(app.visibleEditor)).toBe(text);
  expect(await app.storedText(path)).toBe(stored);
});

test("writes real local directory attachments", async ({ app, page }) => {
  await localFolder(app);
  await fileEvent(app, "paste", "local.png", "image/png", png);
  const pasted = await insertedPath(app, ".png");
  expect(await localFileBytes(page, pasted)).toEqual(png);
  await app.focusEditor(app.visibleEditor);
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  const choice = page
    .locator(".cm-tooltip-autocomplete li")
    .filter({ hasText: "/image" });
  await expect(choice).toBeVisible();
  const pending = page.waitForEvent("filechooser");
  await choice.click();
  await (
    await pending
  ).setFiles({
    name: "local-choice.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect
    .poll(
      async () =>
        (await app.editorText(app.visibleEditor)).match(
          /!\[\]\(\/assets\/[^)]+\.png\)/g,
        )?.length,
    )
    .toBe(2);
  const paths = [
    ...(await app.editorText(app.visibleEditor)).matchAll(
      /!\[\]\((\/assets\/[^)]+\.png)\)/g,
    ),
  ].map((match) => decodeURIComponent(match[1].slice(1)));
  expect(await localFileBytes(page, paths[1])).toEqual(png);
});

test("rejects oversized and unsupported files and reports disk failures", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  const before = await app.editorText(app.visibleEditor);
  const messages = await app.recordMessages();
  await fileEvent(
    app,
    "paste",
    "large.png",
    "image/png",
    [],
    20 * 1024 * 1024 + 1,
  );
  await expect.poll(messages).toContainEqual(expect.stringContaining("20 MiB"));
  await fileEvent(app, "paste", "data.pdf", "application/pdf", [1]);
  await expect
    .poll(messages, { timeout: 15000 })
    .toContainEqual(expect.stringContaining("not supported"));
  await page.evaluate((dir) => {
    const fs = (window as unknown as FileHost).pfs;
    const write = fs.writeFile.bind(fs);
    fs.writeFile = async (path, data) => {
      if (path.startsWith(`${dir}/assets/`))
        throw new Error("Simulated attachment write failure");
      return write(path, data);
    };
  }, dir);
  await fileEvent(app, "paste", "failed.png", "image/png", png);
  await expect
    .poll(messages, { timeout: 15000 })
    .toContainEqual(expect.stringContaining("could not be saved"));
  expect(await app.editorText(app.visibleEditor)).toBe(before);
});

test("keeps later typing when an attachment write is pending", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  await page.evaluate((dir) => {
    const fs = (window as unknown as FileHost).pfs;
    const write = fs.writeFile.bind(fs);
    const state = window as unknown as {
      attachmentHeld: boolean;
      releaseAttachment: () => void;
    };
    const gate = new Promise<void>((resolve) => {
      state.releaseAttachment = resolve;
    });
    fs.writeFile = async (path, data) => {
      if (path.startsWith(`${dir}/assets/`)) {
        state.attachmentHeld = true;
        await gate;
      }
      return write(path, data);
    };
  }, dir);
  await fileEvent(app, "paste", "pending.png", "image/png", png);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { attachmentHeld: boolean }).attachmentHeld,
      ),
    )
    .toBe(true);
  await page.keyboard.type("later typing");
  await page.evaluate(() =>
    (
      window as unknown as { releaseAttachment: () => void }
    ).releaseAttachment(),
  );
  await insertedPath(app, ".png");
  expect(await app.editorText(app.visibleEditor)).toContain("later typing");
});

test("does not insert a pending attachment into another note", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  const first = await app.noteTitle.inputValue();
  await app.openNotes();
  await app.createNote();
  const second = await app.noteTitle.inputValue();
  await app.setEditorText("Second note", app.visibleEditor);
  await expect
    .poll(() => app.storedText(`${dir}/${second}.md`))
    .toContain("Second note");
  await app.selectTab(first);
  await page.evaluate((dir) => {
    const fs = (window as unknown as FileHost).pfs;
    const write = fs.writeFile.bind(fs);
    const state = window as unknown as { held: boolean; release: () => void };
    const gate = new Promise<void>((resolve) => {
      state.release = resolve;
    });
    fs.writeFile = async (path, data) => {
      if (path.startsWith(`${dir}/assets/`)) {
        state.held = true;
        await gate;
      }
      return write(path, data);
    };
  }, dir);
  await fileEvent(app, "paste", "switch.png", "image/png", png);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { held: boolean }).held),
    )
    .toBe(true);
  await app.selectTab(second);
  await page.evaluate(() =>
    (window as unknown as { release: () => void }).release(),
  );
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toBe("Second note");
  await app.selectTab(first);
  await expect
    .poll(() => app.editorText(app.visibleEditor))
    .toContain("/assets/");
  await app.selectTab(second);
  expect(await app.editorText(app.visibleEditor)).toBe("Second note");
});

const noteChanges = [
  {
    result: "closed",
    change: async (app: CrossnoteApp, title: string) => {
      await app.tab(title).locator(".flexlayout__tab_button_trailing").click();
      await expect(app.tab(title)).toBeHidden();
      return title;
    },
    reopen: async (app: CrossnoteApp, title: string) => {
      await app.openNotes();
      await app.noteCards.getByText(title, { exact: true }).click();
      await app.modeButton("Edit").click();
    },
  },
  {
    result: "renamed",
    change: async (app: CrossnoteApp) => {
      await app.noteTitle.fill("Renamed attachment note");
      await app.noteTitle.press("Enter");
      await expect(app.tab("Renamed attachment note")).toBeVisible();
      return "Renamed attachment note";
    },
    reopen: async () => {},
  },
];
for (const { result, change, reopen } of noteChanges) {
  test(`does not insert an attachment after the note is ${result}`, async ({
    app,
    page,
  }) => {
    const dir = await createDraft(app);
    const title = await app.noteTitle.inputValue();
    const messages = await app.recordMessages();
    await holdFileRead(app);
    const name = await change(app, title);
    await page.evaluate(() =>
      (window as unknown as { releaseFileRead(): void }).releaseFileRead(),
    );
    await expect
      .poll(messages)
      .toContainEqual(expect.stringContaining("No link was inserted"));
    await reopen(app, title);
    expect(await app.editorText(app.visibleEditor)).not.toContain("/assets/");
    expect(await app.storedText(`${dir}/${name}.md`)).not.toContain("/assets/");
  });
}

test("opening and switching modes does not write the note", async ({
  app,
  page,
}) => {
  const dir = await createDraft(app);
  const title = await app.noteTitle.inputValue();
  const path = `${dir}/${title}.md`;
  await fileEvent(app, "paste", "read-only.png", "image/png", png);
  await insertedPath(app, ".png");
  await page.keyboard.press("Control+s");
  await expect.poll(() => app.storedText(path)).toContain("/assets/");
  await app.tab(title).locator(".flexlayout__tab_button_trailing").click();
  await expect(app.tab(title)).toBeHidden();
  await page.evaluate((path) => {
    const fs = (window as unknown as FileHost).pfs;
    const original = fs.writeFile.bind(fs);
    const state = window as unknown as { noteWrites: string[] };
    state.noteWrites = [];
    fs.writeFile = async (file, data) => {
      if (file === path) state.noteWrites.push(file);
      return original(file, data);
    };
  }, path);
  await app.openNotes();
  await app.noteCards.getByText(title, { exact: true }).click();
  await expect(
    app.preview.filter({ visible: true }).locator("img"),
  ).toBeVisible();
  for (const mode of ["Edit", "Source code", "Preview", "Edit"] as const)
    await app.modeButton(mode).click();
  await app.focusEditor(app.visibleEditor);
  await page.keyboard.press("Control+s");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      () => (window as unknown as { noteWrites: string[] }).noteWrites,
    ),
  ).toEqual([]);
});

test("HTTP media does not play or read a local path", async ({ app, page }) => {
  await createDraft(app);
  await app.setEditorText(
    "![](http://example.com/blocked.mp4?token=1)",
    app.visibleEditor,
  );
  await page.evaluate(() => {
    const fs = (window as unknown as FileHost).pfs;
    const read = fs.readFile.bind(fs);
    const state = window as unknown as { mediaReads: string[] };
    state.mediaReads = [];
    fs.readFile = async (path) => {
      state.mediaReads.push(path);
      return read(path);
    };
  });
  await app.modeButton("Preview").click();
  const preview = app.preview.filter({ visible: true });
  await expect(preview.locator("video, audio")).toHaveCount(0);
  await expect(preview.locator("img")).toHaveAttribute("src", "");
  expect(
    await page.evaluate(() =>
      (window as unknown as { mediaReads: string[] }).mediaReads.filter(
        (path) => path.includes("blocked") || path.includes("example.com"),
      ),
    ),
  ).toEqual([]);
});

test("HTTPS media keeps its query and playback errors are visible", async ({
  app,
  page,
}) => {
  await createDraft(app);
  await page.route("https://example.com/**", (route) => {
    const bad = new URL(route.request().url()).pathname.endsWith("bad.mp4");
    return route.fulfill({
      status: 200,
      contentType: bad ? "video/mp4" : "audio/wav",
      body: bad ? Buffer.from("unsupported media bytes") : Buffer.from(wav),
    });
  });
  await app.setEditorText(
    "![](https://example.com/sound.wav?token=abc)\n\n![](https://example.com/bad.mp4?x=1)",
    app.visibleEditor,
  );
  await app.modeButton("Preview").click();
  const preview = app.preview.filter({ visible: true });
  await expect(preview.locator("audio[controls]")).toHaveAttribute(
    "src",
    "https://example.com/sound.wav?token=abc",
  );
  await expect(preview.locator("video[controls]")).toHaveCount(1);
  await expect
    .poll(() =>
      preview
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.error?.code ?? 0),
    )
    .toBeGreaterThan(0);
  await expect(preview.getByRole("status")).toContainText(
    "could not be played",
  );
});
