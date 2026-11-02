import { afterEach, describe, expect, it, vi } from "vitest";
import { renderVegaLite, withoutWindowActions } from "./vegaLite";

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

describe("renderVegaLite", () => {
  afterEach(() => {
    delete (window as any).vegaEmbed;
  });

  it("embeds the chart, JSON or YAML, without the actions that open windows", () => {
    const vegaEmbed = vi.fn((_element: HTMLElement, _spec: unknown) =>
      Promise.resolve(),
    );
    (window as any).vegaEmbed = vegaEmbed;
    const { element } = renderVegaLite(
      '{"mark": "point", "usermeta": {"embedOptions": {"editorUrl": "https://example.org/"}}}',
    );
    renderVegaLite("mark: bar\n");
    expect(vegaEmbed).toHaveBeenNthCalledWith(1, element, {
      mark: "point",
      usermeta: { embedOptions: { actions: noWindows } },
    });
    expect(vegaEmbed.mock.calls[1][1]).toEqual({
      mark: "bar",
      usermeta: { embedOptions: { actions: noWindows } },
    });
  });

  it("shows why a chart cannot be read", () => {
    (window as any).vegaEmbed = vi.fn();
    const { element } = renderVegaLite("{ not json");
    expect(element.textContent).toMatch(/JSON/);
    expect((window as any).vegaEmbed).not.toHaveBeenCalled();
  });

  it("shows why a chart cannot be drawn", async () => {
    (window as any).vegaEmbed = vi.fn(() =>
      Promise.reject(new Error("no such mark")),
    );
    const { element } = renderVegaLite('{"mark": "nothing"}');
    await vi.waitFor(() =>
      expect(element.textContent).toBe("Error: no such mark"),
    );
  });
});
