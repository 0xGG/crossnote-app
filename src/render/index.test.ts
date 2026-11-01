import { afterEach, describe, expect, it, vi } from "vitest";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import * as echomd from "./echomd";
import { mountPreview } from "./index";

vi.mock("../utilities/image", () => ({ resolveNoteImageSrc: vi.fn() }));
vi.mock("./echomd", async (importOriginal) => {
  const original = await importOriginal<typeof import("./echomd")>();
  return { ...original, renderMarkdown: vi.fn(original.renderMarkdown) };
});

const note = { notebookPath: "/notebooks/n", filePath: "a.md" } as Note;

// An image resolution that finishes when the test says so.
function pendingImage() {
  let finish: (src: string) => void;
  vi.mocked(resolveNoteImageSrc).mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );
  return (src: string) => finish(src);
}

afterEach(() => {
  vi.mocked(resolveNoteImageSrc).mockReset();
  document.body.innerHTML = "";
});

describe("mountPreview", () => {
  it("draws the sanitized HTML", async () => {
    // echomd's own filter lets a form through, as it looks at src, href and
    // background addresses only.
    const element = document.createElement("div");
    const preview = mountPreview(
      element,
      '[[Other]]\n\n<form action="javascript:alert(1)"><input type="submit" value="Go"></form>\n',
      { note: null },
    );
    await preview.done;
    expect(preview.isPresentation).toBe(false);
    expect(element.querySelector("form")).toBeNull();
    expect(element.querySelector("input").value).toBe("Go");
    expect(element.querySelector("a").textContent).toBe("Other");
  });

  it("keeps a wiki link to a note whose name starts like a scheme", async () => {
    const element = document.createElement("div");
    await mountPreview(element, "[[Todo: groceries]] and [[README]]\n", {
      note: null,
    }).done;
    const [todo, readme] = Array.from(element.querySelectorAll("a"));
    expect(todo.getAttribute("href")).toBe("./Todo: groceries");
    expect(readme.getAttribute("href")).toBe("README");
  });

  it("draws the rest of the note when one block cannot be drawn", async () => {
    // mermaid is not loaded here, so its block fails.
    const element = document.createElement("div");
    await mountPreview(
      element,
      "```mermaid\ngraph TD; A-->B\n```\n\n```js\nlet a = 1;\n```\n\nAfter.\n",
      { note: null },
    ).done;
    expect(element.querySelector(".language-error")).not.toBeNull();
    expect(element.querySelector(".vickeymd-fence")).toBeNull();
    expect(element.textContent).toContain("let a = 1;");
    expect(element.textContent).toContain("After.");
  });

  it("settles once the note's images are resolved", async () => {
    const finish = pendingImage();
    const element = document.createElement("div");
    let settled = false;
    const preview = mountPreview(element, "![](a%20b.png)", { note });
    preview.done.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(resolveNoteImageSrc).toHaveBeenCalledWith(note, "a b.png");
    finish("data:image/png;base64,AAAA");
    await preview.done;
    expect(element.querySelector("img").getAttribute("src")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("keeps an image as it is when the preview is disposed of first", async () => {
    const finish = pendingImage();
    const element = document.createElement("div");
    const preview = mountPreview(element, "![](a.png)", { note });
    preview.dispose();
    finish("data:image/png;base64,AAAA");
    await preview.done;
    expect(element.querySelector("img").getAttribute("src")).toBe("a.png");
  });

  it("disposes of what was drawn into the element before", async () => {
    const finish = pendingImage();
    const element = document.createElement("div");
    const first = mountPreview(element, "![](a.png)", { note });
    const image = element.querySelector("img");
    mountPreview(element, "Second.", { note });
    finish("data:image/png;base64,AAAA");
    await first.done;
    expect(image.getAttribute("src")).toBe("a.png");
    expect(element.textContent.trim()).toBe("Second.");
  });

  it("shows why the markdown stage failed, and rejects", async () => {
    vi.mocked(echomd.renderMarkdown).mockImplementationOnce(() => {
      throw new Error("cannot read");
    });
    const element = document.createElement("div");
    await expect(mountPreview(element, "text", { note }).done).rejects.toThrow(
      "cannot read",
    );
    expect(element.innerText).toBe("Error: cannot read");
  });
});

describe("mountPreview with slides", () => {
  const deck = "<!-- slide -->\n\n# One\n\n[[Other]]\n";

  function mountDeck() {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const preview = mountPreview(element, deck, { note: null });
    const listener = added.mock.calls.find(([type]) => type === "message")[1];
    added.mockRestore();
    const iframe = element.querySelector("iframe");
    const id =
      iframe.contentDocument.documentElement.innerHTML.match(
        /reveal\.js\.[\d.]+/,
      )[0];
    return { element, preview, listener, removed, iframe, id };
  }

  it("finishes the deck once reveal.js says it is ready, and stops listening", async () => {
    const { preview, listener, removed, iframe, id } = mountDeck();
    expect(preview.isPresentation).toBe(true);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { event: "reveal-ready", id },
        source: iframe.contentWindow,
      }),
    );
    await preview.done;
    expect(removed).toHaveBeenCalledWith("message", listener);
    const link = iframe.contentDocument.body.querySelector("a");
    expect(link.textContent).toBe("Other");
    expect(link.onclick).not.toBeNull();
    removed.mockRestore();
  });

  it("ignores the message of another frame", async () => {
    const { preview, iframe, id, removed } = mountDeck();
    let settled = false;
    preview.done.then(() => (settled = true));
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { event: "reveal-ready", id },
        source: window,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve));
    expect(settled).toBe(false);
    expect(iframe.contentDocument.body.querySelector("a").onclick).toBeNull();
    preview.dispose();
    removed.mockRestore();
  });

  it("stops listening when disposed of before the deck is ready", async () => {
    const { preview, listener, removed, iframe, id } = mountDeck();
    preview.dispose();
    await preview.done;
    expect(removed).toHaveBeenCalledWith("message", listener);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { event: "reveal-ready", id },
        source: iframe.contentWindow,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve));
    expect(iframe.contentDocument.body.querySelector("a").onclick).toBeNull();
    removed.mockRestore();
  });
});
