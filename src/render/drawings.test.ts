import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Drawing,
  DrawingContext,
  previewTimeout,
  startDrawing,
} from "./drawing";
import { mountPreview } from "./index";

// One kind of block, drawn by a renderer the tests finish when they say so;
// another whose blocks each wait their turn behind the one before, as
// mermaid's do, and never finish.
let turns: Promise<unknown> = Promise.resolve();
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
    [
      /^turn$/,
      () => {
        const before = turns;
        let release = () => {};
        turns = new Promise<void>((resolve) => (release = resolve));
        return startDrawing(
          document.createElement("div"),
          async (signal, begin) => {
            signal.addEventListener("abort", () => release());
            await before;
            begin();
            await new Promise(() => {});
          },
          { waitsItsTurn: true },
        );
      },
      true,
    ],
  ],
}));

const note = "Before.\n\n```test\nA\n```\n\n```test\nB\n```\n";

afterEach(() => {
  turns = Promise.resolve();
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

  it("gives up on every block not drawn once it has waited for them all for previewTimeout", async () => {
    // Each block's time counts from its turn: four that take too long
    // would otherwise hold the preview up for four times a block's time.
    vi.useFakeTimers();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const preview = mountPreview(
      element,
      "```turn\nA\n```\n\n```turn\nB\n```\n\n```turn\nC\n```\n\n```turn\nD\n```\n",
      { note: null },
    );
    let settled = false;
    preview.done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(previewTimeout - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(element.textContent).toContain(
      "this block took more than 30 seconds to draw",
    );
    // Neither the limit's timer nor the blocks' own are left.
    expect(vi.getTimerCount()).toBe(0);
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
