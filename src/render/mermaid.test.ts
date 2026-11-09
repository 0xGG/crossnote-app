import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewTimeout } from "./drawing";
import type { renderMermaid as RenderMermaid } from "./mermaid";

// mermaid draws by laying text out, which jsdom cannot do: the tests have
// it hand back what they say, and record how it was set up as it finished
// each diagram (its settings are one for all diagrams).
const calls: { theme?: string; securityLevel?: string; id?: string }[] = [];
let drawn = (code: string) => `<svg><text>${code}</text></svg>`;
// What a drawing waits for before mermaid hands it back.
let held: Promise<unknown> = Promise.resolve();

vi.mock("mermaid", () => {
  let settings: Record<string, string> = {};
  return {
    default: {
      initialize: (config: Record<string, string>) => (settings = config),
      render: async (id: string, code: string) => {
        const call: (typeof calls)[number] = { id };
        calls.push(call);
        if (code === "stuck") {
          await new Promise(() => {});
        }
        await held;
        await new Promise((resolve) => setTimeout(resolve));
        Object.assign(call, {
          theme: settings.theme,
          securityLevel: settings.securityLevel,
        });
        return { svg: drawn(code) };
      },
    },
  };
});

// The diagrams wait their turn in a queue of the module's own: each test
// has a module of its own, so that one that leaves a diagram waiting holds
// up no other test's. Time is the tests' to move on.
let renderMermaid: typeof RenderMermaid;
beforeEach(async () => {
  vi.resetModules();
  ({ renderMermaid } = await import("./mermaid"));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  calls.length = 0;
  drawn = (code) => `<svg><text>${code}</text></svg>`;
  held = Promise.resolve();
});

// Lets whatever is under way run to its end, then waits for promise.
async function after<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

// Waits for promise while time moves on by a millisecond at a time, for a
// tenth of a second at most: what settles only by a limit of seconds fails.
async function soon<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let ms = 0; ms < 100 && !settled; ms++) {
    await vi.advanceTimersByTimeAsync(1);
  }
  if (!settled) {
    throw new Error("not settled within 100 ms");
  }
  return promise;
}

describe("renderMermaid", () => {
  it("draws the diagram in the theme that goes with the preview's, strictly", async () => {
    const light = renderMermaid("A", { dark: false });
    const dark = renderMermaid("B", { dark: true });
    await after(Promise.all([light.done, dark.done]));
    expect(light.element.querySelector("svg text").textContent).toBe("A");
    expect(dark.element.querySelector("svg text").textContent).toBe("B");
    // One after the other, each in its own theme, under its own id.
    expect(
      calls.map(({ theme, securityLevel }) => [theme, securityLevel]),
    ).toEqual([
      ["default", "strict"],
      ["dark", "strict"],
    ]);
    expect(calls[0].id).not.toBe(calls[1].id);
  });

  it("gives a diagram its time from its turn, not while it waits behind another", async () => {
    let release: (value?: unknown) => void;
    held = new Promise((resolve) => (release = resolve));
    const first = renderMermaid("A", { dark: false });
    const second = renderMermaid("B", { dark: false });
    let secondStarted = false;
    second.started.then(() => (secondStarted = true));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await first.started;
    await vi.advanceTimersByTimeAsync(previewTimeout);
    expect(secondStarted).toBe(false);
    release();
    await after(Promise.all([first.done, second.done]));
    expect(secondStarted).toBe(true);
  });

  it("gives the next diagram its turn a preview's wait after one mermaid never finishes is given up on", async () => {
    const stuck = renderMermaid("stuck", { dark: false });
    const next = renderMermaid("B", { dark: false });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    stuck.giveUp(10);
    await vi.advanceTimersByTimeAsync(previewTimeout - 1);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await after(next.done);
    expect(next.element.querySelector("svg text").textContent).toBe("B");
    expect(stuck.element.textContent).toBe(
      "Error: this block took more than 10 seconds to draw",
    );
  });

  it("gives the next diagram its turn once mermaid has finished one given up on while it drew it", async () => {
    let release: (value?: unknown) => void;
    held = new Promise((resolve) => (release = resolve));
    const first = renderMermaid("A", { dark: false });
    const second = renderMermaid("B", { dark: false });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    first.giveUp(10);
    await vi.advanceTimersByTimeAsync(previewTimeout / 2);
    // mermaid is still drawing the first: the two would be drawn at once.
    expect(calls).toHaveLength(1);
    // Once it is done, the next goes at once, not at the preview's limit.
    release();
    await soon(second.done);
    expect(calls).toHaveLength(2);
    expect(second.element.querySelector("svg text").textContent).toBe("B");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the diagrams after one disposed of while waiting its turn behind the one mermaid draws", async () => {
    let release: (value?: unknown) => void;
    held = new Promise((resolve) => (release = resolve));
    const first = renderMermaid("A", { dark: false });
    const second = renderMermaid("B", { dark: false });
    const third = renderMermaid("C", { dark: false });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    second.dispose();
    // The second had no turn yet: the third waits for the first, however
    // long mermaid takes with it.
    await vi.advanceTimersByTimeAsync(previewTimeout * 2);
    expect(calls).toHaveLength(1);
    // Once the first is done, the third goes at once.
    release();
    await soon(Promise.all([first.done, third.done]));
    expect(calls).toHaveLength(2);
    expect(third.element.querySelector("svg text").textContent).toBe("C");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("puts what mermaid draws in the page only once sanitized", async () => {
    drawn = () =>
      '<svg onload="window.fromMermaid=1"><script>window.fromMermaid=1</script><foreignObject><div><img src="x" onerror="window.fromMermaid=1">label</div></foreignObject></svg>';
    const drawing = renderMermaid("A", { dark: false });
    await after(drawing.done);
    const svg = drawing.element.querySelector("svg");
    expect(svg.hasAttribute("onload")).toBe(false);
    expect(drawing.element.querySelector("script")).toBeNull();
    expect(drawing.element.querySelector("img").hasAttribute("onerror")).toBe(
      false,
    );
    // HTML labels stay.
    expect(drawing.element.querySelector("foreignObject").textContent).toBe(
      "label",
    );
  });

  it("draws nothing for a diagram disposed of while mermaid draws it, nor for one waiting its turn", async () => {
    let release: (value?: unknown) => void;
    held = new Promise((resolve) => (release = resolve));
    const first = renderMermaid("A", { dark: false });
    const second = renderMermaid("B", { dark: false });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    first.dispose();
    second.dispose();
    release();
    await after(Promise.all([first.done, second.done]));
    expect(first.element.childNodes.length).toBe(0);
    expect(second.element.childNodes.length).toBe(0);
    // The one waiting is not drawn at all.
    expect(calls).toHaveLength(1);
  });
});
