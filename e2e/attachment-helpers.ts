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

export async function createDraft(app: CrossnoteApp) {
  await app.open();
  await app.openNotes();
  await app.createNote();
  return app.notebookFolder();
}
