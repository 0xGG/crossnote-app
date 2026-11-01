import { afterEach, describe, expect, it, vi } from "vitest";
import { renderVegaLite, withoutEditorAction } from "./vegaLite";

describe("withoutEditorAction", () => {
  it("turns the editor action off and drops the editor's address", () => {
    expect(
      withoutEditorAction({
        editorUrl: "https://example.org/",
        actions: { export: true, source: false },
        renderer: "svg",
      }),
    ).toEqual({
      actions: { export: true, source: false, editor: false },
      renderer: "svg",
    });
  });

  it("leaves the other actions on when none are named", () => {
    expect(withoutEditorAction()).toEqual({ actions: { editor: false } });
    expect(withoutEditorAction({ actions: true })).toEqual({
      actions: { editor: false },
    });
  });

  it("keeps all actions off", () => {
    expect(withoutEditorAction({ actions: false })).toEqual({
      actions: false,
    });
  });
});

describe("renderVegaLite", () => {
  afterEach(() => {
    delete (window as any).vegaEmbed;
  });

  it("embeds the chart, JSON or YAML, without the editor action", () => {
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
      usermeta: { embedOptions: { actions: { editor: false } } },
    });
    expect(vegaEmbed.mock.calls[1][1]).toEqual({
      mark: "bar",
      usermeta: { embedOptions: { actions: { editor: false } } },
    });
  });

  it("shows why a chart cannot be read", () => {
    (window as any).vegaEmbed = vi.fn();
    const { element } = renderVegaLite("{ not json");
    expect(element.innerText).toMatch(/JSON/);
    expect((window as any).vegaEmbed).not.toHaveBeenCalled();
  });
});
