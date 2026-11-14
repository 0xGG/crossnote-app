import { ensureSyntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NoteDocument } from "../editor/noteDocument";
import { NoteEditor } from "../editor/noteEditor";
import { imageMarkup } from "../editor/livePreview";
import "../i18n/i18n";
import type { Note } from "../lib/note";
import { renderMarkdown } from "../render";
import { resolveNoteImageSrc } from "../utilities/image";
import EditImageDialog, { type EditedImage } from "./EditImageDialog";

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

let editor: NoteEditor;
let editorHost: HTMLDivElement;
const note = { notebookPath: "/notebooks/a", filePath: "a.md" } as Note;

// An image as the editor tells of one clicked: what its markup says, and
// where the markup is.
function image(src: string): EditedImage {
  return {
    src,
    alt: "a picture",
    title: "",
    from: 0,
    to: editor.document.doc.length,
    document: editor.document.doc,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  editorHost = document.createElement("div");
  document.body.appendChild(editorHost);
  editor = new NoteEditor({
    parent: editorHost,
    document: new NoteDocument(""),
    display: "source",
    testId: "image-editor",
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  editor.destroy();
  editorHost.remove();
});

// The preview is filled from a promise its effect starts, which async act
// waits for when the lookup ends straight away, as it does for a web address.
async function show(
  open: boolean,
  edited: EditedImage | null,
  forNote: Note | null = note,
) {
  await act(async () => {
    root.render(
      <EditImageDialog
        open={open}
        onClose={() => {}}
        editor={editor}
        image={edited}
        note={forNote}
      />,
    );
  });
}

// The dialog renders in a portal; the only img in the document is the
// preview.
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

const action = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name,
  )!;

it("preserves the meaning of an escaped image title through Update", async () => {
  const text = String.raw`![photo](https://example.com/a.png "A \"quoted\" photo &amp; more")`;
  editor.document.load(text);
  const state = editor.view.state;
  const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
  let node: SyntaxNode;
  tree.iterate({
    enter: (ref) => {
      if (ref.name === "Image") node = ref.node;
    },
  });
  await show(true, {
    ...imageMarkup(state, node)!,
    from: node.from,
    to: node.to,
    document: editor.document.doc,
  });
  act(() => action("Update").click());
  const rendered = document.createElement("div");
  rendered.innerHTML = renderMarkdown(editor.document.text()).html;
  expect(rendered.querySelector("img")?.getAttribute("title")).toBe(
    'A "quoted" photo & more',
  );
});

it.each([
  [
    "![photo](<https://example.com/my photo.png>)",
    "https://example.com/my%20photo.png",
  ],
  [
    "![photo](https://example.com/a\\(1\\).png)",
    "https://example.com/a(1).png",
  ],
  ["![photo](https://example.com/a<b.png)", "https://example.com/a%3Cb.png"],
  ["![photo](https://example.com/a>b.png)", "https://example.com/a%3Eb.png"],
  ["![photo](https://example.com/a>)", "https://example.com/a%3E"],
  [String.raw`![photo](https://example.com/a\>)`, "https://example.com/a%3E"],
  [String.raw`![photo](\<photo>.png)`, "%3Cphoto%3E.png"],
  ["![photo](<https://example.com/a)b.png>)", "https://example.com/a)b.png"],
  [
    "![photo](https://example.com/a(b)<c>.png)",
    "https://example.com/a(b)%3Cc%3E.png",
  ],
  [
    "![photo](https://example.com/a&amp;amp;b.png)",
    "https://example.com/a&amp;b.png",
  ],
])(
  "preserves the parsed image destination through Update: %s",
  async (text, target) => {
    editor.document.load(text);
    const state = editor.view.state;
    const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
    let node: SyntaxNode;
    tree.iterate({
      enter: (ref) => {
        if (ref.name === "Image") node = ref.node;
      },
    });
    expect(node).toBeDefined();
    await show(true, {
      ...imageMarkup(state, node)!,
      from: node.from,
      to: node.to,
      document: editor.document.doc,
    });
    act(() => action("Update").click());
    const rendered = document.createElement("div");
    rendered.innerHTML = renderMarkdown(editor.document.text()).html;
    expect(rendered.querySelector("img")?.getAttribute("src")).toBe(target);
  },
);

it("keeps a leading angle bracket in an image URL entered through Update", async () => {
  editor.document.load("![photo](https://example.com/a.png)");
  await show(true, image("https://example.com/a.png"));
  act(() => type(urlField(), "<photo>.png"));
  act(() => action("Update").click());
  const rendered = document.createElement("div");
  rendered.innerHTML = renderMarkdown(editor.document.text()).html;
  expect(rendered.querySelector("img")?.getAttribute("src")).toBe(
    "%3Cphoto%3E.png",
  );
});

it.each(["Update", "Delete"])(
  "prevents stale %s after a document reload, including before React redraws",
  async (name) => {
    const oldText = "![old](https://example.com/a.png)";
    const newText = "![new](https://example.com/b.png)";
    editor.document.load(oldText);
    await show(true, { ...image("https://example.com/a.png"), alt: "old" });
    act(() => {
      editor.document.load(newText);
      action(name).click();
    });
    expect(editor.document.text()).toBe(newText);
    expect(action(name).disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "The note changed",
    );
  },
);

it.each(["Update", "Delete"])(
  "invalidates %s when text is inserted before the selected image",
  async (name) => {
    const original = "![old](https://example.com/a.png)";
    editor.document.load(original);
    await show(true, image("https://example.com/a.png"));
    act(() => {
      editor.view.dispatch({
        changes: { from: 0, insert: "![new](https://example.com/b.png)\n" },
      });
      action(name).click();
    });
    expect(editor.document.text()).toBe(
      `![new](https://example.com/b.png)\n${original}`,
    );
    expect(action(name).disabled).toBe(true);
  },
);

it.each(["![old](https://example.com/a.png)", "![old][pic]"])(
  "updates and deletes a selected image with markup %s",
  async (markup) => {
    const definition = '\n\n[pic]: https://example.com/a.png "Shared"';
    editor.document.load(markup + definition);
    await show(true, {
      ...image("https://example.com/a.png"),
      to: markup.length,
      alt: "new",
    });
    act(() => action("Update").click());
    expect(editor.document.text()).toBe(
      "![new](https://example.com/a.png)" + definition,
    );
    await show(false, null);
    await show(true, {
      ...image("https://example.com/a.png"),
      to: "![new](https://example.com/a.png)".length,
    });
    act(() => action("Delete").click());
    expect(editor.document.text()).toBe(definition);
  },
);

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

it("shows nothing of another note's picture while this note's is looked up", async () => {
  // A source relative to the note is resolved against its folder, so the
  // same source can be a different picture in another note.
  const other = { notebookPath: "/notebooks/a", filePath: "sub/b.md" } as Note;
  await show(false, null);
  const endFirstLookup = holdNextLookup();
  await show(true, image("./p.png"), note);
  await endFirstLookup("data:image/png;base64,QQ==");
  expect(preview()).toBe("data:image/png;base64,QQ==");
  await show(false, image("./p.png"), note);

  const endLookup = holdNextLookup();
  await show(true, image("./p.png"), other);
  expect(preview()).toBe("");

  await endLookup("data:image/png;base64,Qg==");
  expect(preview()).toBe("data:image/png;base64,Qg==");
});
