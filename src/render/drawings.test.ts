import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawing, DrawingContext, startDrawing } from "./drawing";
import { mountPreview } from "./index";

// One kind of block, drawn by a renderer the tests finish when they say so.
const drawings: {
  drawing: Drawing;
  context: DrawingContext;
  finish: () => void;
  released: () => boolean;
}[] = [];

vi.mock("./diagrams", () => ({
  diagramRenderers: [
    [
      /^test$/,
      (code: string, _info: unknown, context: DrawingContext) => {
        const element = document.createElement("div");
        let finish = () => {};
        let released = false;
        const drawing = startDrawing(element, (signal) => {
          signal.addEventListener("abort", () => (released = true));
          return new Promise<void>((resolve) => {
            finish = () => {
              element.textContent = `drawn: ${code.trim()}`;
              resolve();
            };
          });
        });
        drawings.push({
          drawing,
          context,
          finish: () => finish(),
          released: () => released,
        });
        return drawing;
      },
      true,
    ],
  ],
}));

const note = "Before.\n\n```test\nA\n```\n\n```test\nB\n```\n";

afterEach(() => {
  drawings.length = 0;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("mountPreview with blocks drawn later", () => {
  it("settles once every block is drawn", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const preview = mountPreview(element, note, { note: null });
    let settled = false;
    preview.done.then(() => (settled = true));
    await vi.waitFor(() => expect(drawings).toHaveLength(2));
    drawings[0].finish();
    await new Promise((resolve) => setTimeout(resolve));
    expect(settled).toBe(false);
    drawings[1].finish();
    await preview.done;
    expect(element.textContent).toContain("drawn: A");
    expect(element.textContent).toContain("drawn: B");
    expect(drawings[0].context).toEqual({ dark: false, inSlides: false });
  });

  it("disposes of the blocks when it is disposed of, and settles", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const preview = mountPreview(element, note, { note: null });
    await vi.waitFor(() => expect(drawings).toHaveLength(2));
    preview.dispose();
    await preview.done;
    expect(drawings.map(({ released }) => released())).toEqual([true, true]);
  });

  it("disposes of the blocks drawn before when the element is drawn into again", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    mountPreview(element, note, { note: null });
    await vi.waitFor(() => expect(drawings).toHaveLength(2));
    drawings.forEach(({ finish }) => finish());
    mountPreview(element, "After.\n", { note: null });
    expect(drawings.map(({ released }) => released())).toEqual([true, true]);
  });

  it("gives up on a block that takes too long, and draws the rest", async () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const preview = mountPreview(element, note, { note: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(drawings).toHaveLength(2);
    drawings[1].finish();
    await vi.advanceTimersByTimeAsync(10000);
    await preview.done;
    expect(drawings[0].released()).toBe(true);
    expect(element.textContent).toContain(
      "this block took more than 10 seconds to draw",
    );
    expect(element.textContent).toContain("drawn: B");
  });

  it("draws the blocks in a dark theme's colours in a dark preview", async () => {
    const element = document.createElement("div");
    element.setAttribute("data-preview-theme", "dark");
    document.body.appendChild(element);
    mountPreview(element, note, { note: null });
    await vi.waitFor(() => expect(drawings).toHaveLength(2));
    expect(drawings[0].context).toEqual({ dark: true, inSlides: false });
  });

  it("draws the other blocks when a block's info, written in the note's HTML, is not an object", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const preview = mountPreview(
      element,
      '```test\nA\n```\n\n<pre class="vickeymd-fence" data-parsed-info="null">B</pre>\n\n<pre class="vickeymd-fence" data-parsed-info=\'{"language":{"toString":1}}\'>C</pre>\n',
      { note: null },
    );
    await vi.waitFor(() => expect(drawings).toHaveLength(1));
    drawings[0].finish();
    await preview.done;
    expect(element.textContent).toContain("drawn: A");
    expect(element.textContent).toContain("B");
    expect(element.textContent).toContain("C");
    preview.dispose();
    expect(drawings[0].released()).toBe(true);
  });
});

describe("mountPreview with a deck", () => {
  // The deck is ready once reveal.js says so, which the test does for it.
  function mountDeck(text: string) {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const added = vi.spyOn(window, "addEventListener");
    const preview = mountPreview(element, text, { note: null });
    const listener = added.mock.calls.find(
      ([type]) => type === "message",
    )[1] as (event: unknown) => void;
    added.mockRestore();
    const iframe = element.querySelector("iframe");
    const id =
      iframe.contentDocument.documentElement.innerHTML.match(
        /reveal\.js\.[\d.]+/,
      )[0];
    listener({
      source: iframe.contentWindow,
      data: { event: "reveal-ready", id },
    });
    return preview;
  }

  it("settles once its slides' blocks are drawn, and disposes of them with it", async () => {
    const preview = mountDeck("<!-- slide -->\n\n```test\nA\n```\n");
    await vi.waitFor(() => expect(drawings).toHaveLength(1));
    expect(drawings[0].context).toEqual({ dark: false, inSlides: true });
    let settled = false;
    preview.done.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve));
    expect(settled).toBe(false);
    drawings[0].finish();
    await preview.done;
    preview.dispose();
    expect(drawings[0].released()).toBe(true);
  });
});
