import { afterEach, describe, expect, it, vi } from "vitest";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import { mountPreview } from "./index";
import * as markdown from "./markdown";

vi.mock("../utilities/image", () => ({ resolveNoteImageSrc: vi.fn() }));
// mermaid itself is too slow to load here; this one cannot draw anything.
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: async () => {
      throw new Error("Parse error on line 1");
    },
  },
}));
vi.mock("./markdown", async (importOriginal) => {
  const original = await importOriginal<typeof import("./markdown")>();
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
  // A test that times out on fake timers does not reach its own finally.
  vi.useRealTimers();
});

describe("mountPreview", () => {
  it("keeps what a note's HTML says, less what the sanitizer takes out", async () => {
    const element = document.createElement("div");
    await mountPreview(
      element,
      '<p onclick="alert(1)">Kept</p>\n\n<br>\n\n<script>alert(1)</script>\n\nA <a href="javascript:alert(1)">link</a> and <iframe src="https://a.b/"></iframe>.\n',
      { note: null },
    ).done;
    expect(element.querySelector("p")?.textContent).toBe("Kept");
    expect(element.querySelector("[onclick]")).toBeNull();
    expect(element.querySelector("br")).not.toBeNull();
    expect(element.querySelector("script, iframe")).toBeNull();
    expect(element.querySelector("a")?.textContent).toBe("link");
    expect(element.querySelector("a")?.hasAttribute("href")).toBe(false);
  });

  it("goes to the place in the note a link to #name names", async () => {
    const element = document.createElement("div");
    document.body.append(element);
    await mountPreview(element, "A note[^1].\n\n[^1]: The note.\n", { note })
      .done;
    // jsdom does not scroll.
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      element.querySelector<HTMLAnchorElement>('a[href^="#fn"]')!.click();
      expect(scrolled.map(({ id }) => id)).toEqual(["fn1"]);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("goes to the top of the note for a link to # alone", async () => {
    // In the app, what scrolls is a box around the preview.
    const box = document.createElement("div");
    const element = document.createElement("div");
    box.append(element);
    document.body.append(box);
    await mountPreview(element, "Text.\n\n[Back to top](#)\n", { note }).done;
    // jsdom does not scroll, so the box's scroll position is recorded.
    const tops: number[] = [];
    Object.defineProperty(box, "scrollTop", {
      configurable: true,
      get: () => 120,
      set: (top: number) => tops.push(top),
    });
    element.querySelector<HTMLAnchorElement>('a[href="#"]')!.click();
    expect(tops).toEqual([0]);
  });

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
    expect(element.querySelector("form")).toBeNull();
    expect(element.querySelector("input").value).toBe("Go");
    expect(element.querySelector("a").textContent).toBe("Other");
  });

  it("keeps a wiki link to a note whose name holds a colon", async () => {
    const element = document.createElement("div");
    await mountPreview(
      element,
      "[[Todo: groceries]], [[Book review: Dune]] and [[README]]\n",
      { note: null },
    ).done;
    const [todo, review, readme] = Array.from(element.querySelectorAll("a"));
    expect(todo.getAttribute("href")).toBe("./Todo: groceries");
    expect(review.getAttribute("href")).toBe("./Book review: Dune");
    expect(readme.getAttribute("href")).toBe("README");
  });

  it("draws the rest of the note when one block cannot be drawn", async () => {
    // mermaid cannot draw it, so its block fails.
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
    vi.mocked(markdown.renderMarkdown).mockImplementationOnce(() => {
      throw new Error("cannot read");
    });
    const element = document.createElement("div");
    await expect(mountPreview(element, "text", { note }).done).rejects.toThrow(
      "cannot read",
    );
    expect(element.textContent).toBe("Error: cannot read");
  });
});
