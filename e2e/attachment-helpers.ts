import { expect, type Page } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";

// A real one-pixel PNG, usable by both the browser decoder and the picker.
export const png = Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
// PCM mono, 8 kHz, one sample.
export const wav = [
  82, 73, 70, 70, 38, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0,
  1, 0, 1, 0, 64, 31, 0, 0, 64, 31, 0, 0, 1, 0, 8, 0, 100, 97, 116, 97, 2, 0, 0,
  0, 128, 128,
];

export async function recordedWebm(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    });
    recorder.start();
    for (let frame = 0; frame < 8; frame++) {
      context.fillStyle = frame % 2 ? "blue" : "red";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return [
      ...new Uint8Array(
        await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
      ),
    ];
  });
}

export async function fileEvent(
  app: CrossnoteApp,
  kind: "paste" | "drop",
  name: string,
  type: string,
  data: number[],
  size?: number,
) {
  await app.focusEditor(app.visibleEditor);
  await app.visibleEditor.locator(".cm-content").evaluate(
    (target, args) => {
      const transfer = new DataTransfer();
      const parts: BlobPart[] = args.size
        ? [new Uint8Array(args.size)]
        : [new Uint8Array(args.data)];
      transfer.items.add(new File(parts, args.name, { type: args.type }));
      const event =
        args.kind === "paste"
          ? new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: transfer,
            })
          : new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            });
      target.dispatchEvent(event);
    },
    { kind, name, type, data, size },
  );
}

// Pause before the notebook operation acquires its lock, allowing close and
// rename to finish while the same real File is still being read.
export async function holdFileRead(app: CrossnoteApp) {
  await app.focusEditor(app.visibleEditor);
  await app.visibleEditor.locator(".cm-content").evaluate((target, data) => {
    const state = window as unknown as {
      fileReadHeld: boolean;
      releaseFileRead(): void;
    };
    const file = new File([new Uint8Array(data)], "pending.png", {
      type: "image/png",
    });
    const read = File.prototype.arrayBuffer;
    const gate = new Promise<void>((resolve) => {
      state.releaseFileRead = resolve;
    });
    File.prototype.arrayBuffer = async function () {
      if (this.name === "pending.png") {
        File.prototype.arrayBuffer = read;
        state.fileReadHeld = true;
        await gate;
      }
      return read.call(this);
    };
    const transfer = new DataTransfer();
    transfer.items.add(file);
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, png);
  await expect
    .poll(() =>
      app.page.evaluate(
        () => (window as unknown as { fileReadHeld: boolean }).fileReadHeld,
      ),
    )
    .toBe(true);
}

export async function insertedPath(app: CrossnoteApp, extension: string) {
  let result = "";
  await expect
    .poll(async () => {
      const text = await app.editorText(app.visibleEditor);
      result =
        [...text.matchAll(/!\[\]\((\/assets\/[^)]+)\)/g)]
          .map((match) => match[1])
          .find((path) => path.endsWith(extension)) ?? "";
      return result;
    })
    .not.toBe("");
  return decodeURIComponent(result.slice(1));
}

export async function createDraft(app: CrossnoteApp) {
  await app.open();
  await app.openNotes();
  await app.createNote();
  return app.notebookFolder();
}

export async function localFolder(app: CrossnoteApp) {
  await app.open();
  await app.page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("AttachmentFolder", {
      create: true,
    });
    const file = await dir.getFileHandle("README.md", { create: true });
    const writer = await file.createWritable();
    await writer.write("Local note");
    await writer.close();
    (
      window as unknown as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker = async () => dir;
  });
  await app.sidebar.getByRole("button", { name: "Add a notebook" }).click();
  await app.page.getByRole("button", { name: "Open a Local Folder" }).click();
  await expect(app.notebook("AttachmentFolder")).toBeVisible();
  await app.openNotes("AttachmentFolder");
  await app.noteCards.getByText("README", { exact: true }).click();
  await app.modeButton("Edit").click();
}

export async function localFileBytes(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("AttachmentFolder");
    const assets = await dir.getDirectoryHandle("assets");
    const file = await assets.getFileHandle(path.split("/").pop()!);
    return [...new Uint8Array(await (await file.getFile()).arrayBuffer())];
  }, path);
}
