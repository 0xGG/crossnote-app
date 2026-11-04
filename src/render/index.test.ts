import { afterEach, describe, expect, it, vi } from "vitest";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import { mountPreview } from "./index";
import * as markdown from "./markdown";
import { revealTimeout } from "./presentation";

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
    expect(preview.isPresentation).toBe(false);
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

  it("shows why a deck's frame cannot be put in, and rejects", async () => {
    // An element outside a page gives its frame no window to write into.
    vi.useFakeTimers();
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const element = document.createElement("div");
    const preview = mountPreview(element, "<!-- slide -->\n\n# One\n", {
      note: null,
    });
    expect(preview.isPresentation).toBe(true);
    await expect(preview.done).rejects.toThrow(TypeError);
    expect(element.textContent).toMatch(/^TypeError/);
    // Nothing is left waiting for the frame: neither the listener for
    // reveal.js nor the time it is given.
    const listener = added.mock.calls.find(([type]) => type === "message")[1];
    expect(removed).toHaveBeenCalledWith("message", listener);
    expect(vi.getTimerCount()).toBe(0);
    added.mockRestore();
    removed.mockRestore();
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
    const { preview, listener, removed } = mountDeck();
    preview.dispose();
    await preview.done;
    expect(removed).toHaveBeenCalledWith("message", listener);
    removed.mockRestore();
  });

  it("gives up on a deck reveal.js says nothing about, and stops listening", async () => {
    // Scripts do not run in these frames, so reveal.js never answers, as
    // when its request neither answers nor fails.
    vi.useFakeTimers();
    try {
      const { preview, listener, removed } = mountDeck();
      vi.advanceTimersByTime(revealTimeout - 1);
      expect(removed).not.toHaveBeenCalledWith("message", listener);
      vi.advanceTimersByTime(1);
      await expect(preview.done).rejects.toThrow("reveal.js did not load");
      expect(removed).toHaveBeenCalledWith("message", listener);
      removed.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes nothing of the note into the frame that could run", () => {
    // The frame is the app's own origin and runs scripts, so what the note
    // brings in must not: raw HTML, a block made to look like wavedrom's, an
    // element whose type wavedrom's own loader would evaluate, speaker notes
    // reveal.js writes as HTML, and front matter that names a theme file,
    // scripts to load or a value that would end the frame's script.
    const element = document.createElement("div");
    document.body.appendChild(element);
    const preview = mountPreview(
      element,
      [
        "---",
        "presentation:",
        '  theme: "../../x.css"',
        "  previewLinks: true",
        "  dependencies:",
        '    - src: "https://unpkg.com/x"',
        '  title: "</script><script>window.fromSettings=1</script>"',
        "---",
        "",
        '<!-- slide data-notes="<img src=x onerror=window.fromNotes=1>" -->',
        "",
        '<img src="x.png" onerror="window.fromImage=1">',
        "",
        '<div class="vickeymd-fence wavedrom">window.fromFence=1</div>',
        "",
        '<ol type="WaveDrom"><li>window.fromList=1</li></ol>',
        "",
        // Written with &#61; for "=", which echomd's own filter would catch.
        `<section data-background-video='https://a.invalid/x.mp4" onerror&#61;"window.fromVideo&#61;1'></section>`,
        "",
        "```wavedrom",
        '{ "signal": [] }',
        "```",
        "",
      ].join("\n"),
      { note: null },
    );
    const frame = element.querySelector("iframe").contentDocument;
    expect(frame.querySelector("[onerror]")).toBeNull();
    expect(frame.querySelector("[data-notes]")).toBeNull();
    expect(frame.querySelector("[data-background-video]")).toBeNull();
    expect(frame.querySelector('[type="WaveDrom" i]')).toBeNull();
    const themes = Array.from(frame.querySelectorAll("link")).map((link) =>
      link.getAttribute("href"),
    );
    expect(themes).toContain(
      "https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/css/theme/white.css",
    );
    expect(themes.join(" ")).not.toContain("x.css");
    // The scripts are the frame's own: the libraries it loads and its own
    // inline code, the settings included as a value inside it.
    const scripts = Array.from(frame.querySelectorAll("script"));
    expect(
      scripts.filter((script) => !script.src).map((script) => script.text),
    ).toEqual([
      expect.stringContaining("JSON.parse(text)"),
      expect.stringContaining("Reveal.initialize("),
    ]);
    const init = scripts.find((script) =>
      script.text.includes("Reveal.initialize("),
    ).text;
    expect(init).toContain('"previewLinks":false');
    expect(init).not.toContain("dependencies");
    expect(init).toContain(
      "\\u003c/script>\\u003cscript>window.fromSettings=1",
    );
    preview.dispose();
  });
});
