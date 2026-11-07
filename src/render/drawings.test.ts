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
      (code: string, context: DrawingContext) => {
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
    expect(drawings[0].context).toEqual({ dark: false });
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
    expect(drawings[0].context).toEqual({ dark: true });
  });

  it("draws a block written in the note's HTML that names no language, or one of its own, as code", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const preview = mountPreview(
      element,
      '```test {width=1}\nA\n```\n\n<pre class="vickeymd-fence">B</pre>\n\n<pre class="vickeymd-fence" data-language="{&quot;toString&quot;:1}">C</pre>\n',
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
