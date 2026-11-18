import { afterEach, expect, it, vi } from "vitest";
import { pfs } from "../lib/fs";
import type { Note } from "../lib/note";
import { resolveNoteImageSrc } from "./image";

afterEach(() => vi.restoreAllMocks());
const note = { notebookPath: "/books/a", filePath: "nested/note.md" } as Note;

it.each([
  "../../secret.png",
  "/../../secret.png",
  "..%2f..%2fsecret.png",
  "..\\secret.png",
])("checks %s before any filesystem lookup", async (src) => {
  const exists = vi.spyOn(pfs, "exists");
  const read = vi.spyOn(pfs, "readFile");
  await expect(resolveNoteImageSrc(note, src)).rejects.toThrow();
  expect(exists).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

it("leaves HTTPS image URLs and their query untouched", async () => {
  const src = "https://example.com/image.png?token=a%23b";
  expect(await resolveNoteImageSrc(note, src)).toBe(src);
});

it("reads a relative image with an encoded Chinese name, space, percent and hash", async () => {
  const root = `/notebooks/image-${crypto.randomUUID()}`;
  const nestedNote = { notebookPath: root, filePath: "nested/note.md" } as Note;
  const bytes = new Uint8Array([0, 255, 42]);
  await pfs.mkdirp(`${root}/assets`);
  await pfs.writeFile(`${root}/assets/中文 空%#.png`, bytes);
  expect(
    await resolveNoteImageSrc(
      nestedNote,
      "../assets/%E4%B8%AD%E6%96%87%20%E7%A9%BA%25%23.png",
    ),
  ).toBe("data:image/png;base64,AP8q");
});

it("retains literal hashes in existing relative filenames", async () => {
  const root = `/notebooks/image-${crypto.randomUUID()}`;
  await pfs.mkdirp(root);
  await pfs.writeFile(`${root}/part#one.png`, new Uint8Array([42]));
  expect(
    await resolveNoteImageSrc(
      { notebookPath: root, filePath: "note.md" } as Note,
      "part#one.png",
    ),
  ).toBe("data:image/png;base64,Kg==");
});

it.each(["100%.png", "%FF.png", "mix%text%20.png"])(
  "reads existing literal filename %s when it is not valid URL encoding",
  async (name) => {
    const root = `/notebooks/image-${crypto.randomUUID()}`;
    await pfs.mkdirp(`${root}/nested`);
    await pfs.writeFile(`${root}/nested/${name}`, new Uint8Array([42]));
    expect(
      await resolveNoteImageSrc(
        { notebookPath: root, filePath: "nested/note.md" } as Note,
        name,
      ),
    ).toBe("data:image/png;base64,Kg==");
  },
);

it.each(["literal%20name.png", "literal%25name.png"])(
  "reads the literal filename %s when the decoded name is absent",
  async (name) => {
    const root = `/notebooks/image-${crypto.randomUUID()}`;
    await pfs.mkdirp(root);
    await pfs.writeFile(`${root}/${name}`, new Uint8Array([42]));
    expect(
      await resolveNoteImageSrc(
        { notebookPath: root, filePath: "note.md" } as Note,
        name,
      ),
    ).toBe("data:image/png;base64,Kg==");
  },
);

it("prefers the decoded image when both decoded and literal names exist", async () => {
  const root = `/notebooks/image-${crypto.randomUUID()}`;
  await pfs.mkdirp(root);
  await pfs.writeFile(`${root}/a b.png`, new Uint8Array([42]));
  await pfs.writeFile(`${root}/a%20b.png`, new Uint8Array([43]));
  expect(
    await resolveNoteImageSrc(
      { notebookPath: root, filePath: "note.md" } as Note,
      "a%20b.png",
    ),
  ).toBe("data:image/png;base64,Kg==");
});
