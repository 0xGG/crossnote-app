import { afterEach, expect, it, vi } from "vitest";
import type { Note } from "../lib/note";
import { pfs } from "../lib/fs";
import { mediaKind, notebookMediaPath, resolveNoteMedia } from "./media";

const note = { notebookPath: "/books/a", filePath: "nested/note.md" } as Note;
afterEach(() => vi.restoreAllMocks());

it("resolves notebook-root and note-relative media, including encoded names", () => {
  expect(
    notebookMediaPath(
      note.notebookPath,
      note.filePath,
      "/assets/中%20文%23%25.png",
    ),
  ).toBe("/books/a/assets/中 文#%.png");
  expect(
    notebookMediaPath(note.notebookPath, note.filePath, "../assets/a.png"),
  ).toBe("/books/a/assets/a.png");
  expect(notebookMediaPath(note.notebookPath, note.filePath, "local.png")).toBe(
    "/books/a/nested/local.png",
  );
  expect(
    notebookMediaPath(
      note.notebookPath,
      note.filePath,
      "%252e%252e/secret.png",
    ),
  ).toBe("/books/a/nested/%2e%2e/secret.png");
});

it.each([
  "../../secret.png",
  "/../../secret.png",
  "..%2f..%2fsecret.png",
  "..\\secret.png",
  "%5csecret.png",
  "../../secret%FF.png",
  "/../../mix%text.png",
])("rejects escape %s before reading", async (src) => {
  const read = vi.spyOn(pfs, "readFile");
  await expect(resolveNoteMedia(note, src)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});

it("keeps an HTTPS media address and its query intact", async () => {
  const src = "https://example.com/clip.mp4?token=a%23b&v=2";
  expect(mediaKind(src)).toBe("video");
  expect((await resolveNoteMedia(note, src)).url).toBe(src);
});
