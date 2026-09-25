import type { Editor, TextMarker } from "codemirror";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import type { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import EditImageDialog from "./EditImageDialog";

// The real lookup, which a test can hold for one call to end it when it
// chooses.
vi.mock("../utilities/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utilities/image")>();
  return {
    ...actual,
    resolveNoteImageSrc: vi.fn(actual.resolveNoteImageSrc),
  };
});
function holdNextLookup(): (url: string) => Promise<void> {
  let end: (url: string) => void;
  vi.mocked(resolveNoteImageSrc).mockImplementationOnce(
    () => new Promise<string>((resolve) => (end = resolve)),
  );
  return (url) => act(async () => end(url));
}

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The dialog only asks the editor and the marker to replace the image's
// markdown, which none of these tests does.
const editor = {} as Editor;
const marker = {} as TextMarker;
const note = { notebookPath: "/notebooks/a", filePath: "a.md" } as Note;

// An image as the editor folds it: the source sits in data-src.
function image(src: string): HTMLImageElement {
  const element = document.createElement("img");
  element.setAttribute("data-src", src);
  element.alt = "a picture";
  return element;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// The preview is filled from a promise its effect starts, which async act
// waits for when the lookup ends straight away, as it does for a web address.
async function show(
  open: boolean,
  imageElement: HTMLImageElement | null,
  forNote: Note | null = note,
) {
  await act(async () => {
    root.render(
      <EditImageDialog
        open={open}
        onClose={() => {}}
        editor={editor}
        marker={marker}
        imageElement={imageElement}
        note={forNote}
      />,
    );
  });
}

// The dialog renders in a portal; the image element under test is detached,
// so the only img in the document is the preview.
const urlField = () => document.querySelector("input") as HTMLInputElement;
const preview = () => document.querySelector("img").getAttribute("src");

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    value,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("shows the image as it is each time it opens, not a cancelled edit", async () => {
  const picture = image("https://example.com/a.png");
  await show(true, picture);
  expect(urlField().value).toBe("https://example.com/a.png");
  act(() => type(urlField(), "https://example.com/typo.png"));

  await show(false, picture);
  await show(true, picture);
  expect(urlField().value).toBe("https://example.com/a.png");
});

it("previews an image that shares its source with the one opened before", async () => {
  // Mounted before any image is clicked, as the note panel mounts it.
  await show(false, null);
  await show(true, image("https://example.com/a.png"));
  expect(preview()).toBe("https://example.com/a.png");

  await show(false, image("https://example.com/a.png"));
  await show(true, image("https://example.com/a.png"));
  expect(preview()).toBe("https://example.com/a.png");
});

it("keeps the preview on the source when an earlier lookup ends later", async () => {
  // Opened as it mounts, with the lookup for the empty source it starts with
  // ending after the image's own, as reading the note's folder can.
  const endFirstLookup = holdNextLookup();
  await show(true, image("https://example.com/a.png"));
  expect(preview()).toBe("https://example.com/a.png");

  await endFirstLookup("");
  expect(preview()).toBe("https://example.com/a.png");
});

it("shows nothing of the image opened before while the next is looked up", async () => {
  await show(false, null);
  await show(true, image("https://example.com/a.png"));
  expect(preview()).toBe("https://example.com/a.png");
  await show(false, image("https://example.com/a.png"));

  // A picture kept in the notebook is read from its folder, which takes a
  // while.
  const endLookup = holdNextLookup();
  await show(true, image("./b.png"));
  expect(preview()).toBe("");

  await endLookup("data:image/png;base64,Yg==");
  expect(preview()).toBe("data:image/png;base64,Yg==");
});

it("previews the image of a kanban card, which has no note", async () => {
  await show(false, null, null);
  await show(true, image("https://example.com/a.png"), null);
  expect(preview()).toBe("https://example.com/a.png");
});
