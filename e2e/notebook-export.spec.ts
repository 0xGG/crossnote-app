import { ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Download } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { holdFileRead, png } from "./attachment-helpers";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import {
  bytes,
  changeRemote,
  cloneRemote,
  createRemote,
  localBytes,
  type FileHost,
} from "./git";

test.describe.configure({ timeout: 60_000 });

const exportLabel = "Export notebook ZIP";
const notePath = "journal/Chapter.md";
const original = "---\r\nnumber: 001\r\n---\r\nPreserve every byte.\r\n";

async function readZip(download: Download) {
  const path = await download.path();
  ok(path, "The export did not produce a downloaded file");
  return unzipSync(await readFile(path));
}

async function exportDialog(app: CrossnoteApp, notebook: string) {
  await app
    .notebook(notebook)
    .getByRole("treeitem", { name: exportLabel })
    .click();
  return app.page.getByRole("dialog", { name: `Export ${notebook} as ZIP` });
}

async function draftWithChapter(app: CrossnoteApp) {
  await app.open();
  await app.openNotes();
  const dir = await app.notebookFolder();
  await localBytes(app.page, `${dir}/${notePath}`, bytes("# Chapter\n"));
  await app.page.reload();
  await app.waitUntilReady();
  await app.openNotes();
  await app.noteCards.getByText("Chapter", { exact: true }).click();
  return dir;
}

async function openExtractedFiles(
  app: CrossnoteApp,
  files: Record<string, Uint8Array>,
) {
  const entries = Object.entries(files).flatMap(([name, data]) =>
    name.startsWith("files/") && name !== "files/"
      ? [{ name: name.slice("files/".length), data: [...data] }]
      : [],
  );
  await app.page.evaluate(async (entries) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle("BackupCopy", {
      create: true,
    });
    await folder.getDirectoryHandle(".git", { create: true });
    for (const { name, data } of entries) {
      const parts = name.split("/");
      const basename = parts.pop()!;
      let directory = folder;
      for (const part of parts)
        directory = await directory.getDirectoryHandle(part, { create: true });
      if (!basename) continue;
      const file = await directory.getFileHandle(basename, { create: true });
      const writer = await file.createWritable();
      await writer.write(new Uint8Array(data));
      await writer.close();
    }
    (
      window as unknown as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker = () => root.getDirectoryHandle("BackupCopy");
  }, entries);
  await app.sidebar.getByRole("button", { name: "Add a notebook" }).click();
  await app.page.getByRole("button", { name: "Open a Local Folder" }).click();
  await app.openNotes("BackupCopy");
}

type HeldFile = { fileReadHeld?: boolean; releaseFileRead: () => void };

test("exports a selected image with its saved note and reopens the extracted files", async ({
  app,
  page,
}) => {
  const dir = await draftWithChapter(app);
  const unrelatedFiles = {
    "journal/Original.md": bytes(original),
    "metadata.json": bytes("user metadata"),
    ".hidden.bin": [0, 255, 13, 10],
    "assets/unreferenced.png": png,
    "notes/zero": [],
    "nested/.git": bytes("gitdir: elsewhere"),
    ".GIT/owned.bin": [4, 6],
    "nested/.GIT": bytes("user file distinct from lower-case Git metadata"),
    "deeper/worktree/.git/config": bytes("git metadata"),
  };
  for (const [name, content] of Object.entries(unrelatedFiles))
    await localBytes(page, `${dir}/${name}`, content);
  await page.evaluate(async (name) => {
    const fs = (
      window as unknown as FileHost & {
        pfs: { mkdirp(path: string): Promise<void> };
      }
    ).pfs;
    await fs.mkdirp(`${name}/empty/subfolder`);
    await fs.storeTree(name);
  }, dir);

  await app.modeButton("Edit").click();
  await app.focusEditor(app.visibleEditor);
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await page.evaluate(() => {
    const control = window as unknown as HeldFile;
    const arrayBuffer = File.prototype.arrayBuffer;
    const hold = new Promise<void>(
      (resolve) => (control.releaseFileRead = resolve),
    );
    File.prototype.arrayBuffer = async function () {
      if (this.name === "selected.png") {
        File.prototype.arrayBuffer = arrayBuffer;
        control.fileReadHeld = true;
        await hold;
      }
      return arrayBuffer.call(this);
    };
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .locator(".cm-tooltip-autocomplete li")
    .filter({ hasText: "/image" })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "selected.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as HeldFile).fileReadHeld),
    )
    .toBe(true);
  const dialog = await exportDialog(app, "Drafts");
  await expect(dialog.getByText(/Git-ignored files/)).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: exportLabel }).click();
  await expect(dialog.getByRole("status")).toContainText("Preparing");
  await page.evaluate(() => (window as unknown as HeldFile).releaseFileRead());

  const result = await download;
  expect(result.suggestedFilename()).toBe("Drafts.zip");
  const archive = await readZip(result);
  expect(JSON.parse(strFromU8(archive["metadata.json"]))).toEqual({
    format: "crossnote-notebook",
    version: 1,
    displayName: "Drafts",
  });
  expect([...archive["files/journal/Original.md"]]).toEqual(bytes(original));
  expect(strFromU8(archive["files/metadata.json"])).toBe("user metadata");
  expect([...archive["files/.hidden.bin"]]).toEqual([0, 255, 13, 10]);
  expect([...archive["files/assets/unreferenced.png"]]).toEqual(png);
  expect([...archive["files/.GIT/owned.bin"]]).toEqual([4, 6]);
  expect(strFromU8(archive["files/nested/.GIT"])).toBe(
    "user file distinct from lower-case Git metadata",
  );
  for (const empty of [
    "files/",
    "files/empty/",
    "files/empty/subfolder/",
    "files/notes/zero",
  ])
    expect(archive[empty]).toEqual(new Uint8Array(0));
  expect(
    Object.keys(archive).some((name) => name.split("/").includes(".git")),
  ).toBe(false);

  const chapter = strFromU8(archive[`files/${notePath}`]);
  expect(chapter).toContain("# Chapter");
  const image = chapter.match(
    /!\[\]\(\/(assets\/selected-[^\s)]+\.png)\)/,
  )?.[1];
  ok(image, "The archived note misses the image accepted just before export");
  expect([...archive[`files/${image}`]]).toEqual(png);
  expect(await localBytes(page, `${dir}/${notePath}`)).toEqual([
    ...archive[`files/${notePath}`],
  ]);

  await openExtractedFiles(app, archive);
  await page.evaluate(() => {
    const host = window as unknown as FileHost & { backupWrites: string[] };
    const write = host.pfs.writeFile;
    host.backupWrites = [];
    host.pfs.writeFile = (name, data) => {
      host.backupWrites.push(name);
      return write(name, data);
    };
  });
  await app.noteCards.getByText("Chapter", { exact: true }).click();
  const preview = app.preview.filter({ visible: true });
  await expect(preview.locator("img")).toBeVisible();
  await expect
    .poll(() =>
      preview
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);

  const diskDialog = await exportDialog(app, "BackupCopy");
  await expect(
    diskDialog.getByText(/Chrome may hide symbolic links/),
  ).toBeVisible();
  const diskDownload = page.waitForEvent("download");
  await diskDialog.getByRole("button", { name: exportLabel }).click();
  const diskZip = await readZip(await diskDownload);
  expect(Object.keys(diskZip).sort()).toEqual(Object.keys(archive).sort());
  expect(JSON.parse(strFromU8(diskZip["metadata.json"])).displayName).toBe(
    "BackupCopy",
  );
  const originalFiles = Object.entries(archive).filter(([name]) =>
    name.startsWith("files/"),
  );
  for (const [name, data] of originalFiles)
    expect(diskZip[name], name).toEqual(data);
  expect(
    await page.evaluate(
      () => (window as unknown as { backupWrites: string[] }).backupWrites,
    ),
  ).toEqual([]);
});

test("lists incompatible Windows names but keeps the original archive entries", async ({
  app,
  page,
}) => {
  const dir = await draftWithChapter(app);
  await localBytes(page, `${dir}/Meeting: plan.md`, bytes(original));
  await localBytes(page, `${dir}/ Report  .md `, [3]);
  await localBytes(page, `${dir}/control\tfile`, [4]);
  await localBytes(page, `${dir}/Case/first`, [1]);
  await localBytes(page, `${dir}/case/second`, [2]);
  const exports = app
    .notebook("Drafts")
    .getByRole("treeitem", { name: exportLabel });
  await exports.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Export Drafts as ZIP" });
  await dialog.getByRole("button", { name: exportLabel }).click();
  const warning = dialog.getByRole("alert");
  await expect(warning).toContainText("on Windows");
  await expect(warning.getByRole("listitem")).toHaveText([
    '" Report  .md "',
    '"Case"',
    '"Meeting: plan.md"',
    '"case"',
    '"control\\tfile"',
  ]);
  await expect(warning.locator("code").first()).toHaveText(
    /^" Report {2}\.md "$/,
    { useInnerText: true },
  );
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download ZIP" }).click();
  const archive = await readZip(await download);
  expect([...archive["files/Meeting: plan.md"]]).toEqual(bytes(original));
  expect([...archive["files/ Report  .md "]]).toEqual([3]);
  expect([...archive["files/control\tfile"]]).toEqual([4]);
  expect([...archive["files/Case/first"]]).toEqual([1]);
  expect([...archive["files/case/second"]]).toEqual([2]);
});

test("reports an unsaved note and exports it on retry after storage recovers", async ({
  app,
  page,
}) => {
  const dir = await draftWithChapter(app);
  const saved = await localBytes(page, `${dir}/${notePath}`);
  await app.modeButton("Edit").click();
  await app.refuseWrites();
  await app.setEditorText("Typing still in the editor", app.visibleEditor);
  const staged: Download[] = [];
  page.on("download", (file) => staged.push(file));
  const dialog = await exportDialog(app, "Drafts");
  await dialog.getByRole("button", { name: exportLabel }).click();
  await expect(dialog.getByRole("alert")).toContainText(notePath);
  expect(await app.refusedWrites()).toContain("file");
  expect(staged).toHaveLength(0);
  expect(await localBytes(page, `${dir}/${notePath}`)).toEqual(saved);

  await app.refuseWrites(false);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Retry" }).click();
  const archive = await readZip(await download);
  expect(strFromU8(archive[`files/${notePath}`])).toContain(
    "Typing still in the editor",
  );
  expect(await localBytes(page, `${dir}/${notePath}`)).toEqual([
    ...archive[`files/${notePath}`],
  ]);
});

test("waits for a text file dropped in the editor before saving the archive", async ({
  app,
  page,
}) => {
  await draftWithChapter(app);
  await app.modeButton("Edit").click();
  await app.visibleEditor.locator(".cm-content").evaluate((element) => {
    const control = window as unknown as HeldFile;
    const read = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (file, encoding) {
      FileReader.prototype.readAsText = read;
      control.fileReadHeld = true;
      control.releaseFileRead = () => read.call(this, file, encoding);
    };
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["Text accepted from the drop"], "pending.txt", {
        type: "text/plain",
      }),
    );
    const line = element.querySelector(".cm-line")!.getBoundingClientRect();
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: line.left + 2,
        clientY: line.top + line.height / 2,
      }),
    );
  });
  expect(
    await page.evaluate(() => (window as unknown as HeldFile).fileReadHeld),
  ).toBe(true);
  const dialog = await exportDialog(app, "Drafts");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: exportLabel }).click();
  await expect(dialog.getByRole("status")).toContainText("Preparing");
  await page.evaluate(() => (window as unknown as HeldFile).releaseFileRead());
  const archive = await readZip(await download);
  expect(strFromU8(archive[`files/${notePath}`])).toContain(
    "Text accepted from the drop",
  );
});

test("reports a failed settings write from another registration while export waits", async ({
  app,
  page,
}) => {
  await app.open();
  await openExtractedFiles(app, {
    [`files/${notePath}`]: new Uint8Array(bytes("# Chapter\n")),
  });
  const dir = await app.notebookFolder();
  expect(dir).toMatch(/^\/lfs\//);
  await app.noteCards.getByText("Chapter", { exact: true }).click();

  await app.sidebar.getByRole("button", { name: "Add a notebook" }).click();
  await page.getByRole("button", { name: "Open a Local Folder" }).click();
  const notebooks = app.notebook("BackupCopy");
  await expect(notebooks).toHaveCount(2);
  // The new registration appears first. The editor is in the expanded one.
  const other = notebooks.first();
  await expect(other).toHaveAttribute("aria-expanded", "false");
  await other.getByRole("button", { name: "Expand", exact: true }).click();
  await app.modeButton("Edit").click();
  await holdFileRead(app);
  await page.evaluate((target) => {
    const host = window as unknown as FileHost & {
      rejectSettingsWrite?: () => void;
      settingsWriteFinished?: boolean;
    };
    const write = host.pfs.writeFile;
    host.pfs.writeFile = (name, data) => {
      if (name !== target) return write(name, data);
      if (!host.rejectSettingsWrite) {
        return new Promise<void>((_, reject) => {
          host.rejectSettingsWrite = () =>
            reject(new Error("Settings write refused"));
        });
      }
      host.pfs.writeFile = write;
      return write(name, data).then(() => {
        host.settingsWriteFinished = true;
      });
    };
  }, `${dir}/${notePath}`);
  const messages = await app.recordMessages();
  await page.getByRole("button", { name: "Note menu" }).click();
  await page
    .getByRole("button", { name: "Add to quick access", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => "rejectSettingsWrite" in window))
    .toBe(true);
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Pin the note", exact: true }).click();

  const downloads: Download[] = [];
  page.on("download", (file) => downloads.push(file));
  await other.getByRole("treeitem", { name: exportLabel }).click();
  const dialog = page.getByRole("dialog", {
    name: "Export BackupCopy as ZIP",
  });
  await dialog.getByRole("button", { name: exportLabel }).click();
  await expect(dialog.getByRole("status")).toContainText("Preparing");
  await page.evaluate(() => {
    (
      window as unknown as { rejectSettingsWrite: () => void }
    ).rejectSettingsWrite();
  });
  await expect
    .poll(messages)
    .toEqual(
      expect.arrayContaining([
        expect.stringContaining("Settings write refused"),
      ]),
    );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { settingsWriteFinished?: boolean })
            .settingsWriteFinished,
      ),
    )
    .toBe(true);
  const saved = await localBytes(page, `${dir}/${notePath}`);
  expect(strFromU8(Uint8Array.from(saved))).toContain("pinned: true");
  await page.evaluate(() => (window as unknown as HeldFile).releaseFileRead());

  await expect
    .poll(async () => {
      if (downloads.length > 0) return "download";
      if (await dialog.getByRole("alert").count()) return "save error";
      return "pending";
    })
    .toBe("save error");
  await expect(dialog.getByRole("alert")).toContainText(notePath);
  await expect(dialog.getByRole("alert")).toContainText(
    "Settings write refused",
  );
  expect(downloads).toHaveLength(0);
});

test("exports a child folder with edits opened through its parent notebook", async ({
  app,
  page,
}) => {
  await app.open();
  await openExtractedFiles(app, {
    [`files/${notePath}`]: new Uint8Array(bytes("# Chapter\n")),
    "files/Outside.md": new Uint8Array(bytes("# Outside\n")),
  });
  const parent = await app.notebookFolder();
  await app.noteCards.getByText("Outside", { exact: true }).click();
  await app.modeButton("Edit").click();
  await holdFileRead(app);

  await app.openNotes("BackupCopy");
  await app.noteCards.getByText("Chapter", { exact: true }).click();
  await app.modeButton("Edit").click();
  await page.evaluate(async (target) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle("BackupCopy");
    const host = window as unknown as FileHost & {
      showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      rejectChapterWrite: () => void;
    };
    host.showDirectoryPicker = () => folder.getDirectoryHandle("journal");
    const write = host.pfs.writeFile;
    host.pfs.writeFile = (name, data) => {
      if (name !== target) return write(name, data);
      host.pfs.writeFile = write;
      return new Promise<void>((_, reject) => {
        host.rejectChapterWrite = () =>
          reject(new Error("Chapter write refused"));
      });
    };
  }, `${parent}/${notePath}`);
  await app.setEditorText("Edited through the parent", app.visibleEditor);
  await expect
    .poll(() => page.evaluate(() => "rejectChapterWrite" in window))
    .toBe(true);

  await app.sidebar.getByRole("button", { name: "Add a notebook" }).click();
  await page.getByRole("button", { name: "Open a Local Folder" }).click();
  await app.openNotes("journal");
  const dialog = await exportDialog(app, "journal");
  const downloads: Download[] = [];
  page.on("download", (file) => downloads.push(file));
  await dialog.getByRole("button", { name: exportLabel }).click();
  await page.evaluate(() => {
    (
      window as unknown as { rejectChapterWrite: () => void }
    ).rejectChapterWrite();
  });
  const error = dialog.getByRole("alert");
  await expect
    .poll(async () => {
      if (downloads[0]) {
        const archive = await readZip(downloads[0]);
        return strFromU8(archive["files/Chapter.md"]);
      }
      return (await error.count()) ? "save error" : "pending";
    })
    .toBe("save error");
  await expect(error).toContainText("Chapter.md");
  await expect(error).not.toContainText(notePath);
  await expect(error).toContainText("Chapter write refused");

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Retry" }).click();
  const archive = await readZip(await download);
  expect(strFromU8(archive["files/Chapter.md"])).toContain(
    "Edited through the parent",
  );
  expect(Object.keys(archive).sort()).toEqual([
    "files/",
    "files/Chapter.md",
    "metadata.json",
  ]);
  await page.evaluate(() => (window as unknown as HeldFile).releaseFileRead());
});

test("waits for the same Git notebook's download and includes ignored working files", async ({
  app,
  page,
  request,
}) => {
  const remote = await createRemote(request, {
    "Guide.md": bytes("Old guide"),
    ".gitignore": bytes("private/\n"),
  });
  await app.open();
  const dir = await cloneRemote(app, remote);
  await localBytes(page, `${dir}/private/draft.bin`, [0, 255, 42]);
  await changeRemote(request, remote, { "Guide.md": bytes("New guide") });
  const advertisement = "**/info/refs?service=git-upload-pack";
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    advertisement,
    async (route) => {
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  const fetchStarted = page.waitForRequest(advertisement);
  await app
    .notebook(remote.id)
    .getByRole("treeitem", { name: /Download/ })
    .click();
  try {
    await fetchStarted;
    const dialog = await exportDialog(app, remote.id);
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: exportLabel }).click();
    await expect(dialog.getByRole("status")).toContainText("Preparing");
    release();
    const archive = await readZip(await download);
    expect(strFromU8(archive["files/Guide.md"])).toBe("New guide");
    expect(strFromU8(archive["files/.gitignore"])).toBe("private/\n");
    expect([...archive["files/private/draft.bin"]]).toEqual([0, 255, 42]);
    expect(
      Object.keys(archive).some((name) => name.startsWith("files/.git/")),
    ).toBe(false);
    expect(JSON.parse(strFromU8(archive["metadata.json"]))).toEqual({
      format: "crossnote-notebook",
      version: 1,
      displayName: remote.id,
    });
  } finally {
    release();
  }
});
