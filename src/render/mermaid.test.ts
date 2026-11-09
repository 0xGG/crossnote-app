import { afterEach, describe, expect, it, vi } from "vitest";
import { previewTimeout } from "./drawing";
import { renderMermaid } from "./mermaid";

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

afterEach(() => {
  calls.length = 0;
  drawn = (code) => `<svg><text>${code}</text></svg>`;
  held = Promise.resolve();
});

describe("renderMermaid", () => {
  it("draws the diagram in the theme that goes with the preview's, strictly", async () => {
    const light = renderMermaid("A", { dark: false });
    const dark = renderMermaid("B", { dark: true });
    await Promise.all([light.done, dark.done]);
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
    expect(secondStarted).toBe(false);
    release();
    await Promise.all([first.done, second.done]);
    expect(secondStarted).toBe(true);
  });

  it("gives the next diagram its turn a preview's wait after one mermaid never finishes is given up on", async () => {
    vi.useFakeTimers();
    try {
      const stuck = renderMermaid("stuck", { dark: false });
      const next = renderMermaid("B", { dark: false });
      await vi.waitFor(() => expect(calls).toHaveLength(1));
      stuck.giveUp(10);
      await vi.advanceTimersByTimeAsync(previewTimeout - 1);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => expect(calls).toHaveLength(2));
      await vi.advanceTimersByTimeAsync(0);
      await next.done;
      expect(next.element.querySelector("svg text").textContent).toBe("B");
      expect(stuck.element.textContent).toBe(
        "Error: this block took more than 10 seconds to draw",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives the next diagram its turn once mermaid has finished one given up on while it drew it", async () => {
    let release: (value?: unknown) => void;
    held = new Promise((resolve) => (release = resolve));
    const first = renderMermaid("A", { dark: false });
    const second = renderMermaid("B", { dark: false });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    first.giveUp(10);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // mermaid is still drawing the first: the two would be drawn at once.
    expect(calls).toHaveLength(1);
    release();
    await second.done;
    expect(calls).toHaveLength(2);
    expect(second.element.querySelector("svg text").textContent).toBe("B");
  });

  it("keeps the diagrams after one disposed of while waiting its turn behind the one mermaid draws", async () => {
    let release: (value?: unknown) => void;
    held = new Promise((resolve) => (release = resolve));
    const first = renderMermaid("A", { dark: false });
    const second = renderMermaid("B", { dark: false });
    const third = renderMermaid("C", { dark: false });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    second.dispose();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toHaveLength(1);
    release();
    await Promise.all([first.done, third.done]);
    expect(calls).toHaveLength(2);
    expect(third.element.querySelector("svg text").textContent).toBe("C");
  });

  it("puts what mermaid draws in the page only once sanitized", async () => {
    drawn = () =>
      '<svg onload="window.fromMermaid=1"><script>window.fromMermaid=1</script><foreignObject><div><img src="x" onerror="window.fromMermaid=1">label</div></foreignObject></svg>';
    const drawing = renderMermaid("A", { dark: false });
    await drawing.done;
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
    await Promise.all([first.done, second.done]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(first.element.childNodes.length).toBe(0);
    expect(second.element.childNodes.length).toBe(0);
    // The one waiting is not drawn at all.
    expect(calls).toHaveLength(1);
  });
});
