import { expressionInterpreter } from "vega-interpreter";
import { dark } from "vega-themes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderVega } from "./vega";

// vega draws on a canvas, which jsdom does not have: the view here runs
// when the test says so.
const stub = vi.hoisted(() => ({
  parse: (..._args: unknown[]) => ({}) as unknown,
  views: [] as {
    options: Record<string, unknown>;
    finish: () => void;
    finalize: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("vega", () => ({
  parse: (...args: unknown[]) => stub.parse(...args),
  View: class {
    run: Promise<void>;
    finalize: ReturnType<typeof vi.fn>;
    constructor(_runtime: unknown, options: Record<string, unknown>) {
      let finish = () => {};
      this.run = new Promise((resolve) => (finish = resolve));
      this.finalize = vi.fn();
      stub.views.push({ options, finish, finalize: this.finalize });
    }
    runAsync() {
      return this.run;
    }
  },
}));

afterEach(() => {
  stub.views.length = 0;
});

describe("renderVega", () => {
  it("runs the chart with vega's interpreter, in the preview's theme, and finalizes it", async () => {
    const parse = vi.fn((..._args: unknown[]) => ({}));
    stub.parse = parse;
    const drawing = renderVega(
      "marks: []\n",
      {},
      { dark: true, inSlides: false },
    );
    let done = false;
    drawing.done.then(() => (done = true));
    await vi.waitFor(() => expect(stub.views).toHaveLength(1));
    expect(parse).toHaveBeenCalledWith({ marks: [] }, dark, { ast: true });
    expect(stub.views[0].options).toMatchObject({
      expr: expressionInterpreter,
      container: drawing.element,
    });
    await new Promise((resolve) => setTimeout(resolve));
    expect(done).toBe(false);
    stub.views[0].finish();
    await drawing.done;
    drawing.dispose();
    expect(stub.views[0].finalize).toHaveBeenCalled();
  });

  it("starts no chart for a drawing disposed of while vega loads", async () => {
    const parse = vi.fn((..._args: unknown[]) => ({}));
    stub.parse = parse;
    const drawing = renderVega(
      '{"marks": []}',
      {},
      { dark: false, inSlides: false },
    );
    await Promise.resolve();
    drawing.dispose();
    await drawing.done;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stub.views).toHaveLength(0);
  });

  it("uses vega's own look in a light preview", async () => {
    const parse = vi.fn((..._args: unknown[]) => ({}));
    stub.parse = parse;
    renderVega('{"marks": []}', {}, { dark: false, inSlides: false });
    await vi.waitFor(() => expect(parse).toHaveBeenCalled());
    expect(parse.mock.calls[0][1]).toBeUndefined();
  });
});
