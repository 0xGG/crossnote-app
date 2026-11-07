import { expressionInterpreter } from "vega-interpreter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withBindingsInChart } from "./vega";
import {
  chartEmbedOptions,
  renderVegaLite,
  withoutWindowActions,
} from "./vegaLite";

// vega-embed draws on a canvas, which jsdom does not have.
const embed = vi.hoisted(() => vi.fn());
vi.mock("vega-embed", () => ({ default: embed }));

const noWindows = { source: false, compiled: false, editor: false };

describe("withoutWindowActions", () => {
  it("turns off the actions that open windows, and drops what feeds them", () => {
    expect(
      withoutWindowActions({
        editorUrl: "https://example.org/",
        sourceHeader: "<script>opener.x = 1</script>",
        sourceFooter: "<script>opener.y = 1</script>",
        actions: { export: true, source: true },
        renderer: "svg",
      }),
    ).toEqual({
      actions: { export: true, ...noWindows },
      renderer: "svg",
    });
  });

  it("leaves the other actions on when none are named", () => {
    expect(withoutWindowActions()).toEqual({ actions: noWindows });
    expect(withoutWindowActions({ actions: true })).toEqual({
      actions: noWindows,
    });
  });

  it("keeps all actions off", () => {
    expect(withoutWindowActions({ actions: false })).toEqual({
      actions: false,
    });
  });
});

describe("chartEmbedOptions", () => {
  it("keeps a chart from turning vega's interpreter off or naming its inputs' or tooltip's element", () => {
    expect(
      chartEmbedOptions({
        ast: false,
        expr: "eval",
        viewClass: "View",
        bind: "body",
        patch: [{ op: "remove", path: "/config" }],
        tooltip: { id: "root", theme: "dark" },
        renderer: "svg",
      }),
    ).toEqual({
      actions: noWindows,
      tooltip: { theme: "dark" },
      renderer: "svg",
    });
  });
});

describe("renderVegaLite", () => {
  afterEach(() => {
    embed.mockReset();
  });

  const context = { dark: false };

  it("embeds the chart, JSON or YAML, without the actions that open windows, with vega's interpreter and its inputs in its own element", async () => {
    const finalize = vi.fn();
    embed.mockResolvedValue({ finalize });
    const point = renderVegaLite(
      '{"mark": "point", "usermeta": {"embedOptions": {"editorUrl": "https://example.org/"}}}',
      {},
      context,
    );
    const bar = renderVegaLite("mark: bar\n", {}, { ...context, dark: true });
    await Promise.all([point.done, bar.done]);
    expect(embed.mock.calls[0][0]).toBe(point.element);
    expect(embed.mock.calls[0][1]).toEqual({
      mark: "point",
      usermeta: { embedOptions: { actions: noWindows } },
    });
    expect(embed.mock.calls[0][2]).toMatchObject({
      ast: true,
      expr: expressionInterpreter,
      theme: undefined,
      patch: withBindingsInChart,
    });
    expect(embed.mock.calls[1][1]).toEqual({
      mark: "bar",
      usermeta: { embedOptions: { actions: noWindows } },
    });
    // In a dark preview, vega's dark theme.
    expect(embed.mock.calls[1][2]).toMatchObject({ theme: "dark" });
    point.dispose();
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it("draws a chart whose embed options are not an object", async () => {
    embed.mockResolvedValue({ finalize: vi.fn() });
    const drawing = renderVegaLite(
      '{"mark": "point", "usermeta": {"embedOptions": null}}',
      {},
      context,
    );
    await drawing.done;
    expect(embed.mock.calls[0][1]).toEqual({
      mark: "point",
      usermeta: { embedOptions: { actions: noWindows } },
    });
  });

  it("starts no chart for a drawing disposed of while vega-embed loads", async () => {
    const drawing = renderVegaLite('{"mark": "point"}', {}, context);
    await Promise.resolve();
    drawing.dispose();
    await drawing.done;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(embed).not.toHaveBeenCalled();
  });

  it("shows why a chart cannot be read", async () => {
    const drawing = renderVegaLite("{ not json", {}, context);
    await drawing.done;
    expect(drawing.element.textContent).toMatch(/JSON/);
    expect(embed).not.toHaveBeenCalled();
  });

  it("shows why a chart cannot be drawn", async () => {
    embed.mockRejectedValue(new Error("no such mark"));
    const drawing = renderVegaLite('{"mark": "nothing"}', {}, context);
    await drawing.done;
    expect(drawing.element.textContent).toBe("Error: no such mark");
  });
});
