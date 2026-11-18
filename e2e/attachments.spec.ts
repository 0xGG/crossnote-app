import { expect, test } from "./fixtures";
import { localBytes, type FileHost } from "./git";
import { createDraft, png, wav } from "./attachment-helpers";

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

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
